#!/bin/bash

# Script pour vérifier et initialiser le replica set MongoDB pour Meeshy
# Utilise par défaut le conteneur Docker meeshy-database ou meeshy-dev-database

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration - Détecter le conteneur MongoDB
CONTAINER_NAME=""
if docker ps --filter "name=meeshy-dev-database" --format "{{.Names}}" | grep -q "meeshy-dev-database"; then
    CONTAINER_NAME="meeshy-dev-database"
elif docker ps --filter "name=meeshy-database" --format "{{.Names}}" | grep -q "meeshy-database"; then
    CONTAINER_NAME="meeshy-database"
else
    CONTAINER_NAME=${1:-meeshy-dev-database}
fi

REPLICA_SET_NAME=${2:-rs0}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérifier que le conteneur existe et est en cours d'exécution
if ! docker ps --filter "name=$CONTAINER_NAME" --format "{{.Names}}" | grep -q "$CONTAINER_NAME"; then
    log_error "Le conteneur $CONTAINER_NAME n'est pas en cours d'exécution"
    log_info "Démarrez-le avec: ./start-dev.sh"
    exit 1
fi

log_info "Vérification du replica set MongoDB dans $CONTAINER_NAME..."
echo ""

# Vérifier si MongoDB est prêt
log_info "1️⃣  Vérification de la disponibilité de MongoDB..."
if docker exec $CONTAINER_NAME mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
    log_success "MongoDB est disponible"
else
    log_error "MongoDB n'est pas disponible"
    exit 1
fi

echo ""

# Vérifier le statut du replica set
log_info "2️⃣  Vérification du statut du replica set..."
RS_STATUS=$(docker exec $CONTAINER_NAME mongosh --quiet --eval "try { rs.status() } catch(e) { print('NOT_INITIALIZED') }" 2>&1)

if echo "$RS_STATUS" | grep -q "NOT_INITIALIZED\|MongoServerError\|no replset config"; then
    log_warning "Replica set non initialisé"
    echo ""
    log_info "3️⃣  Initialisation du replica set $REPLICA_SET_NAME..."
    
    INIT_RESULT=$(docker exec $CONTAINER_NAME mongosh --quiet --eval "
        try {
            rs.initiate({
                _id: '$REPLICA_SET_NAME',
                members: [{ _id: 0, host: 'database:27017' }]
            });
            print('SUCCESS');
        } catch (e) {
            if (e.message.includes('already initialized')) {
                print('ALREADY_INITIALIZED');
            } else {
                print('ERROR: ' + e.message);
            }
        }
    " 2>&1)
    
    if echo "$INIT_RESULT" | grep -q "SUCCESS\|ALREADY_INITIALIZED"; then
        log_success "Replica set initialisé avec succès"
        
        # Attendre que le replica set soit prêt
        log_info "Attente de la disponibilité du replica set..."
        sleep 5
        
        for i in {1..30}; do
            STATE=$(docker exec $CONTAINER_NAME mongosh --quiet --eval "rs.status().myState" 2>&1 | tail -1)
            if [ "$STATE" = "1" ]; then
                log_success "Replica set est PRIMARY et prêt!"
                break
            fi
            sleep 1
        done
    else
        log_error "Échec de l'initialisation: $INIT_RESULT"
        exit 1
    fi
else
    log_success "Replica set déjà initialisé"
fi

echo ""

# Afficher les informations du replica set
log_info "4️⃣  Informations du replica set:"
echo ""

# État du membre
MY_STATE=$(docker exec $CONTAINER_NAME mongosh --quiet --eval "rs.status().myState" 2>&1 | tail -1)
case $MY_STATE in
    1)
        log_success "État: PRIMARY ✅"
        ;;
    2)
        log_info "État: SECONDARY"
        ;;
    *)
        log_warning "État: $MY_STATE"
        ;;
esac

# Nom du replica set
RS_NAME=$(docker exec $CONTAINER_NAME mongosh --quiet --eval "rs.conf()._id" 2>&1 | tail -1)
echo -e "   Nom du replica set: ${GREEN}$RS_NAME${NC}"

# Membres
MEMBERS=$(docker exec $CONTAINER_NAME mongosh --quiet --eval "rs.conf().members.length" 2>&1 | tail -1)
echo -e "   Nombre de membres: ${GREEN}$MEMBERS${NC}"

# Membre principal
PRIMARY=$(docker exec $CONTAINER_NAME mongosh --quiet --eval "rs.status().members.find(m => m.state === 1)?.name || 'N/A'" 2>&1 | tail -1)
echo -e "   Membre PRIMARY: ${GREEN}$PRIMARY${NC}"

echo ""

# URL de connexion
log_info "5️⃣  URL de connexion:"
echo ""
echo -e "   ${GREEN}mongodb://database:27017/meeshy?replicaSet=$REPLICA_SET_NAME${NC}"
echo -e "   ${BLUE}(depuis un conteneur Docker)${NC}"
echo ""
echo -e "   ${GREEN}mongodb://localhost:27017/meeshy?replicaSet=$REPLICA_SET_NAME${NC}"
echo -e "   ${BLUE}(depuis la machine hôte)${NC}"

echo ""
log_success "✅ Replica set MongoDB opérationnel!"

# Test de connexion avec replica set
echo ""
log_info "6️⃣  Test de connexion avec replica set..."
TEST_RESULT=$(docker exec $CONTAINER_NAME mongosh "mongodb://database:27017/meeshy?replicaSet=$REPLICA_SET_NAME" --quiet --eval "db.adminCommand('ping').ok" 2>&1 | tail -1)

if [ "$TEST_RESULT" = "1" ]; then
    log_success "Connexion avec replica set réussie!"
else
    log_warning "Problème de connexion avec replica set"
    log_info "Cela peut prendre quelques secondes supplémentaires pour être complètement prêt"
fi

echo ""
log_info "💡 Commandes utiles:"
echo ""
echo "   # Voir le statut complet"
echo "   docker exec $CONTAINER_NAME mongosh --eval 'rs.status()'"
echo ""
echo "   # Voir la configuration"
echo "   docker exec $CONTAINER_NAME mongosh --eval 'rs.conf()'"
echo ""
echo "   # Se connecter à MongoDB"
echo "   docker exec -it $CONTAINER_NAME mongosh mongodb://database:27017/meeshy?replicaSet=$REPLICA_SET_NAME"
echo ""
