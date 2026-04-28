# Tasks

## Done

- [x] Phase 1 — Socle : Fastify + Swagger + CI + Release Please + Husky
- [x] Phase 2 — Météo : OWM client + cache Redis deux niveaux + `GET /weather`
- [x] Phase 3 — Auth : Google OAuth2 + Drizzle/PostgreSQL + JWT cookie
- [x] Phase 4 — Observabilité : fastify-metrics + `/metrics` + enrichissement logs
- [x] Phase 5 — ABAC : policies + `/weather/forecast` + `/admin/users` + `/me` + coverage CI
- [x] Migrate ESLint/Prettier → Biome
- [x] Fix TypeScript 6 (`baseUrl` → `paths`, `.$type<>()` sur Drizzle schema)
- [x] Merge auth routes into `auth.plugin.ts`
- [x] Centralize hardcoded values into `src/lib/config.ts`
- [x] Remove direct `process.env` access outside `env.ts` (add `PORT` to env schema)
- [x] Split `fastify-meteo-plan.md` into focused files under `plan/`

## In Progress (branch: `review-feedback`)

- [ ] Review feedback address — ongoing

## Roadmap (not started)

### Features
- [ ] Use UUIDs for user IDs instead of sequential IDs (prevents enumeration)
- [ ] Hide admin endpoints from Swagger UI

### Security & Infrastructure
- [ ] JTI blacklist — revoke compromised tokens before expiry
- [ ] Network-level rate limiting (WAF / nginx `limit_req`) — current limit is application-level only
- [ ] Vulnerability scanning (Snyk / `npm audit`) in CI
- [ ] IaC with Terraform (DB, cache, secrets)
- [ ] Staging environment
- [ ] Protect `main` branch (required reviews + passing CI)
- [ ] Regular `pg_dump` backups

### Observability
- [ ] OpenTelemetry tracing → Grafana Tempo
- [ ] Grafana dashboard (latency p95/p99, cache hit/miss, error rate)
- [ ] Alerts: 5xx > 1%, p95 latency > 2s, OWM quota threshold
- [ ] Sentry integration for error capture with `req.user` context

### Quality
- [ ] Test coverage for `/me`, `/admin` routes and `auth.plugin`
- [ ] Load tests (k6 / Artillery)
- [ ] Integration tests with real PostgreSQL + Redis (currently all mocked)
- [ ] End-to-end test (full auth + weather flow)
- [ ] Improve error messages (e.g. distinguish "city not found" from "daily limit reached")
- [ ] `@fastify/rate-limit` as complement to ABAC
