#!/bin/bash

##############################################################################
# Script de test d'intégration pour le système de notifications
#
# OBJECTIF: Vérifier que l'application fonctionne parfaitement dans 2 scénarios:
# 1. Sans Firebase configuré (WebSocket seulement)
# 2. Avec Firebase configuré (WebSocket + Push notifications)
#
# Usage:
#   ./test-notifications-integration.sh [options]
#
# Options:
#   --backend-only    Exécute uniquement les tests backend
#   --frontend-only   Exécute uniquement les tests frontend
#   --verbose         Affiche plus de détails
#   --coverage        Génère les rapports de couverture
#   --help            Affiche l'aide
##############################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Options
RUN_BACKEND=true
RUN_FRONTEND=true
VERBOSE=false
COVERAGE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --backend-only)
      RUN_FRONTEND=false
      shift
      ;;
    --frontend-only)
      RUN_BACKEND=false
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --coverage)
      COVERAGE=true
      shift
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --backend-only    Exécute uniquement les tests backend"
      echo "  --frontend-only   Exécute uniquement les tests frontend"
      echo "  --verbose         Affiche plus de détails"
      echo "  --coverage        Génère les rapports de couverture"
      echo "  --help            Affiche l'aide"
      exit 0
      ;;
    *)
      echo -e "${RED}Option inconnue: $1${NC}"
      echo "Utilisez --help pour voir les options disponibles"
      exit 1
      ;;
  esac
done

# Header
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Tests d'intégration - Système de Notifications         ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Track results
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=0

# Function to run a test suite
run_test_suite() {
  local name=$1
  local command=$2
  local description=$3

  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}Test: ${name}${NC}"
  echo -e "${YELLOW}Description: ${description}${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

  TOTAL_TESTS=$((TOTAL_TESTS + 1))

  if [ "$VERBOSE" = true ]; then
    echo -e "${YELLOW}Commande: ${command}${NC}"
  fi

  if eval "$command"; then
    echo -e "${GREEN}✅ ${name}: PASSED${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    echo -e "${RED}❌ ${name}: FAILED${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

# Sauvegarder les variables d'environnement
save_env() {
  export SAVED_FIREBASE_ADMIN_CREDENTIALS_PATH="${FIREBASE_ADMIN_CREDENTIALS_PATH:-}"
  export SAVED_FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-}"
  export SAVED_NEXT_PUBLIC_FIREBASE_API_KEY="${NEXT_PUBLIC_FIREBASE_API_KEY:-}"
  export SAVED_NEXT_PUBLIC_FIREBASE_PROJECT_ID="${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-}"
}

# Restaurer les variables d'environnement
restore_env() {
  export FIREBASE_ADMIN_CREDENTIALS_PATH="$SAVED_FIREBASE_ADMIN_CREDENTIALS_PATH"
  export FIREBASE_PROJECT_ID="$SAVED_FIREBASE_PROJECT_ID"
  export NEXT_PUBLIC_FIREBASE_API_KEY="$SAVED_NEXT_PUBLIC_FIREBASE_API_KEY"
  export NEXT_PUBLIC_FIREBASE_PROJECT_ID="$SAVED_NEXT_PUBLIC_FIREBASE_PROJECT_ID"
}

# Supprimer les variables Firebase (simuler absence de Firebase)
clear_firebase_env() {
  unset FIREBASE_ADMIN_CREDENTIALS_PATH
  unset FIREBASE_PROJECT_ID
  unset FIREBASE_CLIENT_EMAIL
  unset FIREBASE_PRIVATE_KEY
  unset NEXT_PUBLIC_FIREBASE_API_KEY
  unset NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  unset NEXT_PUBLIC_FIREBASE_PROJECT_ID
  unset NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  unset NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  unset NEXT_PUBLIC_FIREBASE_APP_ID
  unset NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  unset NEXT_PUBLIC_FIREBASE_VAPID_KEY
}

# Configurer Firebase (simuler présence de Firebase)
setup_firebase_env() {
  export FIREBASE_ADMIN_CREDENTIALS_PATH="./test-firebase-credentials.json"
  export FIREBASE_PROJECT_ID="test-project"
  export NEXT_PUBLIC_FIREBASE_API_KEY="test-api-key"
  export NEXT_PUBLIC_FIREBASE_PROJECT_ID="test-project"
  export NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="test.firebaseapp.com"
  export NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="test.appspot.com"
  export NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="123456789"
  export NEXT_PUBLIC_FIREBASE_APP_ID="test-app-id"
  export NEXT_PUBLIC_FIREBASE_VAPID_KEY="test-vapid-key"
}

save_env

##############################################################################
# TESTS BACKEND
##############################################################################

if [ "$RUN_BACKEND" = true ]; then
  echo ""
  echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║               TESTS BACKEND                              ║${NC}"
  echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"

  cd gateway

  # Test 1: Backend sans Firebase
  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}Scénario 1: Backend SANS Firebase${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  clear_firebase_env

  if [ "$COVERAGE" = true ]; then
    TEST_CMD="npm test -- src/__tests__/notifications-integration.test.ts --coverage"
  else
    TEST_CMD="npm test -- src/__tests__/notifications-integration.test.ts"
  fi

  run_test_suite \
    "Backend sans Firebase" \
    "$TEST_CMD" \
    "Vérifier que le service fonctionne sans Firebase (WebSocket uniquement)"

  # Test 2: Backend avec Firebase
  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}Scénario 2: Backend AVEC Firebase${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  setup_firebase_env

  if [ "$COVERAGE" = true ]; then
    TEST_CMD="npm test -- src/__tests__/notifications-firebase.test.ts --coverage"
  else
    TEST_CMD="npm test -- src/__tests__/notifications-firebase.test.ts"
  fi

  run_test_suite \
    "Backend avec Firebase" \
    "$TEST_CMD" \
    "Vérifier que Firebase est correctement intégré et que le fallback fonctionne"

  # Test 3: Tests de performance
  clear_firebase_env

  if [ "$COVERAGE" = true ]; then
    TEST_CMD="npm test -- src/__tests__/notifications-performance.test.ts --coverage"
  else
    TEST_CMD="npm test -- src/__tests__/notifications-performance.test.ts"
  fi

  run_test_suite \
    "Performance Notifications" \
    "$TEST_CMD" \
    "Vérifier que le système peut gérer de grandes charges"

  # Test 4: Tests de sécurité
  if [ "$COVERAGE" = true ]; then
    TEST_CMD="npm test -- src/__tests__/notifications-security.test.ts --coverage"
  else
    TEST_CMD="npm test -- src/__tests__/notifications-security.test.ts"
  fi

  run_test_suite \
    "Sécurité Notifications" \
    "$TEST_CMD" \
    "Vérifier la protection XSS, IDOR, rate limiting, etc."

  cd ..
fi

##############################################################################
# TESTS FRONTEND
##############################################################################

if [ "$RUN_FRONTEND" = true ]; then
  echo ""
  echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║               TESTS FRONTEND                             ║${NC}"
  echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"

  cd frontend

  # Test 5: Frontend sans Firebase
  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}Scénario 3: Frontend SANS Firebase${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  clear_firebase_env

  if [ "$COVERAGE" = true ]; then
    TEST_CMD="npm test -- __tests__/firebase-availability.test.tsx --coverage"
  else
    TEST_CMD="npm test -- __tests__/firebase-availability.test.tsx"
  fi

  run_test_suite \
    "Frontend sans Firebase" \
    "$TEST_CMD" \
    "Vérifier que l'app frontend fonctionne sans Firebase"

  # Test 6: Frontend avec Firebase
  echo ""
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}Scénario 4: Frontend AVEC Firebase${NC}"
  echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  setup_firebase_env

  run_test_suite \
    "Frontend avec Firebase" \
    "$TEST_CMD" \
    "Vérifier que Firebase est disponible et WebSocket fonctionne toujours"

  cd ..
fi

restore_env

##############################################################################
# RÉSULTATS FINAUX
##############################################################################

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                RÉSULTATS FINAUX                          ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 TOUS LES TESTS SONT PASSÉS !${NC}"
  echo ""
  echo -e "${GREEN}✅ Tests réussis: ${TESTS_PASSED}/${TOTAL_TESTS}${NC}"
  echo -e "${GREEN}✅ App fonctionne avec Firebase${NC}"
  echo -e "${GREEN}✅ App fonctionne sans Firebase${NC}"
  echo -e "${GREEN}✅ Aucun crash détecté${NC}"
  echo -e "${GREEN}✅ Performance OK${NC}"
  echo -e "${GREEN}✅ Sécurité OK${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}❌ CERTAINS TESTS ONT ÉCHOUÉ${NC}"
  echo ""
  echo -e "${RED}Tests réussis: ${TESTS_PASSED}/${TOTAL_TESTS}${NC}"
  echo -e "${RED}Tests échoués: ${TESTS_FAILED}/${TOTAL_TESTS}${NC}"
  echo ""
  echo -e "${YELLOW}Veuillez vérifier les logs ci-dessus pour plus de détails.${NC}"
  echo ""
  exit 1
fi
