# Fastify Meteo API

API météo REST construite avec Fastify, TypeScript et OpenWeatherMap. Déployée sur Render.

**Live :** https://weathermap-2pyq.onrender.com/docs

> Premier démarrage sur le plan gratuit Render : l'instance peut mettre ~50 s à répondre si elle a été mise en veille.

---

## Stack

| Couche          | Choix                                                     |
| --------------- | --------------------------------------------------------- |
| Runtime         | Node.js 24 + TypeScript 6                                 |
| Framework       | Fastify 5                                                 |
| Auth            | Google OAuth2 + JWT (identité uniquement)                 |
| Base de données | PostgreSQL via Drizzle ORM                                |
| Cache           | Redis — géocodage (24h) + météo (10min) + prévisions (1h) |
| Logs            | Pino + logfmt                                             |
| Métriques       | Prometheus (`/metrics`)                                   |
| Docs            | Swagger UI (`/docs`)                                      |
| PaaS            | Render (free tier)                                        |

---

## Démarrage rapide

**Prérequis :** Node.js ≥ 24, pnpm ≥ 9, PostgreSQL, Redis

Utiliser les devcontainers ou configurer localement avec les bonnes variables d'environnement (voir ci-dessous). Ensuite :

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

---

## Comment utiliser l'API

### 1. S'authentifier via Google OAuth2

L'API utilise Google comme fournisseur d'identité. Aucun mot de passe, aucune inscription manuelle.

**Flux :**

```
GET /auth/google
  └─ redirige vers la page de consentement Google
       └─ Google redirige vers GET /auth/callback?code=...
            └─ l'API échange le code contre un token d'identité Google
                 ├─ upsert de l'utilisateur en base (email unique)
                 └─ génère un JWT signé → cookie httpOnly (1h)
```

Après le callback, le cookie `token` est automatiquement envoyé par le navigateur. Pour les appels API programmatiques, récupérer la valeur du cookie et l'envoyer dans le header `Authorization` :

```http
Authorization: Bearer <token>
```

**Exemple avec curl :**

```bash
# 1. Ouvrir dans le navigateur pour obtenir le cookie
open https://weathermap-2pyq.onrender.com/auth/google

# 2. Copier le token depuis le cookie, puis :
curl -H "Authorization: Bearer <token>" \
  "https://weathermap-2pyq.onrender.com/weather?city=Paris"
```

### 2. Restrictions par plan

| Fonctionnalité           |    free (viewer)    | pro (viewer) |   admin    |
| ------------------------ | :-----------------: | :----------: | :--------: |
| Météo actuelle           | ✅ Europe seulement |  ✅ Mondial  | ✅ Mondial |
| Limite quotidienne       |     10 req/jour     |  Illimitée   | Illimitée  |
| Prévisions 5 jours       |         ❌          |      ✅      |     ✅     |
| Invalidation du cache    |         ❌          |      ❌      |     ✅     |
| Gestion des utilisateurs |         ❌          |      ❌      |     ✅     |

**Headers de rate limiting (plan free) :**

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 4
X-Cache-Status: HIT | MISS
```

---

## Secrets nécessaires

| Variable               | Obligatoire | Source                                                                            |
| ---------------------- | :---------: | --------------------------------------------------------------------------------- |
| `OPENWEATHER_API_KEY`  |     ✅      | [openweathermap.org/api](https://openweathermap.org/api) — plan gratuit suffisant |
| `GOOGLE_CLIENT_ID`     |     ✅      | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID        |
| `GOOGLE_CLIENT_SECRET` |     ✅      | Même endroit que le client ID                                                     |
| `JWT_SECRET`           |     ✅      | Clé aléatoire ≥ 32 caractères (`openssl rand -hex 32`)                            |
| `DATABASE_URL`         |     ✅      | `postgresql://user:pass@host:5432/dbname`                                         |
| `REDIS_URL`            |      —      | `redis://host:6379` — si absent, le cache est désactivé                           |
| `NODE_ENV`             |      —      | `development` \| `test` \| `production` (défaut : `development`)                  |

---

## Architecture & choix de design

### Structure du code

```
src/
  plugins/
    auth.plugin.ts        # JWT sign/verify + lookup DB → req.user
    permissions.plugin.ts # fastify.authorize(action) — évaluation ABAC
    metrics.plugin.ts     # GET /metrics protégé par Bearer token
    logger.plugin.ts      # Hooks Pino : log à chaque requête + onResponse
    swagger.plugin.ts     # Spec OpenAPI + Swagger UI
  routes/
    auth.ts               # GET /auth/google, /auth/callback
    weather.ts            # GET /weather, /weather/forecast, POST /weather/cache/invalidate
    me.ts                 # GET /me, PATCH /me/plan, DELETE /me/daily-count
    admin/
      users.ts            # CRUD admin sur les utilisateurs
  lib/
    weather.service.ts    # Orchestration : géocodage → cache → OWM → rate limit
    owm-client.ts         # Client HTTP OpenWeatherMap
    cache.ts              # Abstraction Redis (get / set / delete / daily count)
    geo.ts                # isEuropean() — restriction géographique plan free
    metrics.ts            # Compteurs Prometheus custom
    env.ts                # Validation Zod des variables d'environnement
  policies/
    weather.policy.ts     # Règles ABAC pour les actions weather
    admin.policy.ts       # Règles ABAC pour les actions admin
  db/
    schema.ts             # Schéma Drizzle (table users)
    migrations/           # Migrations SQL générées
  test/helpers/           # Helpers JWT et mocks pour les tests
  types/
    fastify.d.ts          # Augmentation req.user
  index.ts                # buildApp() — utilisé par les tests
  server.ts               # Point d'entrée : buildApp() + listen()
```

### Modèle de contrôle d'accès (ABAC)

L'accès aux ressources est contrôlé par un système ABAC (Attribute-Based Access Control). Chaque endpoint déclare l'action requise :

```typescript
// Exemple dans weather.ts
preHandler: fastify.authorize("weather:read:forecast");
```

Le plugin `permissions.plugin.ts` évalue les politiques dans `src/policies/` et répond 403 si l'accès est refusé. L'avantage de cette approche sur un simple contrôle de rôle (RBAC) est que les règles peuvent combiner plusieurs attributs (rôle + plan) sans multiplier les conditions dans les routes.

### Stratégie de cache à deux niveaux

```
Requête GET /weather?city=Paris
  │
  ├─ geo:paris → Redis (TTL 24h)
  │     ├─ HIT  → coordonnées directement
  │     └─ MISS → appel OWM Geocoding → stockage Redis
  │
  ├─ Vérification restriction géographique
  ├─ Vérification + incrément compteur quotidien (clé user:{email}:daily)
  │
  └─ weather:{lat}:{lon} → Redis (TTL 10min)
        ├─ HIT  → données météo directement (X-Cache-Status: HIT)
        └─ MISS → appel OWM Current Weather → stockage Redis (X-Cache-Status: MISS)
```

Le géocodage est mis en cache 24h car les coordonnées d'une ville ne changent pas. La météo est rafraîchie toutes les 10 minutes, les prévisions toutes les heures — valeurs choisies en accord avec les limites de l'API OWM gratuite.

### Séparation service / route

La logique métier est entièrement dans `weather.service.ts`. Les routes ne font qu'appeler le service et mapper les erreurs en codes HTTP.

### Validation par schéma Zod

Toutes les entrées (query params, body) et sorties (réponses JSON) sont typées via Zod + `@fastify/type-provider-zod`. Le schéma sert aussi à générer automatiquement la spec OpenAPI affichée dans `/docs`.

---

## CI/CD

### Pipeline GitHub Actions

```
Push / PR → main ou develop
  │
  ├─ lint-typecheck (Node LTS)
  │     ├─ pnpm typecheck  (tsc --noEmit)
  │     ├─ pnpm lint       (Biome)
  │     └─ pnpm format:check
  │
  ├─ commitlint (push seulement)
  │     └─ vérifie le format Conventional Commits depuis origin/main
  │
  ├─ build (Node LTS)
  │     └─ pnpm build → dist/ (tsup, ESM)
  │
  ├─ test (Node 24)
  │     ├─ pnpm test:coverage  → seuils min : 80% lignes / 78% fonctions
  │     └─ upload artifact coverage-report (7 jours)
  │
  └─ [main + push seulement] → release-please (needs lint + build + test)
        ├─ ouvre une PR "chore: release vX.Y.Z" avec CHANGELOG généré
        └─ si la PR est mergée → tag git + trigger deploy Render
```

### Gestion des versions

[release-please](https://github.com/googleapis/release-please) analyse les commits Conventional Commits (`feat:`, `fix:`, `chore:`, etc.) et génère automatiquement :

- La PR de release avec bump de version dans `package.json`
- Le `CHANGELOG.md`
- Le tag git

Le déploiement ne se déclenche que sur une release effective (tag créé), pas à chaque push sur `main`.

### Qualité locale

```
git commit
  ├─ pre-commit  → lint-staged (biome check --write sur les fichiers staged)
  └─ commit-msg  → commitlint (conventional commits)
```

---

## Monitoring

### Logs applicatifs (Pino)

Chaque requête produit deux lignes de log au format logfmt :

```
level=info method=GET url=/weather?city=Paris msg="incoming request"
level=info method=GET url=/weather?city=Paris status=200 duration=43 cache=miss user=alice@example.com msg="request completed"
```

Champs utiles pour l'observabilité :

- `duration` (ms) — détecter les requêtes lentes ou la latence OWM
- `cache` (hit/miss) — mesurer l'efficacité du cache Redis
- `user` — tracer l'usage par utilisateur
- `status` — suivre les taux d'erreur 4xx/5xx

### Métriques Prometheus (`/metrics`)

Endpoint protégé par authentification pour le moment.

**Métriques custom :**

| Métrique                   | Type    | Description                               |
| -------------------------- | ------- | ----------------------------------------- |
| `weather_cache_hit_total`  | Counter | Nombre total de hits sur le cache météo   |
| `weather_cache_miss_total` | Counter | Nombre total de misses sur le cache météo |

**Métriques Fastify built-in** (via `prom-client` default registry) :

- `http_request_duration_seconds` — latence par route et méthode
- `http_requests_total` — volume de requêtes par status code
- `process_cpu_seconds_total`, `process_resident_memory_bytes` — santé du process Node

### Ce que l'on suivrait en production

Avec ces données, les dashboards Grafana prioritaires seraient :

1. **Performance** : latence p95, p99 par endpoint, taux de cache hit/miss, latence OWM (via logs corrélés), utilisation CPU/mémoire, database query duration (via logs ou tracing)
2. **Usage** : nombre de requêtes par plan (free/pro), utilisateurs les plus actifs, endpoints les plus utilisés
3. **Erreurs** : taux d'erreur 4xx/5xx global et par endpoint, erreurs spécifiques (ex : 403 forbidden pour les restrictions)

---

## Ce qui manque pour la production

### Lacunes techniques actuelles

**Infrastructure :**

- Pas de gestion des secrets chiffrés (Vault, AWS SSM) — les secrets sont en variables d'environnement brutes
- Pas d'IaC (Terraform, Pulumi) — l'infrastructure est configurée manuellement sur Render

**Sécurité :**

- Pas d'analyses des vulnérabilités (Snyk, npm audit) — les dépendances ne sont pas régulièrement vérifiées
- Pas de mise à jour automatique des dépendances (Dependabot) — les updates sont manuelles
- Pas de backup
- Pas de liste de révocation de tokens (JTI blacklist) — impossible d'invalider un token compromis avant expiration
- Pas de rate limiting au niveau réseau (WAF, nginx `limit_req`) — seule la limite applicative quotidienne existe
- Cacher la documentation des endpoints d'administration
- Utiliser des UUID pour les IDs utilisateurs au lieu d'id sequentiels (protection contre le scraping et enumeration)
- Supprimer les endpoints de gestion de compte (PATCH /me, DELETE /me/daily-count) utilisé pour la démonstration
- Pas de pentest de sécurité (ex : OWASP ZAP) pour détecter les vulnérabilités courantes (XSS, CSRF, injections)

**Observabilité :**

- Pas de tracing (OpenTelemetry) — difficile de relier une requête lente à une cause (OWM ? Redis ? DB ?)
- Dashboard Grafana pour visualiser les métriques et logs de manière corrélée
- Pas d'alertes configurées
- Intégration Sentry pour une meilleure analyse des logs et alerting sur les erreurs critiques

**Qualité :**

- Couverture de tests autour de 80% — les routes `/me`, `/admin` et le plugin `auth` ne sont pas couverts
- Pas de tests de charge (k6, Artillery) pour valider le comportement sous stress
- Pas de tests d'intégration avec une vraie base PostgreSQL et Redis (les tests mockent tout)
- Pas de tests end-to-end du flux complet (authentification + météo)
- Améliorer les messages de retour d'erreur pour les rendre plus clairs et actionnables (ex : différencier "ville non trouvée" de "limite quotidienne atteinte")

### Ce qui aurait été ajouté avec plus de temps

**Fonctionnalités :**

- Ajout du CLAUDE.md pour aider au developpement avec l'IA (ex : génération de tests unitaires, refactorings, documentation)
- Frontend React minimal pour tester l'API de manière plus ergonomique (recherche de ville, affichage météo, gestion du compte)

**Infrastructure :**

- Mise en place d'un environment de staging pour tester les changements avant production en plus des environnements de revues
- Protection de la branches `main` avec des règles de merge strictes (tests + review obligatoires)
- IaC avec Terraform pour provisionner l'infrastructure (base de données, cache, secrets) de manière déclarative et versionnée

**Observabilité :**

- Tracing OpenTelemetry → Tempo (Grafana Cloud) pour visualiser le chemin complet d'une requête
- Dashboard Grafana avec les métriques clés et logs corrélés
- Alertes sur : taux d'erreur 5xx > 1%, latence p95 > 2s, quota OWM proche du seuil
- Intégration Sentry pour une meilleure gestion des erreurs

---

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm lint
pnpm lint:fix
pnpm format:check
pnpm check
pnpm typecheck
pnpm db:generate
pnpm db:migrate
```
