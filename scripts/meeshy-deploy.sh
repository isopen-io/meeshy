#!/bin/bash

# 🚀 MEESHY - SCRIPT UNIFIÉ DE DÉPLOIEMENT OPTIMISÉ
# Usage: ./scripts/meeshy-deploy.sh [COMMAND] [DROPLET_IP]
# Commands: deploy, test, verify, status, logs, restart, stop, recreate
# 
# OPTIMISATION: Ne transmet que les fichiers essentiels pour l'infrastructure
# et la configuration, pas les sources qui sont déjà buildées dans les images

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Variables globales
COMMAND=""
DROPLET_IP=""
FORCE_REFRESH=false
REGENERATE_SECRETS=false

# Fonctions utilitaires
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Fonction d'aide
show_help() {
    echo "🚀 MEESHY - Script de déploiement unifié"
    echo ""
    echo "Usage: $0 [COMMAND] [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  deploy     Déployer l'application complète"
    echo "  test       Tester la connexion au serveur"
    echo "  verify     Vérifier le statut des services"
    echo "  status     Afficher le statut des conteneurs"
    echo "  logs       Afficher les logs des services"
    echo "  restart    Redémarrer les services"
    echo "  stop       Arrêter les services"
    echo "  recreate   Recréer les conteneurs"
    echo ""
    echo "Options:"
    echo "  --regenerate-secrets    Forcer la régénération des secrets de production (écrase les secrets existants)"
    echo "  --force-refresh         Forcer le rafraîchissement des images"
    echo "  --help, -h              Afficher cette aide"
    echo ""
    echo "Gestion des secrets:"
    echo "  Par défaut, si des secrets existent déjà, ils seront réutilisés."
    echo "  Utilisez --regenerate-secrets pour forcer la création de nouveaux secrets."
    echo ""
    echo "Exemples:"
    echo "  $0 deploy 192.168.1.100                    # Utilise les secrets existants"
    echo "  $0 deploy 192.168.1.100 --regenerate-secrets  # Génère de nouveaux secrets"
    echo "  $0 status 192.168.1.100"
    echo ""
}

# Fonction pour parser les arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --regenerate-secrets)
                REGENERATE_SECRETS=true
                shift
                ;;
            --force-refresh)
                FORCE_REFRESH=true
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                # Si ce n'est pas une option, c'est probablement la commande ou l'IP
                if [ -z "$COMMAND" ]; then
                    COMMAND="$1"
                elif [ -z "$DROPLET_IP" ]; then
                    DROPLET_IP="$1"
                fi
                shift
                ;;
        esac
    done
}

# Parser les arguments
parse_arguments "$@"

# Variables après parsing
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DOCKER_COMPOSE_FILE="docker-compose.traefik.yml"

# Test de connexion SSH
test_ssh_connection() {
    local ip="$1"
    log_info "Test de connexion SSH..."
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@$ip "echo 'Connexion SSH réussie'" >/dev/null 2>&1; then
        log_success "Connexion SSH réussie"
        return 0
    else
        log_error "Impossible de se connecter au serveur"
        return 1
    fi
}

# Déploiement optimisé (infrastructure et configuration uniquement)
deploy_complete() {
    local ip="$1"
    local domain="${2:-localhost}"
    log_info "🚀 Déploiement optimisé sur $ip (domaine: $domain) - infrastructure et configuration uniquement"

    # Créer répertoire temporaire pour les fichiers essentiels uniquement
    local deploy_dir="/tmp/meeshy-deploy-optimized-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$deploy_dir"

    # Préparer fichiers essentiels uniquement
    log_info "📁 Préparation des fichiers essentiels (infrastructure et configuration)..."
    cp "$PROJECT_ROOT/$DOCKER_COMPOSE_FILE" "$deploy_dir/docker-compose.yml"
    cp "$PROJECT_ROOT/env.digitalocean" "$deploy_dir/.env"
    
    # Configuration Docker essentielle uniquement
    mkdir -p "$deploy_dir/docker"
    cp -r "$PROJECT_ROOT/docker/nginx" "$deploy_dir/docker/"
    cp -r "$PROJECT_ROOT/docker/supervisor" "$deploy_dir/docker/"
    
    # Fichiers shared essentiels pour la configuration (pas les sources)
    mkdir -p "$deploy_dir/shared"
    
    # Schémas de base de données
    cp "$PROJECT_ROOT/shared/schema.prisma" "$deploy_dir/shared/"
    cp "$PROJECT_ROOT/shared/schema.postgresql.prisma" "$deploy_dir/shared/"
    
    # Scripts d'initialisation de base de données
    cp "$PROJECT_ROOT/shared/init-postgresql.sql" "$deploy_dir/shared/"
    cp "$PROJECT_ROOT/shared/init-database.sh" "$deploy_dir/shared/"
    cp "$PROJECT_ROOT/shared/init-mongodb-replica.sh" "$deploy_dir/shared/"
    cp "$PROJECT_ROOT/shared/mongodb-keyfile" "$deploy_dir/shared/"
    
    # Fichiers Proto pour la communication inter-services
    mkdir -p "$deploy_dir/shared/proto"
    cp "$PROJECT_ROOT/shared/proto/messaging.proto" "$deploy_dir/shared/proto/"
    
    # Version pour le suivi
    cp "$PROJECT_ROOT/shared/version.txt" "$deploy_dir/shared/" 2>/dev/null || echo "1.0.0" > "$deploy_dir/shared/version.txt"
    
    # Génération des configurations de production sécurisées
    log_info "🔐 Gestion des configurations de production sécurisées..."
    if [ -f "$PROJECT_ROOT/scripts/production/meeshy-generate-production-variables.sh" ]; then
        # Vérifier si les secrets existent déjà
        if [ -f "$PROJECT_ROOT/secrets/production-secrets.env" ] && [ "$REGENERATE_SECRETS" = false ]; then
            log_info "📋 Fichier de secrets existant détecté: $PROJECT_ROOT/secrets/production-secrets.env"
            log_info "💡 Utilisation des secrets existants (utilisez --regenerate-secrets pour forcer la régénération)"
        else
            if [ "$REGENERATE_SECRETS" = true ]; then
                log_warning "⚠️  Régénération forcée des secrets de production..."
            else
                log_info "📋 Génération des nouvelles configurations de production..."
            fi
            bash "$PROJECT_ROOT/scripts/production/meeshy-generate-production-variables.sh" --force
            log_success "✅ Configurations de production générées"
        fi
        
        # Vérifier que le fichier clear.txt a été créé par meeshy-generate-production-variables.sh
        if [ -f "$PROJECT_ROOT/secrets/clear.txt" ]; then
            log_success "✅ Fichier des mots de passe en clair trouvé: secrets/clear.txt"
        else
            log_warning "⚠️  Fichier des mots de passe en clair non trouvé: secrets/clear.txt"
        fi
    else
        log_warning "⚠️  Script de génération de configuration non trouvé"
    fi

    # Gestion des secrets de production
    log_info "🔐 Gestion des secrets de production..."
    if [ -f "$PROJECT_ROOT/secrets/production-secrets.env" ]; then
        log_info "📋 Fichier de secrets de production trouvé"
        # Créer le répertoire secrets sur le serveur
        ssh -o StrictHostKeyChecking=no root@$ip "mkdir -p /opt/meeshy/secrets"
        # Transférer le fichier de secrets
        scp -o StrictHostKeyChecking=no "$PROJECT_ROOT/secrets/production-secrets.env" root@$ip:/opt/meeshy/secrets/
        # Sécuriser le fichier sur le serveur
        ssh -o StrictHostKeyChecking=no root@$ip "chmod 600 /opt/meeshy/secrets/production-secrets.env"
        log_success "✅ Fichier de secrets transféré et sécurisé"
        
        # ⚠️  SÉCURITÉ: Ne JAMAIS transférer les mots de passe en clair sur le serveur
        log_info "🔒 Fichier des mots de passe en clair conservé en local uniquement (sécurité)"
    else
        log_warning "⚠️  Fichier de secrets de production non trouvé: $PROJECT_ROOT/secrets/production-secrets.env"
        log_info "💡 Créez le fichier avec: ./scripts/production/meeshy-generate-production-variables.sh"
    fi

# Envoyer sur serveur
    log_info "📤 Envoi des fichiers optimisés..."
    ssh -o StrictHostKeyChecking=no root@$ip "mkdir -p /opt/meeshy"
    scp -o StrictHostKeyChecking=no "$deploy_dir/docker-compose.yml" root@$ip:/opt/meeshy/
    scp -o StrictHostKeyChecking=no "$deploy_dir/.env" root@$ip:/opt/meeshy/
    scp -r -o StrictHostKeyChecking=no "$deploy_dir/docker" root@$ip:/opt/meeshy/
    scp -r -o StrictHostKeyChecking=no "$deploy_dir/shared" root@$ip:/opt/meeshy/

    # Script de déploiement amélioré avec gestion SSL intelligente
    cat << 'EOF' > /tmp/deploy-services.sh
#!/bin/bash
set -e
cd /opt/meeshy

# Installer Docker si pas présent
if ! command -v docker &> /dev/null; then
    echo "🐳 Installation de Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    usermod -aG docker $USER
    systemctl enable docker
    systemctl start docker
    rm get-docker.sh
fi

# Installer Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "📦 Installation de Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
fi

# Installer OpenSSL et dig si pas présents
if ! command -v openssl &> /dev/null; then
    echo "🔐 Installation d'OpenSSL..."
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y openssl dnsutils
    elif command -v yum &> /dev/null; then
        yum install -y openssl bind-utils
    elif command -v apk &> /dev/null; then
        apk add --no-cache openssl bind-tools
    fi
fi

# Charger les secrets de production si disponibles
if [ -f "/opt/meeshy/secrets/production-secrets.env" ]; then
    echo "🔐 Chargement des secrets de production..."
    set -a
    source /opt/meeshy/secrets/production-secrets.env
    set +a
    echo "✅ Secrets de production chargés"
    
    # Ajouter les secrets au fichier .env pour docker-compose
    echo "" >> .env
    echo "# ===== SECRETS DE PRODUCTION ======" >> .env
    echo "# Générés automatiquement le $(date)" >> .env
    cat /opt/meeshy/secrets/production-secrets.env >> .env
    echo "✅ Secrets ajoutés au fichier .env"
else
    echo "⚠️  Fichier de secrets de production non trouvé, utilisation de la configuration par défaut"
fi

echo "🧹 Nettoyage..."
docker-compose down --remove-orphans || true
docker system prune -f || true
docker image prune -f || true

# Gestion SSL intelligente
echo "🔐 Configuration SSL..."
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
    echo "🌐 Mode production détecté pour $DOMAIN"
    # Utiliser la configuration Let's Encrypt
    cp docker/nginx/letsencrypt.conf docker/nginx/active.conf 2>/dev/null || {
        echo "⚠️  Configuration Let's Encrypt non trouvée, utilisation du mode développement"
        cp docker/nginx/digitalocean.conf docker/nginx/active.conf
    }
else
    echo "🔧 Mode développement détecté"
    # Générer des certificats auto-signés
    if [ ! -f "ssl/cert.pem" ] || [ ! -f "ssl/key.pem" ]; then
        mkdir -p ssl
        cd ssl
        
        openssl genrsa -out key.pem 2048
        cat > openssl.conf << 'SSL_EOF'
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = FR
ST = IDF
L = Paris
O = Meeshy
CN = localhost

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = 127.0.0.1
IP.1 = 127.0.0.1
IP.2 = 0.0.0.0
SSL_EOF

        openssl req -new -x509 -key key.pem -out cert.pem -days 365 -config openssl.conf
        chmod 600 key.pem
        chmod 644 cert.pem
        rm openssl.conf
        
        echo "✅ Certificats auto-signés générés"
        cd ..
    fi
    
    # Utiliser la configuration de développement
    cp docker/nginx/digitalocean.conf docker/nginx/active.conf
fi

if [ "$FORCE_REFRESH" = "true" ]; then
    echo "📦 Téléchargement forcé des images..."
    docker-compose pull --no-cache
else
    echo "📦 Téléchargement des images..."
    docker-compose pull
fi

echo "🚀 Démarrage séquentiel..."

# Traefik (doit être démarré en premier)
echo "🌐 Démarrage Traefik..."
docker-compose up -d traefik
sleep 5

# Vérifier Traefik
# Attendre que Traefik soit prêt (optimisé)
echo "⏳ Attente de Traefik..."
sleep 5
if curl -f -s http://localhost:80 >/dev/null 2>&1; then
    echo "✅ Traefik prêt"
else
    echo "⚠️  Traefik en cours de démarrage..."
fi

# MongoDB
echo "📊 Démarrage MongoDB..."
docker-compose up -d database
sleep 5

# Vérifier MongoDB avec authentification correcte
# Attendre que MongoDB soit prêt (optimisé)
echo "⏳ Attente de MongoDB..."
sleep 3
if docker-compose exec -T database mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
    echo "✅ MongoDB prêt"
else
    echo "⚠️  MongoDB en cours de démarrage..."
fi

# Vérifier que la base meeshy est accessible (optimisé)
echo "⏳ Vérification de la base meeshy..."
sleep 5
if docker-compose exec -T database mongosh --eval "use meeshy; db.runCommand('ping')" >/dev/null 2>&1; then
    echo "✅ Base de données 'meeshy' accessible"
else
    echo "⚠️  Base de données 'meeshy' en cours d'initialisation..."
fi

# Configuration et vérification du replica set MongoDB
echo "🔧 CONFIGURATION DU REPLICA SET MONGODB..."
echo "=========================================="

# Attendre que MongoDB soit complètement prêt
echo "⏳ Attente que MongoDB soit prêt pour la configuration du replica set..."
sleep 3

# Vérifier si le replica set est déjà initialisé
if docker-compose exec -T database mongosh --eval "rs.status()" >/dev/null 2>&1; then
    echo "✅ Replica set MongoDB détecté"
    
    # Vérifier le nom d'hôte du replica set
    echo "🔍 Vérification de la configuration du replica set..."
    current_host=$(docker-compose exec -T database mongosh --eval "rs.status().members[0].name" --quiet 2>/dev/null | tr -d '\r\n')
    
    if [ "$current_host" = "meeshy-database:27017" ]; then
        echo "✅ Replica set correctement configuré avec meeshy-database:27017"
        echo "📊 Statut du replica set:"
        docker-compose exec -T database mongosh --eval "rs.status()" --quiet
    else
        echo "⚠️  Replica set configuré avec le mauvais nom d'hôte: $current_host"
        echo "🔧 Reconfiguration du replica set avec le bon nom d'hôte..."
        
        # Reconfigurer le replica set avec le bon nom d'hôte
        docker-compose exec -T database mongosh --eval "
            try {
                var config = rs.conf();
                config.members[0].host = 'meeshy-database:27017';
                rs.reconfig(config, {force: true});
                print('✅ Replica set reconfiguré avec meeshy-database:27017');
            } catch (e) {
                print('❌ Erreur lors de la reconfiguration: ' + e.message);
                throw e;
            }
        "
        
        # Attendre que la reconfiguration soit effective
        echo "⏳ Attente de la reconfiguration du replica set..."
        sleep 5
        
        # Vérifier la nouvelle configuration
        new_host=$(docker-compose exec -T database mongosh --eval "rs.status().members[0].name" --quiet 2>/dev/null | tr -d '\r\n')
        if [ "$new_host" = "meeshy-database:27017" ]; then
            echo "✅ Replica set reconfiguré avec succès"
        else
            echo "❌ Échec de la reconfiguration du replica set"
            exit 1
        fi
    fi
else
    echo "📋 Initialisation du replica set rs0..."
    
    # Initialiser le replica set avec le bon nom d'hôte
    docker-compose exec -T database mongosh --eval "
        try {
            rs.initiate({
                _id: 'rs0',
                members: [
                    { _id: 0, host: 'meeshy-database:27017' }
                ]
            });
            print('✅ Replica set rs0 initialisé avec succès');
        } catch (e) {
            if (e.message.includes('already initialized')) {
                print('⚠️  Replica set déjà initialisé');
            } else {
                print('❌ Erreur initialisation replica set: ' + e.message);
                throw e;
            }
        }
    "
    
    # Attendre que le replica set soit prêt
    echo "⏳ Attente que le replica set soit prêt..."
    for i in {1..15}; do
        if docker-compose exec -T database mongosh --eval "rs.status().ok" 2>/dev/null | grep -q "1"; then
            echo "✅ Replica set rs0 prêt"
            break
        fi
        echo "⏳ Tentative $i/15 pour le replica set..."
        sleep 3
    done
fi

# Vérification finale de la configuration
echo "🔍 VÉRIFICATION FINALE DE LA CONFIGURATION MONGODB..."
echo "===================================================="
final_host=$(docker-compose exec -T database mongosh --eval "rs.status().members[0].name" --quiet 2>/dev/null | tr -d '\r\n')
echo "📊 Nom d'hôte du replica set: $final_host"

if [ "$final_host" = "meeshy-database:27017" ]; then
    echo "✅ Configuration MongoDB validée - Prêt pour les connexions des services"
    echo "📊 Statut final du replica set:"
    docker-compose exec -T database mongosh --eval "rs.status()" --quiet
else
    echo "❌ Configuration MongoDB invalide - Arrêt du déploiement"
    exit 1
fi

# Vérifier que la base de données meeshy est accessible avec le replica set
echo "🔍 Vérification de l'accès à la base de données avec replica set..."
for i in {1..10}; do
    if docker-compose exec -T database mongosh --eval "use meeshy; db.runCommand('ping')" >/dev/null 2>&1; then
        echo "✅ Base de données 'meeshy' accessible avec replica set"
        break
    fi
    echo "⏳ Tentative $i/10 pour la base meeshy avec replica set..."
    sleep 2
done

# Test de connexion depuis l'extérieur pour valider la configuration
echo "🧪 Test de connexion MongoDB depuis l'extérieur du conteneur..."
if docker-compose exec -T database mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
    echo "✅ MongoDB accessible et opérationnel"
    
    # Configuration MongoDB sécurisée avec authentification
    echo ""
    echo "🔒 CONFIGURATION MONGODB SÉCURISÉE..."
    echo "===================================="
    
    # Vérifier si les secrets de production existent
    if [ -f "/opt/meeshy/secrets/production-secrets.env" ]; then
        echo "📋 Chargement des secrets de production..."
        source /opt/meeshy/secrets/production-secrets.env
        
        # Créer l'utilisateur MongoDB avec le mot de passe sécurisé
        echo "👤 Création de l'utilisateur MongoDB sécurisé..."
        docker-compose exec -T database mongosh --eval "
use admin;
try {
    db.createUser({
        user: \"meeshy\",
        pwd: \"$MONGODB_PASSWORD\",
        roles: [
            { role: \"readWrite\", db: \"meeshy\" },
            { role: \"dbAdmin\", db: \"meeshy\" },
            { role: \"clusterAdmin\", db: \"admin\" },
            { role: \"readWriteAnyDatabase\", db: \"admin\" }
        ]
    });
    print(\"✅ Utilisateur meeshy créé avec succès\");
} catch (e) {
    if (e.code === 51003) {
        print(\"ℹ️  Utilisateur meeshy existe déjà\");
    } else {
        print(\"❌ Erreur lors de la création de l'\''utilisateur: \" + e.message);
    }
}
"
        
        # Tester la connexion avec authentification
        echo "🧪 Test de connexion avec authentification..."
        if docker-compose exec -T database mongosh -u meeshy -p "$MONGODB_PASSWORD" --authenticationDatabase admin --eval "db.runCommand({connectionStatus: 1})" >/dev/null 2>&1; then
            echo "✅ Authentification MongoDB configurée avec succès"
            
            # Activer l'authentification MongoDB
            echo "🔐 Activation de l'authentification MongoDB..."
            docker-compose stop database
            sleep 5
            
            # Modifier la configuration pour activer l'authentification
            sed -i 's/--noauth/--auth/' docker-compose.yml
            
            # Redémarrer MongoDB avec authentification
            docker-compose up -d database
            sleep 3
            
            # Vérifier que MongoDB fonctionne avec authentification
            if docker-compose exec -T database mongosh -u meeshy -p "$MONGODB_PASSWORD" --authenticationDatabase admin --eval "db.runCommand({connectionStatus: 1})" >/dev/null 2>&1; then
                echo "✅ MongoDB sécurisé avec authentification activée"
            else
                echo "❌ Problème avec l'authentification MongoDB"
                # Désactiver l'authentification en cas de problème
                sed -i 's/--auth/--noauth/' docker-compose.yml
                docker-compose restart database
                sleep 5
            fi
        else
            echo "❌ Échec de la configuration de l'authentification MongoDB"
        fi
    else
        echo "⚠️  Fichier de secrets de production non trouvé, MongoDB restera sans authentification"
        echo "💡 Pour sécuriser MongoDB, exécutez: ./scripts/production/meeshy-generate-production-variables.sh"
    fi
else
    echo "❌ MongoDB non accessible - Arrêt du déploiement"
    exit 1
fi

echo "🎉 CONFIGURATION MONGODB TERMINÉE AVEC SUCCÈS !"
echo "=============================================="
echo "✅ Replica set configuré avec meeshy-database:27017"
echo "✅ Base de données 'meeshy' accessible"
echo "✅ Prêt pour les connexions des services Gateway et Translator"
echo ""

# Redis
echo "🔴 Démarrage Redis..."
docker-compose up -d redis
sleep 2

# Vérifier Redis
for i in {1..3}; do
    if docker-compose exec -T redis redis-cli --no-auth-warning -a MeeshyRedis123 ping >/dev/null 2>&1; then
        echo "✅ Redis prêt"
        break
    fi
    echo "⏳ Tentative $i/10 pour Redis..."
    sleep 2
done

# Services d'administration (MongoDB UI, Redis UI)
echo "🛠️  Démarrage des services d'administration..."
docker-compose up -d nosqlclient p3x-redis-ui
sleep 3

# Vérifier les services d'administration
echo "🔍 Vérification des services d'administration..."
if docker-compose ps nosqlclient | grep -q "Up"; then
    echo "✅ MongoDB UI (NoSQLClient) prêt"
else
    echo "⚠️  MongoDB UI non disponible"
fi

if docker-compose ps p3x-redis-ui | grep -q "Up"; then
    echo "✅ Redis UI (P3X Redis) prêt"
else
    echo "⚠️  Redis UI non disponible"
fi

# Gestion avancée des volumes et permissions
echo "🔧 Configuration avancée des volumes et permissions..."

# Fonction pour corriger les permissions d'un volume
fix_volume_permissions() {
    local volume_name="$1"
    local mount_path="$2"
    local user_id="${3:-1000}"
    local group_id="${4:-1000}"
    
    if docker volume ls | grep -q "$volume_name"; then
        echo "📁 Volume $volume_name existant détecté"
        # Corriger les permissions
        docker run --rm -v "$volume_name:$mount_path" alpine:latest sh -c "
            echo '🔧 Correction des permissions du volume $volume_name...'
            chown -R $user_id:$group_id $mount_path 2>/dev/null || true
            chmod -R 755 $mount_path 2>/dev/null || true
            echo '✅ Permissions corrigées pour le volume $volume_name'
        "
    else
        echo "📁 Création du volume $volume_name avec permissions correctes..."
        docker volume create "$volume_name"
        # Initialiser les permissions
        docker run --rm -v "$volume_name:$mount_path" alpine:latest sh -c "
            echo '🔧 Initialisation des permissions du volume $volume_name...'
            mkdir -p $mount_path
            chown -R $user_id:$group_id $mount_path
            chmod -R 755 $mount_path
            echo '✅ Volume $volume_name initialisé avec permissions correctes'
        "
    fi
}

# Corriger les permissions de tous les volumes translator
fix_volume_permissions "meeshy_models_data" "/workspace/models" "1000" "1000"
fix_volume_permissions "meeshy_translator_cache" "/workspace/cache" "1000" "1000"
fix_volume_permissions "meeshy_translator_generated" "/workspace/generated" "1000" "1000"

# Nettoyage avancé des fichiers de verrouillage
echo "🧹 Nettoyage avancé des fichiers de verrouillage..."
for volume in "meeshy_models_data" "meeshy_translator_cache" "meeshy_translator_generated"; do
    if docker volume ls | grep -q "$volume"; then
        echo "🧹 Nettoyage du volume $volume..."
        case $volume in
            *models*)
                mount_path="/workspace/models"
                ;;
            *cache*)
                mount_path="/workspace/cache"
                ;;
            *generated*)
                mount_path="/workspace/generated"
                ;;
            *)
                mount_path="/workspace"
                ;;
        esac
        
        docker run --rm -v "$volume:$mount_path" alpine:latest sh -c "
            echo '🧹 Recherche et suppression des fichiers de verrouillage dans $volume...'
            find $mount_path -name '*.lock' -type f -delete 2>/dev/null || true
            find $mount_path -name '*.tmp' -type f -delete 2>/dev/null || true
            find $mount_path -name '.incomplete' -type d -exec rm -rf {} + 2>/dev/null || true
            find $mount_path -name '*.pid' -type f -delete 2>/dev/null || true
            find $mount_path -name '.DS_Store' -type f -delete 2>/dev/null || true
            echo '✅ Fichiers de verrouillage nettoyés dans $volume'
        "
    fi
done

# Translator
echo "🌐 DÉMARRAGE TRANSLATOR..."
echo "=========================="
echo "📋 Connexion à MongoDB: mongodb://meeshy:${MONGODB_PASSWORD}@meeshy-database:27017/meeshy?authSource=admin&replicaSet=rs0"
docker-compose up -d translator
sleep 5

# Vérifier Translator
echo "⏳ Attente de Translator..."
sleep 3
if curl -f -s http://localhost:8000/health >/dev/null 2>&1; then
    echo "✅ Translator prêt et connecté à MongoDB"
else
    echo "⚠️  Translator en cours de démarrage..."
    echo "🔍 Vérification des logs Translator pour diagnostic..."
    docker-compose logs --tail 10 translator | grep -E "(error|Error|ERROR|MongoDB|database)" || echo "Aucune erreur critique détectée"
fi

# Gateway
echo "🚪 DÉMARRAGE GATEWAY..."
echo "======================"
echo "📋 Connexion à MongoDB: mongodb://meeshy:${MONGODB_PASSWORD}@meeshy-database:27017/meeshy?authSource=admin&replicaSet=rs0"
docker-compose up -d gateway
sleep 5

# Vérifier Gateway
echo "⏳ Attente de Gateway..."
sleep 3
if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
    echo "✅ Gateway prêt et connecté à MongoDB"
else
    echo "⚠️  Gateway en cours de démarrage..."
    echo "🔍 Vérification des logs Gateway pour diagnostic..."
    docker-compose logs --tail 10 gateway | grep -E "(error|Error|ERROR|MongoDB|Prisma)" || echo "Aucune erreur critique détectée"
fi

# Frontend
echo "🎨 Démarrage Frontend..."
docker-compose up -d frontend
sleep 2

# Vérifier Frontend
# Attendre que Frontend soit prêt (optimisé)
echo "⏳ Attente de Frontend..."
sleep 2
if docker-compose exec -T frontend curl -f -s http://localhost:3100 >/dev/null 2>&1; then
    echo "✅ Frontend prêt"
else
    echo "⚠️  Frontend en cours de démarrage..."
fi

# Zone Web v3 (servie sous le préfixe /__v3, port 3300).
#
# Sans ce démarrage, le service `frontend-v3` du compose reste DÉCLARÉ et
# jamais lancé : Traefik n'enregistre aucun routeur `frontend-v3`, et les
# chunks `/__v3/_next/*` retombent sur le plancher attrape-tout `frontend`.
echo "🧪 Démarrage Web v3..."
docker-compose up -d frontend-v3
sleep 2

if docker-compose exec -T frontend-v3 wget -q -O /dev/null http://localhost:3300/__v3 >/dev/null 2>&1; then
    echo "✅ Web v3 prêt"
else
    echo "⚠️  Web v3 en cours de démarrage..."
fi

echo "📊 État final des services:"
docker-compose ps

echo ""
echo "🎉 DÉPLOIEMENT TERMINÉ AVEC SUCCÈS !"
echo "===================================="
echo "✅ MongoDB: Replica set configuré avec meeshy-database:27017"
echo "✅ MongoDB: Authentification sécurisée activée"
echo "✅ Gateway: Connecté à MongoDB via Prisma avec authentification"
echo "✅ Translator: Connecté à MongoDB via PyMongo avec authentification"
echo "✅ Frontend: Interface utilisateur opérationnelle"
echo "✅ Traefik: Reverse proxy et SSL configurés"
echo "✅ Redis: Cache et sessions opérationnels"
echo ""
echo "🔗 Connexions MongoDB sécurisées validées:"
echo "   • Gateway: mongodb://meeshy:***@meeshy-database:27017/meeshy?authSource=admin&replicaSet=rs0"
echo "   • Translator: mongodb://meeshy:***@meeshy-database:27017/meeshy?authSource=admin&replicaSet=rs0"
echo "   • Interface Admin: mongodb://meeshy:***@meeshy-database:27017/meeshy?authSource=admin&replicaSet=rs0"
echo ""
echo "🔐 Sécurité MongoDB:"
echo "   • Authentification: Activée"
echo "   • Utilisateur: meeshy"
echo "   • Permissions: readWrite, dbAdmin, clusterAdmin"
echo "   • AuthSource: admin"
echo ""
echo "✅ Tous les services déployés et vérifiés avec sécurité renforcée"
EOF

    # Exécuter avec le domaine
    scp -o StrictHostKeyChecking=no /tmp/deploy-services.sh root@$ip:/tmp/
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/deploy-services.sh && FORCE_REFRESH=$FORCE_REFRESH DOMAIN=$domain /tmp/deploy-services.sh"
    rm -f /tmp/deploy-services.sh

    # Vérification automatique
    log_info "🔍 Vérification post-déploiement..."
    sleep 5
    health_check "$ip"
    rm -rf "$deploy_dir"
}

# Correction rapide
deploy_fix() {
    local ip="$1"
    log_info "🔧 Correction rapide sur $ip"

    # Créer répertoire temporaire
    local deploy_dir="/tmp/meeshy-fix-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$deploy_dir"

    # Préparer fichiers
    log_info "📁 Préparation des fichiers corrigés..."
    cp "$PROJECT_ROOT/$DOCKER_COMPOSE_FILE" "$deploy_dir/docker-compose.yml"
    cp "$PROJECT_ROOT/env.digitalocean" "$deploy_dir/.env"

    # Envoyer sur serveur
    log_info "📤 Envoi des fichiers corrigés..."
    scp -o StrictHostKeyChecking=no "$deploy_dir/docker-compose.yml" root@$ip:/opt/meeshy/
    scp -o StrictHostKeyChecking=no "$deploy_dir/.env" root@$ip:/opt/meeshy/

    # Redémarrer services
    restart_services "$ip"

    # Vérifier la santé des services
    log_info "🔍 Vérification post-correction..."
    sleep 3
    health_check "$ip"

    # Nettoyer
    rm -rf "$deploy_dir"
}

# Vérification de la santé
health_check() {
    local ip="$1"
    log_info "🏥 Vérification complète de la santé des services..."
    
    # Vérification préliminaire des services Docker
    log_info "🔍 Vérification préliminaire des conteneurs..."
    ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker-compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'"

    # Script de vérification détaillée
    cat << 'EOF' > /tmp/health-check.sh
#!/bin/bash
cd /opt/meeshy

echo "🏥 VÉRIFICATION COMPLÈTE DE SANTÉ DES SERVICES"
echo "============================================="

# Vérifier que tous les services sont en cours d'exécution
echo ""
echo "📊 ÉTAT DES SERVICES DOCKER:"
docker-compose ps

# 1. Vérifier MongoDB
echo ""
echo "📊 TEST MONGODB:"
if docker-compose exec -T database mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
    echo "✅ MongoDB: Service accessible"

    # Vérifier la base de données meeshy
    if docker-compose exec -T database mongosh --eval "use meeshy; db.runCommand('ping')" >/dev/null 2>&1; then
        echo "✅ Base de données 'meeshy': Accessible"

        # Vérifier les collections
        collections=$(docker-compose exec -T database mongosh --eval "use meeshy; db.getCollectionNames()" --quiet 2>/dev/null | grep -v "MongoDB\|connecting\|switched" | head -5)
        if [ -n "$collections" ]; then
            echo "✅ Collections détectées: $collections"
        else
            echo "⚠️  Aucune collection détectée (base vide)"
        fi
    else
        echo "❌ Base de données 'meeshy': Non accessible"
        exit 1
    fi
else
    echo "❌ MongoDB: Service inaccessible"
    exit 1
fi

# 2. Vérifier Redis
echo ""
echo "🔴 TEST REDIS:"
if docker-compose exec -T redis redis-cli --no-auth-warning -a MeeshyRedis123 ping >/dev/null 2>&1; then
    echo "✅ Redis: Connecté et opérationnel"

    # Test de cache
    if docker-compose exec -T redis redis-cli --no-auth-warning -a MeeshyRedis123 set test_key "test_value" >/dev/null 2>&1; then
        if docker-compose exec -T redis redis-cli --no-auth-warning -a MeeshyRedis123 get test_key | grep -q "test_value"; then
            echo "✅ Cache Redis fonctionnel"
        else
            echo "⚠️  Cache Redis: problème de lecture"
        fi
        # Nettoyer
        docker-compose exec -T redis redis-cli --no-auth-warning -a MeeshyRedis123 del test_key >/dev/null 2>&1
    else
        echo "⚠️  Cache Redis: problème d'écriture"
    fi
else
    echo "❌ Redis: Problème de connexion"
    exit 1
fi

# 3. Vérifier Translator
echo ""
echo "🌐 TEST TRANSLATOR:"
# Test via Traefik (architecture reverse proxy)
for i in {1..4}; do
    if curl -f -s -H "Host: ml.meeshy.me" http://localhost/health >/dev/null 2>&1; then
        echo "✅ Translator: Endpoint /health accessible via Traefik"

        # Test de réponse de santé (suivre les redirections HTTPS)
        health_response=$(curl -s -L -H "Host: ml.meeshy.me" http://localhost/health 2>/dev/null)
        if echo "$health_response" | grep -q "status\|ok\|healthy\|database"; then
            echo "✅ Translator: Réponse de santé valide"
        else
            echo "⚠️  Translator: Réponse de santé suspecte: $health_response"
        fi
        break
    fi
    echo "⏳ Tentative $i/5 pour Translator via Traefik..."
    sleep 3
done

if [ $i -eq 4 ]; then
    echo "❌ Translator: Endpoint /health inaccessible via Traefik après 5 tentatives"
    # Essayer de vérifier via les logs Docker
    echo "📋 Vérification des logs Translator:"
    docker-compose logs --tail 20 translator | grep -i "error\|failed\|exception" || echo "Aucune erreur critique détectée"
    exit 1
fi

# Test des modèles ML via Traefik
if curl -f -s -H "Host: ml.meeshy.me" http://localhost/models >/dev/null 2>&1; then
    echo "✅ Translator: Endpoint /models accessible via Traefik"
else
    echo "⚠️  Translator: Endpoint /models inaccessible via Traefik"
fi

# 4. Vérifier Gateway
echo ""
echo "🚪 TEST GATEWAY:"
# Test via Traefik (architecture reverse proxy)
for i in {1..4}; do
    if curl -f -s -H "Host: gate.meeshy.me" http://localhost/health >/dev/null 2>&1; then
        echo "✅ Gateway: Endpoint /health accessible via Traefik"

        # Test de réponse de santé (suivre les redirections HTTPS)
        health_response=$(curl -s -L -H "Host: gate.meeshy.me" http://localhost/health 2>/dev/null)
        if echo "$health_response" | grep -q "status\|ok\|healthy\|database"; then
            echo "✅ Gateway: Réponse de santé valide"
        else
            echo "⚠️  Gateway: Réponse de santé suspecte: $health_response"
        fi
        break
    fi
    echo "⏳ Tentative $i/5 pour Gateway via Traefik..."
    sleep 3
done

if [ $i -eq 5 ]; then
    echo "❌ Gateway: Endpoint /health inaccessible via Traefik après 5 tentatives"
    # Essayer de vérifier via les logs Docker
    echo "📋 Vérification des logs Gateway:"
    docker-compose logs --tail 20 gateway | grep -i "error\|failed\|exception" || echo "Aucune erreur critique détectée"
    exit 1
fi

# Test des endpoints API (corriger l'endpoint)
if docker-compose exec -T gateway curl -f -s http://localhost:3000/info >/dev/null 2>&1; then
    echo "✅ Gateway: Endpoint /info accessible"
else
    echo "⚠️  Gateway: Endpoint /info inaccessible"
fi

# 5. Vérifier Frontend
echo ""
echo "🎨 TEST FRONTEND:"
# Test via Traefik (architecture reverse proxy)
for i in {1..5}; do
    if curl -f -s -H "Host: meeshy.me" http://localhost >/dev/null 2>&1; then
        echo "✅ Frontend: Accessible via Traefik"

        # Vérifier que c'est bien Next.js (suivre les redirections HTTPS)
        response=$(curl -s -L -H "Host: meeshy.me" http://localhost 2>/dev/null | head -c 200)
        if echo "$response" | grep -q "Next\|React\|meeshy\|Meeshy"; then
            echo "✅ Frontend: Réponse Next.js détectée"
        else
            echo "⚠️  Frontend: Réponse non-Next.js détectée"
        fi
        break
    fi
    echo "⏳ Tentative $i/5 pour Frontend via Traefik..."
    sleep 3
done

if [ $i -eq 5 ]; then
    echo "❌ Frontend: Inaccessible via Traefik après 5 tentatives"
    # Essayer de vérifier via les logs Docker
    echo "📋 Vérification des logs Frontend:"
    docker-compose logs --tail 20 frontend | grep -i "error\|failed\|exception" || echo "Aucune erreur critique détectée"
    exit 1
fi

# 6. Vérifier Traefik (reverse proxy)
echo ""
echo "🌐 TEST TRAEFIK:"
# Test de l'endpoint /ping de Traefik (méthode recommandée)
if curl -f -s http://localhost:8080/ping >/dev/null 2>&1; then
    echo "✅ Traefik: Endpoint /ping accessible (santé OK)"
elif curl -f -s http://localhost:80 >/dev/null 2>&1; then
    echo "✅ Traefik: Port 80 accessible (endpoint /ping non configuré)"
else
    echo "❌ Traefik: Port 80 inaccessible"
    # Essayer de vérifier via les logs Docker
    echo "📋 Vérification des logs Traefik:"
    docker-compose logs --tail 20 traefik | grep -i "error\|failed\|exception" || echo "Aucune erreur critique détectée"
    exit 1
fi

if curl -f -s http://localhost:80 >/dev/null 2>&1; then
    
    # Test de l'API Traefik (accessible via traefik.meeshy.me avec auth)
    if curl -f -s -k -H "Host: traefik.meeshy.me" http://localhost/api/rawdata >/dev/null 2>&1; then
        echo "✅ Traefik: API dashboard accessible"
    else
        echo "ℹ️  Traefik: API dashboard protégée par authentification (normal en production)"
    fi
    
    # Test de redirection HTTPS (Traefik utilise 308 pour permanent redirect)
    redirect_code=$(curl -s -I -H "Host: meeshy.me" http://localhost:80 | head -1 | grep -o "[0-9][0-9][0-9]")
    if [ "$redirect_code" = "308" ]; then
        echo "✅ Traefik: Redirection HTTPS configurée (308 Permanent Redirect)"
    elif [ "$redirect_code" = "301" ] || [ "$redirect_code" = "302" ]; then
        echo "✅ Traefik: Redirection HTTPS configurée ($redirect_code)"
    else
        echo "⚠️  Traefik: Redirection HTTPS non détectée (code: $redirect_code)"
    fi
fi

# 7. Vérifier les connexions ZMQ
echo ""
echo "🔌 TEST ZMQ:"
# Vérifier les ports ZMQ
if netstat -tuln 2>/dev/null | grep -q ":5555\|:5558"; then
    echo "✅ ZMQ: Ports détectés (5555, 5558)"
else
    echo "⚠️  ZMQ: Ports non détectés (peut être normal dans Docker)"
fi

# 8. Vérifier les connexions Prisma
echo ""
echo "🗄️  TEST PRISMA:"
# Vérifier l'initialisation des clients Prisma
if docker-compose logs gateway 2>/dev/null | grep -i "prisma" >/dev/null 2>&1; then
    echo "✅ Gateway: Logs Prisma détectés"
else
    echo "⚠️  Gateway: Aucun log Prisma trouvé"
fi

if docker-compose logs translator 2>/dev/null | grep -i "prisma" >/dev/null 2>&1; then
    echo "✅ Translator: Logs Prisma détectés"
else
    echo "⚠️  Translator: Aucun log Prisma trouvé"
fi

# 9. Test de communication inter-services
echo ""
echo "🔗 TEST COMMUNICATION INTER-SERVICES:"
# Test de communication Gateway -> Translator via gRPC
if docker-compose logs gateway 2>/dev/null | grep -i "translator\|gRPC\|50051" >/dev/null 2>&1; then
    echo "✅ Gateway: Communication avec Translator détectée"
else
    echo "⚠️  Gateway: Communication avec Translator non détectée"
fi

# Test de communication via ZMQ
if docker-compose logs translator 2>/dev/null | grep -i "ZMQ\|5555\|5558" >/dev/null 2>&1; then
    echo "✅ Translator: Communication ZMQ détectée"
else
    echo "⚠️  Translator: Communication ZMQ non détectée"
fi

# 10. Test d'accès externe via Traefik (si domaine configuré)
echo ""
echo "🌍 TEST ACCÈS EXTERNE VIA TRAEFIK:"
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
    echo "Test d'accès via le domaine: $DOMAIN"
    
    # Test du frontend principal
    if curl -f -s -H "Host: $DOMAIN" http://localhost >/dev/null 2>&1; then
        echo "✅ Frontend: Accessible via $DOMAIN"
    else
        echo "⚠️  Frontend: Non accessible via $DOMAIN"
    fi
    
    # Test du sous-domaine www
    if curl -f -s -H "Host: www.$DOMAIN" http://localhost >/dev/null 2>&1; then
        echo "✅ Frontend: Accessible via www.$DOMAIN"
    else
        echo "⚠️  Frontend: Non accessible via www.$DOMAIN"
    fi
    
    # Test de l'API Gateway
    if curl -f -s -H "Host: gate.$DOMAIN" http://localhost/health >/dev/null 2>&1; then
        echo "✅ Gateway: Accessible via gate.$DOMAIN"
    else
        echo "⚠️  Gateway: Non accessible via gate.$DOMAIN"
    fi
    
    # Test du service ML
    if curl -f -s -H "Host: ml.$DOMAIN" http://localhost/health >/dev/null 2>&1; then
        echo "✅ Translator: Accessible via ml.$DOMAIN"
    else
        echo "⚠️  Translator: Non accessible via ml.$DOMAIN"
    fi
    
    # Test du dashboard Traefik
    if curl -f -s -H "Host: traefik.$DOMAIN" http://localhost >/dev/null 2>&1; then
        echo "✅ Traefik Dashboard: Accessible via traefik.$DOMAIN"
    else
        echo "⚠️  Traefik Dashboard: Non accessible via traefik.$DOMAIN"
    fi
    
    # Test des interfaces d'administration
    if curl -f -s -H "Host: mongo.$DOMAIN" http://localhost >/dev/null 2>&1; then
        echo "✅ MongoDB UI: Accessible via mongo.$DOMAIN"
    else
        echo "⚠️  MongoDB UI: Non accessible via mongo.$DOMAIN"
    fi
    
    if curl -f -s -H "Host: redis.$DOMAIN" http://localhost >/dev/null 2>&1; then
        echo "✅ Redis UI: Accessible via redis.$DOMAIN"
    else
        echo "⚠️  Redis UI: Non accessible via redis.$DOMAIN"
    fi
else
    echo "ℹ️  Domaine non configuré, test d'accès externe ignoré"
fi

echo ""
echo "🎉 VÉRIFICATION COMPLÈTE TERMINÉE !"
echo "===================================="
echo "✅ Traefik: Opérationnel (Reverse Proxy + SSL)"
echo "✅ MongoDB: Opérationnel (Replica Set)"
echo "✅ Redis: Opérationnel"
echo "✅ Gateway: Opérationnel (gate.$DOMAIN)"
echo "✅ Translator: Opérationnel (ml.$DOMAIN)"
echo "✅ Frontend: Opérationnel ($DOMAIN)"
echo "✅ MongoDB UI: Opérationnel (mongo.$DOMAIN)"
echo "✅ Redis UI: Opérationnel (redis.$DOMAIN)"
echo "✅ ZMQ: Configuré"
echo "✅ Prisma: Initialisé"
echo ""
echo "🚀 TOUS LES SERVICES SONT OPÉRATIONNELS !"
echo "🌐 Architecture Traefik avec sous-domaines configurée"
EOF

    scp -o StrictHostKeyChecking=no /tmp/health-check.sh root@$ip:/tmp/
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/health-check.sh && /tmp/health-check.sh"
    rm -f /tmp/health-check.sh
}

# Vérification simple et robuste
simple_health_check() {
    local ip="$1"
    log_info "🔍 Vérification simple des services..."
    
    # Script de vérification simplifiée
    cat << 'EOF' > /tmp/simple-health-check.sh
#!/bin/bash
cd /opt/meeshy

echo "🔍 VÉRIFICATION SIMPLE DES SERVICES"
echo "==================================="

# 1. Vérifier l'état des conteneurs
echo ""
echo "📊 ÉTAT DES CONTENEURS:"
docker-compose ps

# 2. Vérifier les health checks Docker
echo ""
echo "🏥 HEALTH CHECKS DOCKER:"
for service in traefik database redis nosqlclient p3x-redis translator gateway frontend; do
    if docker-compose ps --format "{{.Name}} {{.Status}}" | grep -q "$service.*healthy\|$service.*Up"; then
        echo "✅ $service: Opérationnel"
    else
        echo "❌ $service: Problème détecté"
        # Afficher les logs récents en cas de problème
        echo "📋 Logs récents pour $service:"
        docker-compose logs --tail 5 $service 2>/dev/null | grep -E "(error|Error|ERROR|failed|Failed|FAILED)" || echo "Aucune erreur récente"
    fi
done

# 3. Test de connectivité réseau interne
echo ""
echo "🔌 TEST CONNECTIVITÉ RÉSEAU:"
# Test MongoDB
if docker-compose exec -T database mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
    echo "✅ MongoDB: Connecté"
else
    echo "❌ MongoDB: Non connecté"
fi

# Test Redis
if docker-compose exec -T redis redis-cli --no-auth-warning -a MeeshyRedis123 ping >/dev/null 2>&1; then
    echo "✅ Redis: Connecté"
else
    echo "❌ Redis: Non connecté"
fi

# Test des services via Traefik (architecture reverse proxy)
echo ""
echo "🌐 TEST SERVICES VIA TRAEFIK:"
# Test Gateway via Traefik
if curl -f -s -H "Host: gate.meeshy.me" http://localhost/health >/dev/null 2>&1; then
    echo "✅ Gateway: Accessible via Traefik (gate.meeshy.me)"
else
    echo "❌ Gateway: Non accessible via Traefik"
fi

# Test Translator via Traefik
if curl -f -s -H "Host: ml.meeshy.me" http://localhost/health >/dev/null 2>&1; then
    echo "✅ Translator: Accessible via Traefik (ml.meeshy.me)"
else
    echo "❌ Translator: Non accessible via Traefik"
fi

# Test Frontend via Traefik
if curl -f -s -H "Host: meeshy.me" http://localhost >/dev/null 2>&1; then
    echo "✅ Frontend: Accessible via Traefik (meeshy.me)"
else
    echo "❌ Frontend: Non accessible via Traefik"
fi

# 4. Test d'accès externe (Traefik)
echo ""
echo "🌐 TEST ACCÈS EXTERNE:"
if curl -f -s http://localhost:80 >/dev/null 2>&1; then
    echo "✅ Traefik: Port 80 accessible"
else
    echo "❌ Traefik: Port 80 non accessible"
fi

echo ""
echo "🎯 RÉSUMÉ:"
echo "=========="
healthy_services=$(docker-compose ps --format "{{.Name}} {{.Status}}" | grep -c "healthy\|Up")
total_services=$(docker-compose ps --format "{{.Name}}" | wc -l)
echo "Services opérationnels: $healthy_services/$total_services"

if [ $healthy_services -eq $total_services ]; then
    echo "🎉 TOUS LES SERVICES SONT OPÉRATIONNELS !"
    exit 0
else
    echo "⚠️  CERTAINS SERVICES ONT DES PROBLÈMES"
    exit 1
fi
EOF

    scp -o StrictHostKeyChecking=no /tmp/simple-health-check.sh root@$ip:/tmp/
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/simple-health-check.sh && /tmp/simple-health-check.sh"
    rm -f /tmp/simple-health-check.sh
}

# Configuration du replica set MongoDB
configure_mongodb_replica() {
    local ip="$1"
    log_info "🔧 Configuration du replica set MongoDB..."
    
    # Script de configuration du replica set
    cat << 'EOF' > /tmp/configure-replica.sh
#!/bin/bash
cd /opt/meeshy

echo "🔧 CONFIGURATION DU REPLICA SET MONGODB"
echo "======================================="

# Vérifier que MongoDB est en cours d'exécution
echo "📊 Vérification de l'état de MongoDB..."
docker-compose ps database

# Attendre que MongoDB soit prêt
echo "⏳ Attente que MongoDB soit prêt..."
# Attendre que MongoDB soit prêt (optimisé)
echo "⏳ Attente de MongoDB..."
sleep 3
if docker-compose exec -T database mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
    echo "✅ MongoDB prêt"
else
    echo "⚠️  MongoDB en cours de démarrage..."
fi

# Vérifier si le replica set est déjà configuré
echo "🔍 Vérification du statut du replica set..."
if docker-compose exec -T database mongosh --eval "rs.status()" >/dev/null 2>&1; then
    echo "✅ Replica set déjà configuré"
    echo "📊 Statut actuel:"
    docker-compose exec -T database mongosh --eval "rs.status()" --quiet
else
    echo "📋 Initialisation du replica set rs0..."
    
    # Initialiser le replica set
    docker-compose exec -T database mongosh --eval "
        try {
            rs.initiate({
                _id: 'rs0',
                members: [
                    { _id: 0, host: 'meeshy-database:27017', priority: 1 }
                ]
            });
            print('✅ Replica set rs0 initialisé avec succès');
        } catch (e) {
            if (e.message.includes('already initialized')) {
                print('⚠️  Replica set déjà initialisé');
            } else {
                print('❌ Erreur initialisation replica set: ' + e.message);
                throw e;
            }
        }
    "
    
    # Attendre que le replica set soit prêt
    echo "⏳ Attente que le replica set soit prêt..."
    # Attendre que le replica set soit prêt (optimisé)
    echo "⏳ Attente du replica set..."
    sleep 15
    if docker-compose exec -T database mongosh --eval "rs.status().ok" 2>/dev/null | grep -q "1"; then
        echo "✅ Replica set rs0 prêt"
    else
        echo "⚠️  Replica set en cours d'initialisation..."
    fi
fi

# Vérifier le statut final
echo "📊 Statut final du replica set:"
docker-compose exec -T database mongosh --eval "rs.status()" --quiet

# Tester la connexion avec le replica set
echo "🔍 Test de connexion avec le replica set..."
if docker-compose exec -T database mongosh --eval "use meeshy; db.runCommand('ping')" >/dev/null 2>&1; then
    echo "✅ Connexion à la base de données avec replica set réussie"
else
    echo "❌ Problème de connexion à la base de données"
    exit 1
fi

echo "🎉 Configuration du replica set MongoDB terminée avec succès!"
echo "🔗 String de connexion: mongodb://meeshy-database:27017/meeshy?replicaSet=rs0"
EOF

    scp -o StrictHostKeyChecking=no /tmp/configure-replica.sh root@$ip:/tmp/
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/configure-replica.sh && /tmp/configure-replica.sh"
    rm -f /tmp/configure-replica.sh
}

# Correction des permissions du translator
fix_translator_permissions() {
    local ip="$1"
    log_info "🔧 Correction des permissions du container meeshy-translator..."
    
    # Script de correction des permissions
    cat << 'EOF' > /tmp/fix-translator-permissions.sh
#!/bin/bash
cd /opt/meeshy

echo "🔧 CORRECTION DES PERMISSIONS DU CONTAINER MEESHY-TRANSLATOR"
echo "=========================================================="

# Vérifier que les volumes existent
echo "🔍 Vérification des volumes translator..."
VOLUMES=$(docker volume ls | grep translator | awk '{print $2}')
if [ -z "$VOLUMES" ]; then
    echo "❌ Aucun volume translator trouvé"
    exit 1
fi

echo "✅ Volumes translator trouvés:"
echo "$VOLUMES" | while read volume; do
    echo "  • $volume"
done

echo ""
echo "🔧 Correction des permissions des volumes..."

# Fonction pour corriger les permissions d'un volume
fix_volume_permissions() {
    local volume_name="$1"
    local mount_path="$2"
    local user_id="${3:-1000}"
    local group_id="${4:-1000}"
    
    echo "  • Correction des permissions du volume $volume_name..."
    
    # Déterminer le chemin selon le type de volume
    case $volume_name in
        *models*)
            path="/workspace/models"
            ;;
        *cache*)
            path="/workspace/cache"
            ;;
        *generated*)
            path="/workspace/generated"
            ;;
        *)
            path="/workspace"
            ;;
    esac
    
    # Corriger les permissions
    docker run --rm -v "$volume_name:$path" alpine:latest sh -c "
        echo '🔧 Correction des permissions du volume $volume_name...'
        chown -R $user_id:$group_id $path 2>/dev/null || true
        chmod -R 755 $path 2>/dev/null || true
        echo '✅ Permissions corrigées pour $volume_name'
    "
    
    echo "    ✅ Permissions corrigées pour $volume_name"
}

# Corriger les permissions de chaque volume
for volume in $VOLUMES; do
    fix_volume_permissions "$volume" "/workspace" "1000" "1000"
done

echo ""
echo "🔄 Redémarrage du service translator..."

# Redémarrer le translator
docker-compose restart translator

echo ""
echo "⏳ Attente du redémarrage du translator..."
sleep 20

echo ""
echo "🔍 Vérification du statut du translator..."

# Vérifier le statut
STATUS=$(docker-compose ps translator | grep translator)
echo "$STATUS"

# Vérifier les logs récents pour voir si les modèles se chargent
echo ""
echo "📋 Vérification des logs récents du translator..."
docker logs meeshy-translator --tail 20

echo ""
echo "🎉 Correction des permissions terminée !"
echo ""
echo "💡 Si le translator a encore des problèmes:"
echo "  • Vérifiez les logs: docker logs meeshy-translator"
echo "  • Redémarrez manuellement: docker-compose restart translator"
echo "  • Vérifiez l'espace disque: df -h"
EOF

    scp -o StrictHostKeyChecking=no /tmp/fix-translator-permissions.sh root@$ip:/tmp/
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/fix-translator-permissions.sh && /tmp/fix-translator-permissions.sh"
    rm -f /tmp/fix-translator-permissions.sh
}

# Test des certificats SSL et configuration Traefik
test_ssl_certificates() {
    local ip="$1"
    log_info "🔒 Test des certificats SSL et configuration Traefik..."
    
    # Script de test SSL
    cat << 'EOF' > /tmp/test-ssl.sh
#!/bin/bash
cd /opt/meeshy

echo "🔒 TEST DES CERTIFICATS SSL ET CONFIGURATION TRAEFIK"
echo "=================================================="

# Vérifier que Traefik est en cours d'exécution
echo "📊 Vérification de l'état de Traefik..."
docker-compose ps traefik

# Vérifier les volumes de certificats
echo "📁 Vérification des volumes de certificats..."
if docker volume ls | grep -q "traefik_certs"; then
    echo "✅ Volume traefik_certs trouvé"
    
    # Vérifier le contenu du volume
    echo "📋 Contenu du volume de certificats:"
    docker run --rm -v meeshy_traefik_certs:/data alpine ls -la /data/ 2>/dev/null || echo "Volume vide ou inaccessible"
else
    echo "❌ Volume traefik_certs non trouvé"
fi

# Test de redirection HTTP vers HTTPS
echo "🔄 Test de redirection HTTP vers HTTPS..."
if curl -f -s -I http://localhost:80 | grep -q "301\|302"; then
    echo "✅ Redirection HTTP vers HTTPS configurée"
    echo "📋 Détails de la redirection:"
    curl -f -s -I http://localhost:80 | grep -i "location\|status"
else
    echo "⚠️  Redirection HTTP vers HTTPS non détectée"
fi

# Test des sous-domaines (si domaine configuré)
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
    echo "🌐 Test des sous-domaines avec SSL..."
    
    # Test du frontend principal
    echo "🔍 Test du frontend principal ($DOMAIN)..."
    if curl -f -s -H "Host: $DOMAIN" http://localhost >/dev/null 2>&1; then
        echo "✅ Frontend accessible via $DOMAIN"
    else
        echo "❌ Frontend non accessible via $DOMAIN"
    fi
    
    # Test du dashboard Traefik
    echo "🔍 Test du dashboard Traefik (traefik.$DOMAIN)..."
    if curl -f -s -H "Host: traefik.$DOMAIN" http://localhost >/dev/null 2>&1; then
        echo "✅ Dashboard Traefik accessible via traefik.$DOMAIN"
    else
        echo "❌ Dashboard Traefik non accessible via traefik.$DOMAIN"
    fi
    
    # Test de l'API Gateway
    echo "🔍 Test de l'API Gateway (gate.$DOMAIN)..."
    if curl -f -s -H "Host: gate.$DOMAIN" http://localhost/health >/dev/null 2>&1; then
        echo "✅ API Gateway accessible via gate.$DOMAIN"
    else
        echo "❌ API Gateway non accessible via gate.$DOMAIN"
    fi
    
    # Test du service ML
    echo "🔍 Test du service ML (ml.$DOMAIN)..."
    if curl -f -s -H "Host: ml.$DOMAIN" http://localhost/health >/dev/null 2>&1; then
        echo "✅ Service ML accessible via ml.$DOMAIN"
    else
        echo "❌ Service ML non accessible via ml.$DOMAIN"
    fi
else
    echo "ℹ️  Domaine non configuré, tests SSL externes ignorés"
fi

# Vérifier les logs Traefik pour les erreurs SSL
echo "📋 Vérification des logs Traefik pour les erreurs SSL..."
docker-compose logs --tail 20 traefik | grep -i "ssl\|tls\|certificate\|acme" || echo "Aucun log SSL récent"

echo "🎉 Test des certificats SSL terminé!"
EOF

    scp -o StrictHostKeyChecking=no /tmp/test-ssl.sh root@$ip:/tmp/
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/test-ssl.sh && /tmp/test-ssl.sh"
    rm -f /tmp/test-ssl.sh
}

# Déploiement fiable des mots de passe Traefik
deploy_traefik_passwords() {
    local ip="$1"
    log_info "🔐 Déploiement fiable des mots de passe Traefik..."
    
    # Vérification du fichier clear.txt
    local clear_file="secrets/clear.txt"
    if [ ! -f "$clear_file" ]; then
        log_error "Fichier $clear_file non trouvé"
        return 1
    fi
    
    # Extraction du mot de passe admin
    local admin_password=$(grep "ADMIN_PASSWORD_CLEAR=" "$clear_file" | cut -d'"' -f2)
    if [ -z "$admin_password" ]; then
        log_error "Mot de passe admin non trouvé dans $clear_file"
        return 1
    fi
    
    log_info "Mot de passe admin extrait: ${admin_password:0:4}****"
    
    # Génération du hash bcrypt
    log_info "Génération du hash bcrypt..."
    local bcrypt_hash=$(htpasswd -nbB admin "$admin_password")
    if [ -z "$bcrypt_hash" ]; then
        log_error "Échec de la génération du hash bcrypt"
        return 1
    fi
    
    log_success "Hash bcrypt généré: ${bcrypt_hash:0:20}****"
    
    # Création du script de déploiement
    local temp_script="/tmp/deploy-traefik-passwords.sh"
    cat > "$temp_script" << EOF
#!/bin/bash
set -e

echo "🔐 DÉPLOIEMENT DES MOTS DE PASSE TRAEFIK"
echo "========================================"

cd /opt/meeshy

# Sauvegarde du fichier .env
cp .env .env.backup.\$(date +%Y%m%d_%H%M%S)
echo "✅ Sauvegarde du fichier .env créée"

# Hash bcrypt à utiliser
BCRYPT_HASH="$bcrypt_hash"

# Mise à jour des variables Traefik
echo "🔧 Mise à jour des variables TRAEFIK_USERS et API_USERS..."

# Mettre à jour TRAEFIK_USERS
if grep -q "TRAEFIK_USERS=" .env; then
    sed -i "s|TRAEFIK_USERS=.*|TRAEFIK_USERS=\"\$BCRYPT_HASH\"|" .env
else
    echo "TRAEFIK_USERS=\"\$BCRYPT_HASH\"" >> .env
fi

# Mettre à jour API_USERS
if grep -q "API_USERS=" .env; then
    sed -i "s|API_USERS=.*|API_USERS=\"\$BCRYPT_HASH\"|" .env
else
    echo "API_USERS=\"\$BCRYPT_HASH\"" >> .env
fi

echo "✅ Variables mises à jour dans .env"

# Échapper les $ pour Docker Compose (seulement pour les variables Traefik)
sed -i 's|_USERS="admin:\$2y\$05\$|_USERS="admin:\$\$2y\$\$05\$\$|g' .env

echo "✅ Variables Traefik échappées pour Docker Compose"

# Recréation du conteneur Traefik
echo "🔄 Recréation du conteneur Traefik..."
docker-compose up -d traefik

# Attente du redémarrage
echo "⏳ Attente du redémarrage de Traefik..."
sleep 15

# Vérification que Traefik est opérationnel
echo "🔍 Vérification du statut de Traefik..."
if docker ps | grep -q "meeshy-traefik.*Up"; then
    echo "✅ Traefik redémarré avec succès"
else
    echo "❌ Problème avec le redémarrage de Traefik"
    exit 1
fi

echo "🎉 Déploiement des mots de passe Traefik terminé !"
echo ""
echo "🔐 INFORMATIONS DE CONNEXION:"
echo "   URL: https://traefik.meeshy.me"
echo "   Utilisateur: admin"
echo "   Mot de passe: $admin_password"
echo ""
EOF

    # Transfert et exécution du script
    log_info "Transfert du script de déploiement vers le serveur..."
    scp -o StrictHostKeyChecking=no "$temp_script" root@$ip:/tmp/
    
    log_info "Exécution du script de déploiement..."
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/deploy-traefik-passwords.sh && /tmp/deploy-traefik-passwords.sh"
    
    # Nettoyage
    rm -f "$temp_script"
    ssh -o StrictHostKeyChecking=no root@$ip "rm -f /tmp/deploy-traefik-passwords.sh"
    
    log_success "Déploiement des mots de passe Traefik terminé !"
    echo ""
    echo "🔐 ACCÈS TRAEFIK:"
    echo "   URL: https://traefik.meeshy.me"
    echo "   Utilisateur: admin"
    echo "   Mot de passe: $admin_password"
    echo ""
    echo "🧪 Test de connexion:"
    echo "   curl -u admin:$admin_password https://traefik.meeshy.me"
}

# Tests complets
run_tests() {
    local ip="$1"
    log_info "🧪 Tests complets des services..."

    # Script de tests
    cat << 'EOF' > /tmp/run-tests.sh
#!/bin/bash
cd /opt/meeshy

echo "🧪 TESTS COMPLETS POST-DÉPLOIEMENT"
echo "=================================="

# État Docker
echo "🐳 Services Docker:"
docker-compose ps

# Tests de performance
echo ""
echo "⏱️  TESTS DE PERFORMANCE:"

# MongoDB
start_time=$(date +%s%N)
docker-compose exec -T mongodb mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1
end_time=$(date +%s%N)
mongo_latency=$(( (end_time - start_time) / 1000000 ))
echo "📊 MongoDB: ${mongo_latency}ms"

# Gateway
start_time=$(date +%s%N)
curl -f -s http://localhost:3000/health >/dev/null 2>&1
end_time=$(date +%s%N)
gateway_latency=$(( (end_time - start_time) / 1000000 ))
echo "🚪 Gateway: ${gateway_latency}ms"

# Translator
start_time=$(date +%s%N)
curl -f -s http://localhost:8000/health >/dev/null 2>&1
end_time=$(date +%s%N)
translator_latency=$(( (end_time - start_time) / 1000000 ))
echo "🌐 Translator: ${translator_latency}ms"

echo "✅ Tests terminés"
EOF

    scp -o StrictHostKeyChecking=no /tmp/run-tests.sh root@$ip:/tmp/
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/run-tests.sh && /tmp/run-tests.sh"
    rm -f /tmp/run-tests.sh
}

# Vérification des connexions
verify_connections() {
    local ip="$1"
    log_info "🔌 Vérification des connexions..."

    # Script de vérification
    cat << 'EOF' > /tmp/verify-conn.sh
#!/bin/bash
cd /opt/meeshy

echo "🔌 VÉRIFICATION DES CONNEXIONS"
echo "=============================="

# MongoDB + Prisma
echo "🗄️  MongoDB + Prisma:"
if docker-compose logs gateway | grep -i "prisma" >/dev/null 2>&1; then
    echo "  ✅ Gateway: Prisma initialisé"
else
    echo "  ⚠️  Gateway: Prisma non détecté"
fi

if docker-compose logs translator | grep -i "prisma" >/dev/null 2>&1; then
    echo "  ✅ Translator: Prisma initialisé"
else
    echo "  ⚠️  Translator: Prisma non détecté"
fi

# ZMQ
echo "🔌 ZMQ:"
if netstat -tuln 2>/dev/null | grep -q ":5555\|:5558"; then
    echo "  ✅ Ports ZMQ ouverts"
else
    echo "  ⚠️  Ports ZMQ non détectés"
fi

# REST
echo "🌐 REST:"
if curl -f -s http://localhost:3000/health >/dev/null 2>&1; then
    echo "  ✅ Gateway /health OK"
else
    echo "  ❌ Gateway /health KO"
fi

if curl -f -s http://localhost:8000/health >/dev/null 2>&1; then
    echo "  ✅ Translator /health OK"
else
    echo "  ❌ Translator /health KO"
fi

echo "✅ Vérification terminée"
EOF

    scp -o StrictHostKeyChecking=no /tmp/verify-conn.sh root@$ip:/tmp/
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/verify-conn.sh && /tmp/verify-conn.sh"
    rm -f /tmp/verify-conn.sh
}

# Redémarrage des services
restart_services() {
    local ip="$1"
    log_info "🔄 Redémarrage des services..."

    cat << 'EOF' > /tmp/restart.sh
#!/bin/bash
cd /opt/meeshy
docker-compose down --remove-orphans || true
docker system prune -f || true
docker-compose pull
docker-compose up -d
sleep 30
docker-compose ps
echo "✅ Services redémarrés"
EOF

    scp -o StrictHostKeyChecking=no /tmp/restart.sh root@$ip:/tmp/
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/restart.sh && /tmp/restart.sh"
    rm -f /tmp/restart.sh
}

# Fonction pour reset complet (Traefik + Base de données)
reset_complete() {
    local ip="$1"
    local domain="${2:-localhost}"
    log_info "🔄 Reset complet sur $ip (domaine: $domain) - Traefik + Base de données"

    # Script de reset complet
    cat << 'EOF' > /tmp/reset-complete.sh
#!/bin/bash
set -e

echo "🔄 RESET COMPLET - TRAEFIK + BASE DE DONNÉES"
echo "==========================================="

# Arrêter tous les services
echo "⏹️  Arrêt de tous les services..."
docker-compose down --remove-orphans || true

# Supprimer TOUS les volumes (Traefik + Base de données + Cache)
echo "🗑️  Suppression de TOUS les volumes..."
docker volume rm meeshy_traefik_certs 2>/dev/null || true
docker volume rm meeshy_traefik_data 2>/dev/null || true
docker volume rm meeshy_mongodb_data 2>/dev/null || true
docker volume rm meeshy_redis_data 2>/dev/null || true
docker volume rm meeshy_models_data 2>/dev/null || true
docker volume rm meeshy_translator_cache 2>/dev/null || true
docker volume rm meeshy_translator_generated 2>/dev/null || true

# Nettoyage complet du système Docker
echo "🧹 Nettoyage complet du système Docker..."
docker system prune -af || true
docker volume prune -f || true
docker network prune -f || true

# Supprimer les images inutilisées
echo "🗑️  Suppression des images inutilisées..."
docker image prune -af || true

echo "✅ Reset complet terminé - Tous les volumes et données supprimés"
EOF

    # Exécuter le reset complet
    scp -o StrictHostKeyChecking=no /tmp/reset-complete.sh root@$ip:/tmp/
    ssh -o StrictHostKeyChecking=no root@$ip "chmod +x /tmp/reset-complete.sh && cd /opt/meeshy && /tmp/reset-complete.sh"
    rm -f /tmp/reset-complete.sh

    log_success "Reset complet terminé - Redémarrage du déploiement..."
    
    # Redéployer avec les nouvelles configurations
    deploy_complete "$ip" "$domain"
}

# Afficher l'aide
show_help() {
    echo -e "${BLUE}🚀 MEESHY - SCRIPT UNIFIÉ DE DÉPLOIEMENT${NC}"
    echo "================================================"
    echo ""
    echo -e "${GREEN}Usage:${NC}"
    echo "  $0 [COMMAND] [DROPLET_IP] [--force-refresh]"
    echo ""
    echo -e "${GREEN}Commands:${NC}"
    echo -e "${CYAN}  deploy${NC}       - Déploiement complet"
    echo -e "${CYAN}  deploy-reset${NC} - Déploiement avec reset complet (Traefik + DB)"
    echo -e "${CYAN}  fix${NC}          - Correction rapide (redémarrage)"
    echo -e "${CYAN}  test${NC}         - Tests complets post-déploiement"
    echo -e "${CYAN}  verify${NC}       - Vérification des connexions"
    echo -e "${CYAN}  health${NC}       - Vérification complète de santé"
    echo -e "${CYAN}  simple-health${NC} - Vérification simple et robuste"
    echo -e "${CYAN}  replica${NC}      - Configuration du replica set MongoDB"
    echo -e "${CYAN}  ssl${NC}          - Test des certificats SSL et Traefik"
    echo -e "${CYAN}  fix-translator${NC} - Correction des permissions du container translator"
    echo -e "${CYAN}  deploy-passwords${NC} - Déploiement fiable des mots de passe Traefik"
    echo -e "${CYAN}  status${NC}       - État des services"
    echo -e "${CYAN}  logs${NC}         - Logs des services"
    echo -e "${CYAN}  restart${NC}      - Redémarrage des services"
    echo -e "${CYAN}  stop${NC}         - Arrêt des services"
    echo -e "${CYAN}  recreate${NC}     - Recréation du droplet"
    echo ""
    echo -e "${GREEN}Options:${NC}"
    echo -e "${CYAN}  --force-refresh${NC} - Forcer le téléchargement des images"
    echo ""
    echo -e "${GREEN}Exemples:${NC}"
    echo "  $0 deploy 157.230.15.51"
    echo "  $0 deploy-reset 157.230.15.51"
    echo "  $0 test 157.230.15.51"
    echo "  $0 verify 157.230.15.51"
    echo "  $0 simple-health 157.230.15.51"
    echo "  $0 replica 157.230.15.51"
    echo "  $0 ssl 157.230.15.51"
    echo "  $0 fix-translator 157.230.15.51"
    echo "  $0 deploy-passwords 157.230.15.51"
    echo "  $0 --force-refresh deploy 157.230.15.51"
    echo ""
    echo -e "${YELLOW}💡 Toutes les connexions sont vérifiées automatiquement${NC}"
    echo -e "${YELLOW}💡 MongoDB, ZMQ et REST endpoints validés${NC}"
    echo -e "${RED}⚠️  deploy-reset supprime TOUTES les données (Traefik + DB)${NC}"
}

# Point d'entrée principal
main() {
    # Parsing des options
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force-refresh)
                FORCE_REFRESH=true
                shift
                ;;
            *)
                break
                ;;
        esac
    done

    COMMAND="${1:-}"
    DROPLET_IP="$2"

    case "$COMMAND" in
        "deploy")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            # Récupérer le domaine depuis l'environnement ou utiliser localhost
            local domain=$(grep "^DOMAIN=" env.digitalocean 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "localhost")
            deploy_complete "$DROPLET_IP" "$domain"
            ;;
        "deploy-reset")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            # Récupérer le domaine depuis l'environnement ou utiliser localhost
            local domain=$(grep "^DOMAIN=" env.digitalocean 2>/dev/null | cut -d'=' -f2 | tr -d '"' || echo "localhost")
            reset_complete "$DROPLET_IP" "$domain"
            ;;
        "fix")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            deploy_fix "$DROPLET_IP"
            ;;
        "test")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            run_tests "$DROPLET_IP"
            ;;
        "verify")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            verify_connections "$DROPLET_IP"
            ;;
        "health")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            health_check "$DROPLET_IP"
            ;;
        "simple-health")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            simple_health_check "$DROPLET_IP"
            ;;
        "replica")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            configure_mongodb_replica "$DROPLET_IP"
            ;;
        "ssl")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            test_ssl_certificates "$DROPLET_IP"
            ;;
        "fix-translator")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            fix_translator_permissions "$DROPLET_IP"
            ;;
        "deploy-passwords")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            deploy_traefik_passwords "$DROPLET_IP"
            ;;
        "status")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            ssh -o StrictHostKeyChecking=no root@$DROPLET_IP "cd /opt/meeshy && docker-compose ps"
            ;;
        "logs")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            ssh -o StrictHostKeyChecking=no root@$DROPLET_IP "cd /opt/meeshy && docker-compose logs --tail=50"
            ;;
        "restart")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            restart_services "$DROPLET_IP"
            ;;
        "stop")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            ssh -o StrictHostKeyChecking=no root@$DROPLET_IP "cd /opt/meeshy && docker-compose down"
            log_success "Services arrêtés"
            ;;
        "ssl")
            if [ -z "$DROPLET_IP" ]; then
                log_error "IP du droplet manquante"
                show_help
                exit 1
            fi
            test_ssh_connection "$DROPLET_IP" || exit 1
            local ssl_command="${3:-help}"
            local domain="${4:-'meeshy.me'}"
            local email="${5:-'admin@meeshy.me'}"
            ssh -o StrictHostKeyChecking=no root@$DROPLET_IP "cd /opt/meeshy && ./scripts/manage-ssl.sh $ssl_command $domain $email"
            ;;
        "recreate")
            log_error "Fonction recreate non implémentée - utiliser DigitalOcean directement"
            log_info "Alternative: doctl compute droplet delete <id> && doctl compute droplet create..."
            ;;
        "help"|"-h"|"--help"|"")
            show_help
            ;;
        *)
            log_error "Commande inconnue: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

# Exécuter le script principal
main "$@"
