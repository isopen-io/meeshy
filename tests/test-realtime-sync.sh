#!/bin/bash

# Script de test pour vérifier la synchronisation temps réel entre les vues

echo "======================================"
echo "Test de Synchronisation Temps Réel"
echo "======================================"
echo ""

# Couleurs pour les logs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Instructions de test manuel:${NC}"
echo ""

echo "1. ${GREEN}Test des Typing Indicators${NC}"
echo "   - Ouvrir http://localhost:3000/ sur navigateur A (Chrome)"
echo "   - Ouvrir http://localhost:3000/conversations/meeshy sur navigateur B (Firefox)"
echo "   - Commencer à taper dans A"
echo "   - ${GREEN}✓ Vérifier:${NC} B affiche 'est en train d'écrire...'"
echo "   - Arrêter de taper dans A"
echo "   - ${GREEN}✓ Vérifier:${NC} L'indicateur disparaît dans B"
echo "   - Commencer à taper dans B"
echo "   - ${GREEN}✓ Vérifier:${NC} A affiche 'est en train d'écrire...'"
echo ""

echo "2. ${GREEN}Test des Messages en Temps Réel${NC}"
echo "   - Envoyer un message depuis A (sur /)"
echo "   - ${GREEN}✓ Vérifier:${NC} Le message apparaît instantanément dans B (/conversations/meeshy)"
echo "   - Envoyer un message depuis B (/conversations/meeshy)"
echo "   - ${GREEN}✓ Vérifier:${NC} Le message apparaît instantanément dans A (/)"
echo ""

echo "3. ${GREEN}Test de Présence${NC}"
echo "   - Ouvrir /conversations/meeshy sur navigateurs A et B"
echo "   - ${GREEN}✓ Vérifier:${NC} Les deux voient l'autre en ligne dans la sidebar"
echo "   - Fermer le navigateur A"
echo "   - ${GREEN}✓ Vérifier:${NC} B voit A déconnecté (indicateur gris)"
echo ""

echo "4. ${GREEN}Test de Traductions en Temps Réel${NC}"
echo "   - A envoie un message en français sur /"
echo "   - ${GREEN}✓ Vérifier:${NC} B reçoit le message avec bouton de traduction"
echo "   - B clique sur 'Traduire en anglais'"
echo "   - ${GREEN}✓ Vérifier:${NC} La traduction s'affiche instantanément"
echo ""

echo "======================================"
echo "Vérification des Services"
echo "======================================"
echo ""

# Vérifier que les services sont en ligne
check_service() {
    local name=$1
    local url=$2
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200\|302"; then
        echo -e "${GREEN}✓${NC} $name est en ligne"
    else
        echo -e "${RED}✗${NC} $name est hors ligne - démarrez le service"
        return 1
    fi
}

check_service "Frontend" "http://localhost:3000"
check_service "Gateway" "http://localhost:3001/health"

echo ""
echo "======================================"
echo "Commandes Utiles pour le Debugging"
echo "======================================"
echo ""

echo "# Voir les logs du Gateway en temps réel:"
echo "docker-compose logs -f gateway | grep -E 'TYPING|MESSAGE|CONVERSATION'"
echo ""

echo "# Voir les connexions WebSocket actives:"
echo "curl http://localhost:3001/admin/stats | jq '.connected_users'"
echo ""

echo "# Redémarrer le Gateway après modifications:"
echo "cd gateway && pnpm run dev"
echo ""

echo "======================================"
echo "Checklist de Validation"
echo "======================================"
echo ""

echo "[ ] Typing indicators fonctionnent bidirectionnellement"
echo "[ ] Messages apparaissent en temps réel dans les deux vues"
echo "[ ] Présence mise à jour correctement"
echo "[ ] Traductions reçues en temps réel"
echo "[ ] Déconnexions détectées correctement"
echo ""

echo -e "${GREEN}Bonne chance avec les tests !${NC}"

