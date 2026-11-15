# Tests Notifications - Démarrage Rapide

## En 3 Commandes

```bash
# 1. Rendre le script exécutable (si nécessaire)
chmod +x test-notifications-integration.sh

# 2. Lancer TOUS les tests
./test-notifications-integration.sh

# 3. Voir les résultats
# ✅ Tous passent = Prêt pour production
# ❌ Certains échouent = Voir logs ci-dessus
```

## Résultat Attendu

```
🎉 TOUS LES TESTS SONT PASSÉS !

✅ Tests réussis: 110/110
✅ App fonctionne avec Firebase
✅ App fonctionne sans Firebase
✅ Performance OK
✅ Sécurité OK
```

## Tests Créés

### Backend (90 tests)
- `gateway/src/__tests__/notifications-integration.test.ts` (28 tests)
- `gateway/src/__tests__/notifications-firebase.test.ts` (22 tests)
- `gateway/src/__tests__/notifications-performance.test.ts` (15 tests)
- `gateway/src/__tests__/notifications-security.test.ts` (25 tests)

### Frontend (20 tests)
- `frontend/__tests__/firebase-availability.test.tsx` (20 tests)

## Documentation

**Démarrage :** `TESTS_NOTIFICATIONS_INDEX.md`
**Guide complet :** `TESTING_NOTIFICATIONS_GUIDE.md`
**Résumé :** `TESTS_NOTIFICATIONS_SUMMARY.md`

## Options

```bash
# Backend seulement
./test-notifications-integration.sh --backend-only

# Frontend seulement
./test-notifications-integration.sh --frontend-only

# Avec couverture
./test-notifications-integration.sh --coverage

# Mode verbose
./test-notifications-integration.sh --verbose
```

---

**C'est tout! Simple et efficace.**
