#!/bin/bash

# ===== MEESHY - DÉPLOIEMENT DES SECRETS FIREBASE =====
# Script pour uploader facilement les credentials Firebase et APNS vers le serveur
# Usage: ./deploy-firebase-secrets.sh

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PRODUCTION_SERVER="root@meeshy.me"
REMOTE_SECRETS_DIR="/opt/meeshy/secrets"
LOCAL_SECRETS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../secrets" && pwd)"

# Fonction de logging
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

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🔐 MEESHY - DÉPLOIEMENT DES SECRETS FIREBASE${NC}"
    echo "=============================================="
    echo ""
    echo "Ce script vous aide à uploader les credentials Firebase et APNS vers le serveur de production."
    echo ""
    echo "Usage:"
    echo "  ./deploy-firebase-secrets.sh [options]"
    echo ""
    echo "Options:"
    echo "  --check        - Vérifier quels fichiers sont manquants"
    echo "  --upload       - Uploader les fichiers locaux vers le serveur"
    echo "  --verify       - Vérifier que les fichiers existent sur le serveur"
    echo "  --help         - Afficher cette aide"
    echo ""
    echo "Fichiers requis dans $LOCAL_SECRETS_DIR :"
    echo "  • firebase-admin.json      - Credentials Firebase Admin SDK"
    echo "  • apns-auth-key.p8         - Clé APNS iOS (.p8)"
    echo "  • production-secrets.env   - Variables d'environnement"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-firebase-secrets.sh --check"
    echo "  ./deploy-firebase-secrets.sh --upload"
    echo "  ./deploy-firebase-secrets.sh --verify"
    echo ""
}

# Vérifier les fichiers locaux
check_local_files() {
    log_info "Vérification des fichiers locaux dans $LOCAL_SECRETS_DIR..."

    local missing=0

    # Vérifier firebase-admin.json
    if [ -f "$LOCAL_SECRETS_DIR/firebase-admin.json" ]; then
        log_success "firebase-admin.json trouvé"

        # Valider que c'est du JSON valide
        if jq empty "$LOCAL_SECRETS_DIR/firebase-admin.json" 2>/dev/null; then
            log_success "  → JSON valide"
        else
            log_warning "  → ATTENTION: Le fichier JSON semble invalide"
        fi
    else
        log_error "firebase-admin.json NON TROUVÉ"
        log_info "   Comment l'obtenir:"
        log_info "   1. Allez sur https://console.firebase.google.com/"
        log_info "   2. Paramètres projet → Comptes de service"
        log_info "   3. Générer une nouvelle clé privée"
        log_info "   4. Placez le fichier dans $LOCAL_SECRETS_DIR/"
        missing=$((missing + 1))
    fi

    # Vérifier apns-auth-key.p8
    if [ -f "$LOCAL_SECRETS_DIR/apns-auth-key.p8" ]; then
        log_success "apns-auth-key.p8 trouvé"

        # Valider que c'est une clé APNS valide
        if head -1 "$LOCAL_SECRETS_DIR/apns-auth-key.p8" | grep -q "BEGIN PRIVATE KEY"; then
            log_success "  → Format de clé valide"
        else
            log_warning "  → ATTENTION: Le fichier ne semble pas être une clé .p8 valide"
        fi
    else
        log_error "apns-auth-key.p8 NON TROUVÉ"
        log_info "   Comment l'obtenir:"
        log_info "   1. Allez sur https://developer.apple.com/account/resources/authkeys/list"
        log_info "   2. Créez une nouvelle clé avec APNs activé"
        log_info "   3. Téléchargez AuthKey_XXXXXXXXXX.p8"
        log_info "   4. Renommez en apns-auth-key.p8 et placez dans $LOCAL_SECRETS_DIR/"
        missing=$((missing + 1))
    fi

    # Vérifier production-secrets.env
    if [ -f "$LOCAL_SECRETS_DIR/production-secrets.env" ]; then
        log_success "production-secrets.env trouvé"

        # Vérifier que les variables Firebase sont présentes
        local firebase_vars=("FIREBASE_ADMIN_CREDENTIALS_PATH" "APNS_KEY_ID" "APNS_TEAM_ID" "APNS_KEY_PATH")
        local missing_vars=0

        for var in "${firebase_vars[@]}"; do
            if grep -q "^${var}=" "$LOCAL_SECRETS_DIR/production-secrets.env"; then
                log_success "  → $var configuré"
            else
                log_warning "  → $var MANQUANT"
                missing_vars=$((missing_vars + 1))
            fi
        done

        if [ $missing_vars -gt 0 ]; then
            log_warning "  → $missing_vars variable(s) Firebase manquante(s)"
            log_info "     Consultez docs/FIREBASE_PRODUCTION_SETUP.md pour la liste complète"
        fi
    else
        log_error "production-secrets.env NON TROUVÉ"
        log_info "   Créez le fichier $LOCAL_SECRETS_DIR/production-secrets.env"
        log_info "   Consultez docs/FIREBASE_PRODUCTION_SETUP.md pour les variables à ajouter"
        missing=$((missing + 1))
    fi

    echo ""
    if [ $missing -eq 0 ]; then
        log_success "Tous les fichiers requis sont présents ✅"
        return 0
    else
        log_error "$missing fichier(s) manquant(s) ❌"
        log_info "Consultez docs/FIREBASE_PRODUCTION_SETUP.md pour plus d'informations"
        return 1
    fi
}

# Uploader les fichiers vers le serveur
upload_files() {
    log_info "Upload des secrets vers le serveur de production $PRODUCTION_SERVER..."

    # Vérifier que les fichiers locaux existent d'abord
    if ! check_local_files; then
        log_error "Impossible d'uploader : fichiers locaux manquants"
        return 1
    fi

    echo ""
    log_info "Création du répertoire de secrets sur le serveur..."
    ssh $PRODUCTION_SERVER "mkdir -p $REMOTE_SECRETS_DIR" || {
        log_error "Échec de connexion SSH au serveur"
        return 1
    }

    # Upload firebase-admin.json
    if [ -f "$LOCAL_SECRETS_DIR/firebase-admin.json" ]; then
        log_info "Upload de firebase-admin.json..."
        scp "$LOCAL_SECRETS_DIR/firebase-admin.json" "$PRODUCTION_SERVER:$REMOTE_SECRETS_DIR/" || {
            log_error "Échec de l'upload de firebase-admin.json"
            return 1
        }
        log_success "firebase-admin.json uploadé"
    fi

    # Upload apns-auth-key.p8
    if [ -f "$LOCAL_SECRETS_DIR/apns-auth-key.p8" ]; then
        log_info "Upload de apns-auth-key.p8..."
        scp "$LOCAL_SECRETS_DIR/apns-auth-key.p8" "$PRODUCTION_SERVER:$REMOTE_SECRETS_DIR/" || {
            log_error "Échec de l'upload de apns-auth-key.p8"
            return 1
        }
        log_success "apns-auth-key.p8 uploadé"
    fi

    # Upload production-secrets.env
    if [ -f "$LOCAL_SECRETS_DIR/production-secrets.env" ]; then
        log_info "Upload de production-secrets.env..."
        scp "$LOCAL_SECRETS_DIR/production-secrets.env" "$PRODUCTION_SERVER:$REMOTE_SECRETS_DIR/" || {
            log_error "Échec de l'upload de production-secrets.env"
            return 1
        }
        log_success "production-secrets.env uploadé"
    fi

    # Configurer les permissions sur le serveur
    log_info "Configuration des permissions (600)..."
    ssh $PRODUCTION_SERVER "chmod 600 $REMOTE_SECRETS_DIR/*.json $REMOTE_SECRETS_DIR/*.p8 $REMOTE_SECRETS_DIR/*.env 2>/dev/null || true"
    ssh $PRODUCTION_SERVER "chown root:root $REMOTE_SECRETS_DIR/* 2>/dev/null || true"

    log_success "Tous les fichiers ont été uploadés avec succès ✅"
    log_info "Prochaine étape : Redéployez les services avec ./scripts/deployment/deploy-orchestrator.sh deploy meeshy.me"
}

# Vérifier les fichiers sur le serveur
verify_remote_files() {
    log_info "Vérification des fichiers sur le serveur $PRODUCTION_SERVER..."

    # Vérifier que le répertoire existe
    if ! ssh $PRODUCTION_SERVER "[ -d $REMOTE_SECRETS_DIR ]"; then
        log_error "Le répertoire $REMOTE_SECRETS_DIR n'existe pas sur le serveur"
        return 1
    fi

    # Lister les fichiers
    log_info "Fichiers présents dans $REMOTE_SECRETS_DIR :"
    ssh $PRODUCTION_SERVER "ls -lah $REMOTE_SECRETS_DIR"

    echo ""

    # Vérifier chaque fichier
    local missing=0

    if ssh $PRODUCTION_SERVER "[ -f $REMOTE_SECRETS_DIR/firebase-admin.json ]"; then
        log_success "firebase-admin.json présent"

        # Vérifier permissions
        local perms=$(ssh $PRODUCTION_SERVER "stat -c %a $REMOTE_SECRETS_DIR/firebase-admin.json")
        if [ "$perms" = "600" ]; then
            log_success "  → Permissions correctes (600)"
        else
            log_warning "  → Permissions incorrectes ($perms), devrait être 600"
        fi
    else
        log_error "firebase-admin.json MANQUANT"
        missing=$((missing + 1))
    fi

    if ssh $PRODUCTION_SERVER "[ -f $REMOTE_SECRETS_DIR/apns-auth-key.p8 ]"; then
        log_success "apns-auth-key.p8 présent"

        # Vérifier permissions
        local perms=$(ssh $PRODUCTION_SERVER "stat -c %a $REMOTE_SECRETS_DIR/apns-auth-key.p8")
        if [ "$perms" = "600" ]; then
            log_success "  → Permissions correctes (600)"
        else
            log_warning "  → Permissions incorrectes ($perms), devrait être 600"
        fi
    else
        log_error "apns-auth-key.p8 MANQUANT"
        missing=$((missing + 1))
    fi

    if ssh $PRODUCTION_SERVER "[ -f $REMOTE_SECRETS_DIR/production-secrets.env ]"; then
        log_success "production-secrets.env présent"

        # Vérifier permissions
        local perms=$(ssh $PRODUCTION_SERVER "stat -c %a $REMOTE_SECRETS_DIR/production-secrets.env")
        if [ "$perms" = "600" ]; then
            log_success "  → Permissions correctes (600)"
        else
            log_warning "  → Permissions incorrectes ($perms), devrait être 600"
        fi
    else
        log_error "production-secrets.env MANQUANT"
        missing=$((missing + 1))
    fi

    echo ""
    if [ $missing -eq 0 ]; then
        log_success "Tous les fichiers sont présents sur le serveur ✅"
        return 0
    else
        log_error "$missing fichier(s) manquant(s) sur le serveur ❌"
        return 1
    fi
}

# Parser les arguments
case "${1:-}" in
    --check)
        check_local_files
        ;;
    --upload)
        upload_files
        ;;
    --verify)
        verify_remote_files
        ;;
    --help|-h|"")
        show_help
        ;;
    *)
        log_error "Option inconnue: $1"
        show_help
        exit 1
        ;;
esac
