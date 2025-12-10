# Quick Start - Tests Système de Statut

## Installation Rapide (5 minutes)

```bash
# 1. Installer dépendances backend
cd gateway
pnpm install

# 2. Installer dépendances tests E2E
cd ../tests
pnpm install

# 3. Installer navigateurs Playwright
pnpm exec playwright install --with-deps chromium
```

## Lancer les Tests (30 secondes)

### Option 1: Script Helper (Recommandé)

```bash
cd tests

# Tous les tests
./run-status-tests.sh all

# Tests rapides (unit + integration)
./run-status-tests.sh unit
./run-status-tests.sh integration
```

### Option 2: Commandes npm

```bash
cd tests

# Tests E2E seulement
pnpm run test:e2e

# Tests backend seulement
cd ../gateway
pnpm test
```

## Commandes les Plus Utiles

```bash
# Tests E2E en mode UI interactif (meilleur pour debug)
cd tests
pnpm exec playwright test --ui

# Tests backend avec couverture
cd gateway
pnpm test:coverage

# Tests manuels (ouvre la checklist)
cd tests
pnpm run test:manual
```

## Vérifier que Tout Fonctionne

```bash
# Test rapide de validation
cd gateway
pnpm test -- --testPathPattern="unit/StatusService" --bail

# Si passe → Installation OK ✅
# Si échoue → Voir troubleshooting ci-dessous
```

## Troubleshooting

### Erreur: "Playwright not installed"
```bash
cd tests
pnpm exec playwright install --with-deps
```

### Erreur: "Database connection failed"
```bash
cd gateway
pnpm prisma migrate dev
pnpm prisma generate
```

### Erreur: "Port already in use"
```bash
# Tuer processus sur port 3000
lsof -ti:3000 | xargs kill -9
```

## Prochaines Étapes

1. ✅ Installation réussie
2. 📖 Lire `/tests/README_STATUS_TESTS.md` pour guide complet
3. 🧪 Lancer `/tests/manual/MANUAL_TEST_STATUS.md` pour tests manuels
4. 📊 Consulter rapport couverture: `gateway/coverage/index.html`

## Aide

- **Guide complet**: `tests/README_STATUS_TESTS.md`
- **Résumé**: `tests/STATUS_TESTS_SUMMARY.md`
- **Tests manuels**: `tests/manual/MANUAL_TEST_STATUS.md`
- **Issues GitHub**: https://github.com/meeshy/meeshy/issues
