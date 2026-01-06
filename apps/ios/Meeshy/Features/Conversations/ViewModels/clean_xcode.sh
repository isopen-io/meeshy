#!/bin/bash

# clean_xcode.sh
# Script pour nettoyer complètement le projet Xcode Meeshy
# Usage: ./clean_xcode.sh

set -e  # Arrêter en cas d'erreur

# Couleurs pour l'output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Nettoyage Xcode - Projet Meeshy    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Vérifier si Xcode est en cours d'exécution
if pgrep -x "Xcode" > /dev/null; then
    echo -e "${YELLOW}⚠️  Xcode est en cours d'exécution${NC}"
    echo -e "${YELLOW}   Il est recommandé de fermer Xcode avant de continuer${NC}"
    read -p "Voulez-vous continuer quand même ? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Opération annulée${NC}"
        exit 1
    fi
fi

echo -e "${BLUE}📦 Étape 1/5: Nettoyage des Derived Data${NC}"
DERIVED_DATA_PATH="$HOME/Library/Developer/Xcode/DerivedData"
if [ -d "$DERIVED_DATA_PATH" ]; then
    # Compter les fichiers avant
    BEFORE_COUNT=$(find "$DERIVED_DATA_PATH" -name "Meeshy-*" -type d 2>/dev/null | wc -l)
    
    # Supprimer les dossiers Meeshy
    find "$DERIVED_DATA_PATH" -name "Meeshy-*" -type d -exec rm -rf {} + 2>/dev/null || true
    
    echo -e "${GREEN}✅ Supprimé $BEFORE_COUNT dossier(s) Derived Data${NC}"
else
    echo -e "${YELLOW}⚠️  Dossier Derived Data introuvable${NC}"
fi

echo ""
echo -e "${BLUE}🗑️  Étape 2/5: Nettoyage du cache Xcode${NC}"
XCODE_CACHE="$HOME/Library/Caches/com.apple.dt.Xcode"
if [ -d "$XCODE_CACHE" ]; then
    CACHE_SIZE=$(du -sh "$XCODE_CACHE" 2>/dev/null | cut -f1)
    rm -rf "$XCODE_CACHE"
    mkdir -p "$XCODE_CACHE"
    echo -e "${GREEN}✅ Cache Xcode nettoyé ($CACHE_SIZE libérés)${NC}"
else
    echo -e "${YELLOW}⚠️  Cache Xcode introuvable${NC}"
fi

echo ""
echo -e "${BLUE}📱 Étape 3/5: Nettoyage du support des appareils iOS${NC}"
IOS_SUPPORT="$HOME/Library/Developer/Xcode/iOS DeviceSupport"
if [ -d "$IOS_SUPPORT" ]; then
    SUPPORT_SIZE=$(du -sh "$IOS_SUPPORT" 2>/dev/null | cut -f1)
    rm -rf "$IOS_SUPPORT"/*
    echo -e "${GREEN}✅ Support appareils iOS nettoyé ($SUPPORT_SIZE libérés)${NC}"
else
    echo -e "${YELLOW}⚠️  Dossier iOS DeviceSupport introuvable${NC}"
fi

echo ""
echo -e "${BLUE}🧹 Étape 4/5: Nettoyage du projet local${NC}"

# Trouver le répertoire du projet
PROJECT_DIR=$(find . -name "*.xcodeproj" -type d | head -n 1 | xargs dirname)

if [ -n "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
    
    # Nettoyer les build locaux
    if [ -d "build" ]; then
        rm -rf build
        echo -e "${GREEN}✅ Dossier build/ supprimé${NC}"
    fi
    
    # Nettoyer les fichiers temporaires
    find . -name "*.xcuserstate" -delete 2>/dev/null || true
    find . -name "*.xcworkspace" -type d -exec rm -rf {}/xcuserdata \; 2>/dev/null || true
    find . -name "*.xcodeproj" -type d -exec rm -rf {}/xcuserdata \; 2>/dev/null || true
    
    echo -e "${GREEN}✅ Fichiers utilisateur et temporaires supprimés${NC}"
else
    echo -e "${YELLOW}⚠️  Projet Xcode introuvable dans le répertoire courant${NC}"
fi

echo ""
echo -e "${BLUE}🔧 Étape 5/5: Nettoyage avec xcodebuild${NC}"

if [ -n "$PROJECT_DIR" ] && command -v xcodebuild &> /dev/null; then
    cd "$PROJECT_DIR"
    
    # Trouver le workspace ou project
    WORKSPACE=$(find . -maxdepth 1 -name "*.xcworkspace" -type d | head -n 1)
    PROJECT=$(find . -maxdepth 1 -name "*.xcodeproj" -type d | head -n 1)
    
    if [ -n "$WORKSPACE" ]; then
        echo -e "${BLUE}   Utilisation du workspace: $(basename "$WORKSPACE")${NC}"
        xcodebuild clean -workspace "$WORKSPACE" -scheme Meeshy 2>&1 | grep -E "(CLEAN|SUCCEEDED|FAILED)" || true
    elif [ -n "$PROJECT" ]; then
        echo -e "${BLUE}   Utilisation du projet: $(basename "$PROJECT")${NC}"
        xcodebuild clean -project "$PROJECT" -scheme Meeshy 2>&1 | grep -E "(CLEAN|SUCCEEDED|FAILED)" || true
    else
        echo -e "${YELLOW}⚠️  Aucun workspace ou projet trouvé${NC}"
    fi
    
    echo -e "${GREEN}✅ Nettoyage xcodebuild terminé${NC}"
else
    echo -e "${YELLOW}⚠️  xcodebuild non disponible ou projet introuvable${NC}"
fi

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          Nettoyage Terminé !          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✨ Toutes les étapes de nettoyage sont terminées${NC}"
echo ""
echo -e "${YELLOW}📋 Prochaines étapes:${NC}"
echo -e "   1. Ouvrir Xcode"
echo -e "   2. Ouvrir le projet Meeshy"
echo -e "   3. Product → Build (Cmd+B)"
echo ""
echo -e "${BLUE}💡 Si l'erreur persiste:${NC}"
echo -e "   • Vérifier Build Phases → Compile Sources pour les doublons"
echo -e "   • Consulter GUIDE_NETTOYAGE_XCODE.md"
echo ""

# Calculer et afficher l'espace libéré
echo -e "${GREEN}✅ Script terminé avec succès${NC}"
