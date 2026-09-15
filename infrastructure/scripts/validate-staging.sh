#!/bin/bash
# =============================================================================
# MEESHY - Script de Validation Staging
# =============================================================================
# Description: Valide que l'environnement staging fonctionne correctement
# Usage: ./infrastructure/scripts/validate-staging.sh
# =============================================================================

set -euo pipefail

REMOTE_HOST="root@meeshy.me"
STAGING_DIR="/opt/meeshy/staging"

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Validation de l'environnement STAGING..."
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

# =============================================================================
# HELPERS
# =============================================================================

test_pass() {
  echo -e "${GREEN}✅ $1${NC}"
  ((TESTS_PASSED++))
}

test_fail() {
  echo -e "${RED}❌ $1${NC}"
  ((TESTS_FAILED++))
}

test_warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

# =============================================================================
# ÉTAPE 1: VÉRIFIER LES SERVICES DOCKER
# =============================================================================

echo "🐋 Vérification des services Docker..."
echo ""

# Liste des services attendus
EXPECTED_SERVICES=(
  "meeshy-database-staging"
  "meeshy-gateway-staging"
  "meeshy-translator-staging"
  "meeshy-web-staging"
  "meeshy-redis-staging"
  "meeshy-traefik-staging"
)

for service in "${EXPECTED_SERVICES[@]}"; do
  STATUS=$(ssh $REMOTE_HOST "docker inspect -f '{{.State.Status}}' $service 2>/dev/null" || echo "not_found")

  if [ "$STATUS" = "running" ]; then
    test_pass "Service $service est running"
  else
    test_fail "Service $service n'est pas running (status: $STATUS)"
  fi
done

echo ""

# =============================================================================
# ÉTAPE 2: VÉRIFIER LES HEALTH ENDPOINTS
# =============================================================================

echo "🏥 Vérification des health endpoints..."
echo ""

test_endpoint() {
  local name="$1"
  local url="$2"
  local expected_code="${3:-200}"

  response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

  if [ "$response" = "$expected_code" ]; then
    test_pass "$name - HTTP $response"
  else
    test_fail "$name - HTTP $response (attendu: $expected_code)"
  fi
}

test_endpoint "Gateway Health" "https://gate.staging.meeshy.me/health"
test_endpoint "ML Service Health" "https://ml.staging.meeshy.me/health"
test_endpoint "Frontend" "https://staging.meeshy.me"

echo ""

# =============================================================================
# ÉTAPE 3: VÉRIFIER LES DONNÉES MONGODB
# =============================================================================

echo "💾 Vérification des données MongoDB..."
echo ""

# Compter les documents via Prisma
echo "   Récupération des counts..."

USER_COUNT=$(ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway \
  node -e \"const { PrismaClient } = require('@prisma/client'); \
  const prisma = new PrismaClient(); \
  prisma.user.count().then(c => console.log(c)).finally(() => prisma.\\\$disconnect())\" 2>/dev/null" || echo "0")

MESSAGE_COUNT=$(ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway \
  node -e \"const { PrismaClient } = require('@prisma/client'); \
  const prisma = new PrismaClient(); \
  prisma.message.count().then(c => console.log(c)).finally(() => prisma.\\\$disconnect())\" 2>/dev/null" || echo "0")

COMMUNITY_COUNT=$(ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway \
  node -e \"const { PrismaClient } = require('@prisma/client'); \
  const prisma = new PrismaClient(); \
  prisma.community.count().then(c => console.log(c)).finally(() => prisma.\\\$disconnect())\" 2>/dev/null" || echo "0")

CONVERSATION_COUNT=$(ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway \
  node -e \"const { PrismaClient } = require('@prisma/client'); \
  const prisma = new PrismaClient(); \
  prisma.conversation.count().then(c => console.log(c)).finally(() => prisma.\\\$disconnect())\" 2>/dev/null" || echo "0")

USER_CONV_CAT_COUNT=$(ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway \
  node -e \"const { PrismaClient } = require('@prisma/client'); \
  const prisma = new PrismaClient(); \
  prisma.userConversationCategory.count().then(c => console.log(c)).finally(() => prisma.\\\$disconnect())\" 2>/dev/null" || echo "0")

USER_CONV_PREF_COUNT=$(ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway \
  node -e \"const { PrismaClient } = require('@prisma/client'); \
  const prisma = new PrismaClient(); \
  prisma.userConversationPreferences.count().then(c => console.log(c)).finally(() => prisma.\\\$disconnect())\" 2>/dev/null" || echo "0")

echo ""
echo "   📊 Documents dans Prisma:"
echo "      - Users: $USER_COUNT"
echo "      - Messages: $MESSAGE_COUNT"
echo "      - Communities: $COMMUNITY_COUNT"
echo "      - Conversations: $CONVERSATION_COUNT"
echo "      - User Conversation Categories: $USER_CONV_CAT_COUNT"
echo "      - User Conversation Preferences: $USER_CONV_PREF_COUNT"
echo ""

# Valider les counts
if [ "$USER_COUNT" -gt 0 ]; then
  test_pass "Users > 0"
else
  test_fail "Aucun utilisateur trouvé"
fi

if [ "$MESSAGE_COUNT" -gt 0 ]; then
  test_pass "Messages > 0"
else
  test_warn "Aucun message trouvé (peut être normal)"
fi

if [ "$COMMUNITY_COUNT" -gt 0 ]; then
  test_pass "Communities > 0"
else
  test_warn "Aucune communauté trouvée (peut être normal)"
fi

if [ "$CONVERSATION_COUNT" -gt 0 ]; then
  test_pass "Conversations > 0"
else
  test_warn "Aucune conversation trouvée (peut être normal)"
fi

if [ "$USER_CONV_CAT_COUNT" -gt 0 ]; then
  test_pass "User Conversation Categories > 0"
else
  test_warn "Aucune catégorie de conversation trouvée (peut être normal)"
fi

if [ "$USER_CONV_PREF_COUNT" -gt 0 ]; then
  test_pass "User Conversation Preferences > 0"
else
  test_warn "Aucune préférence de conversation trouvée (peut être normal)"
fi

echo ""

# =============================================================================
# ÉTAPE 4: VÉRIFIER LES VOLUMES
# =============================================================================

echo "💿 Vérification des volumes..."
echo ""

EXPECTED_VOLUMES=(
  "meeshy-staging-database-data"
  "meeshy-staging-gateway-uploads"
  "meeshy-staging-web-uploads"
  "meeshy-staging-redis-data"
  "meeshy-staging-models-data"
)

for volume in "${EXPECTED_VOLUMES[@]}"; do
  EXISTS=$(ssh $REMOTE_HOST "docker volume inspect $volume >/dev/null 2>&1 && echo 'yes' || echo 'no'")

  if [ "$EXISTS" = "yes" ]; then
    test_pass "Volume $volume existe"
  else
    test_fail "Volume $volume n'existe pas"
  fi
done

echo ""

# =============================================================================
# ÉTAPE 5: VÉRIFIER LES LOGS (pas d'erreurs critiques)
# =============================================================================

echo "📜 Vérification des logs récents..."
echo ""

# Chercher des erreurs dans les logs gateway
GATEWAY_ERRORS=$(ssh $REMOTE_HOST "docker logs meeshy-gateway-staging --tail 100 2>&1 | grep -i 'error' | wc -l")

if [ "$GATEWAY_ERRORS" -eq 0 ]; then
  test_pass "Pas d'erreurs dans gateway logs"
else
  test_warn "Gateway logs contiennent $GATEWAY_ERRORS erreurs (à vérifier)"
fi

# Chercher des erreurs dans les logs database
DB_ERRORS=$(ssh $REMOTE_HOST "docker logs meeshy-database-staging --tail 100 2>&1 | grep -i 'error' | wc -l")

if [ "$DB_ERRORS" -eq 0 ]; then
  test_pass "Pas d'erreurs dans database logs"
else
  test_warn "Database logs contiennent $DB_ERRORS erreurs (à vérifier)"
fi

echo ""

# =============================================================================
# ÉTAPE 6: TEST API BASIQUE (si possible)
# =============================================================================

echo "🔌 Test API basique..."
echo ""

# Test ping endpoint
PING_RESPONSE=$(curl -s "https://gate.staging.meeshy.me/api/v1/ping" 2>/dev/null || echo '{"error":"failed"}')

if echo "$PING_RESPONSE" | grep -q "pong"; then
  test_pass "API ping répond"
else
  test_warn "API ping ne répond pas comme attendu"
fi

echo ""

# =============================================================================
# RÉSUMÉ
# =============================================================================

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))

echo "=" | tr -d '\n' | head -c 80; echo
echo "📊 RÉSUMÉ DE LA VALIDATION"
echo "=" | tr -d '\n' | head -c 80; echo
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ Tous les tests ont réussi ($TESTS_PASSED/$TOTAL_TESTS)${NC}"
  echo ""
  echo "🎉 Staging est prêt pour les tests manuels!"
  echo ""
  echo "🌐 URLs disponibles:"
  echo "   - Frontend:  https://staging.meeshy.me"
  echo "   - Gateway:   https://gate.staging.meeshy.me"
  echo "   - ML:        https://ml.staging.meeshy.me"
  echo ""
  echo "🔒 MongoDB UI / Redis UI (#6254 — plus routées par Traefik, accès tunnel SSH uniquement) :"
  echo "   ssh -L 8091:127.0.0.1:8091 -L 8092:127.0.0.1:8092 root@meeshy.me"
  echo "   puis http://localhost:8091 (Mongo) / http://localhost:8092 (Redis) en local"
  echo ""
  echo "📝 Tests manuels à effectuer:"
  echo "   1. Se connecter avec un compte utilisateur"
  echo "   2. Envoyer un message"
  echo "   3. Tester la traduction"
  echo "   4. Tester l'upload de fichiers"
  echo "   5. Vérifier les communautés"
  echo ""
  echo "✅ Si tests manuels OK:"
  echo "   ./infrastructure/scripts/switch-to-production.sh"
  echo ""
  exit 0
else
  echo -e "${RED}❌ Certains tests ont échoué ($TESTS_FAILED/$TOTAL_TESTS)${NC}"
  echo ""
  echo "🔍 Actions recommandées:"
  echo "   1. Vérifier les logs: ssh $REMOTE_HOST 'cd $STAGING_DIR && docker compose logs'"
  echo "   2. Vérifier les services: ssh $REMOTE_HOST 'cd $STAGING_DIR && docker compose ps'"
  echo "   3. Corriger les problèmes"
  echo "   4. Re-lancer la validation"
  echo ""
  exit 1
fi
