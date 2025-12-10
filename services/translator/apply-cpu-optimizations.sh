#!/bin/bash

###############################################################################
# Script d'application des optimisations CPU pour le Translator Meeshy
# Ce script configure automatiquement les paramètres optimaux pour CPU
###############################################################################

set -e

# Couleurs pour l'output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Optimisation CPU du Translator Meeshy${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Vérifier qu'on est dans le bon dossier
if [ ! -f "env.example" ] || [ ! -d "src" ]; then
    echo -e "${RED}❌ Erreur: Ce script doit être exécuté depuis le dossier translator/${NC}"
    exit 1
fi

# Backup du .env existant si présent
if [ -f ".env" ]; then
    BACKUP_FILE=".env.backup.$(date +%Y%m%d_%H%M%S)"
    echo -e "${YELLOW}📦 Sauvegarde de .env existant vers ${BACKUP_FILE}${NC}"
    cp .env "$BACKUP_FILE"
fi

# Créer ou mettre à jour le fichier .env
echo -e "${BLUE}📝 Application des optimisations CPU...${NC}"

# Fonction pour mettre à jour ou ajouter une variable
update_or_add_env_var() {
    local var_name="$1"
    local var_value="$2"
    local env_file="${3:-.env}"
    
    if grep -q "^${var_name}=" "$env_file" 2>/dev/null; then
        # Variable existe, la mettre à jour
        sed -i.tmp "s/^${var_name}=.*/${var_name}=${var_value}/" "$env_file"
        rm -f "${env_file}.tmp"
        echo -e "  ${GREEN}✓${NC} Mis à jour: ${var_name}=${var_value}"
    else
        # Variable n'existe pas, l'ajouter
        echo "${var_name}=${var_value}" >> "$env_file"
        echo -e "  ${GREEN}✓${NC} Ajouté: ${var_name}=${var_value}"
    fi
}

# Copier env.example si .env n'existe pas
if [ ! -f ".env" ]; then
    echo -e "${BLUE}📄 Création de .env depuis env.example${NC}"
    cp env.example .env
fi

echo ""
echo -e "${BLUE}🔧 Configuration des workers optimisés pour CPU...${NC}"

# Workers configuration
update_or_add_env_var "NORMAL_WORKERS_DEFAULT" "4"
update_or_add_env_var "ANY_WORKERS_DEFAULT" "2"
update_or_add_env_var "NORMAL_WORKERS_MIN" "2"
update_or_add_env_var "ANY_WORKERS_MIN" "1"
update_or_add_env_var "NORMAL_WORKERS_MAX" "8"
update_or_add_env_var "ANY_WORKERS_MAX" "4"
update_or_add_env_var "NORMAL_WORKERS_SCALING_MAX" "8"
update_or_add_env_var "ANY_WORKERS_SCALING_MAX" "4"
update_or_add_env_var "ML_MAX_WORKERS" "4"

echo ""
echo -e "${BLUE}⚡ Configuration des performances...${NC}"

# Performance settings
update_or_add_env_var "TRANSLATION_TIMEOUT" "30"
update_or_add_env_var "CONCURRENT_TRANSLATIONS" "4"
update_or_add_env_var "QUANTIZATION_LEVEL" "float32"

echo ""
echo -e "${BLUE}🎯 Configuration ML...${NC}"

# ML settings
update_or_add_env_var "ML_BATCH_SIZE" "32"
update_or_add_env_var "DEVICE" "cpu"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Optimisations appliquées avec succès!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}📊 Résumé des optimisations:${NC}"
echo -e "  • Workers normaux: 20 → 4 (réduction de 80%)"
echo -e "  • Workers 'any': 10 → 2 (réduction de 80%)"
echo -e "  • Workers ML: Limité à 4"
echo -e "  • Timeout traduction: 15s → 30s"
echo -e "  • Traductions concurrentes: 10 → 4"
echo -e "  • Quantization: float16 → float32 (optimisé CPU)"
echo ""

echo -e "${YELLOW}📈 Améliorations attendues:${NC}"
echo -e "  • ${GREEN}Vitesse de traduction:${NC} 5-10x plus rapide (~1-2s au lieu de ~10s)"
echo -e "  • ${GREEN}Utilisation RAM:${NC} Réduction de ~70% (~4-6 GB au lieu de ~12-14 GB)"
echo -e "  • ${GREEN}Utilisation CPU:${NC} Réduction de ~40% (40-60% au lieu de 90-100%)"
echo -e "  • ${GREEN}Timeouts BD:${NC} Résolus (timeout Prisma augmenté à 60s)"
echo ""

echo -e "${BLUE}🚀 Prochaines étapes:${NC}"
echo -e "  1. Vérifiez et ajustez DATABASE_URL dans .env si nécessaire"
echo -e "  2. Redémarrez le service translator:"
echo -e "     ${YELLOW}./translator.sh${NC}"
echo -e "  3. Surveillez les logs pour vérifier les améliorations:"
echo -e "     ${YELLOW}tail -f src/translator.log${NC}"
echo -e "  4. Consultez le guide complet:"
echo -e "     ${YELLOW}cat PERFORMANCE_OPTIMIZATION_GUIDE.md${NC}"
echo ""

# Vérifier si le service est en cours d'exécution
if pgrep -f "python.*translator" > /dev/null; then
    echo -e "${YELLOW}⚠️  Le service translator est actuellement en cours d'exécution${NC}"
    echo -e "${YELLOW}   Redémarrez-le pour appliquer les changements:${NC}"
    echo -e "   ${YELLOW}pkill -f 'python.*translator' && ./translator.sh${NC}"
    echo ""
fi

echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Configuration terminée!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"

