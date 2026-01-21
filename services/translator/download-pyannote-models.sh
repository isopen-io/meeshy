#!/bin/bash
# =============================================================================
# Script de téléchargement des modèles pyannote.audio en cache local
# =============================================================================
# Ce script télécharge les modèles UNE FOIS avec un token HuggingFace temporaire
# Ensuite, les modèles sont en cache et le token n'est plus nécessaire !
#
# Usage:
#   export HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxx
#   ./download-pyannote-models.sh
# =============================================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    Téléchargement des modèles pyannote.audio                  ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Vérifier HF_TOKEN
if [ -z "$HF_TOKEN" ]; then
    echo -e "${RED}❌ HF_TOKEN non défini${NC}"
    echo ""
    echo -e "${YELLOW}📝 Étapes pour obtenir un token HuggingFace (gratuit):${NC}"
    echo ""
    echo "  1. Créer un compte sur https://huggingface.co/"
    echo "  2. Accepter les conditions du modèle:"
    echo "     https://huggingface.co/pyannote/speaker-diarization-3.1"
    echo "  3. Créer un token (Read access):"
    echo "     https://huggingface.co/settings/tokens"
    echo "  4. Exécuter:"
    echo "     export HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxx"
    echo "     ./download-pyannote-models.sh"
    echo ""
    exit 1
fi

echo -e "${BLUE}🔑 Token HuggingFace détecté: ${HF_TOKEN:0:10}...${NC}"
echo ""

# Activer l'environnement virtuel
echo -e "${BLUE}🐍 Activation de l'environnement virtuel...${NC}"
if [ ! -d ".venv" ]; then
    echo -e "${RED}❌ .venv n'existe pas. Exécutez 'make install' d'abord.${NC}"
    exit 1
fi

source .venv/bin/activate
echo ""

# Télécharger les modèles
echo -e "${YELLOW}📦 Téléchargement des modèles pyannote.audio...${NC}"
echo -e "${YELLOW}   (Cela peut prendre quelques minutes - environ 500MB)${NC}"
echo ""

python << 'EOF'
import os
from pyannote.audio import Pipeline

try:
    print("🔄 Chargement du pipeline pyannote/speaker-diarization-3.1...")
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=os.environ['HF_TOKEN']
    )
    print("✅ Pipeline chargé avec succès !")
    print("")
    print("📁 Les modèles sont maintenant en cache dans:")
    print("   ~/.cache/huggingface/hub/")
    print("")
    print("🎉 SUCCÈS ! Vous pouvez maintenant :")
    print("   1. Supprimer le token HF (plus nécessaire)")
    print("   2. Utiliser la diarisation sans token au runtime")
    print("   3. La diarisation fonctionne même offline !")

except Exception as e:
    print(f"❌ Erreur: {e}")
    print("")
    print("Vérifiez que :")
    print("  - Le token HF est valide")
    print("  - Vous avez accepté les conditions du modèle")
    print("    https://huggingface.co/pyannote/speaker-diarization-3.1")
    exit(1)
EOF

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           ✅ Téléchargement terminé avec succès !              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📝 Prochaines étapes:${NC}"
echo ""
echo -e "${YELLOW}1. Vous pouvez maintenant SUPPRIMER le token HuggingFace:${NC}"
echo "   unset HF_TOKEN"
echo ""
echo -e "${YELLOW}2. Tester la diarisation:${NC}"
echo "   cd services/translator"
echo "   python -c \"from pyannote.audio import Pipeline; p = Pipeline.from_pretrained('pyannote/speaker-diarization-3.1'); print('✅ Fonctionne sans token !')\""
echo ""
echo -e "${YELLOW}3. Démarrer le service:${NC}"
echo "   cd /path/to/v2_meeshy && make dev-translator"
echo ""
echo -e "${GREEN}🎯 La diarisation est maintenant activée et ne nécessite plus de token !${NC}"
echo ""

exit 0
