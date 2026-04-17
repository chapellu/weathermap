# Fastify Meteo API

A weather REST API built with Fastify, TypeScript, and OpenWeatherMap. Deployed on Render.

**Live:** https://weathermap-2pyq.onrender.com  
**Docs:** https://weathermap-2pyq.onrender.com/docs

> Free tier cold start: the first request may take ~50s if the instance has spun down.

---

## Stack

| Layer     | Choice                                    |
| --------- | ----------------------------------------- |
| Runtime   | Node.js 22 + TypeScript                   |
| Framework | Fastify 5                                 |
| Auth      | Google OAuth2 + JWT (identity only)       |
| Database  | PostgreSQL via Drizzle ORM                |
| Cache     | Redis — geocoding (24h) + weather (10min) |
| Logging   | Pino + logfmt                             |
| Metrics   | Prometheus (`/metrics`) + Grafana Cloud   |
| Docs      | Swagger UI (`/docs`)                      |
| PaaS      | Render (free tier)                        |

---

## Getting started

**Prerequisites:** Node.js ≥ 22, pnpm ≥ 9

```bash
pnpm install
cp .env.example .env   # fill in the required variables
pnpm dev
```

### Environment variables

```
OPENWEATHER_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
JWT_SECRET=                 # min 32 chars
METRICS_TOKEN=
DATABASE_URL=
REDIS_URL=
NODE_ENV=development
```

---

## Scripts

```bash
pnpm dev            # start with hot reload (tsx watch)
pnpm build          # compile to dist/ (tsup, ESM)
pnpm start          # run compiled output
pnpm test           # vitest run
pnpm test:watch     # vitest watch mode
pnpm test:coverage  # vitest + coverage report
pnpm lint           # eslint (0 warnings allowed)
pnpm lint:fix       # eslint --fix
pnpm format         # prettier --write src/
pnpm format:check   # prettier check (used in CI)
pnpm typecheck      # tsc --noEmit
pnpm db:generate    # drizzle-kit generate migrations
pnpm db:migrate     # drizzle-kit run migrations
```

---

## Project structure

```
src/
  plugins/
    auth.plugin.ts        # JWT sign/verify + DB lookup → req.user
    metrics.plugin.ts     # GET /metrics — Prometheus (Bearer-protected)
    logger.plugin.ts      # Pino hooks: incoming request + onResponse (cache, user, duration)
    swagger.plugin.ts     # OpenAPI spec + Swagger UI
  routes/
    weather.ts            # GET /weather
    weather.test.ts
    auth.ts               # GET /auth/google, GET /auth/callback
  lib/
    owm-client.ts         # OpenWeatherMap HTTP client
    weather.service.ts    # Orchestration: geocode → cache → weather
    cache.ts              # Redis abstraction (two-level: geo 24h, weather 10min)
    metrics.ts            # prom-client registry + cache hit/miss counters
    env.ts                # Zod env validation
  db/
    schema.ts             # Drizzle schema (users table)
    migrations/
  test/helpers/           # JWT test helper
  types/
    fastify.d.ts          # req.user augmentation
  index.ts                # buildApp() factory — used by tests
  server.ts               # Entry point: buildApp() + listen()
```

---

## API

| Method | Route            | Auth         | Description                  |
| ------ | ---------------- | ------------ | ---------------------------- |
| GET    | `/healthz`       | —            | Health check                 |
| GET    | `/version`       | —            | App version                  |
| GET    | `/docs`          | —            | Swagger UI                   |
| GET    | `/auth/google`   | —            | Redirect to Google consent   |
| GET    | `/auth/callback` | —            | OAuth2 callback → JWT cookie |
| GET    | `/weather`       | JWT          | Current weather for a city   |
| GET    | `/metrics`       | Bearer token | Prometheus metrics           |

---

## Local enforcement

```
git commit
  ├─ pre-commit  → lint-staged (eslint --fix + prettier on staged files)
  └─ commit-msg  → commitlint (conventional commits)
```

Commit format: `type: short description` — e.g. `feat: add forecast endpoint`

---

## CI (GitHub Actions)

| Event        | Lint | Commit check | Build | Tests | Release PR | Deploy     |
| ------------ | ---- | ------------ | ----- | ----- | ---------- | ---------- |
| PR → main    | ✅   | ✅           | ✅    | ✅    | —          | —          |
| Push main    | ✅   | ✅           | ✅    | ✅    | ✅         | ✅ prod    |
| Push develop | ✅   | ✅           | ✅    | ✅    | —          | ✅ preview |
