#!/bin/bash

# 🧪 Script de test pour vérifier l'accès des utilisateurs non authentifiés
# Règle : Si l'utilisateur n'est pas authentifié (pas de session token, pas de JWT token), il ne peut pas accéder à aucune conversation

set -e

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Test de l'accès des utilisateurs non authentifiés${NC}"
echo -e "${YELLOW}📋 Règle : Si l'utilisateur n'est pas authentifié, il ne peut pas accéder à aucune conversation${NC}"
echo ""

# Test 1: Utilisateur non authentifié - Accès à la conversation "meeshy"
echo -e "${YELLOW}🔍 Test 1: Utilisateur non authentifié → conversation 'meeshy'${NC}"
response=$(curl -s -w "%{http_code}" http://localhost:3000/conversations/meeshy/messages)
http_code="${response: -3}"
response_body="${response%???}"

if [ "$http_code" = "403" ]; then
    echo -e "  ${GREEN}✅ Accès refusé (403) - Correct (utilisateur non authentifié)${NC}"
else
    echo -e "  ${RED}❌ Code HTTP inattendu: $http_code${NC}"
    echo -e "  ${RED}📋 Réponse: $response_body${NC}"
fi

# Test 2: Utilisateur non authentifié - Accès aux participants de "meeshy"
echo -e "${YELLOW}🔍 Test 2: Utilisateur non authentifié → participants 'meeshy'${NC}"
response=$(curl -s -w "%{http_code}" http://localhost:3000/conversations/meeshy/participants)
http_code="${response: -3}"
response_body="${response%???}"

if [ "$http_code" = "403" ]; then
    echo -e "  ${GREEN}✅ Accès refusé (403) - Correct (utilisateur non authentifié)${NC}"
else
    echo -e "  ${RED}❌ Code HTTP inattendu: $http_code${NC}"
    echo -e "  ${RED}📋 Réponse: $response_body${NC}"
fi

# Test 3: Utilisateur non authentifié - Accès à une conversation avec préfixe mshy_
echo -e "${YELLOW}🔍 Test 3: Utilisateur non authentifié → conversation 'mshy_test'${NC}"
response=$(curl -s -w "%{http_code}" http://localhost:3000/conversations/mshy_test/messages)
http_code="${response: -3}"
response_body="${response%???}"

if [ "$http_code" = "403" ]; then
    echo -e "  ${GREEN}✅ Accès refusé (403) - Correct (utilisateur non authentifié)${NC}"
else
    echo -e "  ${RED}❌ Code HTTP inattendu: $http_code${NC}"
    echo -e "  ${RED}📋 Réponse: $response_body${NC}"
fi

# Test 4: Utilisateur non authentifié - Accès à une conversation inexistante
echo -e "${YELLOW}🔍 Test 4: Utilisateur non authentifié → conversation inexistante${NC}"
response=$(curl -s -w "%{http_code}" http://localhost:3000/conversations/nonexistent/messages)
http_code="${response: -3}"
response_body="${response%???}"

if [ "$http_code" = "403" ]; then
    echo -e "  ${GREEN}✅ Accès refusé (403) - Correct (utilisateur non authentifié)${NC}"
else
    echo -e "  ${RED}❌ Code HTTP inattendu: $http_code${NC}"
    echo -e "  ${RED}📋 Réponse: $response_body${NC}"
fi

# Test 5: Utilisateur non authentifié - Tentative d'envoi de message
echo -e "${YELLOW}🔍 Test 5: Utilisateur non authentifié → envoi de message${NC}"
response=$(curl -s -w "%{http_code}" -X POST http://localhost:3000/conversations/meeshy/messages \
  -H "Content-Type: application/json" \
  -d '{"content": "Test message", "messageType": "text"}')
http_code="${response: -3}"
response_body="${response%???}"

if [ "$http_code" = "403" ]; then
    echo -e "  ${GREEN}✅ Accès refusé (403) - Correct (utilisateur non authentifié)${NC}"
else
    echo -e "  ${RED}❌ Code HTTP inattendu: $http_code${NC}"
    echo -e "  ${RED}📋 Réponse: $response_body${NC}"
fi

# Test 6: Utilisateur non authentifié - Accès à la liste des conversations
echo -e "${YELLOW}🔍 Test 6: Utilisateur non authentifié → liste des conversations${NC}"
response=$(curl -s -w "%{http_code}" http://localhost:3000/conversations)
http_code="${response: -3}"
response_body="${response%???}"

if [ "$http_code" = "403" ]; then
    echo -e "  ${GREEN}✅ Accès refusé (403) - Correct (utilisateur non authentifié)${NC}"
else
    echo -e "  ${RED}❌ Code HTTP inattendu: $http_code${NC}"
    echo -e "  ${RED}📋 Réponse: $response_body${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Tests de l'accès des utilisateurs non authentifiés terminés !${NC}"
echo -e "${BLUE}💡 Règle appliquée:${NC}"
echo -e "  ${GREEN}• Si l'utilisateur n'est pas authentifié (pas de session token, pas de JWT token), il ne peut pas accéder à aucune conversation${NC}"
echo -e "  ${GREEN}• Aucune exception, même pour la conversation 'meeshy'${NC}"
echo -e "  ${GREEN}• Seuls les utilisateurs authentifiés (JWT ou session token) peuvent accéder aux conversations${NC}"
echo -e "  ${GREEN}• Les utilisateurs authentifiés ne peuvent accéder qu'aux conversations dont ils sont membres${NC}"

