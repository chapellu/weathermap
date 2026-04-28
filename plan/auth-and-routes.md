# Auth, Routes et Versioning

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
   INSERT users (email) ON CONFLICT DO NOTHING
   SELECT role, plan FROM users WHERE email = ?
        │
        ▼
   JWT signé { email, exp: +1h }   ← identité uniquement
        │
        ▼
   Cookie httpOnly + secure → redirect /
```

> JWT expire après 1h. Dans Swagger UI, re-cliquer "Authorize" après expiration. Pas de refresh token dans le scope actuel.

### Table users (Drizzle schema)

```ts
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  role: varchar('role', { length: 50 }).notNull().default('viewer').$type<'viewer' | 'admin'>(),
  plan: varchar('plan', { length: 50 }).notNull().default('free').$type<'free' | 'pro'>(),
});
```

> `.$type<>()` : narrowing Drizzle sans modifier le schéma DB — évite que TypeScript infère `string` sur les colonnes varchar.

---

## Routes Admin

Accessibles à `role === 'admin'` uniquement. Changement de plan/rôle immédiatement effectif (résolution DB à chaque requête).

| Méthode | Route                   | Description                    |
| ------- | ----------------------- | ------------------------------ |
| GET     | `/admin/users`          | Lister tous les utilisateurs   |
| GET     | `/admin/users/:id`      | Détail d'un utilisateur        |
| PATCH   | `/admin/users/:id/plan` | Changer le plan (free/pro)     |
| PATCH   | `/admin/users/:id/role` | Changer le rôle (viewer/admin) |
| DELETE  | `/admin/users/:id`      | Supprimer un utilisateur       |

### Workflow de test ABAC depuis Swagger UI

```
1. GET /auth/google → se connecter
2. Récupérer le JWT → "Authorize" dans /docs
3. PATCH /admin/users/:id/plan { plan: "pro" }
4. GET /weather/forecast → 200 immédiatement
5. PATCH /admin/users/:id/plan { plan: "free" }
6. GET /weather/forecast → 403 immédiatement
```

---

## Documentation Swagger — Tableau des endpoints

| Endpoint                         | Auth               | Description            |
| -------------------------------- | ------------------ | ---------------------- |
| GET `/healthz`                   | ❌                 | Status de l'app        |
| GET `/auth/google`               | ❌                 | Redirect OAuth2 Google |
| GET `/weather`                   | ✅ JWT             | Météo actuelle         |
| GET `/weather/forecast`          | ✅ JWT (pro)       | Prévisions 5 jours     |
| POST `/weather/cache/invalidate` | ✅ JWT (admin)     | Invalide le cache      |
| GET `/me`                        | ✅ JWT             | Profil utilisateur     |
| PATCH `/me/plan`                 | ✅ JWT             | Changer son plan       |
| DELETE `/me/daily-count`         | ✅ JWT             | Reset compteur journalier |
| GET `/admin/users`               | ✅ JWT (admin)     | Liste des utilisateurs |
| GET `/admin/users/:id`           | ✅ JWT (admin)     | Détail utilisateur     |
| PATCH `/admin/users/:id/plan`    | ✅ JWT (admin)     | Changer le plan        |
| PATCH `/admin/users/:id/role`    | ✅ JWT (admin)     | Changer le rôle        |
| DELETE `/admin/users/:id`        | ✅ JWT (admin)     | Supprimer utilisateur  |
| GET `/metrics`                   | ✅ Bearer statique | Métriques Prometheus   |
| GET `/docs`                      | ❌                 | Swagger UI             |

> `/metrics` protégé par `METRICS_TOKEN` (Bearer statique) — Grafana Cloud configuré avec ce token.

---

## Conventional Commits

| Type                           | Effet sur la version | Usage                                 |
| ------------------------------ | -------------------- | ------------------------------------- |
| `feat:`                        | minor bump (1.x.0)   | Nouvelle fonctionnalité               |
| `fix:`                         | patch bump (1.0.x)   | Correction de bug                     |
| `feat!:` / `BREAKING CHANGE:`  | major bump (x.0.0)   | Changement breaking                   |
| `chore:`                       | aucun                | Maintenance, deps                     |
| `docs:`                        | aucun                | Documentation                         |
| `test:`                        | aucun                | Tests                                 |
| `ci:`                          | aucun                | Pipeline CI                           |
| `refactor:`                    | aucun                | Refactoring sans nouveau comportement |

Exemples :
```
feat: add GET /weather/forecast endpoint
fix: handle unknown city name in geocoding
fix: round lat/lon to 2 decimals in cache key
chore: upgrade fastify to v5
test: add ABAC integration tests for pro plan
ci: add redis service to github actions
feat: add geocoding cache with 24h TTL
```

---

## Release Please — Flux de versioning

```
Commits sur main
      │
      ├─ feat: ...  ──▶  Release PR mis à jour
      ├─ fix: ...   ──▶  Release PR mis à jour
      └─ feat: ...  ──▶  Release PR mis à jour
                               │
                         Tu merges la Release PR
                               │
                               ▼
                    version bumped dans package.json
                    CHANGELOG.md mis à jour
                    Git tag créé (v1.2.0)
                    GitHub Release créée
                    CI déclenche le deploy Render
```
