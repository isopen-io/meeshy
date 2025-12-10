#!/bin/bash

# ===== MEESHY - APPLICATION DES SECRETS EN PRODUCTION =====
# Script pour appliquer les secrets générés par reset-production-passwords.sh
# Usage: ./scripts/apply-secrets-to-production.sh [DROPLET_IP]

set -e

# Couleurs pour les logs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Variables
DROPLET_IP="${1:-157.230.15.51}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SECRETS_FILE="$PROJECT_ROOT/secrets/production-secrets.env"
ENV_PRODUCTION="$PROJECT_ROOT/env.production"

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }

echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Application des secrets en production${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# Vérifier que le fichier de secrets existe
if [ ! -f "$SECRETS_FILE" ]; then
    log_error "Le fichier de secrets n'existe pas: $SECRETS_FILE"
    log_info "Exécutez d'abord: ./scripts/production/reset-production-passwords.sh"
    exit 1
fi

log_success "Fichier de secrets trouvé: $SECRETS_FILE"

# Créer un fichier temporaire pour le .env avec échappement correct
TEMP_ENV=$(mktemp)
trap "rm -f $TEMP_ENV" EXIT

log_info "📝 Préparation du fichier .env avec échappement des \$..."

# Copier env.production comme base
cp "$ENV_PRODUCTION" "$TEMP_ENV"

# Extraire les variables du fichier secrets et les injecter dans le .env
while IFS='=' read -r key value; do
    # Ignorer les commentaires et lignes vides
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    
    # Nettoyer la valeur (enlever guillemets et espaces)
    clean_value=$(echo "$value" | sed 's/^"//;s/"$//' | xargs)
    
    # Échapper les caractères spéciaux pour les hashes bcrypt
    if [[ "$key" =~ (TRAEFIK_USERS|API_USERS|MONGO_USERS|REDIS_USERS) ]]; then
        # Échapper $ en \$ pour les hashes bcrypt
        escaped_value=$(printf '%s' "$clean_value" | sed 's/\$/\\$/g')
        log_info "  🔐 $key (avec échappement)"
    else
        escaped_value="$clean_value"
    fi
    
    # Remplacer ou ajouter la variable dans le .env
    if grep -q "^${key}=" "$TEMP_ENV"; then
        # Supprimer toutes les occurrences existantes (compatible macOS et Linux)
        sed -i.bak "/^${key}=/d" "$TEMP_ENV" && rm -f "${TEMP_ENV}.bak"
    fi
    
    # Ajouter la nouvelle valeur
    echo "${key}=\"${escaped_value}\"" >> "$TEMP_ENV"
    
done < "$SECRETS_FILE"

log_success "Fichier .env préparé avec échappement correct"

# Afficher un aperçu des variables critiques
log_info "📋 Aperçu des variables critiques:"
echo ""
echo -e "${CYAN}JWT_SECRET:${NC}"
grep "^JWT_SECRET=" "$TEMP_ENV" | head -c 50
echo "..."
echo ""
echo -e "${CYAN}TRAEFIK_USERS:${NC}"
grep "^TRAEFIK_USERS=" "$TEMP_ENV"
echo ""
echo -e "${CYAN}ADMIN_PASSWORD:${NC}"
grep "^ADMIN_PASSWORD=" "$TEMP_ENV"
echo ""

# Demander confirmation
log_warning "Voulez-vous copier ce fichier .env sur le serveur $DROPLET_IP? (yes/NO)"
read -r confirm
if [[ "$confirm" != "yes" ]]; then
    log_info "Opération annulée"
    exit 0
fi

# Copier le fichier sur le serveur
log_info "📤 Copie du fichier .env vers le serveur..."
scp -o StrictHostKeyChecking=no "$TEMP_ENV" root@$DROPLET_IP:/opt/meeshy/.env

log_success "Fichier .env copié"

# Vérifier sur le serveur
log_info "🔍 Vérification sur le serveur..."
ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'ENDSSH'
cd /opt/meeshy
echo "Nombre de lignes TRAEFIK_USERS:"
grep -c "^TRAEFIK_USERS=" .env || echo "0"
echo "Contenu TRAEFIK_USERS:"
grep "^TRAEFIK_USERS=" .env | head -1
echo ""
echo "Nombre de lignes ADMIN_PASSWORD:"
grep -c "^ADMIN_PASSWORD=" .env || echo "0"
echo "Contenu ADMIN_PASSWORD:"
grep "^ADMIN_PASSWORD=" .env | head -1
ENDSSH

# Demander si on redémarre les services
log_warning "Voulez-vous redémarrer les services pour appliquer les changements? (yes/NO)"
read -r restart_confirm
if [[ "$restart_confirm" == "yes" ]]; then
    log_info "🔄 Redémarrage des services..."
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'ENDSSH'
cd /opt/meeshy
docker compose -f docker-compose.traefik.yml restart
ENDSSH
    log_success "Services redémarrés"
fi

log_success "✨ Application des secrets terminée!"

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🔐 Mots de passe appliqués avec succès${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📋 Consultez le fichier secrets/clear.txt pour les mots de passe en clair${NC}"
echo ""
