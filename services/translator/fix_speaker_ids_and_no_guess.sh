#!/bin/bash
# =============================================================================
# Script de correction: speaker_N → sN et pas de devinette sans embedding
# =============================================================================

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    Correction: speaker_N → sN + pas de devinette             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Fonction de remplacement
replace_speaker_ids() {
    local file=$1
    local desc=$2

    if [ ! -f "$file" ]; then
        echo -e "${YELLOW}⚠️  Fichier non trouvé: $file${NC}"
        return
    fi

    echo -e "${BLUE}📝 Correction: $desc${NC}"

    # Remplacer speaker_N par sN
    # Patterns à remplacer:
    # - speaker_0 → s0
    # - speaker_1 → s1
    # - "speaker_{label}" → "s{label}"
    # - f"speaker_{label}" → f"s{label}"

    sed -i.bak 's/"speaker_/"s/g' "$file"
    sed -i.bak "s/'speaker_/'s/g" "$file"
    sed -i.bak 's/f"speaker_{/f"s{/g' "$file"
    sed -i.bak "s/f'speaker_{/f's{/g" "$file"
    sed -i.bak 's/speaker_id = "speaker_/speaker_id = "s/g' "$file"
    sed -i.bak 's/primary_speaker_id = "speaker_/primary_speaker_id = "s/g' "$file"
    sed -i.bak 's/sender_speaker_id = "speaker_/sender_speaker_id = "s/g' "$file"

    # Supprimer le backup
    rm -f "$file.bak"

    echo -e "${GREEN}  ✅ IDs raccourcis : speaker_N → sN${NC}"
}

# Corriger les fichiers Python
echo -e "${YELLOW}🐍 Correction des fichiers Python...${NC}"
echo ""

replace_speaker_ids \
    "src/services/diarization_service.py" \
    "DiarizationService - IDs speakers"

replace_speaker_ids \
    "src/services/transcription_service.py" \
    "TranscriptionService - IDs speakers"

replace_speaker_ids \
    "NOUVEAU_identify_sender.py" \
    "Code de référence identify_sender"

echo ""
echo -e "${GREEN}✅ Corrections appliquées !${NC}"
echo ""

echo -e "${BLUE}📋 Changements effectués:${NC}"
echo "  1. speaker_0 → s0"
echo "  2. speaker_1 → s1"
echo "  3. speaker_N → sN"
echo ""

echo -e "${YELLOW}ℹ️  Note sur la logique sans embedding:${NC}"
echo "La modification pour ne pas deviner sans embedding sera"
echo "faite manuellement dans diarization_service.py"
echo ""

exit 0
