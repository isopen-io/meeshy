#!/bin/bash

# ===== MEESHY - SURVEILLANCE ET MONITORING =====
# Script spécialisé pour la surveillance en temps réel et le monitoring
# Usage: ./deploy-monitoring.sh [COMMAND] [DROPLET_IP] [OPTIONS]

set -e

# Charger la configuration de déploiement
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-config.sh"

# Initialiser la traçabilité
init_deploy_tracing "deploy-monitoring" "monitoring_operations"

# Fonction d'aide
show_help() {
    echo -e "${CYAN}📊 MEESHY - SURVEILLANCE ET MONITORING${NC}"
    echo "======================================="
    echo ""
    echo "Usage:"
    echo "  ./deploy-monitoring.sh [COMMAND] [DROPLET_IP] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo -e "${GREEN}  Surveillance temps réel:${NC}"
    echo "    monitor                - Surveillance temps réel complète"
    echo "    watch-services         - Surveiller l'état des services"
    echo "    watch-resources        - Surveiller les ressources système"
    echo "    watch-logs             - Surveiller les logs en temps réel"
    echo "    watch-performance      - Surveiller les performances"
    echo ""
    echo -e "${GREEN}  Rapports:${NC}"
    echo "    status-report          - Rapport de statut complet"
    echo "    performance-report     - Rapport de performance"
    echo "    health-report          - Rapport de santé système"
    echo "    generate-dashboard     - Générer tableau de bord HTML"
    echo ""
    echo -e "${GREEN}  Alertes:${NC}"
    echo "    check-alerts           - Vérifier les conditions d'alerte"
    echo "    setup-alerts           - Configurer les alertes automatiques"
    echo "    test-alerts            - Tester le système d'alertes"
    echo ""
    echo -e "${GREEN}  Historique:${NC}"
    echo "    collect-metrics        - Collecter les métriques"
    echo "    archive-logs           - Archiver les logs"
    echo "    trend-analysis         - Analyse des tendances"
    echo ""
    echo "Options:"
    echo "  --interval=N           - Intervalle de surveillance en secondes (défaut: 5)"
    echo "  --duration=N           - Durée de surveillance en minutes (défaut: infini)"
    echo "  --save-data            - Sauvegarder les données collectées"
    echo "  --alert-threshold=N    - Seuil d'alerte en pourcentage (défaut: 80)"
    echo "  --output-format=FORMAT - Format de sortie: text, json, html (défaut: text)"
    echo ""
    echo "Exemples:"
    echo "  ./deploy-monitoring.sh monitor 192.168.1.100"
    echo "  ./deploy-monitoring.sh watch-services 192.168.1.100 --interval=10"
    echo "  ./deploy-monitoring.sh status-report 192.168.1.100 --output-format=html"
    echo "  ./deploy-monitoring.sh check-alerts 192.168.1.100 --alert-threshold=90"
    echo ""
}

# Variables globales
INTERVAL=5
DURATION=""
SAVE_DATA=false
ALERT_THRESHOLD=80
OUTPUT_FORMAT="text"

# Surveillance temps réel complète
monitor_system() {
    local ip="$1"
    
    log_info "📊 Démarrage de la surveillance temps réel..."
    trace_deploy_operation "monitor_system" "STARTED" "Starting real-time monitoring of $ip"
    
    local start_time=$(date +%s)
    local iteration=0
    
    # Créer le répertoire de données si nécessaire
    if [ "$SAVE_DATA" = "true" ]; then
        local data_dir="$DEPLOY_LOGS_DIR/monitoring_$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$data_dir"
        log_info "📁 Données sauvegardées dans: $data_dir"
    fi
    
    while true; do
        clear
        echo -e "${CYAN}========================================${NC}"
        echo -e "${CYAN}    SURVEILLANCE MEESHY - TEMPS RÉEL${NC}"
        echo -e "${CYAN}========================================${NC}"
        echo ""
        echo "🖥️  Serveur: $ip"
        echo "⏰ Heure: $(date)"
        echo "🔄 Itération: $((++iteration))"
        
        if [ -n "$DURATION" ]; then
            local elapsed=$(( $(date +%s) - start_time ))
            local remaining=$(( (DURATION * 60) - elapsed ))
            echo "⏱️  Temps restant: ${remaining}s"
        fi
        
        echo ""
        
        # Surveillance des services
        monitor_services_status "$ip"
        echo ""
        
        # Surveillance des ressources
        monitor_system_resources "$ip"
        echo ""
        
        # Surveillance des performances
        monitor_performance_metrics "$ip"
        echo ""
        
        # Surveillance des erreurs récentes
        monitor_recent_errors "$ip"
        
        # Vérifier les conditions d'arrêt
        if [ -n "$DURATION" ]; then
            local elapsed=$(( $(date +%s) - start_time ))
            if [ $elapsed -ge $((DURATION * 60)) ]; then
                log_info "⏰ Durée de surveillance atteinte"
                break
            fi
        fi
        
        echo ""
        echo -e "${YELLOW}Appuyez sur Ctrl+C pour arrêter...${NC}"
        sleep $INTERVAL
    done
    
    trace_deploy_operation "monitor_system" "SUCCESS" "Monitoring completed after $iteration iterations"
}

# Surveiller l'état des services
monitor_services_status() {
    local ip="$1"
    
    echo -e "${GREEN}🔧 ÉTAT DES SERVICES:${NC}"
    
    local services=("traefik" "redis" "mongodb" "gateway" "translator" "frontend")
    local running_count=0
    
    for service in "${services[@]}"; do
        if ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose ps $service | grep -q 'Up'" 2>/dev/null; then
            echo -e "  ✅ $service: ${GREEN}En cours d'exécution${NC}"
            ((running_count++))
        else
            echo -e "  ❌ $service: ${RED}Arrêté${NC}"
        fi
    done
    
    local total_services=${#services[@]}
    local status_percentage=$((running_count * 100 / total_services))
    
    echo "  📊 Services actifs: $running_count/$total_services ($status_percentage%)"
    
    if [ $status_percentage -lt $ALERT_THRESHOLD ]; then
        echo -e "  ${RED}⚠️  ALERTE: Nombre de services insuffisant${NC}"
    fi
}

# Surveiller les ressources système
monitor_system_resources() {
    local ip="$1"
    
    echo -e "${BLUE}💾 RESSOURCES SYSTÈME:${NC}"
    
    # Utilisation CPU
    local cpu_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "top -bn1 | grep 'Cpu(s)' | awk '{print \$2}' | cut -d'%' -f1 | cut -d',' -f1" 2>/dev/null || echo "0")
    echo -n "  🔥 CPU: ${cpu_usage}%"
    if [ "${cpu_usage%.*}" -gt $ALERT_THRESHOLD ]; then
        echo -e " ${RED}⚠️${NC}"
    else
        echo ""
    fi
    
    # Utilisation mémoire
    local memory_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "free | grep Mem | awk '{printf \"%.0f\", \$3/\$2 * 100.0}'" 2>/dev/null || echo "0")
    echo -n "  🧠 Mémoire: ${memory_usage}%"
    if [ "$memory_usage" -gt $ALERT_THRESHOLD ]; then
        echo -e " ${RED}⚠️${NC}"
    else
        echo ""
    fi
    
    # Utilisation disque
    local disk_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "df -h / | tail -1 | awk '{print \$5}' | sed 's/%//'" 2>/dev/null || echo "0")
    echo -n "  💽 Disque: ${disk_usage}%"
    if [ "$disk_usage" -gt $ALERT_THRESHOLD ]; then
        echo -e " ${RED}⚠️${NC}"
    else
        echo ""
    fi
    
    # Charge système
    local load_avg=$(ssh -o StrictHostKeyChecking=no root@$ip "uptime | awk -F'load average:' '{print \$2}' | awk '{print \$1}' | sed 's/,//'" 2>/dev/null || echo "0")
    echo "  ⚡ Charge: $load_avg"
    
    # Nombre de connexions réseau
    local connections=$(ssh -o StrictHostKeyChecking=no root@$ip "netstat -an 2>/dev/null | grep ESTABLISHED | wc -l" 2>/dev/null || echo "0")
    echo "  🌐 Connexions: $connections"
}

# Surveiller les métriques de performance
monitor_performance_metrics() {
    local ip="$1"
    
    echo -e "${CYAN}⚡ PERFORMANCES:${NC}"
    
    # Test de latence HTTP
    local http_latency=$(curl -o /dev/null -s -w '%{time_total}' http://$ip 2>/dev/null || echo "timeout")
    echo "  🌐 Latence HTTP: ${http_latency}s"
    
    # Test des endpoints principaux
    local gateway_status="❌"
    local translator_status="❌"
    
    if curl -f -s --max-time 5 -H 'Host: gate.meeshy.me' http://$ip/health >/dev/null 2>&1; then
        gateway_status="✅"
    fi
    
    if curl -f -s --max-time 5 -H 'Host: ml.meeshy.me' http://$ip/health >/dev/null 2>&1; then
        translator_status="✅"
    fi
    
    echo "  🚪 Gateway API: $gateway_status"
    echo "  🌐 Translator API: $translator_status"
    
    # Statistiques Docker
    local docker_containers=$(ssh -o StrictHostKeyChecking=no root@$ip "docker ps -q | wc -l" 2>/dev/null || echo "0")
    local docker_images=$(ssh -o StrictHostKeyChecking=no root@$ip "docker images -q | wc -l" 2>/dev/null || echo "0")
    local docker_volumes=$(ssh -o StrictHostKeyChecking=no root@$ip "docker volume ls -q | wc -l" 2>/dev/null || echo "0")
    
    echo "  🐳 Conteneurs: $docker_containers"
    echo "  📦 Images: $docker_images"
    echo "  💾 Volumes: $docker_volumes"
}

# Surveiller les erreurs récentes
monitor_recent_errors() {
    local ip="$1"
    
    echo -e "${RED}🚨 ERREURS RÉCENTES:${NC}"
    
    local services=("gateway" "translator" "mongodb")
    local total_errors=0
    
    for service in "${services[@]}"; do
        local error_count=$(ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose logs --tail=20 $service 2>/dev/null | grep -i 'error\|failed\|exception' | wc -l" 2>/dev/null || echo "0")
        
        if [ "$error_count" -gt 0 ]; then
            echo -e "  ⚠️  $service: ${error_count} erreur(s)"
            total_errors=$((total_errors + error_count))
        fi
    done
    
    if [ $total_errors -eq 0 ]; then
        echo "  ✅ Aucune erreur récente détectée"
    else
        echo -e "  🚨 Total: ${RED}$total_errors erreur(s) récente(s)${NC}"
    fi
}

# Générer un rapport de statut complet
generate_status_report() {
    local ip="$1"
    
    log_info "📋 Génération du rapport de statut..."
    
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local report_file="$DEPLOY_LOGS_DIR/status_report_${timestamp}.txt"
    
    {
        echo "======================================"
        echo "    RAPPORT DE STATUT - MEESHY"
        echo "======================================"
        echo ""
        echo "Date: $(date)"
        echo "Serveur: $ip"
        echo "Session: $DEPLOY_SESSION_ID"
        echo ""
        
        echo "SERVICES:"
        local services=("traefik" "redis" "mongodb" "gateway" "translator" "frontend")
        for service in "${services[@]}"; do
            if ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose ps $service | grep -q 'Up'" 2>/dev/null; then
                echo "  ✅ $service: En cours d'exécution"
            else
                echo "  ❌ $service: Arrêté"
            fi
        done
        echo ""
        
        echo "RESSOURCES SYSTÈME:"
        local cpu_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "top -bn1 | grep 'Cpu(s)' | awk '{print \$2}' | cut -d'%' -f1 | cut -d',' -f1" 2>/dev/null || echo "N/A")
        local memory_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "free | grep Mem | awk '{printf \"%.0f\", \$3/\$2 * 100.0}'" 2>/dev/null || echo "N/A")
        local disk_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "df -h / | tail -1 | awk '{print \$5}'" 2>/dev/null || echo "N/A")
        
        echo "  CPU: ${cpu_usage}%"
        echo "  Mémoire: ${memory_usage}%"
        echo "  Disque: $disk_usage"
        echo ""
        
        echo "CONNECTIVITÉ:"
        if curl -f -s --max-time 5 http://$ip >/dev/null 2>&1; then
            echo "  ✅ HTTP (port 80): Accessible"
        else
            echo "  ❌ HTTP (port 80): Inaccessible"
        fi
        
        if curl -f -s --max-time 5 -H 'Host: gate.meeshy.me' http://$ip/health >/dev/null 2>&1; then
            echo "  ✅ Gateway API: Fonctionnelle"
        else
            echo "  ❌ Gateway API: Non fonctionnelle"
        fi
        
        if curl -f -s --max-time 5 -H 'Host: ml.meeshy.me' http://$ip/health >/dev/null 2>&1; then
            echo "  ✅ Translator API: Fonctionnelle"
        else
            echo "  ❌ Translator API: Non fonctionnelle"
        fi
        
        echo ""
        echo "======================================"
        
    } > "$report_file"
    
    log_success "✅ Rapport généré: $report_file"
    
    # Afficher le rapport si format text
    if [ "$OUTPUT_FORMAT" = "text" ]; then
        cat "$report_file"
    fi
}

# Générer un tableau de bord HTML
generate_html_dashboard() {
    local ip="$1"
    
    log_info "🌐 Génération du tableau de bord HTML..."
    
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local dashboard_file="$DEPLOY_LOGS_DIR/dashboard_${timestamp}.html"
    
    # Collecter les données
    local services_status=""
    local services=("traefik" "redis" "mongodb" "gateway" "translator" "frontend")
    local running_count=0
    
    for service in "${services[@]}"; do
        if ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose ps $service | grep -q 'Up'" 2>/dev/null; then
            services_status="$services_status<span class='service-running'>✅ $service</span><br>"
            ((running_count++))
        else
            services_status="$services_status<span class='service-stopped'>❌ $service</span><br>"
        fi
    done
    
    local cpu_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "top -bn1 | grep 'Cpu(s)' | awk '{print \$2}' | cut -d'%' -f1 | cut -d',' -f1" 2>/dev/null || echo "0")
    local memory_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "free | grep Mem | awk '{printf \"%.0f\", \$3/\$2 * 100.0}'" 2>/dev/null || echo "0")
    local disk_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "df -h / | tail -1 | awk '{print \$5}' | sed 's/%//'" 2>/dev/null || echo "0")
    
    {
        cat << 'EOF'
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tableau de Bord Meeshy</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            padding: 30px;
        }
        .header {
            text-align: center;
            color: #2c3e50;
            margin-bottom: 30px;
            border-bottom: 2px solid #3498db;
            padding-bottom: 20px;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .card {
            background: #ffffff;
            border: 1px solid #e1e8ed;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .card h3 {
            margin-top: 0;
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
        }
        .service-running {
            color: #27ae60;
        }
        .service-stopped {
            color: #e74c3c;
        }
        .metric {
            font-size: 24px;
            font-weight: bold;
            margin: 10px 0;
        }
        .metric.good {
            color: #27ae60;
        }
        .metric.warning {
            color: #f39c12;
        }
        .metric.critical {
            color: #e74c3c;
        }
        .progress-bar {
            width: 100%;
            height: 20px;
            background-color: #ecf0f1;
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            height: 100%;
            transition: width 0.3s ease;
        }
        .progress-fill.good {
            background-color: #27ae60;
        }
        .progress-fill.warning {
            background-color: #f39c12;
        }
        .progress-fill.critical {
            background-color: #e74c3c;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Tableau de Bord Meeshy</h1>
            <p>Surveillance en temps réel du serveur</p>
EOF
        echo "            <p><strong>Serveur:</strong> $ip | <strong>Dernière mise à jour:</strong> $(date)</p>"
        echo "        </div>"
        echo "        <div class=\"grid\">"
        echo "            <div class=\"card\">"
        echo "                <h3>🔧 Services</h3>"
        echo "                $services_status"
        echo "                <p><strong>Services actifs:</strong> $running_count/${#services[@]}</p>"
        echo "            </div>"
        echo "            <div class=\"card\">"
        echo "                <h3>💾 Ressources Système</h3>"
        
        # CPU
        local cpu_class="good"
        if [ "${cpu_usage%.*}" -gt 80 ]; then cpu_class="critical"; elif [ "${cpu_usage%.*}" -gt 60 ]; then cpu_class="warning"; fi
        echo "                <p>🔥 <strong>CPU:</strong> <span class=\"metric $cpu_class\">${cpu_usage}%</span></p>"
        echo "                <div class=\"progress-bar\"><div class=\"progress-fill $cpu_class\" style=\"width: ${cpu_usage}%\"></div></div>"
        
        # Mémoire
        local mem_class="good"
        if [ "$memory_usage" -gt 80 ]; then mem_class="critical"; elif [ "$memory_usage" -gt 60 ]; then mem_class="warning"; fi
        echo "                <p>🧠 <strong>Mémoire:</strong> <span class=\"metric $mem_class\">${memory_usage}%</span></p>"
        echo "                <div class=\"progress-bar\"><div class=\"progress-fill $mem_class\" style=\"width: ${memory_usage}%\"></div></div>"
        
        # Disque
        local disk_class="good"
        if [ "$disk_usage" -gt 80 ]; then disk_class="critical"; elif [ "$disk_usage" -gt 60 ]; then disk_class="warning"; fi
        echo "                <p>💽 <strong>Disque:</strong> <span class=\"metric $disk_class\">${disk_usage}%</span></p>"
        echo "                <div class=\"progress-bar\"><div class=\"progress-fill $disk_class\" style=\"width: ${disk_usage}%\"></div></div>"
        
        echo "            </div>"
        echo "            <div class=\"card\">"
        echo "                <h3>🌐 Connectivité</h3>"
        
        # Tests de connectivité
        if curl -f -s --max-time 5 http://$ip >/dev/null 2>&1; then
            echo "                <p><span class=\"service-running\">✅ HTTP (port 80)</span></p>"
        else
            echo "                <p><span class=\"service-stopped\">❌ HTTP (port 80)</span></p>"
        fi
        
        if curl -f -s --max-time 5 -H 'Host: gate.meeshy.me' http://$ip/health >/dev/null 2>&1; then
            echo "                <p><span class=\"service-running\">✅ Gateway API</span></p>"
        else
            echo "                <p><span class=\"service-stopped\">❌ Gateway API</span></p>"
        fi
        
        if curl -f -s --max-time 5 -H 'Host: ml.meeshy.me' http://$ip/health >/dev/null 2>&1; then
            echo "                <p><span class=\"service-running\">✅ Translator API</span></p>"
        else
            echo "                <p><span class=\"service-stopped\">❌ Translator API</span></p>"
        fi
        
        echo "            </div>"
        echo "        </div>"
        echo "    </div>"
        echo "</body>"
        echo "</html>"
        
    } > "$dashboard_file"
    
    log_success "✅ Tableau de bord HTML généré: $dashboard_file"
    log_info "🌐 Ouvrez le fichier dans un navigateur pour visualiser le tableau de bord"
}

# Vérifier les conditions d'alerte
check_alerts() {
    local ip="$1"
    
    log_info "🚨 Vérification des conditions d'alerte..."
    trace_deploy_operation "check_alerts" "STARTED" "Checking alert conditions on $ip"
    
    local alerts=()
    
    # Vérifier l'utilisation CPU
    local cpu_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "top -bn1 | grep 'Cpu(s)' | awk '{print \$2}' | cut -d'%' -f1 | cut -d',' -f1" 2>/dev/null || echo "0")
    if [ "${cpu_usage%.*}" -gt $ALERT_THRESHOLD ]; then
        alerts+=("CPU élevé: ${cpu_usage}% (seuil: ${ALERT_THRESHOLD}%)")
    fi
    
    # Vérifier l'utilisation mémoire
    local memory_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "free | grep Mem | awk '{printf \"%.0f\", \$3/\$2 * 100.0}'" 2>/dev/null || echo "0")
    if [ "$memory_usage" -gt $ALERT_THRESHOLD ]; then
        alerts+=("Mémoire élevée: ${memory_usage}% (seuil: ${ALERT_THRESHOLD}%)")
    fi
    
    # Vérifier l'utilisation disque
    local disk_usage=$(ssh -o StrictHostKeyChecking=no root@$ip "df -h / | tail -1 | awk '{print \$5}' | sed 's/%//'" 2>/dev/null || echo "0")
    if [ "$disk_usage" -gt $ALERT_THRESHOLD ]; then
        alerts+=("Disque plein: ${disk_usage}% (seuil: ${ALERT_THRESHOLD}%)")
    fi
    
    # Vérifier les services arrêtés
    local services=("traefik" "redis" "mongodb" "gateway" "translator" "frontend")
    for service in "${services[@]}"; do
        if ! ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose ps $service | grep -q 'Up'" 2>/dev/null; then
            alerts+=("Service arrêté: $service")
        fi
    done
    
    # Vérifier les erreurs récentes
    local total_errors=0
    for service in "${services[@]}"; do
        local error_count=$(ssh -o StrictHostKeyChecking=no root@$ip "cd /opt/meeshy && docker compose logs --tail=50 $service 2>/dev/null | grep -i 'error\|failed\|exception' | wc -l" 2>/dev/null || echo "0")
        total_errors=$((total_errors + error_count))
    done
    
    if [ $total_errors -gt 10 ]; then
        alerts+=("Erreurs nombreuses: $total_errors erreur(s) récente(s)")
    fi
    
    # Afficher les alertes
    if [ ${#alerts[@]} -eq 0 ]; then
        log_success "✅ Aucune alerte détectée"
        trace_deploy_operation "check_alerts" "SUCCESS" "No alerts detected"
    else
        log_warning "🚨 ${#alerts[@]} alerte(s) détectée(s):"
        for alert in "${alerts[@]}"; do
            log_warning "  ⚠️  $alert"
        done
        trace_deploy_operation "check_alerts" "WARNING" "${#alerts[@]} alerts detected"
    fi
    
    return ${#alerts[@]}
}

# Point d'entrée principal
main() {
    local command="${1:-help}"
    local ip="$2"
    
    # Parser les options
    shift 2 2>/dev/null || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --interval=*)
                INTERVAL="${1#*=}"
                shift
                ;;
            --duration=*)
                DURATION="${1#*=}"
                shift
                ;;
            --save-data)
                SAVE_DATA=true
                shift
                ;;
            --alert-threshold=*)
                ALERT_THRESHOLD="${1#*=}"
                shift
                ;;
            --output-format=*)
                OUTPUT_FORMAT="${1#*=}"
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    case "$command" in
        "monitor")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            monitor_system "$ip"
            ;;
        "watch-services")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            while true; do
                clear
                monitor_services_status "$ip"
                sleep $INTERVAL
            done
            ;;
        "watch-resources")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            while true; do
                clear
                monitor_system_resources "$ip"
                sleep $INTERVAL
            done
            ;;
        "status-report")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            generate_status_report "$ip"
            ;;
        "generate-dashboard")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            generate_html_dashboard "$ip"
            ;;
        "check-alerts")
            if [ -z "$ip" ]; then
                log_error "IP du serveur requise"
                exit 1
            fi
            check_alerts "$ip"
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
