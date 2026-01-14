#!/bin/bash
# Script automatique tout-en-un pour résoudre les problèmes et builder
# Diagnostic → Nettoyage → Build optimisée

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
cat << "EOF"
╔══════════════════════════════════════════════════╗
║   🚀 MEESHY FRONTEND - BUILD AUTOMATIQUE 🚀     ║
║                                                  ║
║   Diagnostic → Nettoyage → Build Optimisée      ║
╚══════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$FRONTEND_ROOT"

# Configuration
AUTO_CLEAN=${AUTO_CLEAN:-false}
AUTO_LOGIN=${AUTO_LOGIN:-true}
PUSH=${PUSH:-true}

# ============================================================
# ÉTAPE 1: DIAGNOSTIC
# ============================================================

echo -e "\n${BLUE}═════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}📋 ÉTAPE 1/5: DIAGNOSTIC DE L'ENVIRONNEMENT${NC}"
echo -e "${BLUE}═════════════════════════════════════════════════${NC}\n"

ISSUES_FOUND=0
DISK_ISSUE=false
AUTH_ISSUE=false

# Check Docker
if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker n'est pas démarré!${NC}"
    echo -e "${YELLOW}→ Démarrez Docker Desktop et relancez ce script${NC}"
    exit 1
fi

# Check espace disque
AVAILABLE_SPACE_GB=$(df -k . | tail -1 | awk '{print $4}')
AVAILABLE_SPACE_GB=$((AVAILABLE_SPACE_GB / 1024 / 1024))

echo -e "💾 Espace disque disponible: ${AVAILABLE_SPACE_GB}GB"

if [ "$AVAILABLE_SPACE_GB" -lt 5 ]; then
    echo -e "${RED}   ⚠️  Espace disque insuffisant (< 5GB)${NC}"
    DISK_ISSUE=true
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
elif [ "$AVAILABLE_SPACE_GB" -lt 10 ]; then
    echo -e "${YELLOW}   ⚠️  Espace disque limite (< 10GB)${NC}"
    DISK_ISSUE=true
else
    echo -e "${GREEN}   ✓ Espace disque OK${NC}"
fi

# Check Docker Hub auth
if docker info 2>/dev/null | grep -q "Username"; then
    USERNAME=$(docker info 2>/dev/null | grep "Username" | awk '{print $2}')
    echo -e "${GREEN}🔐 Connecté à Docker Hub: $USERNAME${NC}"
else
    echo -e "${YELLOW}🔐 Non connecté à Docker Hub${NC}"
    AUTH_ISSUE=true
    if [ "$PUSH" = "true" ]; then
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
fi

# Check buildx
if ! docker buildx version &> /dev/null; then
    echo -e "${RED}❌ Docker buildx n'est pas installé!${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Docker buildx OK${NC}"
fi

# ============================================================
# ÉTAPE 2: RÉSOLUTION DES PROBLÈMES
# ============================================================

if [ $ISSUES_FOUND -gt 0 ]; then
    echo -e "\n${BLUE}═════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}🔧 ÉTAPE 2/5: RÉSOLUTION DES PROBLÈMES${NC}"
    echo -e "${BLUE}═════════════════════════════════════════════════${NC}\n"
    
    # Résoudre problème d'espace disque
    if [ "$DISK_ISSUE" = true ]; then
        echo -e "${YELLOW}💾 Problème d'espace disque détecté${NC}"
        
        # Afficher l'utilisation actuelle
        echo -e "\n${CYAN}Utilisation Docker actuelle:${NC}"
        docker system df
        
        if [ "$AUTO_CLEAN" = "true" ]; then
            echo -e "\n${YELLOW}Nettoyage automatique activé...${NC}"
            docker system prune -af --volumes
            echo -e "${GREEN}✅ Nettoyage terminé!${NC}"
        else
            echo -e "\n${YELLOW}┌─────────────────────────────────────────────┐${NC}"
            echo -e "${YELLOW}│ NETTOYAGE REQUIS                            │${NC}"
            echo -e "${YELLOW}└─────────────────────────────────────────────┘${NC}"
            echo -e ""
            echo -e "Cette commande va supprimer:"
            echo -e "  • Tous les containers arrêtés"
            echo -e "  • Toutes les images non utilisées"
            echo -e "  • Tous les volumes non utilisés"
            echo -e "  • Tout le cache de build"
            echo -e ""
            echo -e "Cela peut libérer ${GREEN}5-10GB${NC} d'espace"
            echo -e ""
            read -p "Voulez-vous nettoyer maintenant? (o/N) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[OoYy]$ ]]; then
                docker system prune -af --volumes
                echo -e "${GREEN}✅ Nettoyage terminé!${NC}"
            else
                echo -e "${RED}❌ Nettoyage annulé${NC}"
                echo -e "${YELLOW}→ Libérez de l'espace manuellement et relancez${NC}"
                exit 1
            fi
        fi
        
        # Vérifier l'espace après nettoyage
        AVAILABLE_SPACE_GB=$(df -k . | tail -1 | awk '{print $4}')
        AVAILABLE_SPACE_GB=$((AVAILABLE_SPACE_GB / 1024 / 1024))
        echo -e "${GREEN}Nouvel espace disponible: ${AVAILABLE_SPACE_GB}GB${NC}"
        
        if [ "$AVAILABLE_SPACE_GB" -lt 5 ]; then
            echo -e "${RED}❌ Toujours insuffisant! Libérez plus d'espace.${NC}"
            exit 1
        fi
    fi
    
    # Résoudre problème d'authentification
    if [ "$AUTH_ISSUE" = true ] && [ "$PUSH" = "true" ]; then
        echo -e "\n${YELLOW}🔐 Authentification Docker Hub requise${NC}"
        
        if [ "$AUTO_LOGIN" = "true" ]; then
            echo -e "${YELLOW}Veuillez vous connecter:${NC}"
            if docker login; then
                echo -e "${GREEN}✅ Connexion réussie!${NC}"
            else
                echo -e "${RED}❌ Connexion échouée${NC}"
                exit 1
            fi
        else
            echo -e "${YELLOW}→ Lancez: docker login${NC}"
            exit 1
        fi
    fi
    
    echo -e "\n${GREEN}✅ Tous les problèmes ont été résolus!${NC}"
else
    echo -e "\n${GREEN}✅ Aucun problème détecté, on continue!${NC}"
fi

# ============================================================
# ÉTAPE 3: PRÉPARATION
# ============================================================

echo -e "\n${BLUE}═════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}📦 ÉTAPE 3/5: PRÉPARATION DU CONTEXTE${NC}"
echo -e "${BLUE}═════════════════════════════════════════════════${NC}\n"

# Run the centralized distribution script from shared/
SHARED_DIR="$(cd "$FRONTEND_ROOT/../shared" && pwd)"
if [ -f "$SHARED_DIR/scripts/distribute.sh" ]; then
    echo "📦 Running centralized shared distribution script..."
    cd "$SHARED_DIR"
    bash ./scripts/distribute.sh
    cd "$FRONTEND_ROOT"
else
    echo -e "${YELLOW}⚠️  Script shared/scripts/distribute.sh non trouvé${NC}"
fi

# ============================================================
# ÉTAPE 4: CONFIGURATION BUILDX
# ============================================================

echo -e "\n${BLUE}═════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}🔨 ÉTAPE 4/5: CONFIGURATION BUILDX${NC}"
echo -e "${BLUE}═════════════════════════════════════════════════${NC}\n"

BUILDER_NAME="meeshy-builder-fresh"

if ! docker buildx inspect "$BUILDER_NAME" > /dev/null 2>&1; then
    echo -e "${YELLOW}Création du builder $BUILDER_NAME...${NC}"
    docker buildx create --name "$BUILDER_NAME" --driver docker-container --bootstrap
else
    echo -e "${GREEN}✓ Builder $BUILDER_NAME existe déjà${NC}"
fi

docker buildx use "$BUILDER_NAME"
echo -e "${GREEN}✓ Utilisation du builder $BUILDER_NAME${NC}"

# ============================================================
# ÉTAPE 5: BUILD
# ============================================================

echo -e "\n${BLUE}═════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}🚀 ÉTAPE 5/5: BUILD DE L'IMAGE${NC}"
echo -e "${BLUE}═════════════════════════════════════════════════${NC}\n"

# Configuration
DOCKER_IMAGE="${DOCKER_IMAGE:-isopen/meeshy-web}"
DOCKER_TAG="${DOCKER_TAG:-latest}"
PLATFORMS="${PLATFORMS:-linux/arm64,linux/amd64}"
DOCKERFILE="${DOCKERFILE:-Dockerfile.optimized}"

echo -e "${CYAN}Configuration:${NC}"
echo -e "  Image:       $DOCKER_IMAGE:$DOCKER_TAG"
echo -e "  Plateformes: $PLATFORMS"
echo -e "  Dockerfile:  $DOCKERFILE"
echo -e "  Push:        $PUSH"
echo -e ""

BUILD_ARGS=(
    --platform "$PLATFORMS"
    --progress=plain
    -t "$DOCKER_IMAGE:$DOCKER_TAG"
    -f "$DOCKERFILE"
    --cache-from "type=registry,ref=$DOCKER_IMAGE:buildcache"
    --cache-to "type=registry,ref=$DOCKER_IMAGE:buildcache,mode=max"
)

if [ "$PUSH" = "true" ]; then
    BUILD_ARGS+=(--push)
else
    BUILD_ARGS+=(--load)
fi

echo -e "${YELLOW}🔨 Démarrage de la build...${NC}"
echo -e "${CYAN}Commande: docker buildx build ${BUILD_ARGS[*]} .${NC}\n"

START_TIME=$(date +%s)

if docker buildx build "${BUILD_ARGS[@]}" .; then
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    MINUTES=$((DURATION / 60))
    SECONDS=$((DURATION % 60))
    
    echo -e "\n${BLUE}═════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}✅ BUILD RÉUSSIE! 🎉${NC}"
    echo -e "${BLUE}═════════════════════════════════════════════════${NC}"
    echo -e ""
    echo -e "${CYAN}📊 Statistiques:${NC}"
    echo -e "  Durée: ${MINUTES}m ${SECONDS}s"
    echo -e "  Image: $DOCKER_IMAGE:$DOCKER_TAG"
    
    if [ "$PUSH" = "true" ]; then
        echo -e "  Status: ${GREEN}Poussée vers Docker Hub ✓${NC}"
        echo -e ""
        echo -e "${CYAN}🚀 Déploiement:${NC}"
        echo -e "  docker pull $DOCKER_IMAGE:$DOCKER_TAG"
        echo -e "  docker run -p 3100:80 $DOCKER_IMAGE:$DOCKER_TAG"
    else
        echo -e "  Status: ${YELLOW}Disponible localement uniquement${NC}"
        echo -e ""
        echo -e "${CYAN}🧪 Test:${NC}"
        echo -e "  docker run -p 3100:80 $DOCKER_IMAGE:$DOCKER_TAG"
    fi
    
    echo -e ""
    echo -e "${CYAN}⚡ Prochaines builds:${NC}"
    echo -e "  Les prochaines builds seront ${GREEN}10x plus rapides${NC}"
    echo -e "  grâce au cache dans: $DOCKER_IMAGE:buildcache"
    echo -e ""
    
else
    echo -e "\n${RED}❌ BUILD ÉCHOUÉE!${NC}"
    echo -e "${YELLOW}→ Vérifiez les logs ci-dessus${NC}"
    echo -e "${YELLOW}→ Essayez: ./scripts/docker-build-separate.sh${NC}"
    exit 1
fi

