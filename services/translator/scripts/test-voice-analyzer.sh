#!/bin/bash
# Script de test pour VoiceAnalyzerService
# Exécute les tests avec couverture de code et génération de rapport

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TEST_FILE="$PROJECT_ROOT/tests/test_voice_quality_analyzer.py"

echo "═══════════════════════════════════════════════════════════════════════════"
echo "  VOICE ANALYZER SERVICE - TEST SUITE"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Vérifier que pytest est installé
if ! command -v pytest &> /dev/null; then
    echo -e "${RED}❌ pytest n'est pas installé${NC}"
    echo "Installation: pip install pytest pytest-asyncio pytest-cov"
    exit 1
fi

# Vérifier que librosa est installé
if ! python3 -c "import librosa" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  librosa n'est pas installé - certains tests seront skippés${NC}"
    echo "Pour installer: pip install librosa soundfile scipy"
    echo ""
fi

cd "$PROJECT_ROOT"

# Fonction pour exécuter les tests
run_tests() {
    local mode=$1
    local extra_args="${2:-}"

    case $mode in
        "quick")
            echo -e "${BLUE}🚀 Mode rapide - Tests de base${NC}"
            pytest "$TEST_FILE" -v -k "not (performance or stress or concurrent)" $extra_args
            ;;
        "full")
            echo -e "${BLUE}🧪 Mode complet - Tous les tests${NC}"
            pytest "$TEST_FILE" -v $extra_args
            ;;
        "coverage")
            echo -e "${BLUE}📊 Mode couverture - Avec rapport de couverture${NC}"
            pytest "$TEST_FILE" -v \
                --cov=src/services/voice_analyzer_service \
                --cov-report=term-missing \
                --cov-report=html:htmlcov \
                $extra_args
            ;;
        "integration")
            echo -e "${BLUE}🔗 Tests d'intégration uniquement${NC}"
            pytest "$TEST_FILE" -v -k "integration or pipeline" $extra_args
            ;;
        "edge")
            echo -e "${BLUE}⚠️  Tests edge cases uniquement${NC}"
            pytest "$TEST_FILE" -v -k "edge or silence or noise or short or error" $extra_args
            ;;
        *)
            echo -e "${RED}❌ Mode inconnu: $mode${NC}"
            echo "Modes disponibles: quick, full, coverage, integration, edge"
            exit 1
            ;;
    esac
}

# Parser les arguments
MODE="quick"
EXTRA_ARGS=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --mode)
            MODE="$2"
            shift 2
            ;;
        --verbose)
            EXTRA_ARGS="$EXTRA_ARGS -vv"
            shift
            ;;
        --failfast)
            EXTRA_ARGS="$EXTRA_ARGS -x"
            shift
            ;;
        --markers)
            pytest --markers
            exit 0
            ;;
        --help)
            echo "Usage: ./test-voice-analyzer.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --mode MODE        Mode de test (quick, full, coverage, integration, edge)"
            echo "  --verbose          Mode verbose (-vv)"
            echo "  --failfast         Arrêter au premier échec (-x)"
            echo "  --markers          Afficher les markers pytest disponibles"
            echo "  --help             Afficher cette aide"
            echo ""
            echo "Exemples:"
            echo "  ./test-voice-analyzer.sh --mode quick"
            echo "  ./test-voice-analyzer.sh --mode coverage --verbose"
            echo "  ./test-voice-analyzer.sh --mode edge --failfast"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Option inconnue: $1${NC}"
            echo "Utilisez --help pour voir les options disponibles"
            exit 1
            ;;
    esac
done

# Afficher les informations
echo -e "${GREEN}📁 Répertoire projet:${NC} $PROJECT_ROOT"
echo -e "${GREEN}📄 Fichier de test:${NC} $TEST_FILE"
echo -e "${GREEN}🎯 Mode:${NC} $MODE"
echo ""

# Exécuter les tests
run_tests "$MODE" "$EXTRA_ARGS"

EXIT_CODE=$?

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ TOUS LES TESTS SONT PASSÉS${NC}"

    if [ "$MODE" = "coverage" ]; then
        echo ""
        echo -e "${BLUE}📊 Rapport de couverture HTML généré:${NC}"
        echo "   file://$PROJECT_ROOT/htmlcov/index.html"
        echo ""
        echo "Ouvrir avec: open htmlcov/index.html"
    fi
else
    echo -e "${RED}❌ DES TESTS ONT ÉCHOUÉ${NC}"
fi

echo "═══════════════════════════════════════════════════════════════════════════"

exit $EXIT_CODE
