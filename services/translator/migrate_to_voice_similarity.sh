#!/bin/bash
# =============================================================================
# Script de migration: isCurrentUser → voiceSimilarityScore
# =============================================================================
# Remplace le boolean isCurrentUser par un score de similarité vocale (0-1)
# dans tous les fichiers Python et la documentation
# =============================================================================

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    Migration: isCurrentUser → voiceSimilarityScore           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Fonction de remplacement dans un fichier
replace_in_file() {
    local file=$1
    local desc=$2

    if [ ! -f "$file" ]; then
        echo -e "${YELLOW}⚠️  Fichier non trouvé: $file${NC}"
        return
    fi

    echo -e "${BLUE}📝 Mise à jour: $desc${NC}"

    # Python: is_current_user → voice_similarity_score
    sed -i.bak 's/is_current_user: bool = False/voice_similarity_score: Optional[float] = None/g' "$file"
    sed -i.bak 's/is_current_user=False/voice_similarity_score=None/g' "$file"
    sed -i.bak 's/is_current_user=/voice_similarity_score=/g' "$file"
    sed -i.bak 's/\.is_current_user/.voice_similarity_score/g' "$file"
    sed -i.bak 's/segment\.is_current_user/segment.voice_similarity_score/g' "$file"
    sed -i.bak 's/s\.is_current_user/s.voice_similarity_score/g' "$file"

    # Python comments
    sed -i.bak 's/True si c.est l.expéditeur du message/Score de similarité vocale avec l utilisateur (0-1)/g' "$file"
    sed -i.bak 's/is_current_user (qui parle)/voice_similarity_score (score similarité)/g' "$file"

    # Supprimer le backup
    rm -f "$file.bak"

    echo -e "${GREEN}  ✅ Fichier mis à jour${NC}"
}

# Mettre à jour les fichiers Python
echo -e "${YELLOW}🐍 Mise à jour des fichiers Python...${NC}"
echo ""

replace_in_file \
    "src/services/transcription_service.py" \
    "TranscriptionService - dataclass TranscriptionSegment"

replace_in_file \
    "src/services/diarization_service.py" \
    "DiarizationService - identify_sender"

replace_in_file \
    "src/utils/smart_segment_merger.py" \
    "SmartSegmentMerger - fusion des segments"

echo ""
echo -e "${GREEN}✅ Migration terminée !${NC}"
echo ""

echo -e "${BLUE}📋 Prochaines étapes:${NC}"
echo "1. Vérifier les modifications: git diff"
echo "2. Implémenter la vraie reconnaissance vocale dans identify_sender()"
echo "3. Tester avec: python -m pytest tests/"
echo ""

echo -e "${YELLOW}ℹ️  Note:${NC}"
echo "Le score de similarité vocale nécessite:"
echo "  - Un profil vocal de l'utilisateur (UserVoiceModel)"
echo "  - L'extraction d'embeddings vocaux (pyannote.audio ou resemblyzer)"
echo "  - Le calcul de similarité cosinus entre embeddings"
echo ""

exit 0
