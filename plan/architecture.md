# Architecture

## Stack Technique

| Couche        | Choix                                  | Justification                        |
| ------------- | -------------------------------------- | ------------------------------------ |
| Runtime       | TypeScript + Fastify                   | Léger, performant, plugin-based      |
| Weather API   | OpenWeatherMap (clé API)               | Geocoding + météo, une seule clé     |
| Auth IdP      | Google OAuth2                          | OIDC standard                        |
| Utilisateurs  | PostgreSQL (Render free)               | Source de vérité pour role + plan    |
| Migrations DB | Drizzle ORM                            | Léger, type-safe, sans codegen lourd |
| Cache         | Redis (Render free, 25MB)              | ~10k villes, TTL 10min               |
| Logging       | Pino + logfmt                          | Natif Fastify, format structuré      |
| Métriques     | fastify-metrics + Grafana Cloud        | Hit/miss cache, latence par route    |
| Documentation | @fastify/swagger + @fastify/swagger-ui | Swagger UI intégré                   |
| Commits       | Conventional Commits + commitlint + husky | Enforcement local + CI            |
| Versioning    | Release Please                         | Trunk-based, Release PR, changelog   |
| PaaS          | Render                                 | Free tier app + Redis + Postgres     |
| CI            | GitHub Actions                         | Lint, build, test, deploy, release   |

---

## Séparation Auth vs Permissions

```
JWT                          PostgreSQL
───────────────────          ────────────────────────────
{ email, exp }      →        SELECT role, plan
                             FROM users WHERE email = ?
Identity only
                             Permissions toujours fraîches
```

Le JWT ne porte que l'identité. Les attributs métier (`role`, `plan`) sont résolus depuis la DB à chaque requête → un changement via `/admin` est immédiatement effectif.

---

## Structure du Projet

```
__mocks__/
  ioredis.ts              # Mock ioredis (racine — convention Vitest pour modules node)
src/
  plugins/
    auth.plugin.ts        # JWT sign + authenticate preHandler + Google OAuth2
    permissions.plugin.ts # Moteur ABAC — deny by default
    metrics.plugin.ts     # fastify-metrics + route /metrics (Bearer JWT)
    logger.plugin.ts      # Pino + logfmt
    swagger.plugin.ts     # Swagger UI + OpenAPI spec
  routes/
    weather.ts            # GET /weather, GET /weather/forecast, POST /weather/cache/invalidate
    weather.test.ts
    me.ts                 # GET /me, PATCH /me/plan, DELETE /me/daily-count
    me.test.ts
    admin/
      users.ts            # Routes admin utilisateurs
      users.test.ts
    auth.ts               # /auth/google + /auth/callback (dans auth.plugin.ts sur review-feedback)
  lib/
    owm-client.ts         # Client HTTP brut OpenWeatherMap (geocoding + weather + forecast)
    weather.service.ts    # Orchestration : geocode → cache → données
    cache.ts              # Abstraction Redis (get/set/delete/dailyCount)
    geo.ts                # Détection zone Europe (44 country codes)
    env.ts                # Validation Zod des variables d'environnement
    config.ts             # Constantes centralisées (TTLs, limites, JWT, OWM)
    metrics.ts            # Registry custom prom-client (hit/miss counters)
  policies/
    weather.policy.ts / weather.policy.test.ts
    admin.policy.ts   / admin.policy.test.ts
  db/
    schema.ts             # Schéma Drizzle (table users)
    client.ts             # Singleton drizzle (toujours mocké en test)
    migrations/
  test/helpers/
    auth.helper.ts        # Génère JWT de test
    mocks.ts              # setupDbSelectUser()
  types/
    fastify.d.ts          # Augmentation req.user { email, role, plan }
  index.ts                # Factory : buildApp() — importée par les tests
  server.ts               # Point d'entrée : buildApp() + listen()
  __mocks__/env.ts        # Mock lib/env.ts
```

---

## APIs OpenWeatherMap

```
GET http://api.openweathermap.org/geo/1.0/direct
    ?q={city}&limit=1&appid={API_KEY}
    → { lat, lon, country }

GET https://api.openweathermap.org/data/2.5/weather
    ?lat={lat}&lon={lon}&units=metric&lang=fr&appid={API_KEY}

GET https://api.openweathermap.org/data/2.5/forecast
    ?lat={lat}&lon={lon}&units=metric&lang=fr&appid={API_KEY}
```

---

## Cache Redis

| Niveau         | Clé                          | TTL         |
| -------------- | ---------------------------- | ----------- |
| Geocoding      | `geo:{city_normalized}`      | 24h         |
| Météo actuelle | `weather:{lat2}:{lon2}`      | 10min       |
| Prévisions     | `forecast:{lat2}:{lon2}`     | 1h          |
| dailyCount     | `daily:{email}:{YYYY-MM-DD}` | jusqu'à minuit UTC |

> lat/lon arrondis à **2 décimales** avant construction de la clé (~1km précision).
> dailyCount : fenêtre calendaire (pas glissante), EXPIREAT à la prochaine minuit UTC.

Estimation Redis 25MB : ~11MB utilisés (météo 5MB + prévisions 4MB + geocoding 1.6MB + counters ~0MB).

Métriques custom : `weather_cache_hit_total`, `weather_cache_miss_total`
Header de réponse : `X-Cache-Status: HIT | MISS`

---

## ABAC — Règles Métier

### isEuropean — `lib/geo.ts`

Liste statique de 44 pays (UE + EEA + candidats) : `AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM TR UA VA XK`

```ts
export const isEuropean = (countryCode: string): boolean =>
  EUROPEAN_COUNTRIES.has(countryCode.toUpperCase());
```

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
| `admin:manage:users`       | `role === 'admin'`                     | ALLOW    |
| toute autre combinaison    | —                                      | DENY     |

### Garanties deny by default

| Scénario                            | Résultat           |
| ----------------------------------- | ------------------ |
| Nouvel utilisateur sans rôle        | DENY               |
| Nouvelle route sans policy          | DENY               |
| JWT manquant ou email inconnu en DB | DENY               |
| Erreur dans le moteur ABAC          | DENY (fail closed) |

---

## Flux de Requête Complet

```
GET /weather?city=Paris
        │
        ▼
   auth.plugin — vérifie JWT → SELECT role, plan → attache req.user
   Token invalide ou email inconnu → 401
        │
        ▼
   permissions.plugin (ABAC deny by default) → 403 si aucune règle
        │
        ▼
   weather.service.ts
        ├─ cache.get("geo:paris") ── HIT ──▶ { lat, lon, country }
        └─ MISS ──▶ OWM Geocoding → cache.set("geo:paris", TTL=24h)
        │
        ▼
   Vérification géo (isEuropean + plan)
        ├─ cache.get("weather:48.85:2.35") ── HIT ──▶ return + log cache=hit
        └─ MISS ──▶ OWM Weather API → cache.set(TTL=10min) → return + log cache=miss
```
