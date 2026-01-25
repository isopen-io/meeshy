#!/bin/bash
# =============================================================================
# MEESHY STAGING - Script de Déploiement
# =============================================================================
# Description: Déploie l'environnement staging complet sur le serveur
# Usage: ./infrastructure/scripts/deploy-staging.sh
# =============================================================================

set -euo pipefail

REMOTE_HOST="root@meeshy.me"
STAGING_DIR="/opt/meeshy/staging"

echo "🚀 Déploiement de l'environnement STAGING..."
echo ""

# =============================================================================
# ÉTAPE 1: VÉRIFICATIONS PRÉ-DÉPLOIEMENT
# =============================================================================

echo "📋 Vérifications pré-déploiement..."

# Vérifier connexion SSH
if ! ssh -q $REMOTE_HOST exit; then
    echo "❌ Erreur: Impossible de se connecter à $REMOTE_HOST"
    exit 1
fi

# Vérifier que le fichier .env.staging existe localement
if [ ! -f "infrastructure/docker/compose/.env.staging" ]; then
    echo "⚠️  Fichier .env.staging non trouvé"
    echo "   Création depuis le template..."
    cp infrastructure/docker/compose/.env.staging.template infrastructure/docker/compose/.env.staging
    echo ""
    echo "⚠️  ATTENTION: Éditer infrastructure/docker/compose/.env.staging"
    echo "   et remplir les valeurs avant de continuer!"
    echo ""
    read -p "Fichier .env.staging édité? (oui/non): " confirm
    if [ "$confirm" != "oui" ]; then
        echo "Déploiement annulé."
        exit 1
    fi
fi

echo "✅ Vérifications OK"
echo ""

# =============================================================================
# ÉTAPE 2: CRÉER LA STRUCTURE SUR LE SERVEUR
# =============================================================================

echo "📁 Création de la structure staging sur le serveur..."

ssh $REMOTE_HOST "mkdir -p $STAGING_DIR/{config/nginx,secrets}"

echo "✅ Structure créée"
echo ""

# =============================================================================
# ÉTAPE 3: COPIER LES FICHIERS DE CONFIGURATION
# =============================================================================

echo "📋 Copie des fichiers de configuration..."

# docker-compose.staging.yml
echo "   → docker-compose.yml..."
scp infrastructure/docker/compose/docker-compose.staging.yml \
    $REMOTE_HOST:$STAGING_DIR/docker-compose.yml

# .env.staging
echo "   → .env..."
scp infrastructure/docker/compose/.env.staging \
    $REMOTE_HOST:$STAGING_DIR/.env

# Config Traefik (depuis prod si existe)
echo "   → config/dynamic.yaml..."
ssh $REMOTE_HOST "
    if [ -f /opt/meeshy/config/dynamic.yaml ]; then
        cp /opt/meeshy/config/dynamic.yaml $STAGING_DIR/config/
    else
        touch $STAGING_DIR/config/dynamic.yaml
    fi
"

# Config Nginx (depuis prod si existe)
echo "   → config/nginx/static-files.conf..."
ssh $REMOTE_HOST "
    if [ -f /opt/meeshy/docker/nginx/static-files.conf ]; then
        cp /opt/meeshy/docker/nginx/static-files.conf $STAGING_DIR/config/nginx/
    fi
"

# Secrets Firebase (depuis prod)
echo "   → secrets/firebase-admin-sdk.json..."
ssh $REMOTE_HOST "
    if [ -f /opt/meeshy/secrets/firebase-admin-sdk.json ]; then
        cp /opt/meeshy/secrets/firebase-admin-sdk.json $STAGING_DIR/secrets/
    else
        echo '{}' > $STAGING_DIR/secrets/firebase-admin-sdk.json
        echo '⚠️  Fichier Firebase vide créé - à remplacer manuellement'
    fi
"

echo "✅ Fichiers copiés"
echo ""

# =============================================================================
# ÉTAPE 4: PULL DES IMAGES DOCKER
# =============================================================================

echo "🐋 Pull des images Docker staging..."

ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose pull" || {
    echo "⚠️  Erreur lors du pull des images (peut-être des images locales?)"
    echo "   Continuer quand même..."
}

echo "✅ Images prêtes"
echo ""

# =============================================================================
# ÉTAPE 5: CRÉER LES VOLUMES (sans données)
# =============================================================================

echo "💾 Création des volumes staging..."

ssh $REMOTE_HOST "docker volume create meeshy-staging-database-data" || true
ssh $REMOTE_HOST "docker volume create meeshy-staging-database-config" || true
ssh $REMOTE_HOST "docker volume create meeshy-staging-redis-data" || true
ssh $REMOTE_HOST "docker volume create meeshy-staging-redis-ui-data" || true
ssh $REMOTE_HOST "docker volume create meeshy-staging-traefik-certs" || true
ssh $REMOTE_HOST "docker volume create meeshy-staging-models-data" || true
ssh $REMOTE_HOST "docker volume create meeshy-staging-gateway-uploads" || true
ssh $REMOTE_HOST "docker volume create meeshy-staging-web-uploads" || true

echo "✅ Volumes créés"
echo ""

# =============================================================================
# ÉTAPE 6: OPTIONNEL - COPIER LES MODÈLES ML DEPUIS PROD
# =============================================================================

echo "🤖 Copie des modèles ML depuis production (optionnel)..."
read -p "Copier les modèles ML depuis prod? (oui/non - recommandé: oui): " copy_models

if [ "$copy_models" = "oui" ]; then
    echo "   Copie en cours (peut prendre 5-10 min pour ~5GB)..."
    ssh $REMOTE_HOST "docker run --rm \
        -v meeshy-models-data:/from:ro \
        -v meeshy-staging-models-data:/to \
        alpine sh -c 'cp -av /from/. /to/'" || {
        echo "⚠️  Erreur lors de la copie des modèles ML"
        echo "   Les modèles seront re-téléchargés au premier démarrage"
    }
    echo "✅ Modèles ML copiés"
else
    echo "⏭️  Modèles ML seront téléchargés au premier démarrage"
fi
echo ""

# =============================================================================
# ÉTAPE 7: DÉMARRER LES SERVICES STAGING
# =============================================================================

echo "▶️  Démarrage des services staging..."

ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose up -d"

echo "✅ Services démarrés"
echo ""

# =============================================================================
# ÉTAPE 8: ATTENDRE LE DÉMARRAGE DES SERVICES
# =============================================================================

echo "⏳ Attente du démarrage des services (60s)..."
sleep 60

# =============================================================================
# ÉTAPE 9: VÉRIFIER L'ÉTAT DES SERVICES
# =============================================================================

echo "🔍 Vérification de l'état des services..."
echo ""

ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose ps"

echo ""

# =============================================================================
# ÉTAPE 10: TESTER LES ENDPOINTS
# =============================================================================

echo "🧪 Test des endpoints staging..."

# Fonction helper
test_endpoint() {
    local name="$1"
    local url="$2"
    echo -n "   Testing $name... "

    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

    if [ "$response" -eq 200 ]; then
        echo "✅ ($response)"
    else
        echo "⏳ ($response - peut prendre quelques minutes)"
    fi
}

test_endpoint "Gateway Health" "https://gate.staging.meeshy.me/health"
test_endpoint "ML Service Health" "https://ml.staging.meeshy.me/health"
test_endpoint "Frontend" "https://staging.meeshy.me"

echo ""

# =============================================================================
# RÉSUMÉ
# =============================================================================

echo "=" | tr -d '\n' | head -c 80; echo
echo "✅ STAGING DÉPLOYÉ AVEC SUCCÈS!"
echo "=" | tr -d '\n' | head -c 80; echo
echo ""
echo "🌐 URLs disponibles:"
echo "   - Frontend:  https://staging.meeshy.me"
echo "   - Gateway:   https://gate.staging.meeshy.me"
echo "   - ML:        https://ml.staging.meeshy.me"
echo "   - MongoDB:   https://mongo.staging.meeshy.me"
echo "   - Redis:     https://redis.staging.meeshy.me"
echo "   - Traefik:   https://traefik.staging.meeshy.me"
echo ""
echo "⚠️  NOTES:"
echo "   - Les certificats SSL peuvent prendre 2-5 minutes"
echo "   - MongoDB est vide (prêt pour migration des données)"
echo "   - Les services Translator/ML peuvent prendre 5-10 min au premier démarrage"
echo ""
echo "📝 Prochaines étapes:"
echo "   1. Attendre que tous les services soient healthy"
echo "   2. Migrer les données: ./infrastructure/scripts/migrate-to-staging.sh"
echo "   3. Valider: ./infrastructure/scripts/validate-staging.sh"
echo ""
echo "🐛 Debug:"
echo "   ssh $REMOTE_HOST 'cd $STAGING_DIR && docker compose logs -f'"
echo ""
