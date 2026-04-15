# Plan Complet — Fastify Meteo App

## Instructions de Coding

### Gestionnaire de paquets — pnpm

Tout le projet utilise **pnpm** exclusivement. Ne jamais utiliser `npm` ou `yarn`.

```bash
# Installation des dépendances
pnpm install

# Ajouter une dépendance
pnpm add fastify
pnpm add -D typescript vitest

# Scripts
pnpm dev
pnpm build
pnpm test
pnpm lint
```

Le fichier `package.json` doit inclure un `engines` pour l'enforcer :

```json
{
  "engines": {
    "node": ">=22",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.15.4"
}
```

Un fichier `.npmrc` à la racine pour éviter les installations accidentelles via npm :

```ini
engine-strict=true
```

---

### TypeScript — Configuration stricte

`tsconfig.json` en mode strict complet, sans dérogation :

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": false,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

Règles :

- **Pas de `any`** — utiliser `unknown` puis narrowing explicite
- **Pas d'assertion `!`** — gérer le cas null/undefined explicitement
- **Pas de `as Type`** sauf à la frontière (parsing JSON, réponse externe) — préférer Zod
- **Types explicites sur les fonctions exportées** — les types inférés restent en interne

---

### Clean Code — Principes appliqués

#### Nommage

```typescript
// ❌
const d = await db.query('SELECT * FROM users WHERE email = $1', [e]);
const r = await owm.get(c);

// ✅
const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);
const weatherData = await owmClient.getCurrentWeather(coords);
```

- Noms de variables : intention claire, pas d'abréviation (`req` et `res` sont acceptés dans Fastify par convention)
- Fonctions : verbe + nom (`getUser`, `buildCacheKey`, `isEuropean`)
- Booléens : préfixe `is` / `has` / `can` (`isEuropean`, `hasProPlan`, `canAccessForecast`)
- Constantes : `SCREAMING_SNAKE_CASE` pour les vraies constantes (`MAX_DAILY_REQUESTS`, `CACHE_TTL_WEATHER`)

#### Fonctions

- **Une responsabilité** : une fonction fait une chose et la fait bien
- **Pas plus de 3 paramètres** — au-delà, utiliser un objet options typé
- **Pas d'effets de bord cachés** — une fonction qui lit fait seulement des lectures
- **Retour explicite** : toujours typer le retour des fonctions exportées

```typescript
// ❌ — deux responsabilités + effet de bord caché
async function getWeather(city: string, userId: string) {
  await incrementDailyCount(userId); // effet de bord inattendu
  const coords = await geocode(city);
  return fetchWeather(coords);
}

// ✅ — responsabilités séparées, appelées explicitement par l'orchestrateur
async function geocodeCity(city: string): Promise<Coords> { ... }
async function fetchCurrentWeather(coords: Coords): Promise<WeatherData> { ... }
async function incrementDailyCount(email: string): Promise<void> { ... }
```

#### Modules et dépendances

- **Injection de dépendances via les plugins Fastify** — pas d'imports directs de singletons dans les handlers
- **Pas de logique métier dans les routes** — les routes orchestrent, les services exécutent
- **Pas de logique dans les tests** — les helpers de test encapsulent le setup, les tests décrivent le comportement

```typescript
// ❌ — logique métier dans la route
fastify.get('/weather', async (req, reply) => {
  const coords = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${req.query.city}`);
  const cached = await redis.get(`weather:${coords.lat}:${coords.lon}`);
  // ...
});

// ✅ — la route orchestre, le service exécute
fastify.get('/weather', async (req, reply) => {
  const weather = await weatherService.getWeather(req.query.city, req.user);
  return reply.send(weather);
});
```

#### Gestion des erreurs

- **Erreurs typées** — créer des classes d'erreur métier explicites
- **Ne jamais swallower une erreur** — pas de `catch {}` vide
- **Fail fast** — valider les inputs à l'entrée (Zod), pas en profondeur
- **Erreurs HTTP via `fastify.httpErrors`** (plugin `@fastify/sensible`)

```typescript
// ❌
try {
  const data = await owmClient.geocode(city);
} catch (e) {
  return null; // erreur avalée silencieusement
}

// ✅
if (!data) {
  throw fastify.httpErrors.notFound(`City not found: ${city}`);
}
```

#### Immutabilité

- Préférer `const` systématiquement, `let` seulement si la valeur change réellement
- Préférer les méthodes non-mutantes (`map`, `filter`, `reduce`) aux mutations en place
- Les objets passés aux fonctions ne sont pas mutés — retourner un nouvel objet si besoin

---

### Structure et organisation des fichiers

#### Règles de co-location

- Les tests sont dans le même dossier que le fichier testé (`weather.service.ts` / `weather.service.test.ts`)
- Les types partagés dans `src/types/`
- Les constantes dans le fichier qui les utilise, remontées dans `src/lib/constants.ts` si elles sont partagées entre 2+ modules

#### Exports

- **Pas d'export default** — toujours nommé pour faciliter le refactoring et l'autocomplete
- **Barrel files (`index.ts`) au minimum** — ils masquent les dépendances et ralentissent le build

#### Taille des fichiers

- Un fichier = un concept principal
- Au-delà de ~200 lignes, questionner si le fichier a une seule responsabilité

---

### Validation — Zod

Toutes les données à la frontière du système (inputs HTTP, réponses OWM, variables d'env) sont validées avec Zod.

```typescript
// Variables d'environnement — validées au démarrage, pas à l'usage
const EnvSchema = z.object({
  OPENWEATHER_API_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  METRICS_TOKEN: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export const env = EnvSchema.parse(process.env); // crash au démarrage si invalide
```

```typescript
// Paramètres de route
const WeatherQuerySchema = z.object({
  city: z.string().min(1).max(100).trim(),
});

// Réponse externe (OWM) — schema minimal, ne parser que ce qu'on utilise
const GeocodingResponseSchema = z
  .array(
    z.object({
      lat: z.number(),
      lon: z.number(),
      country: z.string().length(2),
    }),
  )
  .min(1);
```

---

### Linting et formatage

#### ESLint (`eslint.config.ts`)

```typescript
// Règles essentielles activées
'no-console': 'error',              // utiliser le logger Pino
'@typescript-eslint/no-explicit-any': 'error',
'@typescript-eslint/no-floating-promises': 'error',
'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], // _reply, _done tolérés
'@typescript-eslint/consistent-type-imports': 'error', // import type { Foo }
// Fastify plugins doivent être async par contrat même sans await explicite
'@typescript-eslint/require-await': 'off',
```

#### Prettier (`.prettierrc`)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

#### Scripts `package.json`

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsup src/server.ts --format esm --dts",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --max-warnings 0",
    "lint:fix": "eslint src --fix",
    "format": "prettier --write src",
    "format:check": "prettier --check src",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"],
    "*.{json,yml,yaml,md}": ["prettier --write"]
  }
}
```

---

### Tests — Conventions Vitest

#### Pattern Given / When / Then

Chaque test suit le pattern **Given / When / Then** matérialisé par des commentaires de section. Il décrit le contexte, l'action, et le résultat attendu — lisible comme une spécification, pas comme du code.

```
Given  → état initial du système (contexte, préconditions)
When   → l'action déclenchée (appel de fonction, requête HTTP)
Then   → le résultat observable attendu (assertions)
```

#### Structure d'un fichier de test — unitaire

```typescript
// weather.policy.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateWeatherPolicy } from './weather.policy';

describe('weatherPolicy', () => {
  describe('weather:read:current', () => {
    it('allows any authenticated viewer', () => {
      // Given
      const user = { email: 'user@example.com', role: 'viewer', plan: 'free' };

      // When
      const result = evaluateWeatherPolicy({ action: 'weather:read:current', user });

      // Then
      expect(result).toBe('allow');
    });
  });

  describe('weather:read:forecast', () => {
    it('denies a free plan user', () => {
      // Given
      const user = { email: 'user@example.com', role: 'viewer', plan: 'free' };

      // When
      const result = evaluateWeatherPolicy({ action: 'weather:read:forecast', user });

      // Then
      expect(result).toBe('deny');
    });

    it('allows a pro plan user', () => {
      // Given
      const user = { email: 'pro@example.com', role: 'viewer', plan: 'pro' };

      // When
      const result = evaluateWeatherPolicy({ action: 'weather:read:forecast', user });

      // Then
      expect(result).toBe('allow');
    });

    it('allows an admin regardless of plan', () => {
      // Given
      const user = { email: 'admin@example.com', role: 'admin', plan: 'free' };

      // When
      const result = evaluateWeatherPolicy({ action: 'weather:read:forecast', user });

      // Then
      expect(result).toBe('allow');
    });
  });
});
```

#### Structure d'un fichier de test — intégration API

```typescript
// weather.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildApp } from '../index';
import { createTestUser, resetDb } from '../test/helpers/db.helper';
import { generateTestJwt } from '../test/helpers/auth.helper';
import { mockOwmCurrentWeather } from '../test/helpers/mock-openweather';

describe('GET /weather', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('returns current weather for a European city with a free plan user', async () => {
    // Given
    const user = await createTestUser({ role: 'viewer', plan: 'free' });
    const token = generateTestJwt({ email: user.email });
    const app = await buildApp();
    mockOwmCurrentWeather({ city: 'Paris', country: 'FR' });

    // When
    const response = await app.inject({
      method: 'GET',
      url: '/weather?city=Paris',
      headers: { authorization: `Bearer ${token}` },
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-cache-status']).toBe('MISS');
    expect(response.json()).toMatchObject({ city: 'Paris', temp: expect.any(Number) });
  });

  it('returns 403 when a free plan user requests a non-European city', async () => {
    // Given
    const user = await createTestUser({ role: 'viewer', plan: 'free' });
    const token = generateTestJwt({ email: user.email });
    const app = await buildApp();
    mockOwmCurrentWeather({ city: 'New York', country: 'US' });

    // When
    const response = await app.inject({
      method: 'GET',
      url: '/weather?city=New York',
      headers: { authorization: `Bearer ${token}` },
    });

    // Then
    expect(response.statusCode).toBe(403);
  });

  it('returns 401 when no token is provided', async () => {
    // Given
    const app = await buildApp();

    // When
    const response = await app.inject({ method: 'GET', url: '/weather?city=Paris' });

    // Then
    expect(response.statusCode).toBe(401);
  });
});
```

#### Règles

- **Given / When / Then** : toujours les trois blocs commentés, même si l'un est court — la lisibilité prime
- **Un seul `When` par test** : une seule action déclenchée — si deux actions sont nécessaires, c'est deux tests
- **Nommage** : `it('does X for Y in context Z')` — lisible comme une phrase de spécification
- **Pas de logique dans les tests** : pas de `if`, pas de boucle — si besoin, utiliser `it.each`
- **Tests déterministes** : pas de `Date.now()` ou `Math.random()` sans mock explicite
- **Isolation** : chaque test repart d'un état propre — `resetDb()` dans `beforeEach`, pas de dépendances entre tests
- **Assertions ciblées** : asserter uniquement ce que le test concerne — ne pas re-vérifier ce qu'un autre test couvre déjà

#### Coverage

Seuils minimum dans `vitest.config.ts` :

```typescript
coverage: {
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 75,
  }
}
```

---

### Git — Workflow

```
main        ← production, protégé, merge via PR uniquement
  └─ develop ← intégration, deploy preview Render
       └─ feat/xxx  ← feature branches (courtes, < 2 jours)
       └─ fix/xxx   ← bugfix branches
```

- **Pas de commit direct sur `main`** — toujours via PR
- **Pas de commit direct sur `develop`** — toujours via PR depuis une feature branch
- **Commits atomiques** : un commit = un changement cohérent et buildable
- **Message de commit** : conventional commit, impératif, sans majuscule, sans point final
  - ✅ `feat: add geocoding cache with 24h TTL`
  - ❌ `Added geocoding cache.`

---

## Stack Technique

| Couche        | Choix                                     | Justification                           |
| ------------- | ----------------------------------------- | --------------------------------------- |
| Runtime       | TypeScript + Fastify                      | Léger, performant, plugin-based         |
| Weather API   | OpenWeatherMap (clé API)                  | Geocoding + météo, une seule clé        |
| Auth IdP      | Google OAuth2                             | OIDC standard                           |
| Utilisateurs  | PostgreSQL (Render free)                  | Source de vérité pour role + plan       |
| Migrations DB | Drizzle ORM                               | Léger, type-safe, sans codegen lourd    |
| Cache         | Redis (Render free, 25MB)                 | ~10k villes, TTL 10min                  |
| Logging       | Pino + logfmt                             | Natif Fastify, format structuré         |
| Métriques     | fastify-metrics + Grafana Cloud           | Hit/miss cache, latence par route       |
| Documentation | @fastify/swagger + @fastify/swagger-ui    | Swagger UI intégré, test interactif     |
| Commits       | Conventional Commits + commitlint + husky | Enforcement local + CI                  |
| Versioning    | Release Please                            | Trunk-based, Release PR, changelog auto |
| PaaS          | Render                                    | Free tier app + Redis + Postgres        |
| CI            | GitHub Actions                            | Lint, build, test, deploy, release      |

> **Note Render free tier** : PostgreSQL free est supprimé après **90 jours d'inactivité**. Planifier une migration vers un plan payant ou un export régulier si le projet dure.

---

## Séparation Auth vs Permissions

```
JWT                          PostgreSQL
───────────────────          ────────────────────────────
{ email, exp }      →        SELECT role, plan
                             FROM users
Identity only                WHERE email = ?

                             Permissions toujours fraîches
```

Le JWT ne porte que l'identité. Les attributs métier (`role`, `plan`) sont toujours résolus depuis la DB à chaque requête. Un changement via `/admin` est immédiatement effectif sans aucun refresh de token.

---

## Structure du Projet

```
src/
  plugins/
    auth.plugin.ts        # Google OAuth2 — vérifie identité → émet JWT { email, exp }
    jwt.plugin.ts         # Vérifie JWT + lookup DB → attache req.user { email, role, plan }
    permissions.plugin.ts # Moteur ABAC — deny by default
    metrics.plugin.ts     # fastify-metrics (route /metrics protégée par Bearer token statique)
    logger.plugin.ts      # Pino + logfmt
    swagger.plugin.ts     # Swagger UI + OpenAPI spec
  routes/
    weather.ts            # GET /weather?city= et GET /weather/forecast
    weather.test.ts       # Tests intégration API
    admin/
      users.ts            # Routes admin utilisateurs
      users.test.ts       # Tests intégration admin
    auth.ts               # /auth/google + /auth/callback
  lib/
    owm-client.ts         # Client OpenWeatherMap (geocoding + weather + forecast)
    owm-client.test.ts    # Unitaire avec mock fetch
    weather.service.ts    # Orchestration : geocode → cache → meteo
    cache.ts              # Abstraction Redis (get/set/invalidate)
    cache.test.ts         # Unitaire
    geo.ts                # Détection zone Europe (liste de country codes)
  policies/
    weather.policy.ts     # Règles ABAC météo
    weather.policy.test.ts# Unitaires policies
    admin.policy.ts       # Règles ABAC admin
  db/
    schema.ts             # Schéma Drizzle (table users)
    migrations/           # Fichiers de migration générés par Drizzle Kit
  test/
    helpers/
      auth.helper.ts      # Génère JWT de test { email, exp }
      db.helper.ts        # Seed/reset DB entre les tests
      mock-openweather.ts # Fixture réponse OpenWeatherMap
  types/
    fastify.d.ts          # Augmentation req.user { email, role, plan }
  index.ts                # Factory exportée : buildApp() — importée par les tests
  server.ts               # Point d'entrée : buildApp() + listen() — jamais importé par les tests
.husky/
  pre-commit              # lint-staged (eslint --fix + prettier --write sur les fichiers stagés)
  commit-msg              # commitlint — vérifie le format conventional commit
.commitlintrc.json        # Config conventional commits
.release-please-config.json
CHANGELOG.md              # Généré et maintenu par Release Please
```

> **Naming** : `owm-client.ts` = client HTTP brut vers OpenWeatherMap. `weather.service.ts` = orchestration métier (geocode → cache → données). La distinction est intentionnelle pour isoler les responsabilités et faciliter le mock dans les tests.

---

## APIs OpenWeatherMap

### 1. Geocoding — nom de ville → coordonnées

```
GET http://api.openweathermap.org/geo/1.0/direct
    ?q={city},{country_code}&limit=1&appid={API_KEY}

Réponse utilisée : { lat, lon, country }
```

### 2. Current Weather — météo actuelle

```
GET https://api.openweathermap.org/data/2.5/weather
    ?lat={lat}&lon={lon}&units=metric&lang=fr&appid={API_KEY}
```

### 3. Forecast — prévisions 5 jours (plan pro uniquement)

```
GET https://api.openweathermap.org/data/2.5/forecast
    ?lat={lat}&lon={lon}&units=metric&lang=fr&appid={API_KEY}
```

---

## Cache Redis

### Deux niveaux de cache

| Niveau         | Clé                          | TTL                | Usage                          |
| -------------- | ---------------------------- | ------------------ | ------------------------------ |
| Geocoding      | `geo:{city_normalized}`      | 24h                | `city → { lat, lon, country }` |
| Météo actuelle | `weather:{lat2}:{lon2}`      | 10min              | Données météo                  |
| Prévisions     | `forecast:{lat2}:{lon2}`     | 1h                 | Prévisions 5 jours             |
| dailyCount     | `daily:{email}:{YYYY-MM-DD}` | jusqu'à minuit UTC | Compteur journalier            |

> **Clé lat/lon** : lat et lon sont arrondis à **2 décimales** (~1km de précision) avant construction de la clé, pour éviter les miss dus à la précision flottante.
>
> ```ts
> const lat2 = Math.round(lat * 100) / 100;
> const lon2 = Math.round(lon * 100) / 100;
> const key = `weather:${lat2}:${lon2}`;
> ```

> **dailyCount** : scoped par utilisateur (`email`), reset à minuit UTC via TTL calculé au moment de l'écriture (`EXPIREAT` à la prochaine minuit UTC). Fenêtre calendaire, pas glissante.

### Estimation Redis 25MB

| Donnée                                    | Volume estimé | Taille    |
| ----------------------------------------- | ------------- | --------- |
| Météo actuelle (~1KB × 5k villes actives) | 5k entrées    | ~5MB      |
| Prévisions (~4KB × 1k villes pro)         | 1k entrées    | ~4MB      |
| Geocoding (~200B × 8k villes)             | 8k entrées    | ~1.6MB    |
| dailyCount (~50B × 1k users actifs)       | 1k entrées    | ~0.05MB   |
| **Total estimé**                          |               | **~11MB** |

Marge confortable. Si besoin, réduire le TTL prévisions (1h → 30min) ou activer `maxmemory-policy allkeys-lru` sur Redis.

### Métriques custom

- `weather_cache_hit_total`
- `weather_cache_miss_total`

### Header de réponse

```
X-Cache-Status: HIT | MISS
```

### Logs logfmt

```
level=info msg="weather request" city=Paris cache=hit  duration=2ms   user=user@gmail.com
level=info msg="weather request" city=Lyon  cache=miss duration=187ms user=user@gmail.com
```

---

## ABAC — Règles Métier

### Détection "ville en Europe"

La réponse geocoding OWM inclut un champ `country` (code ISO 3166-1 alpha-2, ex: `"FR"`, `"DE"`). La vérification est faite dans `lib/geo.ts` avec une liste statique des 44 pays européens (UE + EEA + candidats pertinents).

```ts
// lib/geo.ts
const EUROPEAN_COUNTRIES = new Set([
  'AD',
  'AL',
  'AT',
  'BA',
  'BE',
  'BG',
  'BY',
  'CH',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GB',
  'GR',
  'HR',
  'HU',
  'IE',
  'IS',
  'IT',
  'LI',
  'LT',
  'LU',
  'LV',
  'MC',
  'MD',
  'ME',
  'MK',
  'MT',
  'NL',
  'NO',
  'PL',
  'PT',
  'RO',
  'RS',
  'RU',
  'SE',
  'SI',
  'SK',
  'SM',
  'TR',
  'UA',
  'VA',
  'XK',
]);

export const isEuropean = (countryCode: string): boolean =>
  EUROPEAN_COUNTRIES.has(countryCode.toUpperCase());
```

Le `countryCode` vient de la réponse geocoding, stocké dans le cache geocoding avec `{ lat, lon, country }`.

### Tableau des règles

| Action                     | Condition                              | Résultat |
| -------------------------- | -------------------------------------- | -------- |
| `weather:read:current`     | tout utilisateur authentifié           | ALLOW    |
| `weather:read:forecast`    | `plan === 'pro'` ou `role === 'admin'` | ALLOW    |
| `weather:read:forecast`    | `plan === 'free'`                      | DENY     |
| `weather:read`             | ville Europe, plan free                | ALLOW    |
| `weather:read`             | ville hors Europe, `plan === 'free'`   | DENY     |
| `weather:read`             | `dailyCount < 10`, plan free           | ALLOW    |
| `weather:read`             | `dailyCount >= 10`, plan free          | DENY     |
| `weather:cache:invalidate` | `role === 'admin'`                     | ALLOW    |
| `weather:cache:invalidate` | tout autre rôle                        | DENY     |
| `admin:manage:users`       | `role === 'admin'`                     | ALLOW    |
| `admin:manage:users`       | `role !== 'admin'`                     | DENY     |

### Garanties deny by default

| Scénario                            | Résultat           |
| ----------------------------------- | ------------------ |
| Nouvel utilisateur sans rôle        | DENY               |
| Nouvelle route sans policy          | DENY               |
| Nouvelle action sans règle          | DENY               |
| JWT manquant ou email inconnu en DB | DENY               |
| Erreur dans le moteur ABAC          | DENY (fail closed) |

---

## Flux de Requête Complet

```
GET /weather?city=Paris
        │
        ▼
   jwt.plugin
   1. Vérifie signature JWT → extrait email
   2. SELECT role, plan FROM users WHERE email = ?
   3. Attache req.user { email, role, plan }
   Token invalide ou email inconnu → 401
        │
        ▼
   permissions.plugin (ABAC — deny by default)
   Évalue les policies avec req.user + resource + action
   Aucune règle correspondante → 403 immédiat
        │
        ▼
   weather.service.ts
        │
        ├─ cache.get("geo:paris") ── HIT ──▶ { lat, lon, country }
        │
        └─ MISS ──▶ OWM Geocoding API → { lat, lon, country }
                          │
                          ▼
                    cache.set("geo:paris", { lat, lon, country }, TTL=24h)
        │
        ▼
   Vérification ABAC géographique (isEuropean(country) + plan)
        │
        ├─ cache.get("weather:48.85:2.35") ── HIT ──▶ return + log cache=hit
        │
        └─ MISS ──▶ OWM Weather API
                          │
                          ▼
                    cache.set("weather:48.85:2.35", data, TTL=10min)
                          │
                          ▼
                    return + log cache=miss
```

---

## Auth — Google OAuth2 + PostgreSQL

```
1. GET /auth/google → redirect Google consent screen

2. GET /auth/callback
        │
        ▼
   Échange code → id_token Google
        │
        ▼
   Vérification id_token (google-auth-library)
        │
        ▼
   SELECT * FROM users WHERE email = ?
        ├── trouvé     → récupère l'utilisateur existant
        └── pas trouvé → INSERT role='viewer', plan='free'
        │
        ▼
   JWT signé { email, exp: +1h }   ← identité uniquement
        │
        ▼
   Cookie httpOnly + secure → redirect /
```

### Table users (Drizzle schema)

```ts
// src/db/schema.ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  role: varchar('role', { length: 50 }).notNull().default('viewer'),
  plan: varchar('plan', { length: 50 }).notNull().default('free'),
});
```

```
users
────────────────────────────────────────
id | email              | role   | plan
---|--------------------| -------|------
1  | user@gmail.com     | viewer | free
2  | admin@gmail.com    | admin  | pro
```

> **JWT expiry** : le token expire après 1h. Dans Swagger UI, les appels après expiration retournent 401. Cliquer "Authorize" à nouveau avec un token frais. La durée courte est intentionnelle (pas de refresh token dans le scope actuel).

---

## Routes Admin

Accessibles à `role === 'admin'` uniquement (policy `admin:manage:users`). Comme les permissions sont résolues depuis la DB à chaque requête, tout changement est immédiatement effectif.

| Méthode | Route                   | Description                    |
| ------- | ----------------------- | ------------------------------ |
| GET     | `/admin/users`          | Lister tous les utilisateurs   |
| GET     | `/admin/users/:id`      | Détail d'un utilisateur        |
| PATCH   | `/admin/users/:id/plan` | Changer le plan (free/pro)     |
| PATCH   | `/admin/users/:id/role` | Changer le rôle (viewer/admin) |
| DELETE  | `/admin/users/:id`      | Supprimer un utilisateur       |

### Workflow de test ABAC depuis Swagger UI

```
1. Se connecter via GET /auth/google
2. Récupérer le JWT → cliquer "Authorize" dans /docs
   (token valide 1h — re-autoriser si expiré)
3. PATCH /admin/users/:id/plan { plan: "pro" }
4. GET /weather/forecast → immédiatement accessible
5. PATCH /admin/users/:id/plan { plan: "free" }
6. GET /weather/forecast → 403 immédiatement
```

---

## Documentation Swagger

| Endpoint                         | Auth               | Description            |
| -------------------------------- | ------------------ | ---------------------- |
| GET `/healthz`                   | ❌                 | Status de l'app        |
| GET `/auth/google`               | ❌                 | Redirect OAuth2 Google |
| GET `/weather`                   | ✅ JWT             | Météo actuelle         |
| GET `/weather/forecast`          | ✅ JWT (pro)       | Prévisions 5 jours     |
| POST `/weather/cache/invalidate` | ✅ JWT (admin)     | Invalide le cache      |
| GET `/admin/users`               | ✅ JWT (admin)     | Liste des utilisateurs |
| GET `/admin/users/:id`           | ✅ JWT (admin)     | Détail utilisateur     |
| PATCH `/admin/users/:id/plan`    | ✅ JWT (admin)     | Changer le plan        |
| PATCH `/admin/users/:id/role`    | ✅ JWT (admin)     | Changer le rôle        |
| DELETE `/admin/users/:id`        | ✅ JWT (admin)     | Supprimer utilisateur  |
| GET `/metrics`                   | ✅ Bearer statique | Métriques Prometheus   |
| GET `/docs`                      | ❌                 | Swagger UI             |

> **`/metrics`** : protégé par un Bearer token statique (`METRICS_TOKEN` env var) pour éviter l'exposition des données de topologie interne. Grafana Cloud est configuré avec ce token.

---

## Conventional Commits — Convention

| Type                           | Effet sur la version | Usage                                 |
| ------------------------------ | -------------------- | ------------------------------------- |
| `feat:`                        | minor bump (1.x.0)   | Nouvelle fonctionnalité               |
| `fix:`                         | patch bump (1.0.x)   | Correction de bug                     |
| `feat!:` ou `BREAKING CHANGE:` | major bump (x.0.0)   | Changement breaking                   |
| `chore:`                       | aucun                | Maintenance, deps                     |
| `docs:`                        | aucun                | Documentation                         |
| `test:`                        | aucun                | Ajout/modification de tests           |
| `ci:`                          | aucun                | Pipeline CI                           |
| `refactor:`                    | aucun                | Refactoring sans nouveau comportement |

### Exemples concrets pour ce projet

```
feat: add GET /weather/forecast endpoint
fix: handle unknown city name in geocoding
fix: round lat/lon to 2 decimals in cache key
feat!: require plan attribute in JWT payload
chore: upgrade fastify to v5
test: add ABAC integration tests for pro plan
ci: add redis service to github actions
docs: update swagger description for admin routes
feat: add geocoding cache with 24h TTL
```

---

## Flux de Versioning — Release Please

```
Commits sur main
      │
      ├─ feat: add forecast    ──▶  Release PR mis à jour
      ├─ fix: cache key bug    ──▶  Release PR mis à jour
      └─ feat: add admin ui    ──▶  Release PR mis à jour
                                          │
                                    Tu merges la Release PR
                                    quand tu es prêt
                                          │
                                          ▼
                               version bumped dans package.json
                               CHANGELOG.md mis à jour
                               Git tag créé (v1.2.0)
                               GitHub Release créée
                               CI déclenche le deploy Render
```

---

## Tests

### Niveau 1 — Unitaires

```typescript
// Policies ABAC
test('free user peut lire météo actuelle');
test('free user bloqué sur les prévisions');
test('free user bloqué après 10 requêtes/jour');
test('free user bloqué sur ville hors Europe');
test('pro user peut lire les prévisions');
test('pro user peut lire ville hors Europe');
test('admin peut invalider le cache');
test('admin peut accéder aux routes /admin');
test('viewer bloqué sur les routes /admin');
test('rôle inconnu → DENY');
test('attributs manquants → DENY');

// Cache
test('cache miss retourne null');
test('cache hit retourne la valeur');
test('TTL expiré retourne null');
test('clé météo basée sur lat+lon arrondis à 2 décimales');
test('clé geocoding basée sur city normalisée, pas lat/lon');
test('dailyCount incrémenté par user');
test('dailyCount expire à minuit UTC');

// Géographie
test('code "FR" → isEuropean true');
test('code "US" → isEuropean false');
test('code "TR" → isEuropean true');
test('code inconnu → isEuropean false');
```

### Niveau 2 — Intégration API

```typescript
// Auth
test('sans token → 401');
test('token expiré → 401');
test('token malformé → 401');
test('email inconnu en DB → 401');

// Permissions ABAC — résolues depuis la DB
test('viewer, météo actuelle, ville Europe → 200');
test('viewer, prévisions → 403');
test('viewer, ville hors Europe, plan free → 403');
test('viewer, 11ème requête du jour → 403');
test('pro, prévisions → 200');
test('pro, ville hors Europe → 200');
test('admin, toutes les actions → 200');
test('viewer, route /admin → 403');

// Changement de plan immédiatement effectif
test('update plan free→pro, requête suivante débloque forecast');
test('update plan pro→free, requête suivante bloque forecast');

// Comportement métier
test('ville inconnue → 404');
test('paramètre city manquant → 400');
test('OpenWeatherMap en erreur → 502');

// Cache deux niveaux
test('première requête → geocoding miss + weather miss, 2 appels OWM');
test('deuxième requête même ville → geocoding hit + weather hit, 0 appel OWM');
test('cache météo expiré → geocoding hit + weather miss, 1 appel OWM');
test('header X-Cache-Status présent dans la réponse');

// Admin
test('GET /admin/users (admin) → liste les utilisateurs');
test('GET /admin/users (viewer) → 403');
test('PATCH /admin/users/:id/plan → mise à jour immédiate');
test('PATCH /admin/users/:id/role → mise à jour immédiate');
test("DELETE /admin/users/:id → supprime l'utilisateur");
test('admin invalide le cache → 200');
test('viewer invalide le cache → 403');

// Métriques
test('GET /metrics sans token → 401');
test('GET /metrics avec METRICS_TOKEN → 200, contient weather_cache_hit_total');
```

---

## CI — GitHub Actions

| Événement        | Lint | Commit check | Build | Tests | Release PR        | Deploy        |
| ---------------- | ---- | ------------ | ----- | ----- | ----------------- | ------------- |
| PR → main        | ✅   | ✅           | ✅    | ✅    | ❌                | ❌            |
| Push main        | ✅   | ✅           | ✅    | ✅    | ✅ Release Please | ✅ prod       |
| Push develop     | ✅   | ✅           | ✅    | ✅    | ❌                | ✅ preview    |
| Merge Release PR | —    | —            | —     | —     | —                 | ✅ prod + tag |

### Jobs GitHub Actions

```yaml
# Actions utilisées (versions courantes — à mettre à jour si nouvelle major)
actions/checkout@v6
pnpm/action-setup@v5          # version pnpm résolue depuis packageManager dans package.json
actions/setup-node@v6         # node-version: 'lts/*'
googleapis/release-please-action@v4

# Job 1 — Lint & Type Check
- tsc --noEmit
- eslint
- prettier --check

# Job 2 — Commit lint (CI safety net)
- pnpm exec commitlint --from origin/main --to HEAD --verbose

# Job 3 — Build
- tsup src/server.ts --format esm --dts

# Job 4 — Test (activé à partir de la Phase 2)
- vitest
services:
  postgres:
    image: postgres:16
  redis:
    image: redis:7

# Job 5 — Release Please (main uniquement)
- release-please action
  → maintient la Release PR
  → crée tag + GitHub Release au merge

# Job 6 — Deploy Render
- trigger via webhook
  → sur push develop : preview
  → sur merge Release PR : prod
```

### Secrets GitHub

```
RENDER_DEPLOY_HOOK_URL
OPENWEATHER_API_KEY
JWT_SECRET
METRICS_TOKEN
GITHUB_TOKEN              # Requis par Release Please pour créer la Release PR
```

---

## Enforcement Local — Husky + lint-staged + commitlint

```
git commit -m "feat: add forecast route"
        │
        ▼
   .husky/pre-commit
        │
        ▼
   lint-staged — sur les fichiers stagés uniquement
        ├─ *.ts              → eslint --fix  →  prettier --write
        └─ *.{json,yml,yaml,md} → prettier --write
        │
        ├─ ✅ fichiers propres → continue
        └─ ❌ erreur lint non auto-fixable → commit bloqué
        │
        ▼
   .husky/commit-msg
        │
        ▼
   commitlint vérifie le message
        │
        ├─ ✅ "feat: add forecast route"     → commit accepté
        └─ ❌ "add forecast route"           → commit bloqué
              "WIP"                          → commit bloqué
              "fix stuff"                    → commit bloqué
```

---

## Déploiement Render

| Service               | Plan                                  | Coût |
| --------------------- | ------------------------------------- | ---- |
| Web Service (Node.js) | Free (512MB, 0.1 CPU)                 | 0€   |
| PostgreSQL            | Free (1GB, **expire après 90 jours**) | 0€   |
| Redis                 | Free (25MB)                           | 0€   |

### Variables d'environnement Render

```
OPENWEATHER_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
JWT_SECRET
METRICS_TOKEN
DATABASE_URL
REDIS_URL
```

> **Cold start** : contournable avec UptimeRobot qui ping `/healthz` toutes les 5 minutes.
>
> **PostgreSQL 90 jours** : prévoir un export `pg_dump` mensuel ou migrer vers un plan payant avant expiration.

---

## Phases de Développement

### Phase 1 — Socle déployé et opérationnel

**Objectif** : avoir une URL publique fonctionnelle le plus vite possible.

- Initialisation du repo GitHub (main + develop)
- Setup TypeScript + Fastify + tsup
- Logger Pino + logfmt
- Route `/healthz` → `{ status: "ok" }`
- `swagger.plugin.ts` — Swagger UI accessible sur `/docs`
- Setup husky : `pre-commit` (lint-staged) + `commit-msg` (commitlint)
- Setup Release Please (GitHub Action + config)
- Pipeline CI : lint + commit check + build + deploy (job test commenté jusqu'à Phase 2)
- Connexion Render (Web Service uniquement)

**Livrable** : une URL Render qui répond, `/docs` accessible, CI verte, commits conventionnels enforced, lint + format enforced localement, Release PR automatique dès le premier `feat:`.

---

### Phase 2 — Météo sans auth

**Objectif** : valider l'intégration OpenWeatherMap de bout en bout.

- `lib/owm-client.ts` — Geocoding API + Current Weather API
- `lib/cache.ts` — abstraction Redis (deux niveaux : geocoding + météo)
- Clé geocoding : `geo:{city_normalized}`, TTL 24h
- Clé météo : `weather:{lat2}:{lon2}`, lat/lon arrondis à 2 décimales, TTL 10min
- `lib/weather.service.ts` — orchestration geocode → cache → meteo
- Route `GET /weather?city=` — ouverte, pas d'auth encore
- Header `X-Cache-Status: HIT | MISS`
- Schémas Zod sur la route → auto-documentés dans `/docs`
- Tests unitaires `owm-client.ts` + `cache.ts`
- Connexion Redis sur Render

**Livrable** : `GET /weather?city=Paris` testable depuis `/docs`, cache deux niveaux fonctionnel, version `1.0.0` via Release Please.

---

### Phase 3 — Authentification Google

**Objectif** : sécuriser l'app avec Google OAuth2 + PostgreSQL.

- `plugins/auth.plugin.ts` — OAuth2 dance Google
- `plugins/jwt.plugin.ts` — vérification JWT + lookup DB → `req.user { email, role, plan }`
- Schema Drizzle + migration PostgreSQL (table `users`)
- Upsert utilisateur au callback avec `role='viewer'`, `plan='free'` par défaut
- Cookie httpOnly + secure
- Bouton "Authorize" dans Swagger UI pour tester avec JWT (note : token expire en 1h)
- Connexion PostgreSQL sur Render
- Tests d'intégration auth

**Livrable** : impossible d'accéder à `/weather` sans être connecté, permissions résolues depuis la DB.

---

### Phase 4 — Observabilité

**Objectif** : avoir une visibilité sur l'app en production.

- `plugins/metrics.plugin.ts` — fastify-metrics, route `/metrics` protégée par `METRICS_TOKEN`
- Compteurs custom `weather_cache_hit_total` + `weather_cache_miss_total`
- Enrichissement logs logfmt (`cache=hit|miss`, `user=`, `duration=`)
- Dashboard Grafana Cloud (hit rate cache, latence, error rate)
- UptimeRobot sur `/healthz` pour éviter le cold start Render

**Livrable** : dashboard Grafana opérationnel, métriques cache visibles, `/metrics` non accessible sans token.

---

### Phase 5 — ABAC + Interface Admin

**Objectif** : démontrer le contrôle d'accès par attributs et permettre de le tester facilement.

- `lib/geo.ts` — `isEuropean(countryCode)` avec liste statique de 44 pays
- `plugins/permissions.plugin.ts` — moteur ABAC deny by default
- `policies/weather.policy.ts` — règles métier (current, forecast, géographie, dailyCount)
- `policies/admin.policy.ts` — invalidation cache + gestion utilisateurs (`role === 'admin'`)
- Route `GET /weather/forecast` (plan pro)
- Route `POST /weather/cache/invalidate` (admin)
- Compteur journalier dans Redis (`daily:{email}:{YYYY-MM-DD}`, EXPIREAT minuit UTC)
- Routes `GET|PATCH|DELETE /admin/users` — accessibles à `role === 'admin'` uniquement
- Documentation Swagger mise à jour (scopes par rôle/plan visibles)
- Tests unitaires policies + tests intégration ABAC + tests admin complets

**Livrable** : les règles viewer/pro/admin fonctionnent et sont testables en temps réel depuis `/docs` — un changement de plan via `/admin` est immédiatement reflété sans aucun refresh de token.

---

## Roadmap Future

- **Sentry** — capture d'erreurs avec contexte `req.user`
- **Cache DB lookup** — Redis TTL 1-2min sur `email → { role, plan }` pour éviter le roundtrip DB à chaque requête à l'échelle
- **Refresh token** — renouvellement JWT sans re-login Google
- **Rate limiting technique** — `@fastify/rate-limit` en complément de l'ABAC
- **Forecast 16 jours** — plan premium OpenWeatherMap
- **Multi-IdP** — GitHub OAuth2 en plus de Google
- **Migration PostgreSQL** — plan payant avant les 90 jours si projet en production

---

## Vue d'ensemble des phases

```
Phase 1       Phase 2       Phase 3       Phase 4       Phase 5
──────────    ──────────    ──────────    ──────────    ──────────
Socle     ──▶ Météo     ──▶ Auth      ──▶ Obs.      ──▶ ABAC
déployé       sans          Google        Grafana       + Admin
CI verte      auth          + DB          métriques     + tests
/docs         cache 2       lookup        /metrics      /docs
commits       niveaux       DB/requête    protégé       complet
enforced      geo cache     Drizzle                     admin
Release       lat/lon       migrations                  protégé
Please        arrondi                                   geo.ts
```
