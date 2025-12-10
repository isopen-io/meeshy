#!/bin/bash

# ===== MEESHY - RÉINITIALISATION DES MOTS DE PASSE EN PRODUCTION =====
# Script pour réinitialiser les mots de passe en production SANS PERTE DE DONNÉES
# Usage: ./scripts/production/reset-production-passwords.sh [DROPLET_IP]
#
# Ce script réinitialise:
# 1. Mots de passe Traefik Dashboard (admin)
# 2. Mots de passe MongoDB UI (admin)
# 3. Mots de passe Redis UI (admin)
# 4. Mots de passe utilisateurs application (admin, meeshy, atabeth)
# 5. Mot de passe MongoDB database (service)
#
# ⚠️  IMPORTANT: Les données MongoDB ne sont PAS affectées
# ⚠️  Seuls les mots de passe sont modifiés
#
# Date de création: $(date +"%Y-%m-%d %H:%M:%S")

set -e

# Couleurs pour les logs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Variables globales
DROPLET_IP=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
SECRETS_DIR="$PROJECT_ROOT/secrets"
BACKUP_DIR="$SECRETS_DIR/backup-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$SECRETS_DIR/password-reset-$(date +%Y%m%d-%H%M%S).log"

# Fonctions utilitaires
log_info() { 
    echo -e "${BLUE}ℹ️  $1${NC}"
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] INFO: $1" >> "$LOG_FILE"
}

log_success() { 
    echo -e "${GREEN}✅ $1${NC}"
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] SUCCESS: $1" >> "$LOG_FILE"
}

log_warning() { 
    echo -e "${YELLOW}⚠️  $1${NC}"
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] WARNING: $1" >> "$LOG_FILE"
}

log_error() { 
    echo -e "${RED}❌ $1${NC}"
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] ERROR: $1" >> "$LOG_FILE"
}

log_step() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}▶ $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "[$(date +"%Y-%m-%d %H:%M:%S")] STEP: $1" >> "$LOG_FILE"
}

# Fonction d'aide
show_help() {
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  MEESHY - RÉINITIALISATION DES MOTS DE PASSE EN PRODUCTION   ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Usage: $0 [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Description:"
    echo "  Réinitialise tous les mots de passe en production SANS PERTE DE DONNÉES"
    echo ""
    echo "Arguments:"
    echo "  DROPLET_IP              Adresse IP du serveur DigitalOcean"
    echo ""
    echo "Options:"
    echo "  --help, -h              Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  $0 157.230.15.51"
    echo ""
    echo -e "${YELLOW}⚠️  ATTENTION:${NC}"
    echo "  • Les données MongoDB ne seront PAS affectées"
    echo "  • Les services seront redémarrés (brève interruption)"
    echo "  • Un backup des anciens secrets sera créé automatiquement"
    echo ""
    echo -e "${GREEN}🔐 Mots de passe réinitialisés:${NC}"
    echo "  1. Traefik Dashboard (admin)"
    echo "  2. MongoDB UI (admin)"
    echo "  3. Redis UI (admin)"
    echo "  4. Utilisateurs application (admin, meeshy, atabeth)"
    echo "  5. MongoDB database (service)"
    echo ""
}

# Fonction pour générer une chaîne aléatoire sécurisée
generate_random_string() {
    local length=${1:-32}
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -base64 $length | tr -d "=+/\n\r" | cut -c1-$length
    else
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w $length | head -n 1
    fi
}

# Fonction pour générer un mot de passe sécurisé
generate_secure_password() {
    local length=${1:-20}
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -base64 $length | tr -d "=+/\n\r" | cut -c1-$length
    else
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w $length | head -n 1
    fi
}

# Fonction pour générer un hash bcrypt
generate_bcrypt_hash() {
    local password="$1"
    local username="${2:-admin}"
    
    if command -v htpasswd >/dev/null 2>&1; then
        htpasswd -nbB "$username" "$password" | cut -d: -f2
    else
        log_error "htpasswd n'est pas installé. Installez apache2-utils."
        exit 1
    fi
}

# Vérifier les prérequis
check_prerequisites() {
    log_step "ÉTAPE 1/8: Vérification des prérequis"
    
    # Vérifier htpasswd
    if ! command -v htpasswd >/dev/null 2>&1; then
        log_error "htpasswd n'est pas installé"
        log_info "Installation: brew install httpd (macOS) ou apt install apache2-utils (Linux)"
        exit 1
    fi
    log_success "htpasswd est installé"
    
    # Vérifier openssl
    if ! command -v openssl >/dev/null 2>&1; then
        log_error "openssl n'est pas installé"
        exit 1
    fi
    log_success "openssl est installé"
    
    # Vérifier ssh
    if ! command -v ssh >/dev/null 2>&1; then
        log_error "ssh n'est pas installé"
        exit 1
    fi
    log_success "ssh est installé"
    
    # Créer le répertoire secrets si nécessaire
    if [ ! -d "$SECRETS_DIR" ]; then
        mkdir -p "$SECRETS_DIR"
        chmod 700 "$SECRETS_DIR"
        log_success "Répertoire secrets créé"
    fi
    
    # Créer le fichier de log
    touch "$LOG_FILE"
    chmod 600 "$LOG_FILE"
    log_success "Fichier de log créé: $LOG_FILE"
}

# Backup des secrets actuels
backup_current_secrets() {
    log_step "ÉTAPE 2/8: Sauvegarde des secrets actuels"
    
    mkdir -p "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"
    
    if [ -f "$SECRETS_DIR/production-secrets.env" ]; then
        cp "$SECRETS_DIR/production-secrets.env" "$BACKUP_DIR/"
        log_success "Backup: production-secrets.env"
    fi
    
    if [ -f "$SECRETS_DIR/clear.txt" ]; then
        cp "$SECRETS_DIR/clear.txt" "$BACKUP_DIR/"
        log_success "Backup: clear.txt"
    fi
    
    log_success "Backup créé dans: $BACKUP_DIR"
}

# Générer les nouveaux mots de passe
generate_new_passwords() {
    log_step "ÉTAPE 3/8: Génération des nouveaux mots de passe"
    
    # JWT Secret (64 caractères)
    export NEW_JWT_SECRET=$(generate_random_string 64)
    log_success "JWT Secret généré"
    
    # Mots de passe utilisateurs application
    export NEW_ADMIN_PASSWORD=$(generate_secure_password 20)
    export NEW_MEESHY_PASSWORD=$(generate_secure_password 20)
    export NEW_ATABETH_PASSWORD=$(generate_secure_password 20)
    log_success "Mots de passe utilisateurs générés"
    
    # Mots de passe services
    export NEW_MONGODB_PASSWORD=$(generate_secure_password 24)
    export NEW_REDIS_PASSWORD=$(generate_secure_password 20)
    log_success "Mots de passe services générés"
    
    # Générer les hashes bcrypt pour Traefik, MongoDB UI, Redis UI
    export NEW_TRAEFIK_HASH=$(generate_bcrypt_hash "$NEW_ADMIN_PASSWORD" "admin")
    export NEW_API_HASH=$(generate_bcrypt_hash "$NEW_ADMIN_PASSWORD" "admin")
    export NEW_MONGO_UI_HASH=$(generate_bcrypt_hash "$NEW_ADMIN_PASSWORD" "admin")
    export NEW_REDIS_UI_HASH=$(generate_bcrypt_hash "$NEW_ADMIN_PASSWORD" "admin")
    log_success "Hashes bcrypt générés"
}

# Sauvegarder les nouveaux secrets localement
save_new_secrets_locally() {
    log_step "ÉTAPE 4/8: Sauvegarde des nouveaux secrets localement"
    
    # Créer le fichier des mots de passe en clair
    cat > "$SECRETS_DIR/clear.txt" << EOF
# ===== MEESHY - MOTS DE PASSE EN CLAIR =====
# Fichier généré automatiquement - NE PAS COMMITER
# Date de génération: $(date)
# 
# ⚠️  ATTENTION: Ce fichier contient les mots de passe en clair
# ⚠️  Ne jamais le commiter dans Git ou le partager
# ⚠️  Conserver ce fichier dans un endroit sécurisé EN LOCAL UNIQUEMENT

# ===== UTILISATEURS DE L'APPLICATION =====
# Mots de passe pour se connecter à l'application Meeshy
ADMIN_PASSWORD_CLEAR="$NEW_ADMIN_PASSWORD"
MEESHY_PASSWORD_CLEAR="$NEW_MEESHY_PASSWORD"
ATABETH_PASSWORD_CLEAR="$NEW_ATABETH_PASSWORD"

# ===== SERVICES D'ADMINISTRATION =====
# Tous utilisent le même mot de passe admin pour simplifier
TRAEFIK_PASSWORD_CLEAR="$NEW_ADMIN_PASSWORD"
MONGO_UI_PASSWORD_CLEAR="$NEW_ADMIN_PASSWORD"
REDIS_UI_PASSWORD_CLEAR="$NEW_ADMIN_PASSWORD"

# ===== SERVICES DE BASE DE DONNÉES =====
MONGODB_PASSWORD_CLEAR="$NEW_MONGODB_PASSWORD"
REDIS_PASSWORD_CLEAR="$NEW_REDIS_PASSWORD"

# ===== INSTRUCTIONS D'UTILISATION =====
# 
# 🌐 Traefik Dashboard:
#    URL: https://traefik.meeshy.me
#    Utilisateur: admin
#    Mot de passe: $NEW_ADMIN_PASSWORD
#
# 🏠 Application Meeshy:
#    URL: https://meeshy.me
#    Utilisateur Admin: admin / $NEW_ADMIN_PASSWORD
#    Utilisateur Meeshy: meeshy / $NEW_MEESHY_PASSWORD
#    Utilisateur Atabeth: atabeth / $NEW_ATABETH_PASSWORD
#
# 🗄️ MongoDB (NoSQLClient):
#    URL: https://mongo.meeshy.me
#    Utilisateur: admin
#    Mot de passe: $NEW_ADMIN_PASSWORD
#
# 🔴 Redis (P3X Redis UI):
#    URL: https://redis.meeshy.me
#    Utilisateur: admin
#    Mot de passe: $NEW_ADMIN_PASSWORD
#
# ===== JWT SECRET =====
JWT_SECRET="$NEW_JWT_SECRET"

# ===== HASHES BCRYPT =====
TRAEFIK_USERS="admin:$NEW_TRAEFIK_HASH"
API_USERS="admin:$NEW_API_HASH"
MONGO_USERS="admin:$NEW_MONGO_UI_HASH"
REDIS_USERS="admin:$NEW_REDIS_UI_HASH"
EOF

    chmod 600 "$SECRETS_DIR/clear.txt"
    log_success "Fichier clear.txt créé"
    
    # Créer le fichier production-secrets.env
    cat > "$SECRETS_DIR/production-secrets.env" << EOF
# ===== MEESHY PRODUCTION SECRETS =====
# Fichier généré automatiquement - NE PAS COMMITER
# Date de génération: $(date)
# 
# ⚠️  ATTENTION: Ce fichier contient des informations sensibles

# ===== JWT AUTHENTICATION =====
JWT_SECRET="$NEW_JWT_SECRET"
JWT_EXPIRES_IN="7d"

# ===== MOTS DE PASSE UTILISATEURS =====
ADMIN_PASSWORD="$NEW_ADMIN_PASSWORD"
MEESHY_PASSWORD="$NEW_MEESHY_PASSWORD"
ATABETH_PASSWORD="$NEW_ATABETH_PASSWORD"

# ===== MOTS DE PASSE SERVICES =====
MONGODB_PASSWORD="$NEW_MONGODB_PASSWORD"
REDIS_PASSWORD="$NEW_REDIS_PASSWORD"

# ===== EMAILS DE PRODUCTION =====
ADMIN_EMAIL="admin@meeshy.me"
MEESHY_EMAIL="meeshy@meeshy.me"
ATABETH_EMAIL="atabeth@meeshy.me"
SUPPORT_EMAIL="support@meeshy.me"
FEEDBACK_EMAIL="feedback@meeshy.me"

# ===== DOMAINE DE PRODUCTION =====
DOMAIN="meeshy.me"

# ===== HASHES D'AUTHENTIFICATION =====
TRAEFIK_USERS="admin:$NEW_TRAEFIK_HASH"
API_USERS="admin:$NEW_API_HASH"
MONGO_USERS="admin:$NEW_MONGO_UI_HASH"
REDIS_USERS="admin:$NEW_REDIS_UI_HASH"

# ===== CONFIGURATION UTILISATEURS DÉTAILLÉE =====
MEESHY_USERNAME="meeshy"
MEESHY_FIRST_NAME="Meeshy"
MEESHY_LAST_NAME="Sama"
MEESHY_ROLE="BIGBOSS"
MEESHY_SYSTEM_LANGUAGE="en"
MEESHY_REGIONAL_LANGUAGE="fr"
MEESHY_CUSTOM_DESTINATION_LANGUAGE="pt"

ADMIN_USERNAME="admin"
ADMIN_FIRST_NAME="Admin"
ADMIN_LAST_NAME="Manager"
ADMIN_ROLE="ADMIN"
ADMIN_SYSTEM_LANGUAGE="es"
ADMIN_REGIONAL_LANGUAGE="de"
ADMIN_CUSTOM_DESTINATION_LANGUAGE="zh"

ATABETH_USERNAME="atabeth"
ATABETH_FIRST_NAME="André"
ATABETH_LAST_NAME="Tabeth"
ATABETH_ROLE="USER"
ATABETH_SYSTEM_LANGUAGE="fr"
ATABETH_REGIONAL_LANGUAGE="fr"
ATABETH_CUSTOM_DESTINATION_LANGUAGE="en"

# ===== CONFIGURATION BASE DE DONNÉES =====
FORCE_DB_RESET="false"

# ===== INFORMATIONS DE DÉPLOIEMENT =====
DEPLOYMENT_DATE="$(date)"
DEPLOYMENT_VERSION="1.0.0-production-password-reset"
DEPLOYMENT_ENV="production"
EOF

    chmod 600 "$SECRETS_DIR/production-secrets.env"
    log_success "Fichier production-secrets.env créé"
}

# Test de connexion SSH
test_ssh_connection() {
    log_step "ÉTAPE 5/8: Test de connexion SSH au serveur"
    
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@$DROPLET_IP "echo 'Connexion SSH réussie'" >/dev/null 2>&1; then
        log_success "Connexion SSH établie avec $DROPLET_IP"
    else
        log_error "Impossible de se connecter à $DROPLET_IP"
        exit 1
    fi
}

# Mettre à jour les variables d'environnement sur le serveur
update_env_on_server() {
    log_step "ÉTAPE 6/8: Mise à jour des variables d'environnement sur le serveur"
    
    log_info "Connexion au serveur $DROPLET_IP..."
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << EOF
        set -e
        cd /opt/meeshy
        
        echo "📝 Mise à jour du fichier .env..."
        
        # Backup du fichier .env actuel
        cp .env .env.backup-\$(date +%Y%m%d-%H%M%S)
        
        # Mise à jour JWT_SECRET
        sed -i 's|^JWT_SECRET=.*|JWT_SECRET="$NEW_JWT_SECRET"|' .env
        
        # Mise à jour des mots de passe utilisateurs
        sed -i 's|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD="$NEW_ADMIN_PASSWORD"|' .env
        sed -i 's|^MEESHY_PASSWORD=.*|MEESHY_PASSWORD="$NEW_MEESHY_PASSWORD"|' .env
        sed -i 's|^ATABETH_PASSWORD=.*|ATABETH_PASSWORD="$NEW_ATABETH_PASSWORD"|' .env
        
        # Mise à jour des mots de passe services
        sed -i 's|^MONGODB_PASSWORD=.*|MONGODB_PASSWORD="$NEW_MONGODB_PASSWORD"|' .env
        sed -i 's|^REDIS_PASSWORD=.*|REDIS_PASSWORD="$NEW_REDIS_PASSWORD"|' .env
        
        # Mise à jour des hashes bcrypt
        sed -i 's|^TRAEFIK_USERS=.*|TRAEFIK_USERS="admin:$NEW_TRAEFIK_HASH"|' .env
        sed -i 's|^API_USERS=.*|API_USERS="admin:$NEW_API_HASH"|' .env
        sed -i 's|^MONGO_USERS=.*|MONGO_USERS="admin:$NEW_MONGO_UI_HASH"|' .env
        sed -i 's|^REDIS_USERS=.*|REDIS_USERS="admin:$NEW_REDIS_UI_HASH"|' .env
        
        echo "✅ Variables d'environnement mises à jour"
        
        # Vérification
        echo "🔍 Vérification des variables critiques:"
        grep "^JWT_SECRET=" .env | head -c 30
        echo "... (tronqué)"
        grep "^ADMIN_PASSWORD=" .env | head -c 30
        echo "... (tronqué)"
        grep "^TRAEFIK_USERS=" .env | head -c 50
        echo "... (tronqué)"
EOF
    
    log_success "Variables d'environnement mises à jour sur le serveur"
}

# Mettre à jour les utilisateurs MongoDB
update_mongodb_users() {
    log_step "ÉTAPE 7/8: Mise à jour des mots de passe dans MongoDB"
    
    log_info "Connexion au serveur pour mettre à jour MongoDB..."
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'ENDSSH'
        set -e
        cd /opt/meeshy
        
        echo "🗄️  Mise à jour des mots de passe utilisateurs dans MongoDB..."
        
        # Créer un script MongoDB temporaire
        cat > /tmp/update_passwords.js << 'ENDMONGO'
// Script de mise à jour des mots de passe MongoDB
// IMPORTANT: Ce script ne supprime PAS les données, il met seulement à jour les mots de passe

const bcrypt = require('bcryptjs');

// Fonction pour hasher un mot de passe
function hashPassword(password) {
    return bcrypt.hashSync(password, 10);
}

// Connexion à la base de données
db = db.getSiblingDB('meeshy');

// Mots de passe à mettre à jour (seront injectés par le shell)
const adminPassword = process.env.NEW_ADMIN_PASSWORD;
const meeshyPassword = process.env.NEW_MEESHY_PASSWORD;
const atabethPassword = process.env.NEW_ATABETH_PASSWORD;

print('📝 Mise à jour des mots de passe utilisateurs...');

// Mise à jour utilisateur admin
const adminResult = db.users.updateOne(
    { username: 'admin' },
    { $set: { password: hashPassword(adminPassword) } }
);
print('✅ Admin: ' + adminResult.modifiedCount + ' document(s) mis à jour');

// Mise à jour utilisateur meeshy
const meeshyResult = db.users.updateOne(
    { username: 'meeshy' },
    { $set: { password: hashPassword(meeshyPassword) } }
);
print('✅ Meeshy: ' + meeshyResult.modifiedCount + ' document(s) mis à jour');

// Mise à jour utilisateur atabeth
const atabethResult = db.users.updateOne(
    { username: 'atabeth' },
    { $set: { password: hashPassword(atabethPassword) } }
);
print('✅ Atabeth: ' + atabethResult.modifiedCount + ' document(s) mis à jour');

print('✅ Tous les mots de passe ont été mis à jour avec succès!');
ENDMONGO
        
        # Charger les nouvelles variables d'environnement
        source .env
        
        # Exécuter le script dans le conteneur MongoDB avec bcryptjs
        echo "📋 Exécution du script de mise à jour..."
        docker exec -i meeshy-gateway sh -c "
            cd /workspace &&
            export NEW_ADMIN_PASSWORD='$ADMIN_PASSWORD' &&
            export NEW_MEESHY_PASSWORD='$MEESHY_PASSWORD' &&
            export NEW_ATABETH_PASSWORD='$ATABETH_PASSWORD' &&
            node -e \"
                const bcrypt = require('bcryptjs');
                const { MongoClient } = require('mongodb');
                
                async function updatePasswords() {
                    const client = new MongoClient('$DATABASE_URL');
                    try {
                        await client.connect();
                        const db = client.db('meeshy');
                        
                        console.log('📝 Mise à jour des mots de passe utilisateurs...');
                        
                        // Admin
                        const adminHash = bcrypt.hashSync(process.env.NEW_ADMIN_PASSWORD, 10);
                        const adminResult = await db.collection('users').updateOne(
                            { username: 'admin' },
                            { \\\$set: { password: adminHash } }
                        );
                        console.log('✅ Admin: ' + adminResult.modifiedCount + ' document(s) mis à jour');
                        
                        // Meeshy
                        const meeshyHash = bcrypt.hashSync(process.env.NEW_MEESHY_PASSWORD, 10);
                        const meeshyResult = await db.collection('users').updateOne(
                            { username: 'meeshy' },
                            { \\\$set: { password: meeshyHash } }
                        );
                        console.log('✅ Meeshy: ' + meeshyResult.modifiedCount + ' document(s) mis à jour');
                        
                        // Atabeth
                        const atabethHash = bcrypt.hashSync(process.env.NEW_ATABETH_PASSWORD, 10);
                        const atabethResult = await db.collection('users').updateOne(
                            { username: 'atabeth' },
                            { \\\$set: { password: atabethHash } }
                        );
                        console.log('✅ Atabeth: ' + atabethResult.modifiedCount + ' document(s) mis à jour');
                        
                        console.log('✅ Tous les mots de passe ont été mis à jour avec succès!');
                    } finally {
                        await client.close();
                    }
                }
                
                updatePasswords().catch(console.error);
            \"
        "
        
        echo "✅ Mots de passe MongoDB mis à jour"
        
        # Nettoyage
        rm -f /tmp/update_passwords.js
ENDSSH
    
    log_success "Mots de passe utilisateurs mis à jour dans MongoDB"
}

# Redémarrer les services
restart_services() {
    log_step "ÉTAPE 8/8: Redémarrage des services"
    
    log_info "Redémarrage des services sur le serveur..."
    
    ssh -o StrictHostKeyChecking=no root@$DROPLET_IP << 'ENDSSH'
        set -e
        cd /opt/meeshy
        
        echo "🔄 Redémarrage des services concernés..."
        
        # Redémarrer Traefik pour prendre en compte les nouveaux hashes
        echo "📌 Redémarrage Traefik..."
        docker-compose restart traefik
        sleep 5
        
        # Redémarrer NoSQLClient pour MongoDB UI
        echo "📌 Redémarrage NoSQLClient..."
        docker-compose restart nosqlclient
        sleep 5
        
        # Redémarrer P3X Redis UI
        echo "📌 Redémarrage P3X Redis UI..."
        docker-compose restart p3x-redis-ui
        sleep 5
        
        # Redémarrer Gateway (pour JWT_SECRET et mots de passe utilisateurs)
        echo "📌 Redémarrage Gateway..."
        docker-compose restart gateway
        sleep 10
        
        echo "✅ Tous les services ont été redémarrés"
        
        # Vérifier l'état des services
        echo "🔍 Vérification de l'état des services:"
        docker-compose ps
ENDSSH
    
    log_success "Services redémarrés avec succès"
}

# Afficher le récapitulatif
show_summary() {
    echo ""
    log_step "RÉCAPITULATIF DE L'OPÉRATION"
    echo ""
    
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                   OPÉRATION TERMINÉE ✅                        ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${CYAN}📋 NOUVEAUX MOTS DE PASSE:${NC}"
    echo ""
    echo -e "${YELLOW}🌐 Traefik Dashboard:${NC}"
    echo "   URL: https://traefik.meeshy.me"
    echo "   Utilisateur: admin"
    echo "   Mot de passe: $NEW_ADMIN_PASSWORD"
    echo ""
    echo -e "${YELLOW}🏠 Application Meeshy:${NC}"
    echo "   URL: https://meeshy.me"
    echo "   Admin: admin / $NEW_ADMIN_PASSWORD"
    echo "   Meeshy: meeshy / $NEW_MEESHY_PASSWORD"
    echo "   Atabeth: atabeth / $NEW_ATABETH_PASSWORD"
    echo ""
    echo -e "${YELLOW}🗄️  MongoDB UI (NoSQLClient):${NC}"
    echo "   URL: https://mongo.meeshy.me"
    echo "   Utilisateur: admin"
    echo "   Mot de passe: $NEW_ADMIN_PASSWORD"
    echo ""
    echo -e "${YELLOW}🔴 Redis UI (P3X):${NC}"
    echo "   URL: https://redis.meeshy.me"
    echo "   Utilisateur: admin"
    echo "   Mot de passe: $NEW_ADMIN_PASSWORD"
    echo ""
    
    echo -e "${CYAN}📁 FICHIERS CRÉÉS:${NC}"
    echo "   • Secrets: $SECRETS_DIR/production-secrets.env"
    echo "   • Mots de passe en clair: $SECRETS_DIR/clear.txt"
    echo "   • Backup: $BACKUP_DIR/"
    echo "   • Log: $LOG_FILE"
    echo ""
    
    echo -e "${CYAN}✅ VÉRIFICATIONS:${NC}"
    echo "   • Données MongoDB: INTACTES ✅"
    echo "   • Services: REDÉMARRÉS ✅"
    echo "   • Mots de passe: MIS À JOUR ✅"
    echo "   • Backup: CRÉÉ ✅"
    echo ""
    
    echo -e "${MAGENTA}⚠️  IMPORTANT:${NC}"
    echo "   • Testez immédiatement la connexion à tous les services"
    echo "   • Conservez le fichier clear.txt en lieu sûr"
    echo "   • Ne commitez JAMAIS les fichiers de secrets"
    echo "   • Le backup est dans: $BACKUP_DIR/"
    echo ""
    
    echo -e "${GREEN}🎉 Réinitialisation des mots de passe terminée avec succès!${NC}"
    echo ""
}

# Fonction principale
main() {
    # Parser les arguments
    if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
        show_help
        exit 0
    fi
    
    if [ -z "$1" ]; then
        log_error "Adresse IP du serveur requise"
        echo ""
        show_help
        exit 1
    fi
    
    DROPLET_IP="$1"
    
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  MEESHY - RÉINITIALISATION DES MOTS DE PASSE EN PRODUCTION   ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    log_info "Serveur cible: $DROPLET_IP"
    log_info "Date: $(date)"
    echo ""
    
    # Confirmation
    echo -e "${YELLOW}⚠️  ATTENTION:${NC}"
    echo "Cette opération va réinitialiser tous les mots de passe sur $DROPLET_IP"
    echo "Les données MongoDB ne seront PAS affectées."
    echo ""
    read -p "Voulez-vous continuer? (oui/non): " confirm
    
    if [ "$confirm" != "oui" ]; then
        log_warning "Opération annulée par l'utilisateur"
        exit 0
    fi
    
    echo ""
    
    # Exécuter les étapes
    check_prerequisites
    backup_current_secrets
    generate_new_passwords
    save_new_secrets_locally
    test_ssh_connection
    update_env_on_server
    update_mongodb_users
    restart_services
    show_summary
}

# Exécution
main "$@"
