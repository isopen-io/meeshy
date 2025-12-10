#!/bin/bash

#########################################
# Script de Publication d'Annonce Meeshy
# Publie l'annonce de lancement sur le compte meeshy
#
# ⚠️  DÉPRÉCIÉ: Ce script est déprécié.
# Utilisez plutôt le nouveau script mmp.sh (Meeshy Message Publisher)
# qui offre les mêmes fonctionnalités avec vérification des permissions.
# 
# Migration: ./mmp.sh -l [en|fr] -f POST
# Documentation: ./README-MMP.md
#########################################

set -e

# Avertissement de dépréciation
echo -e "\033[1;33m⚠️  AVERTISSEMENT: Ce script est déprécié.\033[0m"
echo -e "\033[1;33m   Utilisez plutôt: ./mmp.sh (Meeshy Message Publisher)\033[0m"
echo -e "\033[1;33m   Migration: ./mmp.sh -l [en|fr] -f POST\033[0m"
echo -e "\033[1;33m   Documentation: ./README-MMP.md\033[0m"
echo ""
sleep 2

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATEWAY_URL="${MEESHY_API_URL:-${MEESHY_GATEWAY_URL:-https://gate.meeshy.me}}"
USERNAME="meeshy"

# Vérifier que le mot de passe est fourni
if [ -z "$MEESHY_PASSWORD" ]; then
    echo -e "${RED}❌ Erreur: MEESHY_PASSWORD n'est pas défini${NC}"
    echo ""
    echo "Usage:"
    echo "  export MEESHY_PASSWORD='votre_mot_de_passe'"
    echo "  $0 [en|fr]"
    echo ""
    echo "Ou bien:"
    echo "  $0 [en|fr] MOT_DE_PASSE"
    exit 1
fi

# Langue (défaut: en)
LANG="${1:-en}"
if [ "$#" -ge 2 ]; then
    export MEESHY_PASSWORD="$2"
fi

# Sélectionner le fichier POST
if [ "$LANG" = "fr" ]; then
    POST_FILE="$SCRIPT_DIR/POST-fr"
    LANG_NAME="Français"
else
    POST_FILE="$SCRIPT_DIR/POST"
    LANG_NAME="English"
fi

# Vérifier que le fichier existe
if [ ! -f "$POST_FILE" ]; then
    echo -e "${RED}❌ Fichier POST introuvable: $POST_FILE${NC}"
    exit 1
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Publication d'Annonce Meeshy 🚀              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}🌐 Gateway:${NC} $GATEWAY_URL"
echo -e "${BLUE}👤 Utilisateur:${NC} $USERNAME"
echo -e "${BLUE}🌍 Langue:${NC} $LANG_NAME"
echo -e "${BLUE}📄 Fichier:${NC} $(basename $POST_FILE)"
echo ""

# Afficher un aperçu du message
echo -e "${YELLOW}📋 Aperçu du message (premières lignes):${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
head -5 "$POST_FILE"
echo "..."
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Demander confirmation
read -p "$(echo -e ${YELLOW}⚠️  Publier cette annonce sur Meeshy ? \(yes/NO\): ${NC})" confirm
if [ "$confirm" != "yes" ]; then
    echo -e "${BLUE}ℹ️  Publication annulée${NC}"
    exit 0
fi

echo ""
echo -e "${BLUE}📤 Publication en cours...${NC}"

# Exécuter le script d'annonce
cd "$SCRIPT_DIR"
if ./announcement.sh -f "$POST_FILE" -u "$USERNAME" -p "$MEESHY_PASSWORD" -g "$GATEWAY_URL" -v; then
    echo ""
    echo -e "${GREEN}✅ Annonce publiée avec succès !${NC}"
    echo ""
    echo -e "${GREEN}🌟 L'annonce est maintenant visible sur:${NC}"
    echo -e "${GREEN}   👉 https://meeshy.me${NC}"
    echo ""
    
    # Afficher les informations de sauvegarde
    BACKUP_FILES=$(ls -t post-* 2>/dev/null | head -1)
    if [ -n "$BACKUP_FILES" ]; then
        echo -e "${BLUE}💾 Sauvegarde créée: $BACKUP_FILES${NC}"
    fi
else
    echo ""
    echo -e "${RED}❌ Échec de la publication${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Meeshy - Brisons les barrières linguistiques  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
