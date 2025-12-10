#!/bin/bash

#########################################
# Meeshy Announcement Script
# Publier un message dans la conversation globale "meeshy"
#
# ⚠️  DÉPRÉCIÉ: Ce script est déprécié.
# Utilisez plutôt le nouveau script mmp.sh (Meeshy Message Publisher)
# qui offre les mêmes fonctionnalités avec vérification des permissions.
# 
# Migration: ./mmp.sh [mêmes options]
# Documentation: ./README-MMP.md
#########################################

set -e

# Avertissement de dépréciation
echo -e "\033[1;33m⚠️  AVERTISSEMENT: Ce script est déprécié.\033[0m"
echo -e "\033[1;33m   Utilisez plutôt: ./mmp.sh (Meeshy Message Publisher)\033[0m"
echo -e "\033[1;33m   Documentation: ./README-MMP.md\033[0m"
echo ""
sleep 2

# Configuration
GATEWAY_URL="${MEESHY_API_URL:-${MEESHY_GATEWAY_URL:-https://gate.meeshy.me}}"
USERNAME="${MEESHY_USERNAME:-meeshy}"
PASSWORD="${MEESHY_PASSWORD}"
CONVERSATION_ID="${MEESHY_CONVERSATION_ID:-meeshy}"

#!/bin/bash

#########################################
# Meeshy Announcement Script
# Publier un message dans la conversation globale "meeshy"
# 
# Ce script permet de publier des messages multi-lignes sur Meeshy
# depuis un fichier texte. Il supporte:
# - Messages multi-lignes depuis un fichier POST
# - Sauvegarde automatique avec horodatage
# - Nettoyage du fichier source après publication
#########################################

set -e

# Configuration
GATEWAY_URL="${MEESHY_API_URL:-${MEESHY_GATEWAY_URL:-https://gate.meeshy.me}}"
USERNAME="${MEESHY_USERNAME:-meeshy}"
PASSWORD="${MEESHY_PASSWORD}"
CONVERSATION_ID="${MEESHY_CONVERSATION_ID:-meeshy}"

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction d'aide
show_help() {
    cat << EOF
Usage: ${0##*/} [OPTIONS] [MESSAGE|FILE]

Publier un message dans la conversation globale Meeshy.

Le script peut fonctionner de trois façons:
  1. Avec un fichier POST spécifié: ${0##*/} -f mon-post.txt
  2. Avec le fichier POST par défaut: ${0##*/} (cherche "POST" dans le répertoire courant)
  3. Avec un message en ligne de commande: ${0##*/} "Mon message"

OPTIONS:
    -h, --help              Afficher cette aide
    -f, --file FILE         Fichier contenant le message à publier
    -u, --username USER     Nom d'utilisateur (défaut: meeshy)
    -p, --password PASS     Mot de passe (ou utiliser MEESHY_PASSWORD)
    -c, --conversation ID   ID de conversation (défaut: meeshy)
    -g, --gateway URL       URL du gateway (défaut: https://gate.meeshy.me)
    -l, --language LANG     Langue du message (défaut: en)
    -v, --verbose           Mode verbeux
    --no-backup             Ne pas créer de sauvegarde du fichier POST
    --no-cleanup            Ne pas supprimer le fichier POST après publication

VARIABLES D'ENVIRONNEMENT:
    MEESHY_PASSWORD         Mot de passe de l'utilisateur meeshy
    MEESHY_USERNAME         Nom d'utilisateur (défaut: meeshy)
    MEESHY_GATEWAY_URL      URL du gateway
    MEESHY_CONVERSATION_ID  ID de conversation

GESTION DES FICHIERS POST:
    Quand un fichier POST est utilisé (via -f ou le fichier POST par défaut):
    1. Le contenu du fichier est lu (support multi-lignes)
    2. Une sauvegarde est créée avec le format: post-YYYYMMDD-HHMMSS
    3. Le message est publié sur Meeshy
    4. Le fichier POST original est supprimé (sauf si --no-cleanup)

EXEMPLES:
    # Publier depuis le fichier POST par défaut dans le répertoire courant
    export MEESHY_PASSWORD="votre_mot_de_passe"
    ${0##*/}

    # Publier depuis un fichier spécifique
    ${0##*/} -f announcement.txt

    # Publier un message en ligne de commande
    ${0##*/} "🚀 Nouvelle version disponible!"

    # Publier avec sauvegarde mais sans suppression
    ${0##*/} -f post.txt --no-cleanup

    # Message en anglais depuis fichier
    ${0##*/} -l en -f english-post.txt

    # Mode verbeux
    ${0##*/} -v -f POST

EOF
    exit 0
}

# Fonction de log
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Fonction pour créer un backup horodaté
create_backup() {
    local source_file="$1"
    local timestamp=$(date +"%Y%m%d-%H%M%S")
    local backup_file="post-${timestamp}"
    
    if [ -f "$source_file" ]; then
        cp "$source_file" "$backup_file"
        log_success "Sauvegarde créée: $backup_file"
        return 0
    else
        log_error "Fichier source introuvable: $source_file"
        return 1
    fi
}

# Fonction pour nettoyer le fichier POST
cleanup_post_file() {
    local file="$1"
    
    if [ -f "$file" ]; then
        rm -f "$file"
        log_success "Fichier nettoyé: $file"
        return 0
    fi
    return 1
}

# Variables par défaut
MESSAGE=""
POST_FILE=""
USE_FILE=false
LANGUAGE="en"
VERBOSE=false
CREATE_BACKUP=true
CLEANUP_FILE=true

# Parser les arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            ;;
        -f|--file)
            POST_FILE="$2"
            USE_FILE=true
            shift 2
            ;;
        -u|--username)
            USERNAME="$2"
            shift 2
            ;;
        -p|--password)
            PASSWORD="$2"
            shift 2
            ;;
        -c|--conversation)
            CONVERSATION_ID="$2"
            shift 2
            ;;
        -g|--gateway)
            GATEWAY_URL="$2"
            shift 2
            ;;
        -l|--language)
            LANGUAGE="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --no-backup)
            CREATE_BACKUP=false
            shift
            ;;
        --no-cleanup)
            CLEANUP_FILE=false
            shift
            ;;
        -*)
            log_error "Option inconnue: $1"
            echo "Utilisez --help pour voir les options disponibles"
            exit 1
            ;;
        *)
            # Si aucun fichier n'est spécifié et que l'argument n'est pas une option,
            # on considère que c'est un message en ligne de commande
            if [ "$USE_FILE" = false ]; then
                MESSAGE="$1"
            fi
            shift
            ;;
    esac
done

# Déterminer la source du message
if [ "$USE_FILE" = false ] && [ -z "$MESSAGE" ]; then
    # Pas de fichier spécifié et pas de message en ligne de commande
    # Chercher le fichier POST par défaut dans le répertoire courant
    if [ -f "POST" ]; then
        POST_FILE="POST"
        USE_FILE=true
        log_info "Utilisation du fichier POST par défaut"
    fi
fi

# Lire le message depuis le fichier si nécessaire
if [ "$USE_FILE" = true ]; then
    if [ -z "$POST_FILE" ]; then
        log_error "Nom de fichier requis avec l'option -f"
        exit 1
    fi
    
    if [ ! -f "$POST_FILE" ]; then
        log_error "Fichier introuvable: $POST_FILE"
        exit 1
    fi
    
    # Lire le contenu complet du fichier (multi-lignes)
    MESSAGE=$(cat "$POST_FILE")
    
    if [ -z "$MESSAGE" ]; then
        log_error "Le fichier $POST_FILE est vide"
        exit 1
    fi
    
    log_success "Message lu depuis: $POST_FILE"
    
    # Créer une sauvegarde si demandé
    if [ "$CREATE_BACKUP" = true ]; then
        create_backup "$POST_FILE" || {
            log_warning "Échec de la création de la sauvegarde"
        }
    fi
fi

# Vérifications
if [ -z "$MESSAGE" ]; then
    log_error "Message requis"
    echo ""
    echo "Usage: ${0##*/} [OPTIONS] MESSAGE"
    echo "Utilisez --help pour plus d'informations"
    exit 1
fi

if [ -z "$PASSWORD" ]; then
    log_error "Mot de passe requis"
    echo ""
    echo "Définissez la variable MEESHY_PASSWORD ou utilisez -p/--password"
    echo "Exemple: export MEESHY_PASSWORD=\"votre_mot_de_passe\""
    exit 1
fi

# Affichage mode verbeux
if [ "$VERBOSE" = true ]; then
    log_info "Configuration:"
    echo "  Gateway: $GATEWAY_URL"
    echo "  Username: $USERNAME"
    echo "  Conversation: $CONVERSATION_ID"
    echo "  Language: $LANGUAGE"
    if [ "$USE_FILE" = true ]; then
        echo "  Source: Fichier $POST_FILE"
        echo "  Backup: $CREATE_BACKUP"
        echo "  Cleanup: $CLEANUP_FILE"
    else
        echo "  Source: Ligne de commande"
    fi
    echo "  Message preview: ${MESSAGE:0:100}..."
    echo ""
fi

# Créer un fichier temporaire pour les cookies
COOKIE_FILE=$(mktemp)
trap "rm -f $COOKIE_FILE" EXIT

log_info "Connexion à Meeshy..."

# 1. Authentification
AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "${GATEWAY_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -c "$COOKIE_FILE" \
    -d "{
        \"username\": \"$USERNAME\",
        \"password\": \"$PASSWORD\"
    }")

HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -n1)
AUTH_BODY=$(echo "$AUTH_RESPONSE" | sed '$d')

if [ "$VERBOSE" = true ]; then
    log_info "Response code: $HTTP_CODE"
fi

if [ "$HTTP_CODE" != "200" ]; then
    log_error "Échec de l'authentification (HTTP $HTTP_CODE)"
    if [ "$VERBOSE" = true ]; then
        echo "$AUTH_BODY" | jq -r '.' 2>/dev/null || echo "$AUTH_BODY"
    fi
    exit 1
fi

# Extraire le token
AUTH_TOKEN=$(echo "$AUTH_BODY" | jq -r '.token // .data.token // empty' 2>/dev/null)

if [ -z "$AUTH_TOKEN" ] || [ "$AUTH_TOKEN" = "null" ]; then
    log_error "Token d'authentification non reçu"
    if [ "$VERBOSE" = true ]; then
        echo "$AUTH_BODY" | jq -r '.' 2>/dev/null || echo "$AUTH_BODY"
    fi
    exit 1
fi

log_success "Authentification réussie"

# 2. Envoi du message
log_info "Envoi du message..."

# Échapper le message pour JSON (échapper les guillemets, backslashes et newlines)
MESSAGE_ESCAPED=$(echo "$MESSAGE" | jq -Rs .)

MESSAGE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "${GATEWAY_URL}/api/conversations/${CONVERSATION_ID}/messages" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -b "$COOKIE_FILE" \
    -d "{
        \"content\": $MESSAGE_ESCAPED,
        \"originalLanguage\": \"$LANGUAGE\",
        \"messageType\": \"text\"
    }")

HTTP_CODE=$(echo "$MESSAGE_RESPONSE" | tail -n1)
MESSAGE_BODY=$(echo "$MESSAGE_RESPONSE" | sed '$d')

if [ "$VERBOSE" = true ]; then
    log_info "Response code: $HTTP_CODE"
fi

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    log_success "Message publié avec succès!"
    
    if [ "$VERBOSE" = true ]; then
        MESSAGE_ID=$(echo "$MESSAGE_BODY" | jq -r '.id // .data.id // .messageId // empty' 2>/dev/null)
        if [ -n "$MESSAGE_ID" ] && [ "$MESSAGE_ID" != "null" ]; then
            echo "  Message ID: $MESSAGE_ID"
        fi
    fi
    
    # Nettoyer le fichier POST si demandé et si on a utilisé un fichier
    if [ "$USE_FILE" = true ] && [ "$CLEANUP_FILE" = true ] && [ -n "$POST_FILE" ]; then
        cleanup_post_file "$POST_FILE"
    fi
    
    exit 0
else
    log_error "Échec de l'envoi du message (HTTP $HTTP_CODE)"
    if [ "$VERBOSE" = true ]; then
        echo "$MESSAGE_BODY" | jq -r '.' 2>/dev/null || echo "$MESSAGE_BODY"
    fi
    exit 1
fi
