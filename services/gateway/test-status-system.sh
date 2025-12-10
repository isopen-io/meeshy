#!/bin/bash

# Script de test du système de statut utilisateur
# Usage: ./test-status-system.sh [test_number]

set -e

GATEWAY_URL="${GATEWAY_URL:-http://localhost:3000}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================================="
echo "  Meeshy - Test du Système de Statut Utilisateur"
echo "=================================================="
echo ""
echo "Gateway URL: $GATEWAY_URL"
echo ""

# Fonction pour afficher les résultats
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ $2${NC}"
    else
        echo -e "${RED}✗ $2${NC}"
    fi
}

# Test 1: Vérifier que les endpoints existent
test_endpoints() {
    echo "Test 1: Vérification des endpoints"
    echo "-----------------------------------"

    # Test maintenance stats
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/maintenance/stats")
    if [ "$STATUS_CODE" = "200" ]; then
        print_result 0 "Endpoint /maintenance/stats accessible"
    else
        print_result 1 "Endpoint /maintenance/stats non accessible (HTTP $STATUS_CODE)"
    fi

    # Test status metrics
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL/maintenance/status-metrics")
    if [ "$STATUS_CODE" = "200" ]; then
        print_result 0 "Endpoint /maintenance/status-metrics accessible"
    else
        print_result 1 "Endpoint /maintenance/status-metrics non accessible (HTTP $STATUS_CODE)"
    fi

    echo ""
}

# Test 2: Afficher les métriques actuelles
test_metrics() {
    echo "Test 2: Métriques StatusService"
    echo "--------------------------------"

    METRICS=$(curl -s "$GATEWAY_URL/maintenance/status-metrics")

    if echo "$METRICS" | jq -e '.success' > /dev/null 2>&1; then
        print_result 0 "Métriques récupérées avec succès"
        echo ""
        echo "Données:"
        echo "$METRICS" | jq '.data'

        # Calculer le throttle rate
        TOTAL=$(echo "$METRICS" | jq -r '.data.totalRequests')
        THROTTLED=$(echo "$METRICS" | jq -r '.data.throttledRequests')
        CACHE_SIZE=$(echo "$METRICS" | jq -r '.data.cacheSize')

        if [ "$TOTAL" -gt 0 ]; then
            RATE=$(echo "scale=2; ($THROTTLED / $TOTAL) * 100" | bc)
            echo ""
            echo "Analyse:"
            echo "  - Total requêtes: $TOTAL"
            echo "  - Requêtes throttled: $THROTTLED"
            echo "  - Taux de throttling: ${RATE}%"
            echo "  - Taille du cache: $CACHE_SIZE"

            if (( $(echo "$RATE > 80" | bc -l) )); then
                print_result 0 "Throttling efficace (> 80%)"
            else
                print_result 1 "Throttling faible (< 80%)"
            fi
        else
            echo -e "${YELLOW}! Aucune requête enregistrée encore${NC}"
        fi
    else
        print_result 1 "Échec de récupération des métriques"
    fi

    echo ""
}

# Test 3: Statistiques de maintenance
test_maintenance_stats() {
    echo "Test 3: Statistiques de Maintenance"
    echo "------------------------------------"

    STATS=$(curl -s "$GATEWAY_URL/maintenance/stats")

    if echo "$STATS" | jq -e '.success' > /dev/null 2>&1; then
        print_result 0 "Statistiques récupérées avec succès"
        echo ""
        echo "Données:"
        echo "$STATS" | jq '.data'

        ONLINE=$(echo "$STATS" | jq -r '.data.onlineUsers')
        TOTAL=$(echo "$STATS" | jq -r '.data.totalUsers')
        MAINTENANCE_ACTIVE=$(echo "$STATS" | jq -r '.data.maintenanceActive')

        echo ""
        echo "Analyse:"
        echo "  - Utilisateurs en ligne: $ONLINE / $TOTAL"

        if [ "$MAINTENANCE_ACTIVE" = "true" ]; then
            print_result 0 "Job de maintenance actif"
        else
            print_result 1 "Job de maintenance inactif"
        fi
    else
        print_result 1 "Échec de récupération des statistiques"
    fi

    echo ""
}

# Test 4: Test de throttling avec requêtes multiples
test_throttling() {
    echo "Test 4: Test de Throttling"
    echo "---------------------------"
    echo "Ce test nécessite un token JWT valide"

    if [ -z "$JWT_TOKEN" ]; then
        echo -e "${YELLOW}! Variable JWT_TOKEN non définie, test ignoré${NC}"
        echo "  Pour exécuter ce test:"
        echo "  export JWT_TOKEN='votre_token_jwt'"
        echo "  ./test-status-system.sh 4"
        echo ""
        return
    fi

    echo "Réinitialisation des métriques..."
    curl -s -X POST "$GATEWAY_URL/maintenance/status-metrics/reset" > /dev/null

    echo "Envoi de 10 requêtes avec intervalle de 1 seconde..."
    for i in {1..10}; do
        echo -n "  Requête $i..."
        STATUS=$(curl -s -w "%{http_code}" -o /dev/null \
            -H "Authorization: Bearer $JWT_TOKEN" \
            "$GATEWAY_URL/api/conversations")

        if [ "$STATUS" = "200" ]; then
            echo " OK"
        else
            echo " FAIL (HTTP $STATUS)"
        fi

        if [ $i -lt 10 ]; then
            sleep 1
        fi
    done

    echo ""
    echo "Vérification des métriques après test..."
    sleep 2

    METRICS=$(curl -s "$GATEWAY_URL/maintenance/status-metrics")
    TOTAL=$(echo "$METRICS" | jq -r '.data.totalRequests')
    THROTTLED=$(echo "$METRICS" | jq -r '.data.throttledRequests')
    SUCCESSFUL=$(echo "$METRICS" | jq -r '.data.successfulUpdates')

    echo "Résultats:"
    echo "  - Total requêtes traitées: $TOTAL"
    echo "  - Requêtes throttled: $THROTTLED"
    echo "  - Updates DB effectuées: $SUCCESSFUL"

    if [ "$TOTAL" -eq 10 ] && [ "$THROTTLED" -ge 8 ] && [ "$SUCCESSFUL" -le 2 ]; then
        print_result 0 "Throttling fonctionne correctement"
    else
        print_result 1 "Throttling ne fonctionne pas comme attendu"
    fi

    echo ""
}

# Test 5: Réinitialisation des métriques
test_reset_metrics() {
    echo "Test 5: Réinitialisation des Métriques"
    echo "---------------------------------------"

    RESULT=$(curl -s -X POST "$GATEWAY_URL/maintenance/status-metrics/reset")

    if echo "$RESULT" | jq -e '.success' > /dev/null 2>&1; then
        print_result 0 "Métriques réinitialisées avec succès"

        echo "Vérification..."
        sleep 1

        METRICS=$(curl -s "$GATEWAY_URL/maintenance/status-metrics")
        TOTAL=$(echo "$METRICS" | jq -r '.data.totalRequests')

        if [ "$TOTAL" -eq 0 ]; then
            print_result 0 "Métriques bien remises à zéro"
        else
            print_result 1 "Métriques non remises à zéro (totalRequests: $TOTAL)"
        fi
    else
        print_result 1 "Échec de réinitialisation des métriques"
    fi

    echo ""
}

# Exécution des tests
if [ -z "$1" ]; then
    echo "Exécution de tous les tests..."
    echo ""
    test_endpoints
    test_metrics
    test_maintenance_stats
    test_throttling
    test_reset_metrics
else
    case $1 in
        1)
            test_endpoints
            ;;
        2)
            test_metrics
            ;;
        3)
            test_maintenance_stats
            ;;
        4)
            test_throttling
            ;;
        5)
            test_reset_metrics
            ;;
        *)
            echo "Test invalide. Utilisez un numéro entre 1 et 5."
            exit 1
            ;;
    esac
fi

echo "=================================================="
echo "  Tests terminés"
echo "=================================================="
