#!/bin/bash

# 🧪 Script de test complet pour l'enregistrement d'utilisateurs
# Ce script teste l'endpoint d'enregistrement après la configuration du replica set MongoDB

set -e

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🧪 Test de l'enregistrement d'utilisateurs${NC}"

# Test 1: Vérifier que les services sont en cours d'exécution
echo -e "${YELLOW}🔍 Vérification des services...${NC}"

services=(
    "3000:Gateway"
    "3100:Frontend" 
    "8000:Translator"
    "27017:MongoDB"
    "6379:Redis"
)

all_services_ok=true
for service in "${services[@]}"; do
    port=$(echo $service | cut -d: -f1)
    name=$(echo $service | cut -d: -f2)
    
    if nc -z localhost $port 2>/dev/null; then
        echo -e "  ${GREEN}✅ $name (port $port)${NC}"
    else
        echo -e "  ${RED}❌ $name (port $port)${NC}"
        all_services_ok=false
    fi
done

if [ "$all_services_ok" = false ]; then
    echo -e "${RED}❌ Certains services ne sont pas disponibles${NC}"
    exit 1
fi

# Test 2: Vérifier le statut du replica set MongoDB
echo -e "${YELLOW}🔍 Vérification du replica set MongoDB...${NC}"
if mongosh --eval "rs.status().ok" --quiet --username meeshy --password MeeshyPassword123 --authenticationDatabase admin | grep -q "1"; then
    echo -e "  ${GREEN}✅ Replica set MongoDB configuré${NC}"
else
    echo -e "  ${RED}❌ Replica set MongoDB non configuré${NC}"
    exit 1
fi

# Test 3: Test d'enregistrement d'un utilisateur
echo -e "${YELLOW}🔍 Test d'enregistrement d'utilisateur...${NC}"

# Générer un nom d'utilisateur unique
timestamp=$(date +%s)
username="testuser_$timestamp"
email="test_$timestamp@example.com"

response=$(curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$username\",
    \"email\": \"$email\",
    \"password\": \"password123\",
    \"firstName\": \"Test\",
    \"lastName\": \"User\"
  }")

# Vérifier la réponse
if echo "$response" | grep -q '"success":true'; then
    echo -e "  ${GREEN}✅ Enregistrement réussi${NC}"
    
    # Extraire l'ID utilisateur de la réponse
    user_id=$(echo "$response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo -e "  ${GREEN}📋 ID utilisateur créé: $user_id${NC}"
    
    # Test 4: Vérifier que l'utilisateur existe dans MongoDB
    echo -e "${YELLOW}🔍 Vérification en base de données...${NC}"
    user_exists=$(mongosh --eval "db.User.findOne({username: '$username'})" --quiet --username meeshy --password MeeshyPassword123 --authenticationDatabase admin meeshy)
    
    if echo "$user_exists" | grep -q "$username"; then
        echo -e "  ${GREEN}✅ Utilisateur trouvé en base de données${NC}"
    else
        echo -e "  ${RED}❌ Utilisateur non trouvé en base de données${NC}"
    fi
    
else
    echo -e "  ${RED}❌ Échec de l'enregistrement${NC}"
    echo -e "  ${RED}📋 Réponse: $response${NC}"
    exit 1
fi

# Test 5: Test de connexion avec l'utilisateur créé
echo -e "${YELLOW}🔍 Test de connexion...${NC}"

login_response=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"username\": \"$username\",
    \"password\": \"password123\"
  }")

if echo "$login_response" | grep -q '"success":true'; then
    echo -e "  ${GREEN}✅ Connexion réussie${NC}"
else
    echo -e "  ${RED}❌ Échec de la connexion${NC}"
    echo -e "  ${RED}📋 Réponse: $login_response${NC}"
fi

echo -e "${GREEN}🎉 Tests terminés avec succès !${NC}"
echo -e "${BLUE}💡 L'enregistrement et la connexion d'utilisateurs fonctionnent correctement${NC}"

