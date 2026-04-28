# Infra, CI et Phases de Développement

## CI — GitHub Actions

| Événement        | Lint | Commit check | Build | Tests | Release PR        | Deploy        |
| ---------------- | ---- | ------------ | ----- | ----- | ----------------- | ------------- |
| PR → main        | ✅   | ✅           | ✅    | ✅    | ❌                | ❌            |
| Push main        | ✅   | ✅           | ✅    | ✅    | ✅ Release Please | ✅ prod       |
| Push develop     | ✅   | ✅           | ✅    | ✅    | ❌                | ✅ preview    |
| Merge Release PR | —    | —            | —     | —     | —                 | ✅ prod + tag |

### Jobs

```yaml
# Actions utilisées
actions/checkout@v6
pnpm/action-setup@v5   # version pnpm résolue depuis packageManager dans package.json
actions/setup-node@v6
actions/upload-artifact@v4
googleapis/release-please-action@v4

# Job 1 — Lint & Type Check (node-version: lts/*)
- tsc --noEmit
- biome lint src
- biome format src --check

# Job 2 — Commit lint
- pnpm exec commitlint --from origin/main --to HEAD --verbose

# Job 3 — Build (node-version: lts/*)
- tsup src/server.ts --format esm

# Job 4 — Test & Coverage (node-version: '24' — engine strict >=24)
- vitest run --coverage  → échoue si seuils non atteints
- upload-artifact: coverage/ (retention 7j, if: always())

# Job 5 — Release Please (main, needs: lint, build, test)
# Job 6 — Deploy Render (sur release_created uniquement, via webhook)
```

> `node-version: '24'` sur le job test : reproduit exactement l'environnement de production (`engines.node >= 24`).

### Secrets GitHub

```
RENDER_DEPLOY_HOOK_URL
OPENWEATHER_API_KEY
JWT_SECRET
METRICS_TOKEN
GITHUB_TOKEN    # Requis par Release Please
```

---

## Enforcement Local — Husky + lint-staged + commitlint

```
git commit -m "feat: add forecast route"
        │
        ▼
   .husky/pre-commit → lint-staged (fichiers stagés uniquement)
        ├─ *.ts / *.{json,yml,yaml,md} → biome check --write
        ├─ ✅ propre → continue
        └─ ❌ erreur non auto-fixable → commit bloqué
        │
        ▼
   .husky/commit-msg → commitlint
        ├─ ✅ "feat: add forecast route" → commit accepté
        └─ ❌ "WIP" / "fix stuff" / sans type → commit bloqué
```

---

## Déploiement Render

| Service               | Plan                                   | Coût |
| --------------------- | -------------------------------------- | ---- |
| Web Service (Node.js) | Free (512MB, 0.1 CPU)                  | 0€   |
| PostgreSQL            | Free (1GB, **expire après 90 jours**) | 0€   |
| Redis                 | Free (25MB)                            | 0€   |

Variables d'environnement Render :
```
OPENWEATHER_API_KEY  GOOGLE_CLIENT_ID  GOOGLE_CLIENT_SECRET
JWT_SECRET  METRICS_TOKEN  DATABASE_URL  REDIS_URL
```

> **Cold start** : UptimeRobot ping `/healthz` toutes les 5 minutes.
> **PostgreSQL 90 jours** : prévoir `pg_dump` mensuel ou migrer vers plan payant.

---

## Phases de Développement

### Phase 1 — Socle déployé ✅
URL publique fonctionnelle, `/docs`, CI verte, commits enforced, Release Please.
- TypeScript + Fastify + tsup, Logger Pino, `/healthz`, Swagger UI
- Husky (pre-commit + commit-msg), Release Please, CI lint+build+deploy

### Phase 2 — Météo sans auth ✅
`GET /weather?city=` testable, cache deux niveaux, version `1.0.0`.
- `env.ts`, `owm-client.ts`, `weather.service.ts`, `cache.ts`
- Cache géo (`geo:{city}`, 24h) + météo (`weather:{lat2}:{lon2}`, 10min)
- Tests intégration via `app.inject()` + mock `fetch`

### Phase 3 — Authentification Google ✅
`/weather` inaccessible sans connexion, permissions résolues depuis DB.
- `auth.plugin.ts` — JWT sign + authenticate + Google OAuth2
- Drizzle schema + migration PostgreSQL (table `users`)
- Upsert utilisateur au callback (`role='viewer'`, `plan='free'`)
- Cookie httpOnly + secure, helpers de test JWT

### Phase 4 — Observabilité ✅
Métriques cache visibles, `/metrics` protégé.
- `metrics.plugin.ts` — fastify-metrics + `/metrics` (Bearer JWT)
- `lib/metrics.ts` — registry custom `prom-client`
- Enrichissement logs (`cache=hit|miss`, `user=email`, `duration=ms`)

### Phase 5 — ABAC + Interface Admin ✅
Règles viewer/pro/admin testables en temps réel depuis `/docs`.
- `geo.ts`, `permissions.plugin.ts`, `weather.policy.ts`, `admin.policy.ts`
- `GET /weather/forecast` (pro), `POST /weather/cache/invalidate` (admin)
- Compteur journalier Redis (`daily:{email}:{YYYY-MM-DD}`, EXPIREAT minuit UTC)
- Routes `/admin/users` (CRUD), routes `/me`
- Tests unitaires policies + intégration ABAC + coverage CI

---

## Roadmap Future

- **Sentry** — capture d'erreurs avec contexte `req.user`
- **Cache DB lookup** — Redis TTL 1-2min sur `email → { role, plan }` pour éviter le roundtrip DB à chaque requête
- **Refresh token** — renouvellement JWT sans re-login Google
- **Rate limiting technique** — `@fastify/rate-limit` en complément de l'ABAC
- **Forecast 16 jours** — plan premium OpenWeatherMap
- **Multi-IdP** — GitHub OAuth2 en plus de Google
- **Migration PostgreSQL** — plan payant avant les 90 jours si projet en production
