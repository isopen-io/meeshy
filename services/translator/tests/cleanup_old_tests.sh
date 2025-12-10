#!/bin/bash

# Script de nettoyage des anciens fichiers de test
# Supprime les fichiers de test obsolètes qui ont été remplacés

set -e

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧹 Nettoyage des anciens fichiers de test${NC}"
echo "=================================================="

# Fichiers à supprimer (remplacés par les nouveaux tests)
OLD_TEST_FILES=(
    "test_simple.py"
    "test_quantized_service.py"
    "test_model_sharing.py"
    "test_fallback_system.py"
    "test-all-models.sh"
)

# Vérifier et supprimer les fichiers
deleted_count=0
for file in "${OLD_TEST_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${YELLOW}🗑️  Suppression de $file${NC}"
        rm "$file"
        ((deleted_count++))
    else
        echo -e "${GREEN}✅ $file déjà supprimé${NC}"
    fi
done

echo ""
echo -e "${BLUE}📊 Résumé du nettoyage:${NC}"
echo -e "  - Fichiers supprimés: ${GREEN}$deleted_count${NC}"
echo -e "  - Fichiers déjà supprimés: ${GREEN}$((${#OLD_TEST_FILES[@]} - deleted_count))${NC}"

echo ""
echo -e "${GREEN}✅ Nettoyage terminé${NC}"
echo ""
echo -e "${BLUE}📋 Nouveaux tests disponibles:${NC}"
echo "  - test_01_model_utils.py (Niveau 1: Utilitaires de base)"
echo "  - test_02_model_detection.py (Niveau 2: Détection des modèles)"
echo "  - test_03_model_download.py (Niveau 3: Téléchargement des modèles)"
echo "  - test_04_service_integration.py (Niveau 4: Intégration du service)"
echo "  - test_05_quantized_service.py (Niveau 5: Service quantifié)"
echo ""
echo -e "${BLUE}🚀 Pour exécuter tous les tests:${NC}"
echo "  ./test-translate.sh"
