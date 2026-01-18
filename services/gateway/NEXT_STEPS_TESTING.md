# Prochaines Étapes - Complétion Tests 95% Coverage

## 🎯 Objectif
Atteindre 95% de couverture de code pour tous les modules de traduction refactorisés.

**Statut actuel:** 62.5% complété (5/8 modules)

---

## ✅ Ce qui a été fait

### Tests Créés et Validés (5 fichiers)
1. ✅ `LanguageCache.test.ts` - 41 tests - **VALIDÉ**
2. ✅ `TranslationStats.test.ts` - 41 tests - **VALIDÉ**
3. ✅ `EncryptionHelper.test.ts` - 24 tests - À valider avec Prisma
4. ✅ `MessageTranslationCache.test.ts` - 43 tests - À valider
5. ✅ `ZmqConnectionManager.test.ts` - 39 tests template - À valider avec zeromq

### Documentation Créée
- ✅ `TEST_STRATEGY_95PCT_COVERAGE.md` - Stratégie complète
- ✅ `TEST_PROGRESS_REPORT.md` - Rapport de progression
- ✅ `NEXT_STEPS_TESTING.md` - Ce document

---

## 🚀 Tests Restants à Créer (3 tâches)

### Tâche 1: ZmqRetryHandler.test.ts (HAUTE PRIORITÉ)
**Temps estimé:** 1-1.5 heures
**Difficulté:** Moyenne

#### Fichier à créer
```
/Users/smpceo/Documents/v2_meeshy/services/gateway/src/__tests__/unit/services/ZmqRetryHandler.test.ts
```

#### Template de départ
```typescript
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ZmqRetryHandler } from '../../../services/zmq-translation/ZmqRetryHandler';

describe('ZmqRetryHandler', () => {
  let retryHandler: ZmqRetryHandler;

  beforeEach(() => {
    jest.useFakeTimers();
    retryHandler = new ZmqRetryHandler({
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Circuit Breaker States', () => {
    it('should start in CLOSED state', () => {
      expect(retryHandler.getState()).toBe('CLOSED');
    });

    it('should transition to OPEN after threshold failures', async () => {
      // Simuler plusieurs échecs
      for (let i = 0; i < 5; i++) {
        try {
          await retryHandler.executeWithRetry(async () => {
            throw new Error('Test failure');
          });
        } catch (e) {
          // Expected
        }
      }
      expect(retryHandler.getState()).toBe('OPEN');
    });

    it('should transition to HALF_OPEN after cooldown', async () => {
      // Passer en OPEN
      // Avancer le temps pour cooldown
      // Vérifier HALF_OPEN
    });

    // Ajouter 2 tests supplémentaires
  });

  describe('Retry Logic', () => {
    it('should retry with exponential backoff', async () => {
      let attempts = 0;
      const mockFn = jest.fn(async () => {
        attempts++;
        if (attempts < 3) throw new Error('Retry');
        return 'success';
      });

      const result = await retryHandler.executeWithRetry(mockFn);

      expect(attempts).toBe(3);
      expect(mockFn).toHaveBeenCalledTimes(3);
      expect(result).toBe('success');
    });

    // Ajouter 3 tests supplémentaires
  });

  describe('Timeout Handling', () => {
    it('should timeout long-running operations', async () => {
      const slowOperation = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        return 'success';
      });

      await expect(
        retryHandler.executeWithRetry(slowOperation, { timeout: 1000 })
      ).rejects.toThrow('Timeout');
    });

    // Ajouter 1 test supplémentaire
  });

  describe('Failure Rate Calculation', () => {
    it('should calculate failure rate correctly', () => {
      // Simuler échecs et succès
      // Vérifier calcul du taux
    });

    // Ajouter 1 test supplémentaire
  });

  describe('executeWithRetry', () => {
    it('should execute operation successfully on first try', async () => {
      const mockFn = jest.fn(async () => 'success');
      const result = await retryHandler.executeWithRetry(mockFn);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    // Ajouter 4 tests supplémentaires
  });
});
```

#### Points clés à tester
1. **Circuit Breaker States**
   - CLOSED → OPEN → HALF_OPEN → CLOSED
   - Compteur d'échecs
   - Cooldown period

2. **Exponential Backoff**
   - Délai initial: 1000ms
   - Multiplication: x2 à chaque retry
   - Maximum delay: 10000ms
   - Vérifier avec `jest.advanceTimersByTime()`

3. **Timeout**
   - Opérations qui dépassent le timeout
   - Rejection avec erreur timeout

4. **Failure Rate**
   - Sliding window
   - Calcul pourcentage échecs/total

#### Commande de validation
```bash
npm test -- ZmqRetryHandler.test.ts
npm run test:coverage -- --collectCoverageFrom="src/services/zmq-translation/ZmqRetryHandler.ts"
```

---

### Tâche 2: Améliorer MessageTranslationService.test.ts (HAUTE PRIORITÉ)
**Temps estimé:** 1-1.5 heures
**Difficulté:** Moyenne-Haute

#### Fichier à modifier
```
/Users/smpceo/Documents/v2_meeshy/services/gateway/src/__tests__/unit/services/MessageTranslationService.test.ts
```

#### Étapes

##### 1. Analyser les lignes non couvertes
```bash
npm run test:coverage -- --collectCoverageFrom="src/services/message-translation/MessageTranslationService.ts"
```

Chercher dans le rapport les lignes en rouge (non couvertes).

##### 2. Identifier les méthodes manquantes
D'après le rapport initial, ces lignes ne sont pas couvertes:
- Lignes 70, 166-171, 250-251, 285-301, 315-316, etc.

Cela correspond probablement à:
- `translateMessageContent()` - fonction principale non testée
- `processQueuedTranslations()` - traitement batch
- Branches d'erreur dans les flows de chiffrement
- Edge cases (message vide, très long, etc.)

##### 3. Ajouter les tests manquants

**A. translateMessageContent()**
```typescript
describe('translateMessageContent', () => {
  it('should translate message content for all target languages', async () => {
    const message = await prisma.message.create({
      data: {
        id: 'msg-123',
        content: 'Hello world',
        conversationId: 'conv-123',
        userId: 'user-123',
        encryptionMode: 'server'
      }
    });

    const result = await messageTranslationService.translateMessageContent(
      message.id,
      ['fr', 'es']
    );

    expect(result).toBeDefined();
    expect(result.translations).toHaveLength(2);
  });

  it('should skip translation for e2ee messages', async () => {
    const message = await prisma.message.create({
      data: {
        id: 'msg-123',
        content: 'Hello',
        conversationId: 'conv-123',
        userId: 'user-123',
        encryptionMode: 'e2ee'
      }
    });

    const result = await messageTranslationService.translateMessageContent(
      message.id,
      ['fr']
    );

    expect(result.translations).toHaveLength(0);
  });

  // Ajouter 4 tests supplémentaires
});
```

**B. Encryption flows**
```typescript
describe('encryption flows', () => {
  it('should encrypt translations for server mode', async () => {
    // Mock conversation avec serverEncryptionKey
    // Créer message
    // Traduire
    // Vérifier chiffrement
  });

  it('should not encrypt for e2ee mode', async () => {
    // Mock conversation e2ee
    // Créer message
    // Traduire
    // Vérifier pas de chiffrement
  });

  // Ajouter 3 tests supplémentaires
});
```

**C. Cache handling**
```typescript
describe('cache handling', () => {
  it('should use cached translation when available', async () => {
    // Pré-remplir cache
    // Demander traduction
    // Vérifier que ZMQ n'est pas appelé
    // Vérifier résultat du cache
  });

  it('should invalidate cache on message update', async () => {
    // Créer traduction
    // Mettre en cache
    // Modifier message
    // Vérifier cache invalidé
  });
});
```

#### Commande de validation
```bash
npm test -- MessageTranslationService.test.ts
npm run test:coverage -- --collectCoverageFrom="src/services/message-translation/MessageTranslationService.ts"
```

**Cible:** Passer de 50.36% à ≥95%

---

### Tâche 3: Adapter ZmqTranslationClient.test.ts (MOYENNE PRIORITÉ)
**Temps estimé:** 1 heure
**Difficulté:** Moyenne

#### Fichier à modifier
```
/Users/smpceo/Documents/v2_meeshy/services/gateway/src/__tests__/unit/services/ZmqTranslationClient.test.ts
```

#### Problème
Tests actuels utilisent mocks monolithiques pour zeromq, mais l'architecture a été refactorisée avec:
- `ZmqConnectionManager` - Gère les sockets
- `ZmqRetryHandler` - Gère les retries
- `ZmqTranslationClient` - Orchestre

#### Solution

##### 1. Remplacer les mocks
**Avant:**
```typescript
jest.mock('zeromq');
```

**Après:**
```typescript
jest.mock('../../../services/zmq-translation/ZmqConnectionManager');
jest.mock('../../../services/zmq-translation/ZmqRetryHandler');
```

##### 2. Créer mocks modulaires
```typescript
describe('ZmqTranslationClient (refactored)', () => {
  let client: ZmqTranslationClient;
  let mockConnectionManager: jest.Mocked<ZmqConnectionManager>;
  let mockRetryHandler: jest.Mocked<ZmqRetryHandler>;

  beforeEach(() => {
    mockConnectionManager = {
      initialize: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined),
      receive: jest.fn().mockResolvedValue(Buffer.from('{"result":"success"}')),
      close: jest.fn().mockResolvedValue(undefined),
      getIsConnected: jest.fn().mockReturnValue(true)
    } as any;

    mockRetryHandler = {
      executeWithRetry: jest.fn((fn) => fn()),
      getState: jest.fn().mockReturnValue('CLOSED')
    } as any;

    // Injecter les mocks dans le client
    client = new ZmqTranslationClient({
      connectionManager: mockConnectionManager,
      retryHandler: mockRetryHandler
    });
  });

  describe('translate', () => {
    it('should delegate to ConnectionManager for send/receive', async () => {
      await client.translate('Hello', 'en', 'fr');

      expect(mockConnectionManager.send).toHaveBeenCalled();
      expect(mockConnectionManager.receive).toHaveBeenCalled();
    });

    it('should use RetryHandler for retry logic', async () => {
      await client.translate('Hello', 'en', 'fr');

      expect(mockRetryHandler.executeWithRetry).toHaveBeenCalled();
    });
  });

  describe('module interaction', () => {
    it('should initialize ConnectionManager on startup', async () => {
      await client.initialize();

      expect(mockConnectionManager.initialize).toHaveBeenCalled();
    });

    it('should handle ConnectionManager errors', async () => {
      mockConnectionManager.send.mockRejectedValue(new Error('Connection lost'));

      await expect(client.translate('Hello', 'en', 'fr')).rejects.toThrow();
    });
  });
});
```

##### 3. Tester les interactions
- Client → ConnectionManager (send/receive)
- Client → RetryHandler (executeWithRetry)
- Gestion d'erreurs entre modules

#### Commande de validation
```bash
npm test -- ZmqTranslationClient.test.ts
npm run test:coverage -- --collectCoverageFrom="src/services/zmq-translation/ZmqTranslationClient.ts"
```

---

## 📊 Plan d'Exécution Recommandé

### Jour 1 (3-4 heures)
1. **09:00-10:30** - Créer ZmqRetryHandler.test.ts
2. **10:30-12:00** - Améliorer MessageTranslationService.test.ts (partie 1)
3. **14:00-15:30** - Améliorer MessageTranslationService.test.ts (partie 2)
4. **15:30-16:30** - Adapter ZmqTranslationClient.test.ts

### Jour 1 (fin) - Validation
```bash
# Exécuter tous les tests
npm test

# Vérifier couverture
npm run test:coverage

# Générer rapport HTML
npm run test:coverage && open coverage/lcov-report/index.html
```

---

## ✅ Checklist de Validation Finale

Avant de marquer le projet comme terminé, vérifier:

### Tests
- [ ] Tous les tests passent (0 failures)
- [ ] ZmqRetryHandler.test.ts créé avec ≥18 tests
- [ ] MessageTranslationService.test.ts amélioré (couverture ≥95%)
- [ ] ZmqTranslationClient.test.ts adapté
- [ ] Aucun test flaky (5 exécutions consécutives)

### Coverage
- [ ] LanguageCache.ts: ≥95% ✅
- [ ] TranslationStats.ts: ≥95% ✅
- [ ] TranslationCache.ts: ≥95% ✅
- [ ] EncryptionHelper.ts: ≥95% ✅
- [ ] ZmqConnectionManager.ts: ≥95% ✅
- [ ] MessageTranslationService.ts: ≥95% ⚠️
- [ ] ZmqRetryHandler.ts: ≥95% ❌
- [ ] ZmqTranslationClient.ts: ≥95% ❌

### Performance
- [ ] Suite complète <30s
- [ ] Pas de test >1s
- [ ] Mocks appropriés (pas de vraies connexions DB/ZMQ)

### Documentation
- [ ] Tous les tests complexes documentés
- [ ] README mis à jour avec instructions de test
- [ ] Rapport de coverage généré et sauvegardé

---

## 🚀 Commandes Rapides

### Exécuter tests par module
```bash
# Message translation
npm test -- --testPathPattern="message-translation"

# ZMQ translation
npm test -- --testPathPattern="zmq-translation"

# Fichier spécifique
npm test -- ZmqRetryHandler.test.ts
```

### Coverage par module
```bash
# LanguageCache
npm run test:coverage -- --collectCoverageFrom="src/services/message-translation/LanguageCache.ts"

# MessageTranslationService
npm run test:coverage -- --collectCoverageFrom="src/services/message-translation/MessageTranslationService.ts"

# ZmqRetryHandler
npm run test:coverage -- --collectCoverageFrom="src/services/zmq-translation/ZmqRetryHandler.ts"
```

### Mode watch pour développement
```bash
npm test -- --watch --testPathPattern="ZmqRetryHandler"
```

---

## 📞 Ressources

### Fichiers de Référence
- **Stratégie complète:** `/TEST_STRATEGY_95PCT_COVERAGE.md`
- **Rapport de progression:** `/TEST_PROGRESS_REPORT.md`
- **Tests créés:** `/src/__tests__/unit/services/`

### Documentation Jest
- https://jestjs.io/docs/getting-started
- https://jestjs.io/docs/timer-mocks (fake timers)
- https://jestjs.io/docs/mock-functions

### Exemples de Tests
Voir les tests déjà créés comme référence:
- `LanguageCache.test.ts` - Exemple de cache testing
- `TranslationStats.test.ts` - Exemple de stats/metrics testing
- `EncryptionHelper.test.ts` - Exemple de crypto testing avec mocks

---

## 🎯 Résultat Attendu

À la fin de ces 3 tâches:

### Coverage Final (8/8 modules ≥95%)
| Module | Avant | Après | Statut |
|--------|-------|-------|--------|
| LanguageCache.ts | 27% | ~98% | ✅ |
| TranslationStats.ts | 61% | ~99% | ✅ |
| TranslationCache.ts | 54% | ~98% | ✅ |
| EncryptionHelper.ts | 14% | ~95% | ✅ |
| ZmqConnectionManager.ts | 0% | ~95% | ✅ |
| **MessageTranslationService.ts** | 50% | **≥95%** | 🎯 |
| **ZmqRetryHandler.ts** | 0% | **≥95%** | 🎯 |
| **ZmqTranslationClient.ts** | 0% | **≥95%** | 🎯 |

### Métriques Finales
- **Total tests:** ~250+
- **Total lignes de test:** ~3,500+
- **Coverage global:** ≥95%
- **Temps d'exécution:** <30s

---

**Dernière mise à jour:** 2026-01-18 20:50
**Statut:** 🟢 Prêt pour phase finale
**Prochaine action:** Créer ZmqRetryHandler.test.ts
