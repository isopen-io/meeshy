#!/bin/bash

# ===================================================================
# Script de Backup MongoDB
# ===================================================================
# Crée un backup complet de la base de données MongoDB avant migration
# ===================================================================

set -e  # Arrêter en cas d'erreur

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         BACKUP MONGODB - MIGRATION RÔLES UTILISATEUR      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Vérifier que DATABASE_URL est définie
if [ -z "$DATABASE_URL" ]; then
  echo -e "${YELLOW}⚠️  DATABASE_URL non définie, chargement depuis .env...${NC}"

  # Chercher le fichier .env
  if [ -f "services/gateway/.env" ]; then
    export $(grep -v '^#' services/gateway/.env | grep DATABASE_URL | xargs)
    echo -e "${GREEN}✅ DATABASE_URL chargée depuis services/gateway/.env${NC}"
  elif [ -f ".env" ]; then
    export $(grep -v '^#' .env | grep DATABASE_URL | xargs)
    echo -e "${GREEN}✅ DATABASE_URL chargée depuis .env${NC}"
  else
    echo -e "${RED}❌ Fichier .env introuvable${NC}"
    echo -e "${YELLOW}💡 Veuillez définir DATABASE_URL ou créer un fichier .env${NC}"
    exit 1
  fi
fi

# Vérifier que mongodump est installé
if ! command -v mongodump &> /dev/null; then
  echo -e "${RED}❌ mongodump n'est pas installé${NC}"
  echo ""
  echo -e "${YELLOW}Installation :${NC}"
  echo "  macOS:   brew tap mongodb/brew && brew install mongodb-database-tools"
  echo "  Ubuntu:  sudo apt-get install mongodb-database-tools"
  echo "  Manual:  https://www.mongodb.com/try/download/database-tools"
  echo ""
  exit 1
fi

# Créer le répertoire de backup
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="backups/mongodb-before-role-migration-${TIMESTAMP}"

echo -e "${BLUE}📁 Création du répertoire de backup...${NC}"
mkdir -p "$BACKUP_DIR"
echo -e "${GREEN}   ✅ Répertoire créé : ${BACKUP_DIR}${NC}"
echo ""

# Extraire le nom de la base de données de l'URL
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
echo -e "${BLUE}💾 Base de données : ${DB_NAME}${NC}"
echo ""

# Effectuer le backup
echo -e "${BLUE}🔄 Backup en cours...${NC}"
echo -e "${YELLOW}   (Cela peut prendre quelques minutes selon la taille de la BDD)${NC}"
echo ""

if mongodump --uri="$DATABASE_URL" --out="$BACKUP_DIR" 2>&1 | while IFS= read -r line; do
  echo "   $line"
done; then
  echo ""
  echo -e "${GREEN}✅ Backup réussi !${NC}"
  echo ""

  # Afficher la taille du backup
  BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
  echo -e "${BLUE}📊 Informations du backup :${NC}"
  echo -e "${GREEN}   Localisation : ${BACKUP_DIR}${NC}"
  echo -e "${GREEN}   Taille       : ${BACKUP_SIZE}${NC}"
  echo ""

  # Créer un fichier de métadonnées
  cat > "$BACKUP_DIR/backup-info.txt" <<EOF
BACKUP MONGODB - MIGRATION RÔLES UTILISATEUR
============================================

Date du backup : $(date)
Base de données : $DB_NAME
Taille : $BACKUP_SIZE

Raison : Migration MODO → MODERATOR
Fichiers : $(ls -1 "$BACKUP_DIR" | wc -l) fichiers

Restauration :
  mongorestore --uri="\$DATABASE_URL" --drop "$BACKUP_DIR/$DB_NAME"
EOF

  echo -e "${BLUE}📝 Fichier de métadonnées créé${NC}"
  echo ""

  # Instructions de restauration
  echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║              RESTAURATION EN CAS DE PROBLÈME               ║${NC}"
  echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${YELLOW}Si vous devez restaurer le backup :${NC}"
  echo ""
  echo -e "${GREEN}mongorestore --uri=\"\$DATABASE_URL\" --drop \"$BACKUP_DIR/$DB_NAME\"${NC}"
  echo ""

else
  echo ""
  echo -e "${RED}❌ Erreur lors du backup${NC}"
  echo -e "${YELLOW}💡 Vérifiez que :${NC}"
  echo "   - DATABASE_URL est correct"
  echo "   - La base de données est accessible"
  echo "   - Vous avez les permissions nécessaires"
  echo ""
  exit 1
fi

echo -e "${GREEN}✅ Backup terminé avec succès !${NC}"
echo -e "${BLUE}➡️  Vous pouvez maintenant procéder à la migration${NC}"
echo ""
