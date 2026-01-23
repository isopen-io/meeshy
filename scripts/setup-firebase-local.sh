#!/bin/bash

# ===================================================================
# MEESHY - CONFIGURATION FIREBASE EN LOCAL
# ===================================================================
# Script pour configurer Firebase en développement local (avec ou sans Docker)
# Usage: ./scripts/setup-firebase-local.sh [options]
# ===================================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="$PROJECT_ROOT/secrets"
GATEWAY_DIR="$PROJECT_ROOT/services/gateway"
WEB_DIR="$PROJECT_ROOT/apps/web"

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

log_step() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🔥 MEESHY - CONFIGURATION FIREBASE EN LOCAL${NC}"
    echo "================================================"
    echo ""
    echo "Ce script configure Firebase pour le développement local (Docker et sans Docker)."
    echo ""
    echo "Usage:"
    echo "  ./scripts/setup-firebase-local.sh [options]"
    echo ""
    echo "Options:"
    echo "  --check        - Vérifier la configuration actuelle"
    echo "  --setup        - Configurer Firebase en local"
    echo "  --disable      - Désactiver Firebase temporairement"
    echo "  --help         - Afficher cette aide"
    echo ""
    echo "Prérequis:"
    echo "  1. Avoir téléchargé firebase-admin.json depuis Firebase Console"
    echo "  2. (Optionnel) Avoir téléchargé apns-auth-key.p8 pour iOS"
    echo ""
    echo "Exemples:"
    echo "  ./scripts/setup-firebase-local.sh --check"
    echo "  ./scripts/setup-firebase-local.sh --setup"
    echo ""
}

# Vérifier la configuration
check_config() {
    log_step "🔍 VÉRIFICATION DE LA CONFIGURATION FIREBASE LOCALE"

    local all_good=true

    # 1. Vérifier le répertoire secrets
    if [ -d "$SECRETS_DIR" ]; then
        log_success "Répertoire secrets existe : $SECRETS_DIR"
    else
        log_error "Répertoire secrets manquant"
        log_info "   Création automatique..."
        mkdir -p "$SECRETS_DIR"
        log_success "   Répertoire créé"
    fi

    # 2. Vérifier firebase-admin.json
    if [ -f "$SECRETS_DIR/firebase-admin-dev.json" ]; then
        log_success "firebase-admin-dev.json trouvé (environnement DEV)"

        # Valider le JSON
        if command -v jq &> /dev/null; then
            if jq empty "$SECRETS_DIR/firebase-admin-dev.json" 2>/dev/null; then
                log_success "  → JSON valide ✅"

                # Afficher le project_id pour confirmation
                local project_id=$(jq -r '.project_id' "$SECRETS_DIR/firebase-admin-dev.json" 2>/dev/null)
                if [ -n "$project_id" ]; then
                    log_info "  → Project ID: $project_id"
                fi
            else
                log_error "  → JSON invalide ❌"
                all_good=false
            fi
        fi
    else
        log_warning "firebase-admin-dev.json NON TROUVÉ"
        log_info "   Comment l'obtenir :"
        log_info "   1. https://console.firebase.google.com/"
        log_info "   2. Créez un projet 'meeshy-dev' (séparé de production)"
        log_info "   3. Paramètres projet → Comptes de service"
        log_info "   4. Générer une nouvelle clé privée"
        log_info "   5. Renommer en firebase-admin-dev.json"
        log_info "   6. Placer dans $SECRETS_DIR/"
        all_good=false
    fi

    # 3. Vérifier apns-auth-key.p8 (optionnel)
    if [ -f "$SECRETS_DIR/apns-auth-key-dev.p8" ]; then
        log_success "apns-auth-key-dev.p8 trouvé (iOS VoIP)"

        if head -1 "$SECRETS_DIR/apns-auth-key-dev.p8" | grep -q "BEGIN PRIVATE KEY"; then
            log_success "  → Format de clé valide ✅"
        else
            log_warning "  → Format de clé invalide"
        fi
    else
        log_warning "apns-auth-key-dev.p8 non trouvé (optionnel pour iOS)"
        log_info "   Nécessaire uniquement si vous testez les appels VoIP iOS"
    fi

    # 4. Vérifier .env du gateway
    if [ -f "$GATEWAY_DIR/.env" ]; then
        log_success ".env gateway existe"

        # Vérifier les variables Firebase
        if grep -q "FIREBASE_ADMIN_CREDENTIALS_PATH" "$GATEWAY_DIR/.env"; then
            local firebase_path=$(grep "^FIREBASE_ADMIN_CREDENTIALS_PATH=" "$GATEWAY_DIR/.env" | cut -d= -f2)
            log_info "  → FIREBASE_ADMIN_CREDENTIALS_PATH=$firebase_path"

            if grep -q "ENABLE_FCM_PUSH=true" "$GATEWAY_DIR/.env"; then
                log_success "  → FCM activé ✅"
            else
                log_warning "  → FCM désactivé (ENABLE_FCM_PUSH=false)"
            fi
        else
            log_warning "  → Variable FIREBASE_ADMIN_CREDENTIALS_PATH manquante"
            all_good=false
        fi
    else
        log_warning ".env gateway non trouvé"
        log_info "   Sera créé depuis .env.example lors du setup"
    fi

    # 5. Vérifier .env.local du web (frontend)
    if [ -f "$WEB_DIR/.env.local" ]; then
        log_success ".env.local web existe"

        if grep -q "NEXT_PUBLIC_FIREBASE_API_KEY" "$WEB_DIR/.env.local"; then
            log_success "  → Variables Firebase configurées ✅"
        else
            log_warning "  → Variables Firebase manquantes"
        fi
    else
        log_warning ".env.local web non trouvé"
        log_info "   Les notifications push web ne fonctionneront pas"
    fi

    echo ""
    if $all_good; then
        log_success "🎉 Configuration Firebase complète !"
        return 0
    else
        log_warning "⚠️  Configuration incomplète. Exécutez --setup pour corriger."
        return 1
    fi
}

# Configurer Firebase
setup_firebase() {
    log_step "🔧 CONFIGURATION FIREBASE EN LOCAL"

    # 1. Créer le répertoire secrets si nécessaire
    mkdir -p "$SECRETS_DIR"

    # 2. Vérifier firebase-admin-dev.json
    if [ ! -f "$SECRETS_DIR/firebase-admin-dev.json" ]; then
        log_error "firebase-admin-dev.json manquant dans $SECRETS_DIR/"
        log_info ""
        log_info "📥 Pour obtenir ce fichier :"
        log_info "   1. Allez sur https://console.firebase.google.com/"
        log_info "   2. Créez un NOUVEAU projet 'meeshy-dev' (séparé de production !)"
        log_info "   3. Dans ce projet dev : Paramètres → Comptes de service"
        log_info "   4. Cliquez sur 'Générer une nouvelle clé privée'"
        log_info "   5. Téléchargez le fichier JSON"
        log_info "   6. Renommez-le en 'firebase-admin-dev.json'"
        log_info "   7. Placez-le dans : $SECRETS_DIR/"
        log_info ""
        log_warning "⚠️  N'utilisez PAS les credentials de production pour le dev !"
        log_info ""
        log_error "Impossible de continuer sans ce fichier."
        exit 1
    fi

    log_success "firebase-admin-dev.json trouvé"

    # 3. Créer .env pour gateway
    log_info "Configuration du gateway..."

    if [ ! -f "$GATEWAY_DIR/.env" ]; then
        if [ -f "$GATEWAY_DIR/.env.example" ]; then
            cp "$GATEWAY_DIR/.env.example" "$GATEWAY_DIR/.env"
            log_success "  → .env créé depuis .env.example"
        else
            log_error "  → .env.example non trouvé dans $GATEWAY_DIR/"
            exit 1
        fi
    fi

    # 4. Mettre à jour les variables Firebase dans .env gateway
    log_info "Mise à jour des variables Firebase..."

    # Chemin relatif ou absolu selon Docker ou pas
    local firebase_path_docker="./secrets/firebase-admin-dev.json"
    local firebase_path_local="$SECRETS_DIR/firebase-admin-dev.json"

    # Déterminer quel chemin utiliser (Docker par défaut)
    local firebase_path="$firebase_path_docker"

    # Mettre à jour ou ajouter les variables
    update_env_var "$GATEWAY_DIR/.env" "FIREBASE_ADMIN_CREDENTIALS_PATH" "$firebase_path"
    update_env_var "$GATEWAY_DIR/.env" "ENABLE_PUSH_NOTIFICATIONS" "true"
    update_env_var "$GATEWAY_DIR/.env" "ENABLE_NOTIFICATION_SYSTEM" "true"
    update_env_var "$GATEWAY_DIR/.env" "ENABLE_FCM_PUSH" "true"

    # Si APNS existe, le configurer
    if [ -f "$SECRETS_DIR/apns-auth-key-dev.p8" ]; then
        log_info "Configuration APNS pour iOS..."
        update_env_var "$GATEWAY_DIR/.env" "APNS_KEY_PATH" "./secrets/apns-auth-key-dev.p8"
        update_env_var "$GATEWAY_DIR/.env" "APNS_ENVIRONMENT" "development"
        update_env_var "$GATEWAY_DIR/.env" "ENABLE_APNS_PUSH" "true"
        update_env_var "$GATEWAY_DIR/.env" "ENABLE_VOIP_PUSH" "true"
        log_success "  → APNS configuré"
    else
        log_warning "  → APNS non configuré (fichier .p8 manquant)"
        update_env_var "$GATEWAY_DIR/.env" "ENABLE_APNS_PUSH" "false"
        update_env_var "$GATEWAY_DIR/.env" "ENABLE_VOIP_PUSH" "false"
    fi

    log_success "Configuration gateway terminée"

    # 5. Instructions pour le frontend
    echo ""
    log_step "📱 CONFIGURATION FRONTEND (optionnel)"
    log_info "Pour activer les notifications push web, créez : $WEB_DIR/.env.local"
    log_info "Exemple de contenu :"
    echo ""
    echo "NEXT_PUBLIC_FIREBASE_API_KEY=votre-api-key"
    echo "NEXT_PUBLIC_FIREBASE_PROJECT_ID=votre-project-id"
    echo "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=votre-sender-id"
    echo "NEXT_PUBLIC_FIREBASE_APP_ID=votre-app-id"
    echo "NEXT_PUBLIC_FIREBASE_VAPID_KEY=votre-vapid-key"
    echo ""
    log_info "Ces valeurs se trouvent dans Firebase Console → Paramètres projet → Applications web"

    # 6. Résumé
    echo ""
    log_step "✅ CONFIGURATION TERMINÉE"
    log_success "Firebase est maintenant configuré en local !"
    echo ""
    log_info "🐳 Pour lancer avec Docker :"
    log_info "   docker-compose -f docker-compose.local.yml up -d"
    echo ""
    log_info "💻 Pour lancer sans Docker :"
    log_info "   cd services/gateway && npm run dev"
    echo ""
    log_info "🔍 Pour vérifier que Firebase fonctionne :"
    log_info "   Regardez les logs du gateway, vous devriez voir :"
    log_info "   [Notifications] ✅ Firebase Admin SDK initialized successfully"
    echo ""
}

# Fonction helper pour mettre à jour une variable dans .env
update_env_var() {
    local env_file="$1"
    local var_name="$2"
    local var_value="$3"

    if grep -q "^${var_name}=" "$env_file"; then
        # Variable existe, la remplacer
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s|^${var_name}=.*|${var_name}=${var_value}|" "$env_file"
        else
            # Linux
            sed -i "s|^${var_name}=.*|${var_name}=${var_value}|" "$env_file"
        fi
    else
        # Variable n'existe pas, l'ajouter
        echo "${var_name}=${var_value}" >> "$env_file"
    fi
}

# Désactiver Firebase
disable_firebase() {
    log_step "🔕 DÉSACTIVATION FIREBASE"

    if [ -f "$GATEWAY_DIR/.env" ]; then
        log_info "Désactivation des notifications push Firebase..."
        update_env_var "$GATEWAY_DIR/.env" "ENABLE_FCM_PUSH" "false"
        update_env_var "$GATEWAY_DIR/.env" "ENABLE_APNS_PUSH" "false"
        log_success "Firebase désactivé"
        log_info "Les notifications WebSocket continueront de fonctionner"
    else
        log_warning "Fichier .env non trouvé"
    fi
}

# Parser les arguments
case "${1:-}" in
    --check)
        check_config
        ;;
    --setup)
        setup_firebase
        ;;
    --disable)
        disable_firebase
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
