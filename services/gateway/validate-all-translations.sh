#!/bin/bash

# Script de validation complète du système de traductions

cd "$(dirname "$0")"

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}VALIDATION COMPLÈTE DU SYSTÈME${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: Vérifier doublons
echo -e "${YELLOW}[1/3] Vérification des doublons en base...${NC}"
if node check-duplicates.js 2>&1 | grep -q "Aucun doublon trouvé"; then
    echo -e "${GREEN}✅ Test 1: Aucun doublon${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}❌ Test 1: Doublons détectés!${NC}"
    ((TESTS_FAILED++))
fi
echo ""

# Test 2: Test temps réel
echo -e "${YELLOW}[2/3] Test création de doublons en temps réel...${NC}"
if node test-real-time-duplicates.js 2>&1 | grep -q "AUCUN DOUBLON DÉTECTÉ"; then
    echo -e "${GREEN}✅ Test 2: Pas de doublons créés${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}❌ Test 2: Doublons créés!${NC}"
    ((TESTS_FAILED++))
fi
echo ""

# Test 3: Test retraduction
echo -e "${YELLOW}[3/3] Test retraduction avec tier supérieur...${NC}"
if node test-retranslation-tier.js 2>&1 | grep -q "TEST RÉUSSI"; then
    echo -e "${GREEN}✅ Test 3: Retraduction fonctionne${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}❌ Test 3: Retraduction échouée!${NC}"
    ((TESTS_FAILED++))
fi
echo ""

# Résumé
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}RÉSUMÉ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Tests réussis: ${GREEN}${TESTS_PASSED}/3${NC}"
echo -e "Tests échoués: ${RED}${TESTS_FAILED}/3${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✅ TOUS LES TESTS RÉUSSIS!${NC}"
    echo ""
    echo -e "${GREEN}Le système de traductions est opérationnel:${NC}"
    echo -e "  ✅ Aucun doublon de traductions"
    echo -e "  ✅ ModelType correctement transmis"
    echo -e "  ✅ Retraduction avec tier supérieur fonctionnelle"
    echo ""
    exit 0
else
    echo -e "${RED}❌ DES TESTS ONT ÉCHOUÉ${NC}"
    echo ""
    echo -e "${YELLOW}Actions recommandées:${NC}"
    echo "  1. Vérifier les logs: docker logs meeshy-gateway-1 --tail 100"
    echo "  2. Nettoyer les doublons: node cleanup-duplicates-prisma.js"
    echo "  3. Redémarrer: docker-compose restart gateway translator"
    echo "  4. Relancer ce script"
    echo ""
    exit 1
fi

