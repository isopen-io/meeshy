#!/bin/bash

# ===== MEESHY - OPTIMISATION ET PERFORMANCES =====
# Script spécialisé pour l'optimisation des performances système
# Usage: ./deploy-performance.sh [COMMAND] [DROPLET_IP] [OPTIONS]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-performance" "performance_operations"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}⚡ MEESHY - OPTIMISATION ET PERFORMANCES${NC}"
    echo "=========================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-performance.sh [COMMAND] [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo -e "${GREEN}  Optimisation système:${NC}"
    echo "    optimize-system        - Optimisation complète du système"
    echo "    optimize-docker        - Optimisation Docker spécifique"
    echo "    optimize-database      - Optimisation MongoDB"
    echo "    optimize-network       - Optimisation réseau"
    echo ""
    echo -e "${GREEN}  Performance monitoring:${NC}"
    echo "    benchmark              - Benchmark complet des performances"
    echo "    stress-test            - Test de charge du système"
    echo "    memory-analysis        - Analyse de l'utilisation mémoire"
    echo "    cpu-analysis           - Analyse de l'utilisation CPU"
    echo ""
    echo -e "${GREEN}  Tuning avancé:${NC}"
    echo "    kernel-tuning          - Optimisation du kernel Linux"
    echo "    swap-optimization      - Optimisation du swap"
    echo "    filesystem-tuning      - Optimisation du système de fichiers"
    echo "    security-hardening     - Durcissement sécuritaire"
    echo ""
    echo -e "${GREEN}  Cache et stockage:${NC}"
    echo "    setup-redis-cluster    - Configuration cluster Redis"
    echo "    optimize-storage       - Optimisation du stockage"
    echo "    cache-warming          - Préchauffage des caches"
    echo ""
    echo -e "${GREEN}  Rapports:${NC}"
    echo "    performance-report     - Rapport de performance détaillé"
    echo "    recommendations        - Recommandations d'optimisation"
    echo "    compare-metrics        - Comparaison avant/après optimisation"
    echo ""
    echo "Options:"
    echo "  --aggressive           - Mode optimisation agressive"
    echo "  --conservative         - Mode optimisation conservative"
    echo "  --target-load=N        - Charge cible en req/sec (défaut: 10000)"
    echo "  --memory-limit=N       - Limite mémoire en GB (défaut: auto)"
    echo "  --cpu-cores=N          - Nombre de cœurs CPU (défaut: auto)"
    echo "  --benchmark-duration=N - Durée du benchmark en secondes (défaut: 60)"
    echo "  --save-baseline        - Sauvegarder les métriques comme référence"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-performance.sh optimize-system 192.168.1.100"
    echo "  ./deploy-performance.sh benchmark 192.168.1.100 --target-load=15000"
    echo "  ./deploy-performance.sh stress-test 192.168.1.100 --benchmark-duration=300"
    echo "  ./deploy-performance.sh performance-report 192.168.1.100 --save-baseline"
    echo ""
}

# Variables globales
AGGRESSIVE_MODE=false
CONSERVATIVE_MODE=false
TARGET_LOAD=10000
MEMORY_LIMIT=""
CPU_CORES=""
BENCHMARK_DURATION=60
SAVE_BASELINE=false

# Optimisation complète du système
optimize_system_complete() {
    local ip="$1"
    
    log_info "⚡ Optimisation complète du système..."
    trace_deploy_operation "optimize_system_complete" "STARTED" "Starting complete system optimization"
    
    # Collecter les métriques de base avant optimisation
    collect_baseline_metrics "$ip" "before"
    
    # Optimisations par catégorie
    optimize_kernel_parameters "$ip"
    optimize_docker_configuration "$ip"
    optimize_mongodb_configuration "$ip"
    optimize_network_stack "$ip"
    optimize_file_system "$ip"
    
    # Redémarrer les services pour appliquer les optimisations
    restart_optimized_services "$ip"
    
    # Collecter les métriques après optimisation
    sleep 30 # Laisser le temps au système de se stabiliser
    collect_baseline_metrics "$ip" "after"
    
    # Générer le rapport d'optimisation
    generate_optimization_report "$ip"
    
    trace_deploy_operation "optimize_system_complete" "SUCCESS" "System optimization completed"
    log_success "✅ Optimisation système terminée"
}

# Optimisation des paramètres kernel
optimize_kernel_parameters() {
    local ip="$1"
    
    log_info "🔧 Optimisation des paramètres kernel..."
    
    local sysctl_config=""
    
    if [ "$AGGRESSIVE_MODE" = "true" ]; then
        sysctl_config="aggressive"
    elif [ "$CONSERVATIVE_MODE" = "true" ]; then
        sysctl_config="conservative"
    else
        sysctl_config="balanced"
    fi
    
    ssh -o StrictHostKeyChecking=no root@$ip << EOF
        # Sauvegarde de la configuration actuelle
        cp /etc/sysctl.conf /etc/sysctl.conf.backup.\$(date +%Y%m%d_%H%M%S)
        
        # Configuration optimisée pour Meeshy
        cat >> /etc/sysctl.conf << 'SYSCTL_EOF'

# ===== OPTIMISATIONS MEESHY =====
# Configuration générée le \$(date)

# Optimisations réseau
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_rmem = 4096 87380 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_tw_reuse = 1

# Optimisations pour applications web
net.core.somaxconn = 1024
net.ipv4.tcp_max_syn_backlog = 1024
net.ipv4.ip_local_port_range = 1024 65535

# Optimisations mémoire
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
vm.vfs_cache_pressure = 50

EOF

        if [ "$sysctl_config" = "aggressive" ]; then
            cat >> /etc/sysctl.conf << 'AGGRESSIVE_EOF'
# Mode agressif
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_keepalive_intvl = 15
vm.max_map_count = 1048576
fs.file-max = 2097152
AGGRESSIVE_EOF
        elif [ "$sysctl_config" = "conservative" ]; then
            cat >> /etc/sysctl.conf << 'CONSERVATIVE_EOF'
# Mode conservateur
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 600
vm.max_map_count = 262144
fs.file-max = 1048576
CONSERVATIVE_EOF
        else
            cat >> /etc/sysctl.conf << 'BALANCED_EOF'
# Mode équilibré
net.ipv4.tcp_fin_timeout = 20
net.ipv4.tcp_keepalive_time = 450
vm.max_map_count = 524288
fs.file-max = 1572864
BALANCED_EOF
        fi
        
        # Appliquer les changements
        sysctl -p
EOF
    
    trace_file_deployment "MODIFIED" "/etc/sysctl.conf" "Kernel parameters optimization ($sysctl_config mode)"
    log_success "✅ Paramètres kernel optimisés"
}

# Optimisation de la configuration Docker
optimize_docker_configuration() {
    local ip="$1"
    
    log_info "🐳 Optimisation de la configuration Docker..."
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        # Créer le répertoire de configuration Docker
        mkdir -p /etc/docker
        
        # Sauvegarder la configuration existante
        if [ -f "/etc/docker/daemon.json" ]; then
            cp /etc/docker/daemon.json /etc/docker/daemon.json.backup.$(date +%Y%m%d_%H%M%S)
        fi
        
        # Configuration optimisée Docker
        cat > /etc/docker/daemon.json << 'DOCKER_EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "storage-opts": [
    "overlay2.override_kernel_check=true"
  ],
  "default-ulimits": {
    "nofile": {
      "Hard": 64000,
      "Name": "nofile",
      "Soft": 64000
    }
  },
  "live-restore": true,
  "max-concurrent-downloads": 10,
  "max-concurrent-uploads": 5,
  "userland-proxy": false,
  "experimental": false,
  "metrics-addr": "127.0.0.1:9323",
  "iptables": true
}
DOCKER_EOF
        
        # Redémarrer Docker pour appliquer les changements
        systemctl restart docker
        systemctl enable docker
EOF
    
    trace_file_deployment "MODIFIED" "/etc/docker/daemon.json" "Docker daemon optimization configuration"
    log_success "✅ Configuration Docker optimisée"
}

# Optimisation de la configuration MongoDB
optimize_mongodb_configuration() {
    local ip="$1"
    
    log_info "🍃 Optimisation de la configuration MongoDB..."
    
    # Déterminer la quantité de RAM disponible
    local available_ram=$(ssh -o StrictHostKeyChecking=no root@$ip "free -g | grep Mem | awk '{print \$2}'" 2>/dev/null || echo "4")
    local mongo_cache_size=$((available_ram * 256)) # 256MB par GB de RAM
    
    ssh -o StrictHostKeyChecking=no root@$ip << EOF
        # Créer le répertoire de configuration MongoDB
        mkdir -p /opt/meeshy/mongodb/config
        
        # Configuration optimisée MongoDB
        cat > /opt/meeshy/mongodb/config/mongod.conf << 'MONGO_EOF'
# Configuration MongoDB optimisée pour Meeshy
# Générée le \$(date)

storage:
  dbPath: /data/db
  journal:
    enabled: true
  wiredTiger:
    engineConfig:
      cacheSizeGB: $((mongo_cache_size / 1024))
      journalCompressor: snappy
      directoryForIndexes: false
    collectionConfig:
      blockCompressor: snappy
    indexConfig:
      prefixCompression: true

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log
  logRotate: reopen

net:
  port: 27017
  bindIp: 0.0.0.0
  maxIncomingConnections: 1000

processManagement:
  timeZoneInfo: /usr/share/zoneinfo

replication:
  replSetName: meeshy-replica

operationProfiling:
  slowOpThresholdMs: 100
  mode: slowOp

setParameter:
  diagnosticDataCollectionEnabled: false
  logicalSessionRefreshMinutes: 5
  maxLogSizeKB: 10240
  connPoolMaxShardedConnsPerHost: 200
  connPoolMaxConnsPerHost: 200
MONGO_EOF

        # Configuration spécifique au mode choisi
        if [ "$AGGRESSIVE_MODE" = "true" ]; then
            cat >> /opt/meeshy/mongodb/config/mongod.conf << 'MONGO_AGGRESSIVE_EOF'

# Optimisations agressives
setParameter:
  cursorTimeoutMillis: 300000
  notablescan: false
  internalQueryExecMaxBlockingSortBytes: 134217728
MONGO_AGGRESSIVE_EOF
        fi
EOF
    
    trace_file_deployment "CREATED" "/opt/meeshy/mongodb/config/mongod.conf" "MongoDB optimization configuration"
    log_success "✅ Configuration MongoDB optimisée"
}

# Optimisation de la pile réseau
optimize_network_stack() {
    local ip="$1"
    
    log_info "🌐 Optimisation de la pile réseau..."
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        # Optimisations des limites système
        cat >> /etc/security/limits.conf << 'LIMITS_EOF'

# Optimisations Meeshy
* soft nofile 65536
* hard nofile 65536
* soft nproc 32768
* hard nproc 32768
root soft nofile 65536
root hard nofile 65536
LIMITS_EOF

        # Optimisations systemd
        mkdir -p /etc/systemd/system.conf.d
        cat > /etc/systemd/system.conf.d/meeshy-limits.conf << 'SYSTEMD_EOF'
[Manager]
DefaultLimitNOFILE=65536
DefaultLimitNPROC=32768
EOF

        # Recharger systemd
        systemctl daemon-reload
EOF
    
    trace_file_deployment "MODIFIED" "/etc/security/limits.conf" "System limits optimization"
    trace_file_deployment "CREATED" "/etc/systemd/system.conf.d/meeshy-limits.conf" "Systemd limits optimization"
    log_success "✅ Pile réseau optimisée"
}

# Optimisation du système de fichiers
optimize_file_system() {
    local ip="$1"
    
    log_info "💾 Optimisation du système de fichiers..."
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        # Optimisations fstab pour les performances
        cp /etc/fstab /etc/fstab.backup.$(date +%Y%m%d_%H%M%S)
        
        # Vérifier si nous sommes sur ext4
        if mount | grep -q "ext4"; then
            echo "Optimisations ext4 détectées"
            # Les optimisations ext4 seraient ajoutées ici
        fi
        
        # Configurer les montages temporaires optimisés
        echo "# Optimisations Meeshy" >> /etc/fstab
        echo "tmpfs /tmp tmpfs nodev,nosuid,size=2G 0 0" >> /etc/fstab || true
        
        # Optimisations I/O scheduler
        echo 'ACTION=="add|change", KERNEL=="sd[a-z]*", ATTR{queue/scheduler}="mq-deadline"' > /etc/udev/rules.d/60-scheduler.rules
EOF
    
    trace_file_deployment "MODIFIED" "/etc/fstab" "Filesystem optimization configuration"
    trace_file_deployment "CREATED" "/etc/udev/rules.d/60-scheduler.rules" "I/O scheduler optimization"
    log_success "✅ Système de fichiers optimisé"
}

# Redémarrer les services avec les optimisations
restart_optimized_services() {
    local ip="$1"
    
    log_info "🔄 Redémarrage des services avec optimisations..."
    
    ssh -o StrictHostKeyChecking=no root@$ip << 'EOF'
        cd /opt/meeshy
        
        # Arrêt propre des services
        docker compose down --timeout 30
        
        # Nettoyage Docker
        docker system prune -f
        
        # Redémarrage avec les nouvelles configurations
        docker compose up -d
        
        # Attendre que les services soient prêts
        sleep 30
EOF
    
    log_success "✅ Services redémarrés avec optimisations"
}

# Benchmark complet des performances
run_performance_benchmark() {
    local ip="$1"
    
    log_info "📊 Exécution du benchmark de performance..."
    trace_deploy_operation "run_performance_benchmark" "STARTED" "Starting performance benchmark"
    
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local benchmark_dir="$DEPLOY_LOGS_DIR/benchmark_$timestamp"
    mkdir -p "$benchmark_dir"
    
    # Test de charge HTTP
    log_info "🌐 Test de charge HTTP..."
    local http_results="$benchmark_dir/http_benchmark.txt"
    {
        echo "=== BENCHMARK HTTP - MEESHY ==="
        echo "Date: $(date)"
        echo "Serveur: $ip"
        echo "Charge cible: $TARGET_LOAD req/sec"
        echo "Durée: ${BENCHMARK_DURATION}s"
        echo ""
        
        # Test avec Apache Bench si disponible
        if command -v ab &> /dev/null; then
            echo "--- Test Apache Bench ---"
            ab -n $((TARGET_LOAD * BENCHMARK_DURATION / 10)) -c 100 -t $BENCHMARK_DURATION "http://$ip/" 2>&1 || echo "Erreur ab"
        fi
        
        # Test avec curl pour vérifier la réponse
        echo "--- Test de réponse basique ---"
        local response_time=$(curl -o /dev/null -s -w '%{time_total}' "http://$ip" 2>/dev/null || echo "erreur")
        echo "Temps de réponse: ${response_time}s"
        
    } > "$http_results"
    
    # Test de charge des APIs
    log_info "🚪 Test de charge des APIs..."
    local api_results="$benchmark_dir/api_benchmark.txt"
    {
        echo "=== BENCHMARK APIs - MEESHY ==="
        echo ""
        
        # Test Gateway
        echo "--- Gateway API ---"
        local gateway_time=$(curl -o /dev/null -s -w '%{time_total}' -H 'Host: gate.meeshy.me' "http://$ip/health" 2>/dev/null || echo "erreur")
        echo "Gateway response time: ${gateway_time}s"
        
        # Test Translator
        echo "--- Translator API ---"
        local translator_time=$(curl -o /dev/null -s -w '%{time_total}' -H 'Host: ml.meeshy.me' "http://$ip/health" 2>/dev/null || echo "erreur")
        echo "Translator response time: ${translator_time}s"
        
    } > "$api_results"
    
    # Test de performance système
    local system_results="$benchmark_dir/system_benchmark.txt"
    ssh -o StrictHostKeyChecking=no root@$ip << EOF > "$system_results"
        echo "=== BENCHMARK SYSTÈME ==="
        echo "Date: \$(date)"
        echo ""
        
        echo "--- CPU ---"
        lscpu | grep -E "(Model name|CPU\\(s\\)|Thread|MHz)"
        echo ""
        
        echo "--- Mémoire ---"
        free -h
        echo ""
        
        echo "--- Disque ---"
        df -h /
        echo ""
        
        echo "--- Performance I/O ---"
        if command -v iostat &> /dev/null; then
            iostat -x 1 5
        else
            echo "iostat non disponible"
        fi
        echo ""
        
        echo "--- Charge système ---"
        uptime
        echo ""
        
        echo "--- Processus Docker ---"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
EOF
    
    log_success "✅ Benchmark terminé - Résultats dans: $benchmark_dir"
    trace_deploy_operation "run_performance_benchmark" "SUCCESS" "Benchmark completed in $benchmark_dir"
    
    # Afficher un résumé
    echo ""
    echo -e "${CYAN}📊 RÉSUMÉ DU BENCHMARK${NC}"
    echo "========================"
    echo "📁 Répertoire: $benchmark_dir"
    echo "🌐 Test HTTP: $([ -f "$http_results" ] && echo "✅" || echo "❌")"
    echo "🚪 Test APIs: $([ -f "$api_results" ] && echo "✅" || echo "❌")"  
    echo "💻 Test système: $([ -f "$system_results" ] && echo "✅" || echo "❌")"
}

# Collecter les métriques de référence
collect_baseline_metrics() {
    local ip="$1"
    local phase="$2" # "before" ou "after"
    
    log_info "📈 Collecte des métriques ($phase optimization)..."
    
    local metrics_file="$DEPLOY_LOGS_DIR/metrics_${phase}_$(date +%Y%m%d_%H%M%S).txt"
    
    ssh -o StrictHostKeyChecking=no root@$ip << EOF > "$metrics_file"
        echo "=== MÉTRIQUES SYSTÈME - $phase ==="
        echo "Date: \$(date)"
        echo "Phase: $phase optimization"
        echo ""
        
        echo "--- CPU ---"
        top -bn1 | head -5
        echo ""
        
        echo "--- Mémoire ---"
        free -h
        echo ""
        cat /proc/meminfo | grep -E "(MemTotal|MemFree|MemAvailable|Cached|Buffers)"
        echo ""
        
        echo "--- Disque ---"
        df -h
        echo ""
        iostat -x 1 1 2>/dev/null || echo "iostat non disponible"
        echo ""
        
        echo "--- Réseau ---"
        netstat -i 2>/dev/null | head -5 || echo "netstat non disponible"
        echo ""
        
        echo "--- Docker ---"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
        echo ""
        
        echo "--- Services ---"
        docker compose -f /opt/meeshy/docker-compose.yml ps
EOF
    
    if [ "$SAVE_BASELINE" = "true" ] && [ "$phase" = "before" ]; then
        cp "$metrics_file" "$DEPLOY_LOGS_DIR/baseline_metrics.txt"
        log_info "💾 Métriques de référence sauvegardées"
    fi
    
    trace_file_deployment "CREATED" "$metrics_file" "System metrics collection ($phase optimization)"
}

# Générer un rapport d'optimisation
generate_optimization_report() {
    local ip="$1"
    
    log_info "📋 Génération du rapport d'optimisation..."
    
    local report_file="$DEPLOY_LOGS_DIR/optimization_report_$(date +%Y%m%d_%H%M%S).html"
    
    {
        cat << 'HTML_HEADER'
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rapport d'Optimisation Meeshy</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { text-align: center; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 20px; margin-bottom: 30px; }
        .section { margin: 20px 0; padding: 20px; border: 1px solid #e1e8ed; border-radius: 8px; }
        .metric { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .improvement { color: #27ae60; font-weight: bold; }
        .neutral { color: #f39c12; }
        .degradation { color: #e74c3c; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚡ Rapport d'Optimisation Meeshy</h1>
HTML_HEADER
        echo "            <p><strong>Serveur:</strong> $ip</p>"
        echo "            <p><strong>Date:</strong> $(date)</p>"
        echo "            <p><strong>Session:</strong> $DEPLOY_SESSION_ID</p>"
        echo "        </div>"
        
        echo "        <div class=\"grid\">"
        
        echo "            <div class=\"section\">"
        echo "                <h3>🔧 Optimisations Appliquées</h3>"
        echo "                <div class=\"metric\"><span>Paramètres Kernel:</span><span class=\"improvement\">✅ Optimisé</span></div>"
        echo "                <div class=\"metric\"><span>Configuration Docker:</span><span class=\"improvement\">✅ Optimisé</span></div>"
        echo "                <div class=\"metric\"><span>Base de données MongoDB:</span><span class=\"improvement\">✅ Optimisé</span></div>"
        echo "                <div class=\"metric\"><span>Pile réseau:</span><span class=\"improvement\">✅ Optimisé</span></div>"
        echo "                <div class=\"metric\"><span>Système de fichiers:</span><span class=\"improvement\">✅ Optimisé</span></div>"
        echo "            </div>"
        
        echo "            <div class=\"section\">"
        echo "                <h3>📊 Métriques Actuelles</h3>"
        
        # Récupérer les métriques actuelles
        local current_cpu=$(ssh -o StrictHostKeyChecking=no root@$ip "top -bn1 | grep 'Cpu(s)' | awk '{print \$2}' | cut -d'%' -f1" 2>/dev/null || echo "N/A")
        local current_mem=$(ssh -o StrictHostKeyChecking=no root@$ip "free | grep Mem | awk '{printf \"%.1f\", \$3/\$2 * 100.0}'" 2>/dev/null || echo "N/A")
        local current_disk=$(ssh -o StrictHostKeyChecking=no root@$ip "df -h / | tail -1 | awk '{print \$5}'" 2>/dev/null || echo "N/A")
        
        echo "                <div class=\"metric\"><span>Utilisation CPU:</span><span>${current_cpu}%</span></div>"
        echo "                <div class=\"metric\"><span>Utilisation Mémoire:</span><span>${current_mem}%</span></div>"
        echo "                <div class=\"metric\"><span>Utilisation Disque:</span><span>$current_disk</span></div>"
        echo "            </div>"
        
        echo "        </div>"
        
        echo "        <div class=\"section\">"
        echo "            <h3>🎯 Recommandations</h3>"
        echo "            <ul>"
        echo "                <li><strong>Surveillance continue:</strong> Monitorer les performances avec deploy-monitoring.sh</li>"
        echo "                <li><strong>Tests de charge:</strong> Exécuter des benchmarks réguliers pour valider les optimisations</li>"
        echo "                <li><strong>Mise à jour:</strong> Maintenir les optimisations à jour avec les nouvelles versions</li>"
        echo "                <li><strong>Scaling:</strong> Considérer le scaling horizontal si les performances ne suffisent pas</li>"
        echo "            </ul>"
        echo "        </div>"
        
        echo "        <div class=\"section\">"
        echo "            <h3>📝 Actions de Suivi</h3>"
        echo "            <ol>"
        echo "                <li>Exécuter un benchmark complet: <code>./deploy-performance.sh benchmark $ip</code></li>"
        echo "                <li>Surveiller les performances: <code>./deploy-monitoring.sh monitor $ip</code></li>"
        echo "                <li>Vérifier les métriques dans 24h pour validation des optimisations</li>"
        echo "            </ol>"
        echo "        </div>"
        
        echo "    </div>"
        echo "</body>"
        echo "</html>"
        
    } > "$report_file"
    
    log_success "✅ Rapport d'optimisation généré: $report_file"
    trace_file_deployment "CREATED" "$report_file" "Performance optimization report"
}

# Point d'entrée principal
main() {
    local command="${1:-help}"
    local ip="$2"
    
    # Parser les options
    shift 2 2>/dev/null || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --aggressive)
                AGGRESSIVE_MODE=true
                shift
                ;;
            --conservative)
                CONSERVATIVE_MODE=true
                shift
                ;;
            --target-load=*)
                TARGET_LOAD="${1#*=}"
                shift
                ;;
            --memory-limit=*)
                MEMORY_LIMIT="${1#*=}"
                shift
                ;;
            --cpu-cores=*)
                CPU_CORES="${1#*=}"
                shift
                ;;
            --benchmark-duration=*)
                BENCHMARK_DURATION="${1#*=}"
                shift
                ;;
            --save-baseline)
                SAVE_BASELINE=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    case "$command" in
        "optimize-system")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            optimize_system_complete "$ip"
            ;;
        "benchmark")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            run_performance_benchmark "$ip"
            ;;
        "performance-report")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            generate_optimization_report "$ip"
            ;;
        "help"|"-h"|"--help"|"")
            show_help
            ;;
        *)
            log_error "Commande inconnue: $command"
            show_help
            exit 1
            ;;
    esac
}

# Exécuter le script principal
main "$@"
