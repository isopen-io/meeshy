#!/bin/bash

# ===== MEESHY - VALIDATION DE CONFIGURATION PRÉ-DÉPLOIEMENT =====
# Script de validation des variables d'environnement avant déploiement en production
# Usage: ./deploy-validate-config.sh [ENV_FILE]

set -e

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Compteurs de validation
ERRORS=0
WARNINGS=0
CHECKS=0

# Fonctions utilitaires
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { 
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARNINGS++))
}
log_error() { 
    echo -e "${RED}❌ $1${NC}"
    ((ERRORS++))
}
log_check() {
    echo -e "${CYAN}🔍 $1${NC}"
    ((CHECKS++))
}

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🛡️ MEESHY - VALIDATION DE CONFIGURATION PRÉ-DÉPLOIEMENT${NC}"
    echo "============================================================"
    echo ""
    echo "Usage: $0 [ENV_FILE]"
    echo ""
    echo "Description:"
    echo "  Valide les variables d'environnement avant déploiement en production"
    echo "  Vérifie les configurations critiques pour éviter les erreurs de déploiement"
    echo ""
    echo "Arguments:"
    echo "  ENV_FILE    Chemin vers le fichier .env (défaut: env.production)"
    echo ""
    echo "Validations effectuées:"
    echo "  • FORCE_DB_RESET doit être false en production"
    echo "  • URLs doivent correspondre à l'environnement (https pour production)"
    echo "  • Mots de passe ne doivent pas contenir de valeurs par défaut"
    echo "  • Variables critiques ne doivent pas être vides"
    echo "  • Configuration SSL/TLS appropriée"
    echo "  • Configuration de base de données correcte"
    echo ""
}

# Charger le fichier d'environnement
load_env_file() {
    local env_file="$1"
    
    if [ ! -f "$env_file" ]; then
        log_error "Fichier $env_file non trouvé"
        exit 1
    fi
    
    log_info "Chargement du fichier: $env_file"
    
    # Charger les variables sans les exporter (pour éviter de polluer l'environnement actuel)
    while IFS='=' read -r key value; do
        # Ignorer les commentaires et lignes vides
        if [[ ! "$key" =~ ^[[:space:]]*# ]] && [[ -n "$key" ]] && [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
            # Supprimer les guillemets et espaces
            value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" | xargs)
            eval "ENV_$key=\"$value\""
        fi
    done < "$env_file"
}

# Validation critique: FORCE_DB_RESET
validate_force_db_reset() {
    log_check "Validation de FORCE_DB_RESET"
    
    if [ "$ENV_NODE_ENV" == "production" ] || [ "$ENV_DEPLOYMENT_ENV" == "production" ] || [ "$ENV_DEPLOYMENT_ENV" == "digitalocean" ]; then
        if [ "$ENV_FORCE_DB_RESET" == "true" ]; then
            log_error "FORCE_DB_RESET=true détecté en PRODUCTION!"
            log_error "  Cette configuration SUPPRIMERA TOUTES les données de production!"
            log_error "  Changez FORCE_DB_RESET=false dans votre fichier .env"
            return 1
        else
            log_success "FORCE_DB_RESET=$ENV_FORCE_DB_RESET (OK pour production)"
        fi
    else
        if [ "$ENV_FORCE_DB_RESET" == "true" ]; then
            log_warning "FORCE_DB_RESET=true détecté en développement"
            log_warning "  Les données seront réinitialisées au démarrage"
        else
            log_success "FORCE_DB_RESET=$ENV_FORCE_DB_RESET"
        fi
    fi
}

# Validation des URLs
validate_urls() {
    log_check "Validation des URLs"
    
    local is_production=false
    if [ "$ENV_NODE_ENV" == "production" ] || [ "$ENV_DEPLOYMENT_ENV" == "production" ] || [ "$ENV_DEPLOYMENT_ENV" == "digitalocean" ]; then
        is_production=true
    fi
    
    # Vérifier INTERNAL_BACKEND_URL
    if [ -n "$ENV_INTERNAL_BACKEND_URL" ]; then
        if $is_production; then
            if [[ "$ENV_INTERNAL_BACKEND_URL" =~ ^http:// ]]; then
                log_error "INTERNAL_BACKEND_URL utilise HTTP en production: $ENV_INTERNAL_BACKEND_URL"
                log_error "  Utilisez HTTPS pour la production (ex: https://gate.meeshy.me)"
            elif [[ "$ENV_INTERNAL_BACKEND_URL" =~ gateway:3000 ]]; then
                log_error "INTERNAL_BACKEND_URL utilise l'URL interne Docker en production: $ENV_INTERNAL_BACKEND_URL"
                log_error "  Utilisez l'URL publique pour la production (ex: https://gate.meeshy.me)"
            elif [[ "$ENV_INTERNAL_BACKEND_URL" =~ ^https:// ]]; then
                log_success "INTERNAL_BACKEND_URL=$ENV_INTERNAL_BACKEND_URL (HTTPS OK)"
            else
                log_warning "INTERNAL_BACKEND_URL format inattendu: $ENV_INTERNAL_BACKEND_URL"
            fi
        else
            log_success "INTERNAL_BACKEND_URL=$ENV_INTERNAL_BACKEND_URL"
        fi
    else
        log_warning "INTERNAL_BACKEND_URL non définie"
    fi
    
    # Vérifier INTERNAL_WS_URL
    if [ -n "$ENV_INTERNAL_WS_URL" ]; then
        if $is_production; then
            if [[ "$ENV_INTERNAL_WS_URL" =~ ^ws:// ]]; then
                log_error "INTERNAL_WS_URL utilise WS en production: $ENV_INTERNAL_WS_URL"
                log_error "  Utilisez WSS pour la production (ex: wss://gate.meeshy.me)"
            elif [[ "$ENV_INTERNAL_WS_URL" =~ gateway:3000 ]]; then
                log_error "INTERNAL_WS_URL utilise l'URL interne Docker en production: $ENV_INTERNAL_WS_URL"
                log_error "  Utilisez l'URL publique pour la production (ex: wss://gate.meeshy.me)"
            elif [[ "$ENV_INTERNAL_WS_URL" =~ ^wss:// ]]; then
                log_success "INTERNAL_WS_URL=$ENV_INTERNAL_WS_URL (WSS OK)"
            else
                log_warning "INTERNAL_WS_URL format inattendu: $ENV_INTERNAL_WS_URL"
            fi
        else
            log_success "INTERNAL_WS_URL=$ENV_INTERNAL_WS_URL"
        fi
    else
        log_warning "INTERNAL_WS_URL non définie"
    fi
}

# Validation des mots de passe
validate_passwords() {
    log_check "Validation des mots de passe"
    
    local default_passwords=(
        "CHANGE_ME"
        "admin123"
        "password"
        "secret"
        "default"
    )
    
    # Variables de mots de passe à vérifier
    local password_vars=(
        "MONGODB_PASSWORD"
        "ADMIN_PASSWORD"
        "MEESHY_BIGBOSS_PASSWORD"
        "JWT_SECRET"
        "TRAEFIK_DASHBOARD_PASSWORD"
    )
    
    for var in "${password_vars[@]}"; do
        local var_name="ENV_$var"
        local var_value="${!var_name}"
        
        if [ -z "$var_value" ]; then
            log_error "$var est vide"
            continue
        fi
        
        # Vérifier les valeurs par défaut
        local has_default=false
        for default in "${default_passwords[@]}"; do
            if [[ "$var_value" == *"$default"* ]]; then
                log_error "$var contient une valeur par défaut: $default"
                has_default=true
                break
            fi
        done
        
        if ! $has_default; then
            # Vérifier la longueur (au moins 8 caractères)
            if [ ${#var_value} -lt 8 ]; then
                log_warning "$var est trop court (${#var_value} caractères, minimum 8 recommandé)"
            else
                log_success "$var configuré (${#var_value} caractères)"
            fi
        fi
    done
}

# Validation de l'environnement
validate_environment() {
    log_check "Validation de l'environnement"
    
    if [ -z "$ENV_NODE_ENV" ]; then
        log_warning "NODE_ENV non défini"
    else
        log_success "NODE_ENV=$ENV_NODE_ENV"
    fi
    
    if [ -z "$ENV_DEPLOYMENT_ENV" ]; then
        log_warning "DEPLOYMENT_ENV non défini"
    else
        log_success "DEPLOYMENT_ENV=$ENV_DEPLOYMENT_ENV"
    fi
}

# Validation de la base de données
validate_database() {
    log_check "Validation de la configuration de base de données"
    
    if [ -z "$ENV_DATABASE_URL" ]; then
        log_error "DATABASE_URL non définie"
    else
        log_success "DATABASE_URL définie"
        
        # Vérifier le format pour MongoDB
        if [[ "$ENV_DATABASE_URL" =~ ^mongodb ]]; then
            log_success "Format MongoDB détecté"
            
            # Vérifier si c'est un replica set
            if [[ "$ENV_DATABASE_URL" =~ replicaSet ]]; then
                log_success "Configuration Replica Set détectée"
            else
                log_warning "Replica Set non configuré (recommandé pour production)"
            fi
        fi
    fi
}

# Validation du domaine
validate_domain() {
    log_check "Validation du domaine"
    
    if [ -z "$ENV_DOMAIN" ]; then
        log_error "DOMAIN non défini"
    else
        log_success "DOMAIN=$ENV_DOMAIN"
        
        # Vérifier si c'est un domaine valide (pas localhost ou IP)
        if [[ "$ENV_DOMAIN" == "localhost" ]] || [[ "$ENV_DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            log_warning "DOMAIN utilise localhost ou une IP: $ENV_DOMAIN"
            log_warning "  Utilisez un nom de domaine pour la production"
        fi
    fi
    
    if [ -z "$ENV_CERTBOT_EMAIL" ]; then
        log_warning "CERTBOT_EMAIL non défini (requis pour SSL)"
    else
        log_success "CERTBOT_EMAIL=$ENV_CERTBOT_EMAIL"
    fi
}

# Génération du rapport
generate_report() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}RAPPORT DE VALIDATION${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo "Total de vérifications: $CHECKS"
    echo "Avertissements: $WARNINGS"
    echo "Erreurs: $ERRORS"
    echo ""
    
    if [ $ERRORS -gt 0 ]; then
        log_error "❌ VALIDATION ÉCHOUÉE - $ERRORS erreur(s) critique(s)"
        log_error "Le déploiement en production est BLOQUÉ"
        log_error "Corrigez les erreurs ci-dessus avant de déployer"
        return 1
    elif [ $WARNINGS -gt 0 ]; then
        log_warning "⚠️ VALIDATION RÉUSSIE AVEC AVERTISSEMENTS - $WARNINGS avertissement(s)"
        log_warning "Le déploiement peut continuer mais vérifiez les avertissements"
        return 0
    else
        log_success "✅ VALIDATION RÉUSSIE - Configuration prête pour le déploiement"
        return 0
    fi
}

# Fonction principale
main() {
    local env_file="${1:-env.production}"
    
    echo -e "${CYAN}🛡️ MEESHY - VALIDATION DE CONFIGURATION PRÉ-DÉPLOIEMENT${NC}"
    echo "============================================================"
    echo ""
    
    if [ "$env_file" == "--help" ] || [ "$env_file" == "-h" ]; then
        show_help
        exit 0
    fi
    
    # Charger le fichier d'environnement
    load_env_file "$env_file"
    
    echo ""
    log_info "Début de la validation..."
    echo ""
    
    # Exécuter toutes les validations
    validate_environment
    echo ""
    validate_force_db_reset
    echo ""
    validate_urls
    echo ""
    validate_passwords
    echo ""
    validate_database
    echo ""
    validate_domain
    echo ""
    
    # Générer le rapport final
    generate_report
    
    return $?
}

# Exécuter la fonction principale
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
