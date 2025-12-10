#!/bin/bash

# ===== MEESHY - SCRIPT UNIFIÉ DE GESTION DES SERVICES (V2.0 MODULAIRE) =====
# Script orchestrateur pour tous les modules Meeshy
# Usage: ./meeshy.sh [COMMAND] [OPTIONS]

set -e

# Charger la configuration globale
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/meeshy-config.sh"

# Initialiser la traçabilité
init_tracing "meeshy-orchestrator" "orchestration"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🚀 MEESHY - SCRIPT UNIFIÉ DE GESTION DES SERVICES (V2.0 MODULAIRE)${NC}"
    echo "=================================================================="
    echo ""
    echo "Usage:"
    echo "  ./meeshy.sh [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo -e "${GREEN}  Gestion des services:${NC}"
    echo "    start       - Démarrer tous les services"
    echo "    stop        - Arrêter tous les services"
    echo "    restart     - Redémarrer tous les services"
    echo "    status      - Afficher le statut des services"
    echo "    logs        - Afficher les logs des services"
    echo ""
    echo -e "${GREEN}  Maintenance:${NC}"
    echo "    clean       - Nettoyer les conteneurs et images inutilisés"
    echo "    backup      - Sauvegarder les données"
    echo "    restore     - Restaurer les données"
    echo "    update      - Mettre à jour et redémarrer"
    echo "    health      - Vérifier la santé des services"
    echo "    optimize    - Optimiser les performances"
    echo "    security    - Vérifications de sécurité"
    echo ""
    echo -e "${GREEN}  Utilitaires:${NC}"
    echo "    info        - Afficher les informations système"
    echo "    trace       - Afficher les traces d'opérations"
    echo "    version     - Afficher la version"
    echo ""
    echo "Options:"
    echo "  --force     - Forcer l'opération"
    echo "  --no-pull   - Ne pas télécharger les images"
    echo "  --logs      - Afficher les logs après démarrage"
    echo "  --detailed  - Affichage détaillé"
    echo "  --help      - Afficher cette aide"
    echo ""
    echo "Exemples:"
    echo "  ./meeshy.sh start"
    echo "  ./meeshy.sh status --detailed"
    echo "  ./meeshy.sh logs gateway --follow"
    echo "  ./meeshy.sh maintenance clean --force"
    echo "  ./meeshy.sh backup"
    echo ""
    echo -e "${YELLOW}💡 Architecture modulaire:${NC}"
    echo "  • meeshy-config.sh    - Configuration globale et traçabilité"
    echo "  • meeshy-start.sh     - Démarrage des services"
    echo "  • meeshy-stop.sh      - Arrêt des services"
    echo "  • meeshy-status.sh    - Statut et surveillance"
    echo "  • meeshy-logs.sh      - Gestion des logs"
    echo "  • meeshy-maintenance.sh - Maintenance et nettoyage"
    echo ""
}

# Fonction pour exécuter un module
execute_module() {
    local module="$1"
    shift
    local args="$@"
    
    local module_script="$SCRIPT_DIR/$module"
    
    if [ ! -f "$module_script" ]; then
        log_error "Module non trouvé: $module"
        trace_operation "module_execution" "FAILED" "Module not found: $module"
        exit 1
    fi
    
    if [ ! -x "$module_script" ]; then
        log_warning "Rendre le module exécutable: $module"
        chmod +x "$module_script"
    fi
    
    log_info "Exécution du module: $module"
    trace_operation "module_execution" "STARTED" "Executing module: $module"
    
    # Exécuter le module avec les arguments
    "$module_script" $args
    local exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        trace_operation "module_execution" "SUCCESS" "Module executed successfully: $module"
    else
        trace_operation "module_execution" "FAILED" "Module execution failed: $module (exit code: $exit_code)"
    fi
    
    return $exit_code
}

# Afficher les informations système
show_info() {
    log_info "Informations système Meeshy:"
    echo ""
    get_system_info
    echo ""
    
    # Afficher les modules disponibles
    echo "=== MODULES DISPONIBLES ==="
    local modules=("meeshy-start.sh" "meeshy-stop.sh" "meeshy-status.sh" "meeshy-logs.sh" "meeshy-maintenance.sh")
    
    for module in "${modules[@]}"; do
        local module_path="$SCRIPT_DIR/$module"
        if [ -f "$module_path" ]; then
            local status="✅ Disponible"
            if [ -x "$module_path" ]; then
                status="✅ Exécutable"
            else
                status="⚠️  Non exécutable"
            fi
            echo "  $module: $status"
        else
            echo "  $module: ❌ Manquant"
        fi
    done
    echo ""
    
    # Afficher les répertoires de traçabilité
    echo "=== RÉPERTOIRES DE TRAÇABILITÉ ==="
    echo "  Logs: $MEESHY_LOGS_DIR"
    echo "  Traces: $MEESHY_TRACE_DIR"
    echo "  Backups: $MEESHY_BACKUP_DIR"
    echo ""
}

# Afficher les traces d'opérations
show_traces() {
    local lines="${1:-50}"
    
    log_info "Affichage des dernières traces d'opérations..."
    
    local trace_file="$MEESHY_TRACE_DIR/operations.log"
    
    if [ -f "$trace_file" ]; then
        echo "=== DERNIÈRES TRACES D'OPÉRATIONS ==="
        tail -n "$lines" "$trace_file"
        echo ""
        echo "Fichier complet: $trace_file"
    else
        log_warning "Aucun fichier de trace trouvé: $trace_file"
    fi
}

# Afficher la version
show_version() {
    echo "=== MEESHY VERSION INFO ==="
    echo "Version: $MEESHY_VERSION"
    echo "Script Version: $MEESHY_SCRIPT_VERSION"
    echo "Build Date: $MEESHY_BUILD_DATE"
    echo "Environment: $MEESHY_ENVIRONMENT"
    echo "Deployment ID: $MEESHY_DEPLOYMENT_ID"
    echo "========================="
}

# Redémarrer les services
restart_services() {
    local args="$@"
    
    log_info "Redémarrage des services..."
    trace_operation "restart_services" "STARTED" "Restarting services"
    
    # Arrêter les services
    execute_module "meeshy-stop.sh" $args
    
    # Attendre un peu
    sleep 5
    
    # Démarrer les services
    execute_module "meeshy-start.sh" $args
    
    trace_operation "restart_services" "SUCCESS" "Services restarted"
}

# Fonction principale
main() {
    local command="$1"
    shift
    local args="$@"
    
    # Vérifications préliminaires (sauf pour les commandes d'information)
    if [[ "$command" != "info" && "$command" != "version" && "$command" != "trace" && "$command" != "help" && "$command" != "--help" && "$command" != "-h" ]]; then
        check_prerequisites
        load_environment
    fi
    
    # Exécuter la commande demandée
    case "$command" in
        "start")
            execute_module "meeshy-start.sh" $args
            ;;
        "stop")
            execute_module "meeshy-stop.sh" $args
            ;;
        "restart")
            restart_services $args
            ;;
        "status")
            execute_module "meeshy-status.sh" $args
            ;;
        "logs")
            execute_module "meeshy-logs.sh" $args
            ;;
        "clean")
            execute_module "meeshy-maintenance.sh" "clean" $args
            ;;
        "backup")
            execute_module "meeshy-maintenance.sh" "backup" $args
            ;;
        "restore")
            execute_module "meeshy-maintenance.sh" "restore" $args
            ;;
        "update")
            execute_module "meeshy-maintenance.sh" "update" $args
            ;;
        "health")
            execute_module "meeshy-maintenance.sh" "health" $args
            ;;
        "optimize")
            execute_module "meeshy-maintenance.sh" "optimize" $args
            ;;
        "security")
            execute_module "meeshy-maintenance.sh" "security" $args
            ;;
        "info")
            show_info
            ;;
        "trace")
            show_traces $args
            ;;
        "version")
            show_version
            ;;
        "help"|"-h"|"--help"|"")
            show_help
            ;;
        *)
            log_error "Commande inconnue: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
    
    # Finaliser la traçabilité
    finalize_tracing "SUCCESS" "Orchestration completed: $command"
}

# Exécuter la fonction principale
main "$@"