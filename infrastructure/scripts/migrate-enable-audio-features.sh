#!/bin/bash

##########################################################################
# Script: migrate-enable-audio-features.sh
# Description: Active les features audio dans UserPreferences.audio en production
# Usage: ./migrate-enable-audio-features.sh
##########################################################################

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Migration Audio Features (Production)${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# Vérifier qu'on est sur le serveur de production
if [ ! -d "/opt/meeshy/production" ]; then
  echo -e "${RED}❌ Erreur: Ce script doit être exécuté sur le serveur de production${NC}"
  echo -e "${YELLOW}   Répertoire /opt/meeshy/production introuvable${NC}"
  exit 1
fi

cd /opt/meeshy/production

# Vérifier que le script de migration existe
MIGRATION_SCRIPT="packages/shared/prisma/migrations/enable_audio_features_in_preferences.js"
if [ ! -f "$MIGRATION_SCRIPT" ]; then
  echo -e "${RED}❌ Erreur: Script de migration introuvable${NC}"
  echo -e "${YELLOW}   Fichier attendu: $MIGRATION_SCRIPT${NC}"
  exit 1
fi

# Charger les variables d'environnement de production
if [ -f ".env.production" ]; then
  export $(cat .env.production | grep -v '^#' | xargs)
  echo -e "${GREEN}✅ Variables d'environnement chargées${NC}"
else
  echo -e "${RED}❌ Erreur: Fichier .env.production introuvable${NC}"
  exit 1
fi

# Vérifier que DATABASE_URL est défini
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ Erreur: DATABASE_URL non défini dans .env.production${NC}"
  exit 1
fi

echo ""
echo -e "${YELLOW}⚠️  ATTENTION: Cette migration va modifier tous les enregistrements UserPreferences${NC}"
echo -e "${YELLOW}   Elle activera les features audio pour tous les utilisateurs${NC}"
echo ""
read -p "Voulez-vous continuer? (oui/non): " confirm

if [ "$confirm" != "oui" ]; then
  echo -e "${RED}❌ Migration annulée${NC}"
  exit 0
fi

echo ""
echo -e "${GREEN}🚀 Lancement de la migration...${NC}"
echo ""

# Exécuter la migration avec Node.js
cd packages/shared/prisma/migrations
node enable_audio_features_in_preferences.js

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  ✅ Migration terminée avec succès !${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "${YELLOW}Note: Les utilisateurs doivent toujours activer les consentements de base:${NC}"
echo -e "${YELLOW}  - dataProcessingConsentAt${NC}"
echo -e "${YELLOW}  - voiceDataConsentAt${NC}"
echo ""
