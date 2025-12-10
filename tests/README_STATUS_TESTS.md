# Guide Complet des Tests - Système de Statut Utilisateur Temps Réel

## Vue d'ensemble

Ce document décrit la suite de tests complète pour le système de statut utilisateur en temps réel de Meeshy. Le système utilise:

- **Socket.IO** pour les mises à jour temps réel
- **Middleware Auth** qui met à jour `lastActiveAt` (throttlé à 1x/minute)
- **Job de maintenance** qui nettoie les zombies toutes les 60 secondes
- **Frontend** avec listeners temps réel (pas de polling)

---

## Architecture de Test

### Structure des Répertoires

```
meeshy/
├── gateway/
│   └── src/
│       └── __tests__/
│           ├── unit/                    # Tests unitaires
│           │   ├── StatusService.test.ts
│           │   └── MaintenanceService.test.ts
│           ├── integration/             # Tests d'intégration
│           │   ├── auth-middleware-status.integration.test.ts
│           │   └── socket-status.integration.test.ts
│           ├── performance/             # Tests de performance
│           │   └── status-load.test.ts
│           └── resilience/              # Tests de résilience
│               └── status-resilience.test.ts
│
├── tests/
│   ├── e2e/                             # Tests E2E Playwright
│   │   ├── user-status-realtime.e2e.test.ts
│   │   ├── global-setup.ts
│   │   └── global-teardown.ts
│   ├── manual/                          # Tests manuels
│   │   └── MANUAL_TEST_STATUS.md
│   ├── playwright.config.ts
│   └── README_STATUS_TESTS.md (ce fichier)
│
└── .github/
    └── workflows/
        └── status-system-tests.yml      # CI/CD Pipeline
```

---

## Types de Tests

### 1. Tests Unitaires (Unit Tests)

**Localisation**: `gateway/src/__tests__/unit/`

**Ce qui est testé**:
- Logique métier isolée
- Méthodes individuelles des services
- Calculs de statut
- Validation des données

**Fichiers**:
- `StatusService.test.ts`: Tests du service de statut
- `MaintenanceService.test.ts`: Tests du job de maintenance

**Exécution**:
```bash
cd gateway
pnpm test -- --testPathPattern="__tests__/unit"
```

**Couverture attendue**: > 80%

---

### 2. Tests d'Intégration (Integration Tests)

**Localisation**: `gateway/src/__tests__/integration/`

**Ce qui est testé**:
- Intégration entre composants
- Middleware Auth + DB
- Socket.IO + Service de statut
- Flux complets

**Fichiers**:
- `auth-middleware-status.integration.test.ts`: Auth → lastActiveAt
- `socket-status.integration.test.ts`: WebSocket → Broadcast → DB

**Exécution**:
```bash
cd gateway
pnpm test -- --testPathPattern="__tests__/integration" --runInBand
```

**Note**: `--runInBand` évite les conflits de ports Socket.IO

---

### 3. Tests de Performance (Performance Tests)

**Localisation**: `gateway/src/__tests__/performance/`

**Ce qui est testé**:
- Charge avec 100+ utilisateurs simultanés
- Temps de broadcast
- Throttling sous charge
- Utilisation mémoire

**Fichiers**:
- `status-load.test.ts`: Tests de charge et scalabilité

**Exécution**:
```bash
cd gateway
pnpm test -- --testPathPattern="__tests__/performance" --runInBand --maxWorkers=1
```

**Métriques clés**:
- 100 connexions simultanées: < 5s
- Broadcast à 100 users: < 1s
- Throttling: Max 1 update DB/minute/user
- Mémoire: Pas de fuite détectable

---

### 4. Tests de Résilience (Resilience Tests)

**Localisation**: `gateway/src/__tests__/resilience/`

**Ce qui est testé**:
- Récupération après pannes
- Gestion d'erreurs DB
- Reconnexion WebSocket
- Race conditions

**Fichiers**:
- `status-resilience.test.ts`: Tests de robustesse et récupération

**Exécution**:
```bash
cd gateway
pnpm test -- --testPathPattern="__tests__/resilience" --runInBand
```

**Scénarios**:
- WebSocket down → Fallback OK
- Crash maintenance job → Récupération automatique
- DB indisponible → Pas de crash serveur
- Connexions simultanées → État cohérent

---

### 5. Tests E2E (End-to-End Tests)

**Localisation**: `tests/e2e/`

**Ce qui est testé**:
- Scénarios utilisateur complets
- Multi-navigateur
- Temps réel entre utilisateurs
- UI/UX du statut

**Fichiers**:
- `user-status-realtime.e2e.test.ts`: Scénarios temps réel

**Exécution**:
```bash
cd tests
pnpm exec playwright test
```

**Navigateurs testés**:
- Chrome Desktop
- Firefox Desktop
- Safari Desktop
- Chrome Mobile
- Safari Mobile

**Scénarios clés**:
- User A connecte → User B voit "en ligne" immédiatement
- User A déconnecte → User B voit "hors ligne" < 100ms
- Multi-onglets → Statut reste "en ligne" tant qu'un onglet actif
- Reconnexion auto après coupure réseau

---

### 6. Tests Manuels (Manual Tests)

**Localisation**: `tests/manual/MANUAL_TEST_STATUS.md`

**Ce qui est testé**:
- Scénarios complexes difficiles à automatiser
- UX/UI réelle
- Edge cases spécifiques
- Validation finale avant production

**Checklist**: 12 tests à effectuer manuellement

**Exécution**:
- Suivre le document `MANUAL_TEST_STATUS.md`
- Requis: 2 testeurs, 2 navigateurs
- Durée: 45-60 minutes

---

## Commandes Rapides

### Lancer tous les tests backend
```bash
cd gateway
pnpm test
```

### Lancer seulement les tests de statut
```bash
cd gateway
pnpm test -- --config=jest.config.status-tests.json
```

### Tests avec couverture
```bash
cd gateway
pnpm test:coverage
```

### Tests E2E (Playwright)
```bash
cd tests
pnpm exec playwright test
```

### Tests E2E en mode UI
```bash
cd tests
pnpm exec playwright test --ui
```

### Tests E2E sur un seul navigateur
```bash
cd tests
pnpm exec playwright test --project=chromium-desktop
```

### Debug d'un test E2E
```bash
cd tests
pnpm exec playwright test --debug user-status-realtime.e2e.test.ts
```

---

## CI/CD Pipeline

### Workflow GitHub Actions

**Fichier**: `.github/workflows/status-system-tests.yml`

**Déclencheurs**:
- Push sur `main`, `develop`, `feature/*`, `fix/*`
- Pull Request vers `main` ou `develop`
- Modification de fichiers liés au statut
- Déclenchement manuel

### Jobs Exécutés

1. **backend-unit-tests** (15 min max)
   - Tests unitaires backend
   - Coverage report
   - Upload vers Codecov

2. **backend-integration-tests** (20 min max)
   - Tests d'intégration
   - Socket.IO + Auth
   - Coverage report

3. **performance-tests** (30 min max)
   - Tests de charge
   - Métriques de performance
   - Rapport détaillé

4. **resilience-tests** (20 min max)
   - Tests de résilience
   - Scénarios d'erreur
   - Récupération automatique

5. **e2e-tests** (30 min max)
   - Tests Playwright
   - Chrome uniquement en CI
   - Artifacts: screenshots, videos

6. **test-summary**
   - Agrégation des résultats
   - Génération du rapport
   - Fail si un job échoue

### Déclencher manuellement

Via GitHub UI:
1. Aller dans l'onglet "Actions"
2. Sélectionner "Status System - Test Suite"
3. Cliquer "Run workflow"

Via CLI:
```bash
gh workflow run status-system-tests.yml
```

---

## Métriques de Couverture

### Objectifs Globaux

- **Branches**: > 80%
- **Functions**: > 80%
- **Lines**: > 80%
- **Statements**: > 80%

### Fichiers Critiques

Couverture minimale requise pour:

| Fichier | Couverture Min |
|---------|---------------|
| `maintenance.service.ts` | 90% |
| `auth.ts` (middleware) | 85% |
| `MeeshySocketIOManager.ts` | 80% |
| `MeeshySocketIOHandler.ts` | 75% |

### Vérifier la couverture

```bash
cd gateway
pnpm test:coverage

# Ouvrir le rapport HTML
open coverage/index.html
```

---

## Guide de Contribution

### Ajouter un nouveau test

#### 1. Tests Unitaires

```typescript
// gateway/src/__tests__/unit/MyService.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MyService } from '../../services/MyService';

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService();
  });

  it('should do something', () => {
    const result = service.doSomething();
    expect(result).toBe(expectedValue);
  });
});
```

#### 2. Tests d'Intégration

```typescript
// gateway/src/__tests__/integration/my-feature.integration.test.ts
import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

describe('My Feature Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    // Setup routes, middleware, etc.
    await app.listen({ port: 0 });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should integrate correctly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/test'
    });
    expect(response.statusCode).toBe(200);
  });
});
```

#### 3. Tests E2E

```typescript
// tests/e2e/my-feature.e2e.test.ts
import { test, expect } from '@playwright/test';

test('should do something in the UI', async ({ page }) => {
  await page.goto('/');
  await page.click('button#my-button');
  await expect(page.locator('.result')).toHaveText('Success');
});
```

### Bonnes Pratiques

1. **Nommage**
   - Tests unitaires: `ServiceName.test.ts`
   - Tests d'intégration: `feature-name.integration.test.ts`
   - Tests E2E: `feature-name.e2e.test.ts`

2. **Structure**
   - `describe()`: Grouper par feature/service
   - `it()`: Un test = une assertion claire
   - `beforeEach/afterEach`: Cleanup systématique

3. **Isolation**
   - Chaque test doit être indépendant
   - Pas de dépendances entre tests
   - Cleanup des données créées

4. **Assertions**
   - Utiliser `expect()` de Jest/Playwright
   - Messages d'erreur clairs
   - Vérifier les cas limites

5. **Mocking**
   - Mocker les dépendances externes
   - Ne pas mocker le code testé
   - Utiliser `jest.mock()` ou `jest.spyOn()`

6. **Performance**
   - Tests rapides (< 5s par test unitaire)
   - `--runInBand` pour tests Socket.IO
   - Parallélisation quand possible

---

## Debugging

### Tests Backend (Jest)

```bash
# Mode watch (relance auto)
cd gateway
pnpm test:watch

# Debug un test spécifique
node --inspect-brk node_modules/.bin/jest src/__tests__/unit/StatusService.test.ts

# Logs détaillés
DEBUG=* pnpm test
```

### Tests E2E (Playwright)

```bash
# Mode debug UI
cd tests
pnpm exec playwright test --debug

# Mode headed (voir le navigateur)
pnpm exec playwright test --headed

# Trace viewer (après échec)
pnpm exec playwright show-trace test-results/.../trace.zip
```

### Logs Backend en Production

```bash
# Suivre les logs de maintenance
tail -f gateway/gateway.log | grep "CLEANUP\|MAINTENANCE"

# Vérifier les stats en temps réel
curl http://localhost:3000/api/socketio/stats | jq
```

---

## Troubleshooting

### Problème: Tests échouent en CI mais passent localement

**Cause**: Différences d'environnement (timezone, réseau, etc.)

**Solution**:
- Forcer timezone: `TZ=UTC pnpm test`
- Augmenter timeouts: `jest.setTimeout(10000)`
- Vérifier variables d'env: `CI=true`

### Problème: Tests Socket.IO échouent aléatoirement

**Cause**: Race conditions, ports occupés

**Solution**:
- Utiliser `--runInBand` pour tests Socket.IO
- Utiliser port 0 (random): `httpServer.listen(0)`
- Attendre connexion: `await new Promise(r => socket.on('connect', r))`

### Problème: Tests E2E timeout

**Cause**: Services pas prêts, pages lentes

**Solution**:
- Augmenter timeout: `test.setTimeout(60000)`
- Vérifier `global-setup.ts` attend les services
- Utiliser `waitForLoadState('networkidle')`

### Problème: Couverture insuffisante

**Cause**: Code non testé, branches manquées

**Solution**:
- Identifier avec: `open coverage/index.html`
- Ajouter tests pour branches manquées
- Vérifier edge cases (null, undefined, erreurs)

---

## Ressources

### Documentation Externe

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Socket.IO Testing Guide](https://socket.io/docs/v4/testing/)
- [Prisma Testing](https://www.prisma.io/docs/guides/testing)

### Exemples de Tests

- Voir `gateway/src/__tests__/call-service.test.ts` pour exemple existant
- Voir `frontend/__tests__/` pour tests React

### Contact

Pour questions sur les tests:
- Créer une issue GitHub
- Consulter le canal #testing sur Slack
- Contacter l'équipe QA

---

## Checklist Avant Pull Request

- [ ] Tous les tests passent localement
- [ ] Nouveaux tests ajoutés pour nouvelle fonctionnalité
- [ ] Couverture > 80% pour code modifié
- [ ] Tests manuels critiques effectués
- [ ] Pipeline CI/CD passe
- [ ] Documentation mise à jour si nécessaire

---

**Version**: 1.0.0
**Dernière mise à jour**: 2025-11-03
**Mainteneur**: Équipe Meeshy
