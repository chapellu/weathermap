# Coding Guidelines

## Gestionnaire de paquets — pnpm

Tout le projet utilise **pnpm** exclusivement. Ne jamais utiliser `npm` ou `yarn`.

```bash
pnpm install
pnpm add fastify
pnpm add -D typescript vitest
pnpm dev / build / test / lint
```

`package.json` doit inclure :
```json
{ "engines": { "node": ">=24", "pnpm": ">=9" }, "packageManager": "pnpm@9.15.4" }
```

`.npmrc` à la racine : `engine-strict=true`

---

## TypeScript — Configuration stricte

`tsconfig.json` en mode strict complet :

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "paths": { "@/*": ["./src/*"], "#mocks/*": ["./__mocks__/*"] },
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

> `moduleResolution: "Bundler"` choisi car fastify n'a pas de champ `exports`, rendant `Node16` incompatible.
> `rootDir` absent intentionnellement : `__mocks__/ioredis.ts` est à la racine (convention Vitest), hors de `src/`.

Règles :
- **Pas de `any`** — utiliser `unknown` + narrowing
- **Pas d'assertion `!`** — gérer null/undefined explicitement
- **Pas de `as Type`** sauf à la frontière (JSON, réponse externe) — préférer Zod
- **Types explicites sur les fonctions exportées**

---

## Clean Code

### Nommage

- Variables : intention claire, pas d'abréviation (`req`/`res` acceptés par convention Fastify)
- Fonctions : verbe + nom (`getUser`, `buildCacheKey`, `isEuropean`)
- Booléens : préfixe `is` / `has` / `can`
- Constantes : `SCREAMING_SNAKE_CASE`

### Fonctions

- **Une responsabilité** par fonction
- **Pas plus de 3 paramètres** — au-delà, objet options typé
- **Pas d'effets de bord cachés**
- **Retour explicite** sur les fonctions exportées

```typescript
// ✅ responsabilités séparées
async function geocodeCity(city: string): Promise<Coords> { ... }
async function fetchCurrentWeather(coords: Coords): Promise<WeatherData> { ... }
async function incrementDailyCount(email: string): Promise<void> { ... }
```

### Modules

- **Injection de dépendances via les plugins Fastify** — pas d'imports directs de singletons dans les handlers
- **Pas de logique métier dans les routes** — les routes orchestrent, les services exécutent

```typescript
// ✅
fastify.get('/weather', async (req, reply) => {
  const weather = await weatherService.getWeather(req.query.city, req.user);
  return reply.send(weather);
});
```

### Gestion des erreurs

- **Erreurs typées** — classes d'erreur métier explicites
- **Ne jamais swallower une erreur**
- **Fail fast** — valider les inputs à l'entrée (Zod)
- **Erreurs HTTP via `fastify.httpErrors`** (`@fastify/sensible`)

### Immutabilité

- `const` systématiquement, `let` seulement si la valeur change
- Méthodes non-mutantes (`map`, `filter`, `reduce`)

---

## Structure et organisation des fichiers

- Tests dans le même dossier que le fichier testé (`weather.service.ts` / `weather.service.test.ts`)
- Types partagés dans `src/types/`
- **Pas d'export default** — toujours nommé
- **Barrel files (`index.ts`) au minimum**
- Un fichier = un concept principal (~200 lignes max)

---

## Validation — Zod

Toutes les données à la frontière (inputs HTTP, réponses OWM, variables d'env) validées avec Zod.

```typescript
// Variables d'env — validées au démarrage, crash immédiat si invalide
export const env = EnvSchema.parse(process.env);

// Paramètres de route
const WeatherQuerySchema = z.object({ city: z.string().min(1).max(100).trim() });

// Réponse externe — schema minimal, ne parser que ce qu'on utilise
```

---

## Linting et formatage — Biome

ESLint + Prettier remplacés par **Biome** (lint + format en un seul outil).

```json
{
  "linter": {
    "rules": {
      "recommended": true,
      "correctness": { "noUnusedVariables": "error" },
      "style": { "useImportType": "error" },
      "suspicious": { "noExplicitAny": "error", "noConsole": "error" },
      "nursery": { "noFloatingPromises": "error" }
    }
  },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "javascript": { "formatter": { "trailingCommas": "all", "semicolons": "always", "quoteStyle": "single" } },
  "assist": { "actions": { "source": { "organizeImports": "on" } } }
}
```

Scripts `package.json` :
```json
{
  "dev": "tsx watch --env-file=.env src/server.ts",
  "build": "tsup src/server.ts --format esm",
  "start": "node dist/server.js",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "lint": "biome lint src",
  "lint:fix": "biome lint --write src",
  "format": "biome format --write src",
  "check": "biome check src",
  "check:fix": "biome check --write src",
  "typecheck": "tsc --noEmit",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "prepare": "husky"
}
```

`lint-staged`: `"*.{ts,json,yml,yaml,md}": ["biome check --write --no-errors-on-unmatched"]`

---

## Git — Workflow

```
main        ← production, merge via PR uniquement
  └─ develop ← intégration, deploy preview Render
       └─ feat/xxx  ← feature branches (< 2 jours)
       └─ fix/xxx   ← bugfix branches
```

- Commits atomiques : un commit = un changement cohérent et buildable
- **Conventional Commits** (voir `auth-and-routes.md` pour la table complète)
  - ✅ `feat: add geocoding cache with 24h TTL`
  - ❌ `Added geocoding cache.`
