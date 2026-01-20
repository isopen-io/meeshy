#!/bin/bash

#############################################################################
# Script de diagnostic TTS
# Usage: ./scripts/diagnostic_tts.sh
#
# Vérifie l'état du système TTS et identifie les problèmes potentiels
#############################################################################

set -e

# Couleurs pour output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   🔍 DIAGNOSTIC TTS - SERVICE TRANSLATOR                  ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Variables
ERRORS=0
WARNINGS=0
SUCCESS=0

#############################################################################
# 1. VÉRIFICATION DES PACKAGES PYTHON
#############################################################################

echo -e "${BLUE}[1/7] Vérification des packages Python TTS...${NC}"

# Chatterbox
if pip show chatterbox-tts &> /dev/null; then
    VERSION=$(pip show chatterbox-tts | grep Version | cut -d ' ' -f 2)
    echo -e "  ${GREEN}✅ chatterbox-tts v${VERSION} installé${NC}"
    ((SUCCESS++))
else
    echo -e "  ${RED}❌ chatterbox-tts NON INSTALLÉ${NC}"
    echo -e "     ${YELLOW}→ Installer avec : pip install chatterbox-tts${NC}"
    ((ERRORS++))
fi

# PyTorch
if pip show torch &> /dev/null; then
    VERSION=$(pip show torch | grep Version | cut -d ' ' -f 2)
    echo -e "  ${GREEN}✅ torch v${VERSION} installé${NC}"
    ((SUCCESS++))
else
    echo -e "  ${RED}❌ torch NON INSTALLÉ${NC}"
    echo -e "     ${YELLOW}→ Installer avec : pip install torch${NC}"
    ((ERRORS++))
fi

# TorchAudio
if pip show torchaudio &> /dev/null; then
    VERSION=$(pip show torchaudio | grep Version | cut -d ' ' -f 2)
    echo -e "  ${GREEN}✅ torchaudio v${VERSION} installé${NC}"
    ((SUCCESS++))
else
    echo -e "  ${YELLOW}⚠️ torchaudio NON INSTALLÉ (recommandé)${NC}"
    echo -e "     ${YELLOW}→ Installer avec : pip install torchaudio${NC}"
    ((WARNINGS++))
fi

# Librosa
if pip show librosa &> /dev/null; then
    VERSION=$(pip show librosa | grep Version | cut -d ' ' -f 2)
    echo -e "  ${GREEN}✅ librosa v${VERSION} installé${NC}"
    ((SUCCESS++))
else
    echo -e "  ${YELLOW}⚠️ librosa NON INSTALLÉ (recommandé)${NC}"
    echo -e "     ${YELLOW}→ Installer avec : pip install librosa${NC}"
    ((WARNINGS++))
fi

echo ""

#############################################################################
# 2. VÉRIFICATION DES RÉPERTOIRES
#############################################################################

echo -e "${BLUE}[2/7] Vérification des répertoires...${NC}"

CACHE_DIR="${HOME}/.cache/meeshy/models"
OUTPUT_DIR="./outputs/audio"

# Cache des modèles
if [ -d "$CACHE_DIR" ]; then
    SIZE=$(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1)
    echo -e "  ${GREEN}✅ Cache modèles existe : ${CACHE_DIR} (${SIZE})${NC}"
    ((SUCCESS++))
else
    echo -e "  ${YELLOW}⚠️ Cache modèles n'existe pas : ${CACHE_DIR}${NC}"
    echo -e "     ${YELLOW}→ Sera créé automatiquement au premier téléchargement${NC}"
    ((WARNINGS++))
fi

# Output audio
if [ -d "$OUTPUT_DIR" ]; then
    echo -e "  ${GREEN}✅ Répertoire output existe : ${OUTPUT_DIR}${NC}"
    ((SUCCESS++))
else
    echo -e "  ${YELLOW}⚠️ Répertoire output n'existe pas : ${OUTPUT_DIR}${NC}"
    echo -e "     ${YELLOW}→ Créer avec : mkdir -p ${OUTPUT_DIR}/translated${NC}"
    ((WARNINGS++))
fi

echo ""

#############################################################################
# 3. VÉRIFICATION ESPACE DISQUE
#############################################################################

echo -e "${BLUE}[3/7] Vérification espace disque...${NC}"

# Obtenir l'espace disponible sur le système de fichiers du cache
if [ -d "$CACHE_DIR" ]; then
    FILESYSTEM=$(df "$CACHE_DIR" | tail -1 | awk '{print $1}')
    AVAILABLE=$(df -BG "$CACHE_DIR" | tail -1 | awk '{print $4}' | sed 's/G//')
else
    FILESYSTEM=$(df . | tail -1 | awk '{print $1}')
    AVAILABLE=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
fi

if [ "$AVAILABLE" -ge 5 ]; then
    echo -e "  ${GREEN}✅ Espace disque suffisant : ${AVAILABLE}GB disponible${NC}"
    ((SUCCESS++))
elif [ "$AVAILABLE" -ge 2 ]; then
    echo -e "  ${YELLOW}⚠️ Espace disque limité : ${AVAILABLE}GB disponible (min recommandé : 5GB)${NC}"
    ((WARNINGS++))
else
    echo -e "  ${RED}❌ Espace disque INSUFFISANT : ${AVAILABLE}GB disponible (min requis : 2GB)${NC}"
    echo -e "     ${YELLOW}→ Libérer de l'espace ou configurer MODELS_PATH ailleurs${NC}"
    ((ERRORS++))
fi

echo ""

#############################################################################
# 4. VÉRIFICATION MODÈLES TÉLÉCHARGÉS
#############################################################################

echo -e "${BLUE}[4/7] Vérification modèles téléchargés...${NC}"

CHATTERBOX_DIR="${CACHE_DIR}/huggingface/ResembleAI/chatterbox"
CHATTERBOX_TURBO_DIR="${CACHE_DIR}/huggingface/ResembleAI/chatterbox-turbo"

# Chatterbox standard
if [ -f "${CHATTERBOX_DIR}/tokenizer.json" ]; then
    SIZE=$(du -sh "$CHATTERBOX_DIR" 2>/dev/null | cut -f1)
    echo -e "  ${GREEN}✅ Chatterbox standard téléchargé (${SIZE})${NC}"
    ((SUCCESS++))
else
    echo -e "  ${YELLOW}⚠️ Chatterbox standard NON téléchargé${NC}"
    echo -e "     ${YELLOW}→ Sera téléchargé automatiquement au premier usage (3.5GB)${NC}"
    ((WARNINGS++))
fi

# Chatterbox Turbo
if [ -f "${CHATTERBOX_TURBO_DIR}/tokenizer.json" ]; then
    SIZE=$(du -sh "$CHATTERBOX_TURBO_DIR" 2>/dev/null | cut -f1)
    echo -e "  ${GREEN}✅ Chatterbox Turbo téléchargé (${SIZE})${NC}"
    ((SUCCESS++))
else
    echo -e "  ${YELLOW}⚠️ Chatterbox Turbo NON téléchargé${NC}"
    echo -e "     ${YELLOW}→ Optionnel, plus rapide mais qualité légèrement inférieure${NC}"
    ((WARNINGS++))
fi

echo ""

#############################################################################
# 5. VÉRIFICATION CONNEXION INTERNET
#############################################################################

echo -e "${BLUE}[5/7] Vérification connexion internet...${NC}"

if ping -c 1 huggingface.co &> /dev/null; then
    echo -e "  ${GREEN}✅ Connexion internet OK (huggingface.co accessible)${NC}"
    ((SUCCESS++))
else
    echo -e "  ${RED}❌ Connexion internet PROBLÉMATIQUE${NC}"
    echo -e "     ${YELLOW}→ Vérifier la connexion réseau pour télécharger les modèles${NC}"
    ((ERRORS++))
fi

echo ""

#############################################################################
# 6. VÉRIFICATION CUDA/GPU (optionnel)
#############################################################################

echo -e "${BLUE}[6/7] Vérification CUDA/GPU (optionnel)...${NC}"

if command -v nvidia-smi &> /dev/null; then
    if nvidia-smi &> /dev/null; then
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)
        GPU_MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader | head -1)
        echo -e "  ${GREEN}✅ GPU détecté : ${GPU_NAME} (${GPU_MEM})${NC}"
        ((SUCCESS++))
    else
        echo -e "  ${YELLOW}⚠️ nvidia-smi présent mais GPU non accessible${NC}"
        ((WARNINGS++))
    fi
else
    echo -e "  ${YELLOW}⚠️ Pas de GPU CUDA détecté (CPU sera utilisé, plus lent)${NC}"
    ((WARNINGS++))
fi

echo ""

#############################################################################
# 7. TEST IMPORT PYTHON
#############################################################################

echo -e "${BLUE}[7/7] Test import Python...${NC}"

# Test import chatterbox
python3 << EOF
import sys
try:
    from chatterbox.tts import ChatterboxTTS
    print("  ✅ Import ChatterboxTTS OK")
    sys.exit(0)
except ImportError as e:
    print(f"  ❌ Import ChatterboxTTS ÉCHEC : {e}")
    sys.exit(1)
EOF

if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✅ Modules Python importables${NC}"
    ((SUCCESS++))
else
    echo -e "  ${RED}❌ Problème d'import Python${NC}"
    echo -e "     ${YELLOW}→ Vérifier l'installation : pip install chatterbox-tts${NC}"
    ((ERRORS++))
fi

echo ""

#############################################################################
# RÉSUMÉ
#############################################################################

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   📊 RÉSUMÉ DU DIAGNOSTIC                                 ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "  ${GREEN}✅ Succès     : ${SUCCESS}${NC}"
echo -e "  ${YELLOW}⚠️ Avertissements : ${WARNINGS}${NC}"
echo -e "  ${RED}❌ Erreurs    : ${ERRORS}${NC}"

echo ""

#############################################################################
# RECOMMANDATIONS
#############################################################################

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}   🎉 SYSTÈME TTS PRÊT                                    ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "Tous les composants sont installés et fonctionnels."
    echo -e "Le système TTS devrait fonctionner correctement."
    echo ""

elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}   ⚠️ SYSTÈME TTS FONCTIONNEL AVEC AVERTISSEMENTS        ${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "Le système devrait fonctionner mais certains composants"
    echo -e "optionnels sont manquants ou des optimisations sont possibles."
    echo ""

else
    echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${RED}   ❌ PROBLÈMES DÉTECTÉS - ACTION REQUISE                  ${NC}"
    echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${RED}${ERRORS} erreur(s) critique(s) détectée(s).${NC}"
    echo ""
    echo -e "${YELLOW}Actions recommandées :${NC}"
    echo ""

    if ! pip show chatterbox-tts &> /dev/null; then
        echo -e "  1. ${YELLOW}Installer chatterbox-tts :${NC}"
        echo -e "     pip install chatterbox-tts"
        echo ""
    fi

    if ! pip show torch &> /dev/null; then
        echo -e "  2. ${YELLOW}Installer PyTorch :${NC}"
        echo -e "     pip install torch"
        echo ""
    fi

    if [ "$AVAILABLE" -lt 2 ]; then
        echo -e "  3. ${YELLOW}Libérer de l'espace disque (au moins 2GB requis)${NC}"
        echo ""
    fi

    if ! ping -c 1 huggingface.co &> /dev/null; then
        echo -e "  4. ${YELLOW}Vérifier la connexion internet${NC}"
        echo ""
    fi

    echo -e "${YELLOW}Documentation :${NC}"
    echo -e "  - Audit complet : AUDIT_COMPLET_TTS.md"
    echo -e "  - Correctifs : CORRECTIFS_TTS_A_APPLIQUER.md"
    echo ""
fi

#############################################################################
# CODE DE SORTIE
#############################################################################

if [ $ERRORS -gt 0 ]; then
    exit 1
else
    exit 0
fi
