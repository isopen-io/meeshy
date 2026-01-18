#!/bin/bash
#
# Script de nettoyage du dossier models
# Supprime les modèles dupliqués et anciens
#
# Usage: ./cleanup_models.sh [--dry-run]
#

set -e

MODELS_DIR="./models"
DRY_RUN=false

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}[MODE DRY-RUN]${NC} Simulation - aucune suppression réelle"
    echo ""
fi

# Fonction pour supprimer un dossier
remove_directory() {
    local dir="$1"
    local reason="$2"

    if [ -d "$dir" ]; then
        local size=$(du -sh "$dir" | cut -f1)
        echo -e "${RED}❌ SUPPRESSION${NC}: $dir"
        echo -e "   Raison: $reason"
        echo -e "   Taille: $size"

        if [ "$DRY_RUN" = false ]; then
            rm -rf "$dir"
            echo -e "   ${GREEN}✅ Supprimé${NC}"
        else
            echo -e "   ${YELLOW}(simulation)${NC}"
        fi
        echo ""
    else
        echo -e "${BLUE}ℹ️  DÉJÀ SUPPRIMÉ${NC}: $dir"
        echo ""
    fi
}

# Fonction pour lister un dossier à garder
keep_directory() {
    local dir="$1"
    local reason="$2"

    if [ -d "$dir" ]; then
        local size=$(du -sh "$dir" 2>/dev/null | cut -f1 || echo "N/A")
        echo -e "${GREEN}✅ CONSERVER${NC}: $dir"
        echo -e "   Raison: $reason"
        echo -e "   Taille: $size"
        echo ""
    fi
}

echo "═══════════════════════════════════════════════════════════"
echo "   Nettoyage du dossier models"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Vérifier que le dossier models existe
if [ ! -d "$MODELS_DIR" ]; then
    echo -e "${RED}❌ ERREUR${NC}: Dossier $MODELS_DIR introuvable"
    exit 1
fi

cd "$MODELS_DIR"

echo "📂 Dossier actuel: $(pwd)"
echo ""

# ══════════════════════════════════════════════════════════════
# 1. MODÈLES NLLB DUPLIQUÉS (à la racine)
# ══════════════════════════════════════════════════════════════
echo "─────────────────────────────────────────────────────────"
echo " 1. Modèles NLLB dupliqués à la racine"
echo "─────────────────────────────────────────────────────────"

remove_directory "models--facebook--nllb-200-distilled-600M" \
    "Dupliqué - version dans huggingface/ utilisée"

remove_directory "models--facebook--nllb-200-distilled-1.3B" \
    "Dupliqué - version dans huggingface/ utilisée"

# ══════════════════════════════════════════════════════════════
# 2. ANCIENS MODÈLES OPUS-MT (non utilisés)
# ══════════════════════════════════════════════════════════════
echo "─────────────────────────────────────────────────────────"
echo " 2. Anciens modèles Opus-MT (non utilisés)"
echo "─────────────────────────────────────────────────────────"

remove_directory "Helsinki-NLP_opus-mt-en-fr" \
    "Ancien modèle remplacé par NLLB-200"

remove_directory "Helsinki-NLP_opus-mt-fr-en" \
    "Ancien modèle remplacé par NLLB-200"

# ══════════════════════════════════════════════════════════════
# 3. DOSSIERS NON RÉFÉRENCÉS (à vérifier)
# ══════════════════════════════════════════════════════════════
echo "─────────────────────────────────────────────────────────"
echo " 3. Dossiers non référencés (à vérifier manuellement)"
echo "─────────────────────────────────────────────────────────"

# Ces dossiers ne sont pas dans settings.py
# À supprimer UNIQUEMENT si confirmé non utilisé

if [ -d "embeddings" ]; then
    echo -e "${YELLOW}⚠️  VÉRIFIER${NC}: embeddings/"
    echo -e "   Taille: $(du -sh embeddings 2>/dev/null | cut -f1 || echo 'N/A')"
    echo -e "   ${YELLOW}Action manuelle requise${NC}: Confirmer si utilisé ou non"
    echo ""
fi

if [ -d "mms" ]; then
    echo -e "${YELLOW}⚠️  VÉRIFIER${NC}: mms/"
    echo -e "   Taille: $(du -sh mms 2>/dev/null | cut -f1 || echo 'N/A')"
    echo -e "   ${YELLOW}Action manuelle requise${NC}: Probablement MMS-TTS, vérifier si utilisé"
    echo ""
fi

if [ -d "vits" ]; then
    echo -e "${YELLOW}⚠️  VÉRIFIER${NC}: vits/"
    echo -e "   Taille: $(du -sh vits 2>/dev/null | cut -f1 || echo 'N/A')"
    echo -e "   ${YELLOW}Action manuelle requise${NC}: Probablement VITS-TTS, vérifier si utilisé"
    echo ""
fi

if [ -d "xet" ]; then
    echo -e "${YELLOW}⚠️  VÉRIFIER${NC}: xet/"
    echo -e "   Taille: $(du -sh xet 2>/dev/null | cut -f1 || echo 'N/A')"
    echo -e "   ${YELLOW}Action manuelle requise${NC}: Inconnu, probablement à supprimer"
    echo ""
fi

# ══════════════════════════════════════════════════════════════
# 4. DOSSIERS ATTENDUS (à conserver)
# ══════════════════════════════════════════════════════════════
echo "─────────────────────────────────────────────────────────"
echo " 4. Dossiers attendus (conservés)"
echo "─────────────────────────────────────────────────────────"

keep_directory "huggingface" "Cache HuggingFace (NLLB, Chatterbox, Higgs)"
keep_directory "openvoice" "OpenVoice V2 checkpoints"
keep_directory "xtts" "XTTS v2 (legacy)"
keep_directory "whisper" "Whisper STT models"
keep_directory "voice_cache" "Clones vocaux utilisateurs"
keep_directory ".locks" "Fichiers de verrouillage HuggingFace"

# ══════════════════════════════════════════════════════════════
# RÉSUMÉ
# ══════════════════════════════════════════════════════════════
echo "═══════════════════════════════════════════════════════════"
echo "   Résumé"
echo "═══════════════════════════════════════════════════════════"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}MODE DRY-RUN${NC}: Aucune suppression réelle effectuée"
    echo ""
    echo "Pour exécuter le nettoyage réel:"
    echo "  ./cleanup_models.sh"
else
    echo -e "${GREEN}✅ Nettoyage terminé${NC}"
    echo ""
    echo "Espace disque récupéré: utilisez 'du -sh .' pour vérifier"
fi

echo ""
echo "Structure attendue après nettoyage:"
echo "  models/"
echo "  ├── huggingface/      # Cache HuggingFace"
echo "  ├── openvoice/        # OpenVoice V2"
echo "  ├── xtts/             # XTTS v2"
echo "  ├── whisper/          # Whisper STT"
echo "  ├── voice_cache/      # Clones vocaux"
echo "  └── .locks/           # Verrouillage HF"
echo ""

cd - > /dev/null
