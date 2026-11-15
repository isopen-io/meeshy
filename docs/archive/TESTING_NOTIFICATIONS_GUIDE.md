# Guide de Test du Système de Notifications

## Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Architecture testée](#architecture-testée)
- [Scénarios couverts](#scénarios-couverts)
- [Lancement des tests](#lancement-des-tests)
- [Structure des tests](#structure-des-tests)
- [Interprétation des résultats](#interprétation-des-résultats)
- [Couverture de code](#couverture-de-code)
- [CI/CD Integration](#cicd-integration)
- [Dépannage](#dépannage)

---

## Vue d'ensemble

Cette suite de tests garantit que le système de notifications de Meeshy fonctionne parfaitement dans **deux scénarios critiques** :

### ✅ Scénario 1 : Sans Firebase
- WebSocket seulement pour les notifications en temps réel
- Aucune dépendance Firebase
- Le serveur démarre sans erreur
- Toutes les fonctionnalités de notifications opérationnelles

### ✅ Scénario 2 : Avec Firebase
- WebSocket + Firebase Cloud Messaging (FCM)
- Push notifications pour mobile/web
- Fallback gracieux si Firebase échoue
- Double canal de notification (WebSocket + Push)

---

## Architecture testée

```
┌─────────────────────────────────────────────────────────────────┐
│                      SYSTÈME DE NOTIFICATIONS                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐         ┌────────────────┐                 │
│  │    BACKEND     │         │    FRONTEND    │                 │
│  ├────────────────┤         ├────────────────┤                 │
│  │                │         │                │                 │
│  │ NotificationSvc│◄───────►│ WebSocket      │                 │
│  │                │         │ Client         │                 │
│  │ Socket.IO      │         │                │                 │
│  │ Server         │         │ Notifications  │                 │
│  │                │         │ Store          │                 │
│  │ Firebase Admin │         │                │                 │
│  │ (optionnel)    │         │ FCM Client     │                 │
│  │                │         │ (optionnel)    │                 │
│  └────────────────┘         └────────────────┘                 │
│         │                            │                          │
│         │                            │                          │
│         ▼                            ▼                          │
│  ┌────────────┐              ┌────────────┐                   │
│  │  MongoDB   │              │  Browser   │                   │
│  └────────────┘              └────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scénarios couverts

### 🔧 Tests Backend

#### 1. **Tests d'intégration sans Firebase**
**Fichier :** `gateway/src/__tests__/notifications-integration.test.ts`

**Couvre :**
- ✅ Démarrage du serveur sans variables Firebase
- ✅ Création de notifications
- ✅ Émission WebSocket
- ✅ Préférences utilisateur
- ✅ Gestion d'erreurs
- ✅ Performance basique
- ✅ Utilisateurs hors ligne/en ligne

**Commande :**
```bash
cd gateway
npm test -- src/__tests__/notifications-integration.test.ts
```

#### 2. **Tests Firebase**
**Fichier :** `gateway/src/__tests__/notifications-firebase.test.ts`

**Couvre :**
- ✅ Détection Firebase disponible
- ✅ Envoi push notifications
- ✅ Gestion tokens FCM multiples
- ✅ Fallback WebSocket si Firebase échoue
- ✅ Gestion tokens invalides
- ✅ Timeouts Firebase
- ✅ Erreurs réseau Firebase

**Commande :**
```bash
cd gateway
FIREBASE_PROJECT_ID=test npm test -- src/__tests__/notifications-firebase.test.ts
```

#### 3. **Tests de performance**
**Fichier :** `gateway/src/__tests__/notifications-performance.test.ts`

**Couvre :**
- ✅ 100 notifications concurrentes (< 5s)
- ✅ 1000 notifications en batch (< 15s)
- ✅ Batch mention sans N+1 queries
- ✅ Requêtes MongoDB optimisées
- ✅ WebSocket à 100 utilisateurs
- ✅ Multi-device (10 appareils/user)
- ✅ Consommation mémoire raisonnable

**Critères de succès :**
- 100 notifications : < 5 secondes
- Index MongoDB : < 100ms par query
- Consommation mémoire : < 50 MB pour 1000 notifications

**Commande :**
```bash
cd gateway
npm test -- src/__tests__/notifications-performance.test.ts
```

#### 4. **Tests de sécurité**
**Fichier :** `gateway/src/__tests__/notifications-security.test.ts`

**Couvre :**
- ✅ Protection XSS (title, content, username, URLs)
- ✅ Prévention IDOR
- ✅ Rate limiting mentions (5/min max)
- ✅ Validation types/priorités
- ✅ Sanitization JSON
- ✅ Protection injection MongoDB
- ✅ Logs de sécurité

**Commande :**
```bash
cd gateway
npm test -- src/__tests__/notifications-security.test.ts
```

### 🎨 Tests Frontend

#### 5. **Tests disponibilité Firebase**
**Fichier :** `frontend/__tests__/firebase-availability.test.tsx`

**Couvre :**

**Sans Firebase :**
- ✅ App se rend sans crash
- ✅ Pas d'erreurs console Firebase
- ✅ WebSocket fonctionne
- ✅ Réception notifications WebSocket

**Avec Firebase :**
- ✅ Variables Firebase détectées
- ✅ App se rend avec Firebase
- ✅ WebSocket fonctionne toujours
- ✅ Dual channel (WebSocket + FCM)

**Tests supplémentaires :**
- ✅ Détection support notifications
- ✅ Gestion permissions refusées
- ✅ Compatibilité iOS/Android
- ✅ Support PWA
- ✅ Reconnexion auto WebSocket
- ✅ Gestion erreurs réseau

**Commande :**
```bash
cd frontend
npm test -- __tests__/firebase-availability.test.tsx
```

---

## Lancement des tests

### 🚀 Méthode 1 : Script global (recommandé)

```bash
# Tous les tests
./test-notifications-integration.sh

# Backend seulement
./test-notifications-integration.sh --backend-only

# Frontend seulement
./test-notifications-integration.sh --frontend-only

# Avec couverture de code
./test-notifications-integration.sh --coverage

# Mode verbose
./test-notifications-integration.sh --verbose

# Aide
./test-notifications-integration.sh --help
```

### 🔧 Méthode 2 : Tests individuels

#### Backend

```bash
cd gateway

# Sans Firebase
unset FIREBASE_ADMIN_CREDENTIALS_PATH
npm test -- src/__tests__/notifications-integration.test.ts

# Avec Firebase
export FIREBASE_PROJECT_ID="test-project"
npm test -- src/__tests__/notifications-firebase.test.ts

# Performance
npm test -- src/__tests__/notifications-performance.test.ts

# Sécurité
npm test -- src/__tests__/notifications-security.test.ts
```

#### Frontend

```bash
cd frontend

# Sans Firebase
unset NEXT_PUBLIC_FIREBASE_API_KEY
npm test -- __tests__/firebase-availability.test.tsx

# Avec Firebase
export NEXT_PUBLIC_FIREBASE_API_KEY="test-key"
npm test -- __tests__/firebase-availability.test.tsx
```

### 📊 Avec couverture de code

```bash
# Backend
cd gateway
npm test -- --coverage

# Frontend
cd frontend
npm test -- --coverage

# Voir le rapport HTML
# Backend: gateway/coverage/lcov-report/index.html
# Frontend: frontend/coverage/lcov-report/index.html
```

---

## Structure des tests

```
meeshy/
├── gateway/
│   └── src/
│       └── __tests__/
│           ├── notifications-integration.test.ts   # Sans Firebase
│           ├── notifications-firebase.test.ts      # Avec Firebase
│           ├── notifications-performance.test.ts   # Performance
│           └── notifications-security.test.ts      # Sécurité
│
├── frontend/
│   └── __tests__/
│       └── firebase-availability.test.tsx          # Frontend both scenarios
│
├── test-notifications-integration.sh               # Script global
└── TESTING_NOTIFICATIONS_GUIDE.md                  # Ce fichier
```

---

## Interprétation des résultats

### ✅ Succès complet

```
╔═══════════════════════════════════════════════════════════╗
║                RÉSULTATS FINAUX                          ║
╚═══════════════════════════════════════════════════════════╝

🎉 TOUS LES TESTS SONT PASSÉS !

✅ Tests réussis: 6/6
✅ App fonctionne avec Firebase
✅ App fonctionne sans Firebase
✅ Aucun crash détecté
✅ Performance OK
✅ Sécurité OK
```

**Signification :** Le système est prêt pour la production

### ❌ Échec partiel

```
❌ CERTAINS TESTS ONT ÉCHOUÉ

Tests réussis: 4/6
Tests échoués: 2/6

Veuillez vérifier les logs ci-dessus pour plus de détails.
```

**Actions :**
1. Identifier les tests échoués dans les logs
2. Vérifier la section "Erreurs courantes" ci-dessous
3. Corriger le code si nécessaire
4. Relancer les tests

---

## Couverture de code

### Objectifs de couverture

| Composant | Objectif | Critique |
|-----------|----------|----------|
| Backend NotificationService | 85% | ✅ |
| Frontend Hooks | 80% | ✅ |
| E2E Scénarios critiques | 100% | ✅ |

### Générer les rapports

```bash
# Backend
cd gateway
npm test -- --coverage
open coverage/lcov-report/index.html

# Frontend
cd frontend
npm test -- --coverage
open coverage/lcov-report/index.html
```

### Interpréter les métriques

- **Statements** : % de lignes exécutées
- **Branches** : % de conditions testées (if/else)
- **Functions** : % de fonctions appelées
- **Lines** : % de lignes couvertes

**Exemple :**
```
File                           | Statements | Branches | Functions | Lines
-------------------------------|------------|----------|-----------|-------
NotificationService.ts         |      87.5% |    85.2% |     92.1% | 88.3%
```
✅ Toutes les métriques > 85% → Excellent

---

## CI/CD Integration

### GitHub Actions

**Fichier :** `.github/workflows/test-notifications.yml`

```yaml
name: Test Notifications

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]

jobs:
  test-without-firebase:
    runs-on: ubuntu-latest
    name: Test Sans Firebase

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd gateway && npm install
          cd ../frontend && npm install

      - name: Test Backend Sans Firebase
        run: |
          cd gateway
          npm test -- src/__tests__/notifications-integration.test.ts

      - name: Test Frontend Sans Firebase
        run: |
          cd frontend
          npm test -- __tests__/firebase-availability.test.tsx

  test-with-firebase:
    runs-on: ubuntu-latest
    name: Test Avec Firebase

    env:
      FIREBASE_PROJECT_ID: test-project
      NEXT_PUBLIC_FIREBASE_API_KEY: test-key

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd gateway && npm install
          cd ../frontend && npm install

      - name: Test Backend Avec Firebase
        run: |
          cd gateway
          npm test -- src/__tests__/notifications-firebase.test.ts

      - name: Test Performance & Sécurité
        run: |
          cd gateway
          npm test -- src/__tests__/notifications-performance.test.ts
          npm test -- src/__tests__/notifications-security.test.ts
```

### GitLab CI

**Fichier :** `.gitlab-ci.yml`

```yaml
stages:
  - test

test-notifications-no-firebase:
  stage: test
  image: node:20
  script:
    - cd gateway && npm install
    - npm test -- src/__tests__/notifications-integration.test.ts
    - cd ../frontend && npm install
    - npm test -- __tests__/firebase-availability.test.tsx

test-notifications-with-firebase:
  stage: test
  image: node:20
  variables:
    FIREBASE_PROJECT_ID: "test-project"
    NEXT_PUBLIC_FIREBASE_API_KEY: "test-key"
  script:
    - cd gateway && npm install
    - npm test -- src/__tests__/notifications-firebase.test.ts
    - npm test -- src/__tests__/notifications-performance.test.ts
    - npm test -- src/__tests__/notifications-security.test.ts
```

---

## Dépannage

### Erreurs courantes

#### 1. "Cannot find module" lors des tests

**Problème :** Dépendances manquantes

**Solution :**
```bash
cd gateway && npm install
cd frontend && npm install
```

#### 2. Tests timeout

**Problème :** Tests prennent trop de temps

**Solution :**
```bash
# Augmenter le timeout dans jest.config.json
{
  "testTimeout": 30000
}
```

#### 3. "Firebase initialization failed"

**Problème :** Variables Firebase mal configurées

**Solution :**
```bash
# Pour tests SANS Firebase, s'assurer qu'elles sont undefined
unset FIREBASE_ADMIN_CREDENTIALS_PATH
unset FIREBASE_PROJECT_ID

# Pour tests AVEC Firebase
export FIREBASE_PROJECT_ID="test-project"
```

#### 4. Tests WebSocket échouent

**Problème :** Socket.IO mock mal configuré

**Solution :** Vérifier que le mock dans les tests retourne bien les bonnes valeurs

```typescript
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  connected: true
};
```

#### 5. Couverture insuffisante

**Problème :** Certaines branches non testées

**Solution :**
```bash
# Identifier les branches manquantes
npm test -- --coverage

# Ajouter des tests pour les cas limites
```

### Debug mode

```bash
# Backend avec logs détaillés
DEBUG=* npm test

# Frontend avec logs
npm test -- --verbose

# Script global en mode verbose
./test-notifications-integration.sh --verbose
```

---

## Métriques de succès

### Performance

| Métrique | Objectif | Critique |
|----------|----------|----------|
| 100 notifications concurrentes | < 5s | ✅ |
| 1000 notifications batch | < 15s | ✅ |
| Query MongoDB (avec index) | < 100ms | ✅ |
| WebSocket 100 users | < 3s | ✅ |
| Consommation mémoire | < 50 MB | ✅ |

### Sécurité

| Test | Status |
|------|--------|
| Protection XSS | ✅ |
| Prévention IDOR | ✅ |
| Rate limiting | ✅ |
| Validation types | ✅ |
| Sanitization | ✅ |

### Fiabilité

| Scénario | Status |
|----------|--------|
| Sans Firebase | ✅ |
| Avec Firebase | ✅ |
| Firebase fail → WebSocket fallback | ✅ |
| Reconnexion auto | ✅ |
| Multi-device | ✅ |

---

## Maintenance

### Mise à jour des tests

1. **Ajouter un nouveau type de notification**
   - Mettre à jour `notifications-integration.test.ts`
   - Ajouter le type dans `notifications-security.test.ts`

2. **Modifier la logique Firebase**
   - Mettre à jour `notifications-firebase.test.ts`

3. **Nouvelles métriques de performance**
   - Ajouter dans `notifications-performance.test.ts`

### Vérification régulière

```bash
# Hebdomadaire : Tous les tests
./test-notifications-integration.sh --coverage

# Mensuel : Review de la couverture
npm test -- --coverage
# Vérifier que coverage reste > 80%

# Avant release : Tests complets + stress tests
./test-notifications-integration.sh --verbose
```

---

## Ressources

- **Documentation NotificationService :** `gateway/src/services/NotificationService.ts`
- **Documentation Firebase :** https://firebase.google.com/docs/cloud-messaging
- **Documentation Jest :** https://jestjs.io/
- **Documentation Testing Library :** https://testing-library.com/

---

## Support

Pour toute question ou problème :

1. Vérifier cette documentation
2. Consulter les logs détaillés avec `--verbose`
3. Vérifier les issues similaires
4. Créer une issue avec :
   - Commande exécutée
   - Logs complets
   - Variables d'environnement (sans secrets)
   - Version Node.js

---

**Dernière mise à jour :** 2025-01-22
**Version :** 1.0.0
**Auteur :** Équipe Meeshy
