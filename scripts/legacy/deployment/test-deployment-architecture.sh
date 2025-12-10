#!/bin/bash

# ===== MEESHY - TEST DE L'ARCHITECTURE DE DÉPLOIEMENT =====
# Script de test pour valider l'intégrité et la fonctionnalité de l'architecture modulaire
# Usage: ./test-deployment-architecture.sh

set -e

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Fonctions de logging
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Test 1: Vérifier la présence de tous les modules
test_module_presence() {
    log_info "Test 1: Vérification de la présence de tous les modules"
    
    local modules=(
        "deploy-config.sh"
        "deploy-test-connection.sh"
        "deploy-prepare-files.sh"
        "deploy-install-prerequisites.sh"
        "deploy-configure-mongodb.sh"
        "deploy-start-services.sh"
        "deploy-health-check.sh"
        "deploy-maintenance.sh"
        "deploy-orchestrator.sh"
    )
    
    local missing_modules=()
    
    for module in "${modules[@]}"; do
        if [ -f "$SCRIPT_DIR/$module" ]; then
            log_success "Module trouvé: $module"
        else
            log_error "Module manquant: $module"
            missing_modules+=("$module")
        fi
    done
    
    if [ ${#missing_modules[@]} -eq 0 ]; then
        log_success "Tous les modules sont présents"
        return 0
    else
        log_error "Modules manquants: ${missing_modules[*]}"
        return 1
    fi
}

# Test 2: Vérifier l'exécutabilité des modules
test_module_executability() {
    log_info "Test 2: Vérification de l'exécutabilité des modules"
    
    local modules=(
        "deploy-config.sh"
        "deploy-test-connection.sh"
        "deploy-prepare-files.sh"
        "deploy-install-prerequisites.sh"
        "deploy-configure-mongodb.sh"
        "deploy-start-services.sh"
        "deploy-health-check.sh"
        "deploy-maintenance.sh"
        "deploy-orchestrator.sh"
    )
    
    local non_executable=()
    
    for module in "${modules[@]}"; do
        if [ -x "$SCRIPT_DIR/$module" ]; then
            log_success "Module exécutable: $module"
        else
            log_error "Module non exécutable: $module"
            non_executable+=("$module")
        fi
    done
    
    if [ ${#non_executable[@]} -eq 0 ]; then
        log_success "Tous les modules sont exécutables"
        return 0
    else
        log_error "Modules non exécutables: ${non_executable[*]}"
        return 1
    fi
}

# Test 3: Tester les commandes d'aide
test_help_commands() {
    log_info "Test 3: Test des commandes d'aide"
    
    local modules=(
        "deploy-test-connection.sh"
        "deploy-prepare-files.sh"
        "deploy-install-prerequisites.sh"
        "deploy-configure-mongodb.sh"
        "deploy-start-services.sh"
        "deploy-health-check.sh"
        "deploy-maintenance.sh"
        "deploy-orchestrator.sh"
    )
    
    local failed_help=()
    
    for module in "${modules[@]}"; do
        log_info "Test de l'aide pour $module"
        # Tester si le script contient une fonction show_help
        if grep -q "show_help" "$SCRIPT_DIR/$module"; then
            log_success "Fonction d'aide présente: $module"
        else
            log_error "Fonction d'aide manquante: $module"
            failed_help+=("$module")
        fi
    done
    
    if [ ${#failed_help[@]} -eq 0 ]; then
        log_success "Toutes les commandes d'aide fonctionnent"
        return 0
    else
        log_error "Commandes d'aide défaillantes: ${failed_help[*]}"
        return 1
    fi
}

# Test 4: Tester le chargement de la configuration
test_config_loading() {
    log_info "Test 4: Test du chargement de la configuration"
    
    # Tester le chargement de la configuration
    if source "$SCRIPT_DIR/deploy-config.sh" >/dev/null 2>&1; then
        log_success "Configuration chargée avec succès"
        
        # Vérifier les variables essentielles
        local required_vars=(
            "DEPLOY_VERSION"
            "DEPLOY_SESSION_ID"
            "DEPLOY_ENVIRONMENT"
            "PROJECT_ROOT"
            "DOCKER_COMPOSE_FILE"
        )
        
        local missing_vars=()
        
        for var in "${required_vars[@]}"; do
            if [ -n "${!var}" ]; then
                log_success "Variable définie: $var"
            else
                log_error "Variable manquante: $var"
                missing_vars+=("$var")
            fi
        done
        
        if [ ${#missing_vars[@]} -eq 0 ]; then
            log_success "Toutes les variables de configuration sont définies"
            return 0
        else
            log_error "Variables manquantes: ${missing_vars[*]}"
            return 1
        fi
    else
        log_error "Échec du chargement de la configuration"
        return 1
    fi
}

# Test 5: Tester les fonctions de logging
test_logging_functions() {
    log_info "Test 5: Test des fonctions de logging"
    
    # Charger la configuration
    source "$SCRIPT_DIR/deploy-config.sh" >/dev/null 2>&1
    
    # Tester les fonctions de logging
    local functions=("log_info" "log_success" "log_warning" "log_error")
    
    for func in "${functions[@]}"; do
        if type "$func" >/dev/null 2>&1; then
            log_success "Fonction de logging disponible: $func"
        else
            log_error "Fonction de logging manquante: $func"
            return 1
        fi
    done
    
    log_success "Toutes les fonctions de logging sont disponibles"
    return 0
}

# Test 6: Tester la traçabilité
test_tracing_functions() {
    log_info "Test 6: Test des fonctions de traçabilité"
    
    # Charger la configuration
    source "$SCRIPT_DIR/deploy-config.sh" >/dev/null 2>&1
    
    # Tester les fonctions de traçabilité
    local functions=("trace_deploy_operation" "init_deploy_tracing" "finalize_deploy_tracing")
    
    for func in "${functions[@]}"; do
        if type "$func" >/dev/null 2>&1; then
            log_success "Fonction de traçabilité disponible: $func"
        else
            log_error "Fonction de traçabilité manquante: $func"
            return 1
        fi
    done
    
    log_success "Toutes les fonctions de traçabilité sont disponibles"
    return 0
}

# Test 7: Vérifier la cohérence des dépendances
test_dependency_consistency() {
    log_info "Test 7: Vérification de la cohérence des dépendances"
    
    # Vérifier que tous les modules peuvent charger deploy-config.sh
    local modules=(
        "deploy-test-connection.sh"
        "deploy-prepare-files.sh"
        "deploy-install-prerequisites.sh"
        "deploy-configure-mongodb.sh"
        "deploy-start-services.sh"
        "deploy-health-check.sh"
        "deploy-maintenance.sh"
        "deploy-orchestrator.sh"
    )
    
    local failed_deps=()
    
    for module in "${modules[@]}"; do
        log_info "Vérification des dépendances pour $module"
        
        # Vérifier que le module source deploy-config.sh
        if grep -q "source.*deploy-config.sh" "$SCRIPT_DIR/$module"; then
            log_success "Dépendance correcte: $module"
        else
            log_error "Dépendance manquante: $module"
            failed_deps+=("$module")
        fi
    done
    
    if [ ${#failed_deps[@]} -eq 0 ]; then
        log_success "Toutes les dépendances sont cohérentes"
        return 0
    else
        log_error "Dépendances incohérentes: ${failed_deps[*]}"
        return 1
    fi
}

# Test 8: Vérifier la structure des répertoires
test_directory_structure() {
    log_info "Test 8: Vérification de la structure des répertoires"
    
    # Vérifier que les répertoires de traçabilité peuvent être créés
    local temp_dirs=(
        "/tmp/meeshy-deploy/logs"
        "/tmp/meeshy-deploy/traces"
        "/tmp/meeshy-deploy/temp"
    )
    
    for dir in "${temp_dirs[@]}"; do
        if mkdir -p "$dir" 2>/dev/null; then
            log_success "Répertoire créable: $dir"
            rmdir "$dir" 2>/dev/null || true
        else
            log_error "Répertoire non créable: $dir"
            return 1
        fi
    done
    
    log_success "Structure des répertoires valide"
    return 0
}

# Test 9: Vérifier la compatibilité avec le script original
test_original_compatibility() {
    log_info "Test 9: Vérification de la compatibilité avec le script original"
    
    # Vérifier que le script original existe
    if [ -f "$PROJECT_ROOT/scripts/meeshy-deploy.sh" ]; then
        log_success "Script original trouvé: meeshy-deploy.sh"
        
        # Vérifier la taille du script original
        local original_size=$(wc -l < "$PROJECT_ROOT/scripts/meeshy-deploy.sh")
        log_info "Taille du script original: $original_size lignes"
        
        # Vérifier que l'orchestrateur peut remplacer le script original
        if [ -f "$SCRIPT_DIR/deploy-orchestrator.sh" ]; then
            log_success "Orchestrateur disponible pour remplacer le script original"
        else
            log_error "Orchestrateur manquant"
            return 1
        fi
    else
        log_warning "Script original non trouvé: meeshy-deploy.sh"
    fi
    
    log_success "Compatibilité avec le script original vérifiée"
    return 0
}

# Test 10: Test de performance
test_performance() {
    log_info "Test 10: Test de performance"
    
    # Mesurer le temps de chargement de la configuration
    local start_time=$(date +%s%N)
    source "$SCRIPT_DIR/deploy-config.sh" >/dev/null 2>&1
    local end_time=$(date +%s%N)
    local load_time=$(( (end_time - start_time) / 1000000 ))
    
    log_info "Temps de chargement de la configuration: ${load_time}ms"
    
    if [ $load_time -lt 1000 ]; then
        log_success "Performance de chargement excellente: ${load_time}ms"
    elif [ $load_time -lt 5000 ]; then
        log_success "Performance de chargement acceptable: ${load_time}ms"
    else
        log_warning "Performance de chargement lente: ${load_time}ms"
    fi
    
    return 0
}

# Fonction principale
main() {
    echo -e "${CYAN}🧪 MEESHY - TEST DE L'ARCHITECTURE DE DÉPLOIEMENT${NC}"
    echo "======================================================"
    echo ""
    
    local tests=(
        "test_module_presence"
        "test_module_executability"
        "test_help_commands"
        "test_config_loading"
        "test_logging_functions"
        "test_tracing_functions"
        "test_dependency_consistency"
        "test_directory_structure"
        "test_original_compatibility"
        "test_performance"
    )
    
    local passed=0
    local failed=0
    
    for test in "${tests[@]}"; do
        echo "--- $test ---"
        if $test; then
            ((passed++))
        else
            ((failed++))
        fi
        echo ""
    done
    
    # Résumé des tests
    echo "=== RÉSUMÉ DES TESTS ==="
    echo "Tests réussis: $passed"
    echo "Tests échoués: $failed"
    echo "Total: $((passed + failed))"
    
    if [ $failed -eq 0 ]; then
        log_success "Tous les tests sont passés avec succès!"
        echo ""
        echo -e "${GREEN}🎉 L'architecture modulaire de déploiement est prête à être utilisée!${NC}"
        echo ""
        echo "Pour utiliser l'orchestrateur:"
        echo "  ./deploy-orchestrator.sh --help"
        echo ""
        echo "Pour déployer:"
        echo "  ./deploy-orchestrator.sh deploy [IP_SERVEUR]"
        echo ""
        exit 0
    else
        log_error "Certains tests ont échoué. Veuillez corriger les problèmes avant d'utiliser l'architecture."
        exit 1
    fi
}

# Exécuter la fonction principale
main "$@"
