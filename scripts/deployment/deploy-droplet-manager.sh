#!/bin/bash

# ===== MEESHY - GESTION DES DROPLETS DIGITALOCEAN =====
# Script spécialisé pour gérer les droplets avec doctl
# Usage: ./deploy-droplet-manager.sh [command] [options]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-droplet-manager" "droplet_management"

# Configuration par défaut
DEFAULT_DROPLET_NAME="meeshy-server"
DEFAULT_DROPLET_SIZE="s-2vcpu-2gb"
DEFAULT_DROPLET_IMAGE="ubuntu-22-04-x64"
DEFAULT_DROPLET_REGION="nyc1"
DEFAULT_SSH_KEY_NAME="meeshy-key"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}🌐 MEESHY - GESTION DES DROPLETS DIGITALOCEAN${NC}"
    echo "=================================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-droplet-manager.sh [command] [options]"
    echo ""
    echo "Commandes disponibles:"
    echo "  list                    Lister tous les droplets"
    echo "  create [name]           Créer un nouveau droplet"
    echo "  get [name|ip]           Obtenir les informations d'un droplet"
    echo "  delete [name|ip]        Supprimer un droplet"
    echo "  find-by-ip [ip]         Trouver un droplet par son IP"
    echo "  setup-ssh-key           Configurer la clé SSH"
    echo "  check-doctl             Vérifier l'installation de doctl"
    echo ""
    echo "Options:"
    echo "  --size [slug]           Taille du droplet (défaut: $DEFAULT_DROPLET_SIZE)"
    echo "  --image [slug]          Image du droplet (défaut: $DEFAULT_DROPLET_IMAGE)"
    echo "  --region [slug]         Région du droplet (défaut: $DEFAULT_DROPLET_REGION)"
    echo "  --ssh-key [name]        Nom de la clé SSH (défaut: $DEFAULT_SSH_KEY_NAME)"
    echo "  --wait                  Attendre la création du droplet"
    echo "  --dry-run               Simulation sans exécution"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-droplet-manager.sh list"
    echo "  ./deploy-droplet-manager.sh create meeshy-prod --size s-4vcpu-8gb --region fra1"
    echo "  ./deploy-droplet-manager.sh get 157.230.15.51"
    echo "  ./deploy-droplet-manager.sh delete meeshy-prod"
    echo ""
}

# Vérifier l'installation de doctl
check_doctl() {
    log_info "Vérification de l'installation de doctl..."
    trace_deploy_operation "check_doctl" "STARTED" "Checking doctl installation"
    
    if ! command -v doctl >/dev/null 2>&1; then
        log_error "doctl n'est pas installé"
        log_info "Installation de doctl..."
        
        # Installation de doctl selon l'OS
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            if command -v brew >/dev/null 2>&1; then
                brew install doctl
            else
                log_error "Homebrew n'est pas installé. Installez doctl manuellement."
                exit 1
            fi
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Linux
            cd /tmp
            wget https://github.com/digitalocean/doctl/releases/latest/download/doctl-1.0.0-linux-amd64.tar.gz
            tar xf doctl-1.0.0-linux-amd64.tar.gz
            sudo mv doctl /usr/local/bin
            rm doctl-1.0.0-linux-amd64.tar.gz
        else
            log_error "OS non supporté pour l'installation automatique de doctl"
            exit 1
        fi
        
        log_success "doctl installé avec succès"
    else
        local doctl_version=$(doctl version 2>/dev/null | head -1 || echo "unknown")
        log_success "doctl déjà installé: $doctl_version"
    fi
    
    # Vérifier l'authentification
    if ! doctl account get >/dev/null 2>&1; then
        log_warning "doctl n'est pas authentifié"
        log_info "Veuillez exécuter: doctl auth init"
        exit 1
    fi
    
    log_success "doctl est prêt à être utilisé"
    trace_deploy_operation "check_doctl" "SUCCESS" "doctl is ready"
}

# Lister tous les droplets
list_droplets() {
    log_info "Liste des droplets DigitalOcean..."
    trace_deploy_operation "list_droplets" "STARTED" "Listing all droplets"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run: simulation de la liste des droplets"
        trace_deploy_operation "list_droplets" "DRY_RUN" "Simulated droplet listing"
        return 0
    fi
    
    doctl compute droplet list --format "ID,Name,PublicIPv4,PrivateIPv4,Memory,VCPUs,Disk,Region,Image,Status,Tags"
    
    log_success "Liste des droplets récupérée"
    trace_deploy_operation "list_droplets" "SUCCESS" "Droplet list retrieved"
}

# Créer un nouveau droplet
create_droplet() {
    local name="$1"
    local size="$2"
    local image="$3"
    local region="$4"
    local ssh_key="$5"
    local wait_flag="$6"
    
    log_info "Création du droplet '$name'..."
    trace_deploy_operation "create_droplet" "STARTED" "Creating droplet $name"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run: simulation de la création du droplet '$name'"
        log_info "  Taille: $size"
        log_info "  Image: $image"
        log_info "  Région: $region"
        log_info "  Clé SSH: $ssh_key"
        trace_deploy_operation "create_droplet" "DRY_RUN" "Simulated droplet creation"
        return 0
    fi
    
    # Vérifier si le droplet existe déjà
    if droplet_exists "$name"; then
        log_warning "Un droplet avec le nom '$name' existe déjà"
        return 1
    fi
    
    # Construire la commande de création
    local create_cmd="doctl compute droplet create $name --size $size --image $image --region $region"
    
    # Ajouter la clé SSH si spécifiée
    if [ -n "$ssh_key" ]; then
        local ssh_key_id=$(get_ssh_key_id "$ssh_key")
        if [ -n "$ssh_key_id" ]; then
            create_cmd="$create_cmd --ssh-keys $ssh_key_id"
        else
            log_warning "Clé SSH '$ssh_key' non trouvée, création sans clé SSH"
        fi
    fi
    
    # Ajouter les options par défaut
    create_cmd="$create_cmd --enable-monitoring --enable-backups --enable-private-networking"
    
    # Ajouter le flag wait si demandé
    if [ "$wait_flag" = "true" ]; then
        create_cmd="$create_cmd --wait"
    fi
    
    # Exécuter la création
    log_info "Commande de création: $create_cmd"
    eval "$create_cmd"
    
    if [ $? -eq 0 ]; then
        log_success "Droplet '$name' créé avec succès"
        
        # Attendre que le droplet soit actif si --wait n'était pas utilisé
        if [ "$wait_flag" != "true" ]; then
            log_info "Attente que le droplet soit actif..."
            wait_for_droplet_active "$name"
        fi
        
        # Afficher les informations du droplet
        get_droplet_info "$name"
        
        trace_deploy_operation "create_droplet" "SUCCESS" "Droplet $name created successfully"
    else
        log_error "Échec de la création du droplet '$name'"
        trace_deploy_operation "create_droplet" "FAILED" "Failed to create droplet $name"
        exit 1
    fi
}

# Vérifier si un droplet existe
droplet_exists() {
    local name="$1"
    doctl compute droplet list --format "Name" --no-header | grep -q "^$name$"
}

# Obtenir l'ID d'une clé SSH
get_ssh_key_id() {
    local key_name="$1"
    doctl compute ssh-key list --format "ID,Name" --no-header | grep "$key_name" | awk '{print $1}' | head -1
}

# Attendre qu'un droplet soit actif
wait_for_droplet_active() {
    local name="$1"
    local max_attempts=3
    local attempt=0
    
    log_info "Attente que le droplet '$name' soit actif..."
    
    while [ $attempt -lt $max_attempts ]; do
        local status=$(doctl compute droplet list --format "Name,Status" --no-header | grep "^$name" | awk '{print $2}')
        
        if [ "$status" = "active" ]; then
            log_success "Droplet '$name' est maintenant actif"
            return 0
        fi
        
        log_info "Statut du droplet '$name': $status (tentative $((attempt + 1))/$max_attempts)"
        sleep 4
        attempt=$((attempt + 1))
    done
    
    log_error "Timeout: le droplet '$name' n'est pas devenu actif dans les temps"
    return 1
}

# Obtenir les informations d'un droplet
get_droplet_info() {
    local identifier="$1"
    
    log_info "Informations du droplet '$identifier'..."
    trace_deploy_operation "get_droplet_info" "STARTED" "Getting droplet info for $identifier"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run: simulation de la récupération des informations"
        trace_deploy_operation "get_droplet_info" "DRY_RUN" "Simulated droplet info retrieval"
        return 0
    fi
    
    # Essayer de trouver le droplet par nom ou IP
    local droplet_info=$(doctl compute droplet list --format "ID,Name,PublicIPv4,PrivateIPv4,Memory,VCPUs,Disk,Region,Image,Status,Tags" --no-header | grep -E "(^[0-9]+.*$identifier|.*$identifier.*)")
    
    if [ -n "$droplet_info" ]; then
        echo "$droplet_info"
        log_success "Informations du droplet récupérées"
        trace_deploy_operation "get_droplet_info" "SUCCESS" "Droplet info retrieved"
    else
        log_error "Droplet '$identifier' non trouvé"
        trace_deploy_operation "get_droplet_info" "FAILED" "Droplet not found"
        return 1
    fi
}

# Trouver un droplet par son IP
find_droplet_by_ip() {
    local ip="$1"
    
    log_info "Recherche du droplet avec l'IP '$ip'..."
    trace_deploy_operation "find_droplet_by_ip" "STARTED" "Finding droplet by IP $ip"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run: simulation de la recherche par IP"
        trace_deploy_operation "find_droplet_by_ip" "DRY_RUN" "Simulated IP search"
        return 0
    fi
    
    local droplet_info=$(doctl compute droplet list --format "ID,Name,PublicIPv4,PrivateIPv4,Memory,VCPUs,Disk,Region,Image,Status,Tags" --no-header | grep "$ip")
    
    if [ -n "$droplet_info" ]; then
        echo "$droplet_info"
        log_success "Droplet trouvé avec l'IP '$ip'"
        trace_deploy_operation "find_droplet_by_ip" "SUCCESS" "Droplet found by IP"
    else
        log_error "Aucun droplet trouvé avec l'IP '$ip'"
        trace_deploy_operation "find_droplet_by_ip" "FAILED" "No droplet found with IP"
        return 1
    fi
}

# Supprimer un droplet
delete_droplet() {
    local identifier="$1"
    
    log_info "Suppression du droplet '$identifier'..."
    trace_deploy_operation "delete_droplet" "STARTED" "Deleting droplet $identifier"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run: simulation de la suppression du droplet '$identifier'"
        trace_deploy_operation "delete_droplet" "DRY_RUN" "Simulated droplet deletion"
        return 0
    fi
    
    # Vérifier si le droplet existe
    if ! droplet_exists "$identifier" && ! find_droplet_by_ip "$identifier" >/dev/null 2>&1; then
        log_error "Droplet '$identifier' non trouvé"
        trace_deploy_operation "delete_droplet" "FAILED" "Droplet not found"
        return 1
    fi
    
    # Supprimer le droplet
    doctl compute droplet delete "$identifier" --force
    
    if [ $? -eq 0 ]; then
        log_success "Droplet '$identifier' supprimé avec succès"
        trace_deploy_operation "delete_droplet" "SUCCESS" "Droplet deleted successfully"
    else
        log_error "Échec de la suppression du droplet '$identifier'"
        trace_deploy_operation "delete_droplet" "FAILED" "Failed to delete droplet"
        exit 1
    fi
}

# Configurer la clé SSH
setup_ssh_key() {
    local key_name="$1"
    
    log_info "Configuration de la clé SSH '$key_name'..."
    trace_deploy_operation "setup_ssh_key" "STARTED" "Setting up SSH key $key_name"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_info "Mode --dry-run: simulation de la configuration SSH"
        trace_deploy_operation "setup_ssh_key" "DRY_RUN" "Simulated SSH key setup"
        return 0
    fi
    
    # Vérifier si la clé existe déjà
    if get_ssh_key_id "$key_name" >/dev/null 2>&1; then
        log_success "Clé SSH '$key_name' existe déjà"
        trace_deploy_operation "setup_ssh_key" "SUCCESS" "SSH key already exists"
        return 0
    fi
    
    # Générer une nouvelle clé SSH
    local ssh_key_path="$HOME/.ssh/${key_name}"
    
    if [ ! -f "$ssh_key_path" ]; then
        log_info "Génération d'une nouvelle clé SSH..."
        ssh-keygen -t rsa -b 4096 -f "$ssh_key_path" -N "" -C "meeshy-deployment"
    fi
    
    # Ajouter la clé à DigitalOcean
    log_info "Ajout de la clé SSH à DigitalOcean..."
    doctl compute ssh-key create "$key_name" --public-key-file "${ssh_key_path}.pub"
    
    if [ $? -eq 0 ]; then
        log_success "Clé SSH '$key_name' configurée avec succès"
        trace_deploy_operation "setup_ssh_key" "SUCCESS" "SSH key configured successfully"
    else
        log_error "Échec de la configuration de la clé SSH"
        trace_deploy_operation "setup_ssh_key" "FAILED" "Failed to configure SSH key"
        exit 1
    fi
}

# Fonction principale
main() {
    local command="$1"
    shift
    
    # Variables par défaut
    local droplet_name="$DEFAULT_DROPLET_NAME"
    local droplet_size="$DEFAULT_DROPLET_SIZE"
    local droplet_image="$DEFAULT_DROPLET_IMAGE"
    local droplet_region="$DEFAULT_DROPLET_REGION"
    local ssh_key="$DEFAULT_SSH_KEY_NAME"
    local wait_flag="false"
    local dry_run="false"
    
    # Parser les arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --size)
                droplet_size="$2"
                shift 2
                ;;
            --image)
                droplet_image="$2"
                shift 2
                ;;
            --region)
                droplet_region="$2"
                shift 2
                ;;
            --ssh-key)
                ssh_key="$2"
                shift 2
                ;;
            --wait)
                wait_flag="true"
                shift
                ;;
            --dry-run)
                dry_run="true"
                shift
                ;;
            *)
                if [ -z "$droplet_name" ] || [ "$droplet_name" = "$DEFAULT_DROPLET_NAME" ]; then
                    droplet_name="$1"
                fi
                shift
                ;;
        esac
    done
    
    # Exporter les variables pour les autres fonctions
    export DRY_RUN="$dry_run"
    
    # Vérifier doctl
    check_doctl
    
    # Exécuter la commande
    case "$command" in
        "list")
            list_droplets
            ;;
        "create")
            create_droplet "$droplet_name" "$droplet_size" "$droplet_image" "$droplet_region" "$ssh_key" "$wait_flag"
            ;;
        "get")
            get_droplet_info "$droplet_name"
            ;;
        "delete")
            delete_droplet "$droplet_name"
            ;;
        "find-by-ip")
            find_droplet_by_ip "$droplet_name"
            ;;
        "setup-ssh-key")
            setup_ssh_key "$ssh_key"
            ;;
        "check-doctl")
            check_doctl
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            log_error "Commande inconnue: $command"
            show_help
            exit 1
            ;;
    esac
}

# Exécuter la fonction principale si le script est appelé directement
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
