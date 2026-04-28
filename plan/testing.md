# Tests — Conventions et Cas

## Pattern Given / When / Then

```
Given  → état initial du système (contexte, préconditions)
When   → l'action déclenchée (appel de fonction, requête HTTP)
Then   → le résultat observable attendu (assertions)
```

## Niveau de test préféré — intégration via `app.inject()`

Les tests s'écrivent au niveau de la route HTTP. `fetch` est mocké globalement pour simuler OWM. La structure interne est un détail d'implémentation non gelé.

```typescript
// src/routes/weather.test.ts
vi.mock('@/lib/env.js');
vi.mock('ioredis');

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/db/client.js', () => ({ db: mockDb }));

afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks(); });
```

> **Stratégie mock Redis** : `vi.mock('ioredis')` active `__mocks__/ioredis.ts` à la racine. Le vrai code de `lib/cache.ts` s'exécute — seul le client ioredis est mocké. Teste la logique de cache sans roundtrip réseau.

## Structure d'un test unitaire (logique pure)

```typescript
describe('weatherPolicy', () => {
  it('denies a free plan user', () => {
    // Given
    const user = { email: 'user@example.com', role: 'viewer', plan: 'free' };
    // When
    const result = evaluateWeatherPolicy({ action: 'weather:read:forecast', user });
    // Then
    expect(result).toBe('deny');
  });
});
```

## Règles

- **Given / When / Then** toujours présents, même si l'un est court
- **Un seul `When` par test** — deux actions = deux tests
- **Nommage** : `it('does X for Y in context Z')` — lisible comme une phrase
- **Pas de logique** dans les tests (`if`, boucle) — utiliser `it.each`
- **Tests déterministes** — mock explicite de `Date.now()` / `Math.random()`
- **Isolation** — `resetDb()` dans `beforeEach`, pas de dépendances entre tests

## Coverage — vitest.config.ts

```typescript
coverage: {
  provider: 'v8',
  include: ['src/**/*.ts'],
  exclude: [
    'src/**/*.test.ts',
    'src/server.ts',
    'src/types/**',
    'src/db/client.ts',   // toujours mocké
    'src/lib/env.ts',     // toujours mocké
    'src/routes/auth.ts', // OAuth2 — non testable en unitaire
  ],
  thresholds: { lines: 80, statements: 77, functions: 78, branches: 65 },
}
```

---

## Cas de test — Niveau 1 (logique pure)

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
test('clé météo basée sur lat+lon arrondis à 2 décimales');
test('clé geocoding basée sur city normalisée');
test('dailyCount expire à minuit UTC');

// Géographie
test('code "FR" → isEuropean true');
test('code "US" → isEuropean false');
test('code "TR" → isEuropean true');
test('code inconnu → isEuropean false');
```

## Cas de test — Niveau 2 (intégration API)

```typescript
// Auth
test('sans token → 401');
test('token expiré → 401');
test('token malformé → 401');
test('email inconnu en DB → 401');

// Permissions ABAC
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
