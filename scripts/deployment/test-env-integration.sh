#!/bin/bash

# ===== MEESHY - TEST D'INTÉGRATION DES SECRETS =====
# Script de test pour vérifier l'intégration des secrets dans le fichier .env
# Usage: ./test-env-integration.sh

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Fonctions de logging
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Fonction pour créer le fichier .env de test
create_test_env_file() {
    local test_dir="$DEPLOY_TEMP_DIR/test-env-integration"
    mkdir -p "$test_dir"
    
    log_info "Test de création du fichier .env avec intégration des secrets..."
    
    # Commencer avec env.digitalocean comme base
    if [ -f "$PROJECT_ROOT/env.digitalocean" ]; then
        cp "$PROJECT_ROOT/env.digitalocean" "$test_dir/.env"
        log_success "Fichier env.digitalocean copié comme base"
    else
        log_warning "Fichier env.digitalocean non trouvé, création d'un fichier .env vide"
        touch "$test_dir/.env"
    fi
    
    # Intégrer les secrets de production si disponibles
    if [ -f "$PROJECT_ROOT/secrets/production-secrets.env" ]; then
        log_info "Intégration des secrets de production..."
        
        # Lire les secrets et les ajouter au fichier .env
        while IFS='=' read -r key value; do
            # Ignorer les commentaires et lignes vides
            if [[ ! "$key" =~ ^[[:space:]]*# ]] && [[ -n "$key" ]]; then
                # Échapper les caractères spéciaux dans la valeur
                escaped_value=$(printf '%s\n' "$value" | sed 's/[[\.*^$()+?{|]/\\&/g')
                
                # Vérifier si la variable existe déjà dans .env
                if grep -q "^${key}=" "$test_dir/.env"; then
                    # Remplacer la valeur existante
                    sed -i.bak "s/^${key}=.*/${key}=${escaped_value}/" "$test_dir/.env"
                else
                    # Ajouter la nouvelle variable
                    echo "${key}=${escaped_value}" >> "$test_dir/.env"
                fi
            fi
        done < "$PROJECT_ROOT/secrets/production-secrets.env"
        
        # Nettoyer le fichier de sauvegarde
        rm -f "$test_dir/.env.bak"
        
        log_success "Secrets de production intégrés dans .env"
    else
        log_warning "Fichier de secrets de production non trouvé, utilisation des valeurs par défaut"
    fi
    
    # Vérifier que le fichier .env a été créé
    if [ -f "$test_dir/.env" ]; then
        log_success "Fichier .env créé avec succès pour la production"
        echo "$test_dir/.env"
    else
        log_error "Échec de la création du fichier .env"
        exit 1
    fi
}

# Fonction pour analyser le fichier .env créé
analyze_env_file() {
    local env_file="$1"
    
    log_info "Analyse du fichier .env créé..."
    
    # Compter les variables
    local total_vars=$(grep -c "^[A-Z_][A-Z0-9_]*=" "$env_file" 2>/dev/null || echo "0")
    log_info "Nombre total de variables: $total_vars"
    
    # Vérifier les variables importantes
    local important_vars=(
        "TRAEFIK_USERS"
        "API_USERS"
        "JWT_SECRET"
        "MONGODB_PASSWORD"
        "REDIS_PASSWORD"
        "ADMIN_PASSWORD"
        "MEESHY_PASSWORD"
        "ATABETH_PASSWORD"
    )
    
    log_info "Vérification des variables importantes:"
    for var in "${important_vars[@]}"; do
        if grep -q "^${var}=" "$env_file"; then
            log_success "Variable présente: $var"
        else
            log_warning "Variable manquante: $var"
        fi
    done
    
    # Afficher un échantillon du fichier (sans les valeurs sensibles)
    log_info "Échantillon du fichier .env (variables sans valeurs):"
    head -20 "$env_file" | sed 's/=.*/=***/' | head -10
}

# Fonction principale
main() {
    echo -e "${CYAN}🧪 MEESHY - TEST D'INTÉGRATION DES SECRETS${NC}"
    echo "=============================================="
    echo ""
    
    # Créer le fichier .env de test
    local env_file=$(create_test_env_file)
    
    # Analyser le fichier créé
    analyze_env_file "$env_file"
    
    # Afficher le chemin du fichier de test
    echo ""
    log_info "Fichier .env de test créé: $env_file"
    
    # Nettoyer
    log_info "Nettoyage des fichiers de test..."
    rm -rf "$(dirname "$env_file")"
    
    log_success "Test d'intégration des secrets terminé avec succès"
}

# Exécuter la fonction principale
main "$@"
