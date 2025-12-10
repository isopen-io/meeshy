#!/bin/bash

# 🧪 Script de test pour la logique d'accès simplifiée
# Règle : Seuls les utilisateurs faisant partie de la conversation peuvent y accéder

set -e

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Test de la logique d'accès simplifiée${NC}"
echo -e "${YELLOW}📋 Règle : Seuls les utilisateurs faisant partie de la conversation peuvent y accéder${NC}"
echo ""

# Test 1: Utilisateur anonyme - Accès à la conversation "meeshy"
echo -e "${YELLOW}🔍 Test 1: Utilisateur anonyme → conversation 'meeshy'${NC}"
response=$(curl -s -w "%{http_code}" http://localhost:3000/conversations/meeshy/messages)
http_code="${response: -3}"
response_body="${response%???}"

if [ "$http_code" = "403" ]; then
    echo -e "  ${GREEN}✅ Accès refusé (403) - Correct (pas membre de la conversation)${NC}"
else
    echo -e "  ${RED}❌ Code HTTP inattendu: $http_code${NC}"
    echo -e "  ${RED}📋 Réponse: $response_body${NC}"
fi

# Test 2: Utilisateur anonyme - Accès aux participants de "meeshy"
echo -e "${YELLOW}🔍 Test 2: Utilisateur anonyme → participants 'meeshy'${NC}"
response=$(curl -s -w "%{http_code}" http://localhost:3000/conversations/meeshy/participants)
http_code="${response: -3}"
response_body="${response%???}"

if [ "$http_code" = "403" ]; then
    echo -e "  ${GREEN}✅ Accès refusé (403) - Correct (pas membre de la conversation)${NC}"
else
    echo -e "  ${RED}❌ Code HTTP inattendu: $http_code${NC}"
    echo -e "  ${RED}📋 Réponse: $response_body${NC}"
fi

# Test 3: Créer un utilisateur connecté
echo -e "${YELLOW}🔍 Test 3: Création d'un utilisateur connecté${NC}"
timestamp=$(date +%s)
username="testuser_$timestamp"
email="test_$timestamp@example.com"

register_response=$(curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$username\",
    \"email\": \"$email\",
    \"password\": \"password123\",
    \"firstName\": \"Test\",
    \"lastName\": \"User\"
  }")

if echo "$register_response" | grep -q '"success":true'; then
    token=$(echo "$register_response" | jq -r '.data.token')
    echo -e "  ${GREEN}✅ Utilisateur créé avec succès${NC}"
else
    echo -e "  ${RED}❌ Échec de la création d'utilisateur${NC}"
    echo -e "  ${RED}📋 Réponse: $register_response${NC}"
    exit 1
fi

# Test 4: Utilisateur connecté - Accès à la conversation "meeshy" (sans être membre)
echo -e "${YELLOW}🔍 Test 4: Utilisateur connecté → conversation 'meeshy' (sans être membre)${NC}"
response=$(curl -s -w "%{http_code}" -H "Authorization: Bearer $token" http://localhost:3000/conversations/meeshy/messages)
http_code="${response: -3}"
response_body="${response%???}"

if [ "$http_code" = "403" ]; then
    echo -e "  ${GREEN}✅ Accès refusé (403) - Correct (pas membre de la conversation)${NC}"
else
    echo -e "  ${RED}❌ Code HTTP inattendu: $http_code${NC}"
    echo -e "  ${RED}📋 Réponse: $response_body${NC}"
fi

# Test 5: Utilisateur connecté - Accès aux participants de "meeshy" (sans être membre)
echo -e "${YELLOW}🔍 Test 5: Utilisateur connecté → participants 'meeshy' (sans être membre)${NC}"
response=$(curl -s -w "%{http_code}" -H "Authorization: Bearer $token" http://localhost:3000/conversations/meeshy/participants)
http_code="${response: -3}"
response_body="${response%???}"

if [ "$http_code" = "403" ]; then
    echo -e "  ${GREEN}✅ Accès refusé (403) - Correct (pas membre de la conversation)${NC}"
else
    echo -e "  ${RED}❌ Code HTTP inattendu: $http_code${NC}"
    echo -e "  ${RED}📋 Réponse: $response_body${NC}"
fi

# Test 6: Utilisateur connecté - Accès à une conversation inexistante
echo -e "${YELLOW}🔍 Test 6: Utilisateur connecté → conversation inexistante${NC}"
response=$(curl -s -w "%{http_code}" -H "Authorization: Bearer $token" http://localhost:3000/conversations/nonexistent/messages)
http_code="${response: -3}"
response_body="${response%???}"

if [ "$http_code" = "404" ]; then
    echo -e "  ${GREEN}✅ Conversation non trouvée (404) - Correct${NC}"
else
    echo -e "  ${RED}❌ Code HTTP inattendu: $http_code${NC}"
    echo -e "  ${RED}📋 Réponse: $response_body${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Tests de la logique d'accès simplifiée terminés !${NC}"
echo -e "${BLUE}💡 Règle appliquée:${NC}"
echo -e "  ${GREEN}• Seuls les utilisateurs faisant partie de la conversation peuvent y accéder${NC}"
echo -e "  ${GREEN}• Aucune exception, même pour la conversation 'meeshy'${NC}"
echo -e "  ${GREEN}• Utilisateurs anonymes : accès uniquement via liens d'invitation${NC}"
echo -e "  ${GREEN}• Utilisateurs connectés : accès uniquement s'ils sont membres${NC}"

