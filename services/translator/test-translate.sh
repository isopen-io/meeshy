#!/bin/bash

# Script de test complet pour le système de traduction Meeshy
# Exécute tous les tests dans l'ordre de complexité croissante

set -e

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$SCRIPT_DIR/tests"
LOG_FILE="$SCRIPT_DIR/test_results.log"

# Fonctions utilitaires
print_header() {
    echo -e "${BLUE}==================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}==================================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️ $1${NC}"
}

print_test_header() {
    echo -e "${PURPLE}🧪 $1${NC}"
}

# Vérifications préalables
check_prerequisites() {
    print_header "Vérification des prérequis"
    
    # Vérifier que nous sommes dans le bon répertoire
    if [ ! -f "src/config/settings.py" ]; then
        print_error "Ce script doit être exécuté depuis le répertoire translator/"
        exit 1
    fi
    
    # Vérifier que le dossier tests existe
    if [ ! -d "$TESTS_DIR" ]; then
        print_error "Dossier tests non trouvé: $TESTS_DIR"
        exit 1
    fi
    
    # Vérifier Python
    if ! command -v python3 &> /dev/null; then
        print_error "Python3 n'est pas installé"
        exit 1
    fi
    
    # Vérifier les dépendances Python de base
    print_info "Vérification des dépendances Python..."
    python3 -c "import sys, os, logging" 2>/dev/null || {
        print_error "Dépendances Python de base manquantes"
        exit 1
    }
    
    print_success "Prérequis vérifiés"
}

# Nettoyer les logs précédents
cleanup_logs() {
    print_info "Nettoyage des logs précédents..."
    > "$LOG_FILE"
    print_success "Logs nettoyés"
}

# Exécuter un test individuel
run_test() {
    local test_file="$1"
    local test_name="$2"
    local test_level="$3"
    
    print_test_header "Test $test_level: $test_name"
    
    if [ ! -f "$test_file" ]; then
        print_error "Fichier de test non trouvé: $test_file"
        return 1
    fi
    
    # Rendre le fichier exécutable
    chmod +x "$test_file"
    
    # Exécuter le test et capturer la sortie
    local output
    local exit_code
    
    output=$(python3 "$test_file" 2>&1)
    exit_code=$?
    
    # Afficher la sortie
    echo "$output"
    
    # Enregistrer dans le log
    echo "=== Test $test_level: $test_name ===" >> "$LOG_FILE"
    echo "$output" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    
    if [ $exit_code -eq 0 ]; then
        print_success "Test $test_level réussi"
        return 0
    else
        print_error "Test $test_level échoué (code: $exit_code)"
        return 1
    fi
}

# Exécuter tous les tests
run_all_tests() {
    print_header "Démarrage des tests de traduction Meeshy"
    
    # Configuration des tests (ordre de complexité croissante)
    declare -a tests=(
        "test_01_model_utils.py|Utilitaires de base|01"
        "test_02_model_detection.py|Détection des modèles|02"
        "test_03_model_download.py|Téléchargement des modèles|03"
        "test_04_service_integration.py|Intégration du service|04"
        "test_05_quantized_service.py|Service quantifié|05"
    )
    
    local total_tests=${#tests[@]}
    local passed_tests=0
    local failed_tests=0
    
    print_info "Nombre total de tests: $total_tests"
    echo ""
    
    # Exécuter chaque test
    for test_config in "${tests[@]}"; do
        IFS='|' read -r test_file test_name test_level <<< "$test_config"
        test_path="$TESTS_DIR/$test_file"
        
        if run_test "$test_path" "$test_name" "$test_level"; then
            ((passed_tests++))
        else
            ((failed_tests++))
        fi
        
        echo ""
    done
    
    # Résumé final
    print_header "Résumé des tests"
    
    echo -e "${CYAN}📊 Statistiques:${NC}"
    echo -e "  - Tests réussis: ${GREEN}$passed_tests${NC}"
    echo -e "  - Tests échoués: ${RED}$failed_tests${NC}"
    echo -e "  - Total: $total_tests"
    echo ""
    
    if [ $failed_tests -eq 0 ]; then
        print_success "🎉 Tous les tests ont réussi!"
        echo ""
        echo -e "${GREEN}Le système de traduction est prêt à être utilisé.${NC}"
        return 0
    else
        print_error "💥 $failed_tests test(s) ont échoué"
        echo ""
        echo -e "${YELLOW}Consultez le fichier de log pour plus de détails: $LOG_FILE${NC}"
        return 1
    fi
}

# Fonction d'aide
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help     Afficher cette aide"
    echo "  -v, --verbose  Mode verbeux"
    echo "  -l, --log      Afficher le fichier de log à la fin"
    echo ""
    echo "Description:"
    echo "  Exécute tous les tests du système de traduction dans l'ordre"
    echo "  de complexité croissante et affiche un résumé des résultats."
    echo ""
    echo "Tests exécutés:"
    echo "  01. Utilitaires de base du gestionnaire de modèles"
    echo "  02. Détection des modèles existants"
    echo "  03. Téléchargement des modèles (optionnel)"
    echo "  04. Intégration avec le service de traduction"
    echo "  05. Service de traduction quantifié"
}

# Gestion des arguments
VERBOSE=false
SHOW_LOG=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -l|--log)
            SHOW_LOG=true
            shift
            ;;
        *)
            print_error "Option inconnue: $1"
            show_help
            exit 1
            ;;
    esac
done

# Fonction principale
main() {
    print_header "🚀 Test du système de traduction Meeshy"
    
    # Vérifications préalables
    check_prerequisites
    
    # Nettoyer les logs
    cleanup_logs
    
    # Exécuter tous les tests
    if run_all_tests; then
        exit_code=0
    else
        exit_code=1
    fi
    
    # Afficher le log si demandé
    if [ "$SHOW_LOG" = true ]; then
        echo ""
        print_header "Fichier de log complet"
        cat "$LOG_FILE"
    fi
    
    exit $exit_code
}

# Exécuter le script principal
main "$@"
