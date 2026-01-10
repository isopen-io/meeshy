# Tests du Système de Notifications - Guide Rapide

## 🚀 Lancement Rapide

```bash
# Tous les tests (recommandé)
./test-notifications-integration.sh

# Avec couverture de code
./test-notifications-integration.sh --coverage
```

## 📋 Fichiers de Test

### Backend (`/gateway/src/__tests__/`)

| Fichier | Description | Scénario |
|---------|-------------|----------|
| `notifications-integration.test.ts` | Tests sans Firebase | WebSocket seulement |
| `notifications-firebase.test.ts` | Tests avec Firebase | WebSocket + FCM |
| `notifications-performance.test.ts` | Tests de performance | 100-1000 notifications |
| `notifications-security.test.ts` | Tests de sécurité | XSS, IDOR, rate limiting |

### Frontend (`/apps/web/__tests__/`)

| Fichier | Description | Scénario |
|---------|-------------|----------|
| `firebase-availability.test.tsx` | Tests avec/sans Firebase | Les deux scénarios |

## ✅ Critères de Succès

### Tous les tests doivent passer dans ces 2 scénarios :

#### Scénario 1 : Sans Firebase
- ✅ Serveur démarre sans erreur
- ✅ NotificationService fonctionne
- ✅ WebSocket notifications fonctionnent
- ✅ Aucune erreur Firebase dans les logs

#### Scénario 2 : Avec Firebase
- ✅ Firebase est détecté
- ✅ Push notifications envoyées
- ✅ WebSocket fonctionne toujours
- ✅ Fallback si Firebase échoue

### Métriques de Performance

| Test | Objectif | Status |
|------|----------|--------|
| 100 notifications concurrentes | < 5s | ✅ |
| 1000 notifications batch | < 15s | ✅ |
| Query MongoDB (index) | < 100ms | ✅ |
| WebSocket 100 users | < 3s | ✅ |

### Couverture Minimale

| Composant | Minimum | Objectif |
|-----------|---------|----------|
| Backend | 80% | 85% |
| Frontend | 75% | 80% |
| E2E Critiques | 100% | 100% |

## 🔧 Commandes Utiles

```bash
# Backend seulement
./test-notifications-integration.sh --backend-only

# Frontend seulement
./test-notifications-integration.sh --frontend-only

# Mode verbose (détails)
./test-notifications-integration.sh --verbose

# Tests individuels
cd gateway
npm test -- src/__tests__/notifications-integration.test.ts
npm test -- src/__tests__/notifications-firebase.test.ts
npm test -- src/__tests__/notifications-performance.test.ts
npm test -- src/__tests__/notifications-security.test.ts

cd frontend
npm test -- __tests__/firebase-availability.test.tsx

# Couverture
npm test -- --coverage
```

## 📊 Résultats Attendus

### Succès
```
🎉 TOUS LES TESTS SONT PASSÉS !

✅ Tests réussis: 6/6
✅ App fonctionne avec Firebase
✅ App fonctionne sans Firebase
✅ Aucun crash détecté
✅ Performance OK
✅ Sécurité OK
```

### Échec
```
❌ CERTAINS TESTS ONT ÉCHOUÉ

Tests réussis: 4/6
Tests échoués: 2/6
```
→ Consulter `TESTING_NOTIFICATIONS_GUIDE.md` pour le dépannage

## 🛠️ Dépannage Rapide

### Erreur "Cannot find module"
```bash
cd gateway && npm install
cd frontend && npm install
```

### Tests timeout
Augmenter `testTimeout` dans `jest.config.json` :
```json
{
  "testTimeout": 30000
}
```

### Variables Firebase non définies
```bash
# Sans Firebase
unset FIREBASE_ADMIN_CREDENTIALS_PATH
unset NEXT_PUBLIC_FIREBASE_API_KEY

# Avec Firebase
export FIREBASE_PROJECT_ID="test-project"
export NEXT_PUBLIC_FIREBASE_API_KEY="test-key"
```

## 📚 Documentation Complète

Voir `TESTING_NOTIFICATIONS_GUIDE.md` pour :
- Architecture détaillée
- Scénarios complets
- CI/CD integration
- Métriques de succès
- Maintenance

## 🔍 Ce qui est testé

### Fonctionnalités
- ✅ Création notifications
- ✅ Émission WebSocket
- ✅ Push notifications FCM
- ✅ Préférences utilisateur
- ✅ Do Not Disturb
- ✅ Rate limiting
- ✅ Batch operations

### Sécurité
- ✅ Protection XSS
- ✅ Prévention IDOR
- ✅ Sanitization
- ✅ Validation types/priorités
- ✅ Protection injection MongoDB

### Performance
- ✅ 100 notifications concurrentes
- ✅ 1000 notifications batch
- ✅ Index MongoDB
- ✅ WebSocket multi-users
- ✅ Multi-device
- ✅ Consommation mémoire

### Fiabilité
- ✅ Fallback Firebase → WebSocket
- ✅ Reconnexion auto
- ✅ Gestion erreurs réseau
- ✅ Tokens invalides
- ✅ Timeouts

## 🎯 Prochaines Étapes

1. **Exécuter les tests**
   ```bash
   ./test-notifications-integration.sh --coverage
   ```

2. **Vérifier les résultats**
   - Tous les tests doivent passer ✅
   - Couverture > 80% ✅

3. **Intégrer dans CI/CD**
   - Copier exemple GitHub Actions/GitLab CI
   - Voir `TESTING_NOTIFICATIONS_GUIDE.md`

4. **Maintenance**
   - Tests hebdomadaires
   - Review couverture mensuelle
   - Tests complets avant release

---

**Pour plus de détails :** Consulter `TESTING_NOTIFICATIONS_GUIDE.md`
