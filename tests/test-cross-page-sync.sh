#!/bin/bash

# Script de test pour la synchronisation cross-page (/ ↔ /conversations)

echo "============================================================"
echo "Test de Synchronisation Cross-Page"
echo "/ (BubbleStream) ↔ /conversations/[id]"
echo "============================================================"
echo ""

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Ce test valide la synchronisation WebSocket entre les pages${NC}"
echo ""

# Vérifier que les services sont en ligne
echo "Vérification des services..."
echo ""

check_service() {
    local name=$1
    local url=$2
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200\|302"; then
        echo -e "${GREEN}✓${NC} $name est en ligne"
        return 0
    else
        echo -e "${RED}✗${NC} $name est hors ligne"
        return 1
    fi
}

SERVICES_OK=true

check_service "Frontend" "http://localhost:3000" || SERVICES_OK=false
check_service "Gateway" "http://localhost:3001/health" || SERVICES_OK=false

if [ "$SERVICES_OK" = false ]; then
    echo ""
    echo -e "${RED}❌ Certains services sont hors ligne. Démarrez-les avant de continuer.${NC}"
    echo ""
    echo "Commandes:"
    echo "  cd frontend && pnpm run dev"
    echo "  cd gateway && pnpm run dev"
    exit 1
fi

echo ""
echo "============================================================"
echo "Instructions de Test Manuel"
echo "============================================================"
echo ""

echo -e "${BLUE}Configuration:${NC}"
echo "  - User 1: Compte 'test' (ou tout autre compte)"
echo "  - User 2: Compte 'admin' (ou tout autre compte)"
echo "  - Conversation: 'meeshy' (conversation globale)"
echo ""

echo -e "${BLUE}1. Test Typing Indicators${NC}"
echo "   ┌─────────────────────────────────────────────────┐"
echo "   │ User 'test' sur /                               │"
echo "   │ User 'admin' sur /conversations/meeshy          │"
echo "   └─────────────────────────────────────────────────┘"
echo ""
echo "   a) User 'test' commence à taper dans la zone de saisie sur /"
echo "      ${GREEN}✓ Vérifier:${NC} User 'admin' voit 'test est en train d'écrire...'"
echo ""
echo "   b) User 'test' arrête de taper"
echo "      ${GREEN}✓ Vérifier:${NC} L'indicateur disparaît pour 'admin'"
echo ""
echo "   c) User 'admin' commence à taper dans /conversations/meeshy"
echo "      ${GREEN}✓ Vérifier:${NC} User 'test' voit 'admin est en train d'écrire...'"
echo ""

echo -e "${BLUE}2. Test Messages Temps Réel${NC}"
echo "   a) User 'test' envoie message 'Hello from /' sur /"
echo "      ${GREEN}✓ Vérifier:${NC} User 'admin' reçoit le message INSTANTANÉMENT"
echo "      ${GREEN}✓ Vérifier:${NC} Le message apparaît en bas de /conversations/meeshy"
echo "      ${GREEN}✓ Vérifier:${NC} PAS besoin de rafraîchir la page"
echo ""
echo "   b) User 'admin' envoie message 'Hello from conversations' sur /conversations/meeshy"
echo "      ${GREEN}✓ Vérifier:${NC} User 'test' reçoit le message INSTANTANÉMENT"
echo "      ${GREEN}✓ Vérifier:${NC} Le message apparaît en haut de /"
echo "      ${GREEN}✓ Vérifier:${NC} PAS besoin de rafraîchir la page"
echo ""

echo -e "${BLUE}3. Test Traductions Synchronisées${NC}"
echo "   a) User 'test' envoie message en français sur /"
echo "      ${GREEN}✓ Vérifier:${NC} User 'admin' voit le message sur /conversations/meeshy"
echo ""
echo "   b) User 'admin' clique 'Traduire en anglais'"
echo "      ${GREEN}✓ Vérifier:${NC} User 'test' voit la traduction apparaître sur /"
echo "      ${GREEN}✓ Vérifier:${NC} La traduction est instantanée"
echo ""

echo -e "${BLUE}4. Test Présence${NC}"
echo "   a) Les deux users connectés"
echo "      ${GREEN}✓ Vérifier:${NC} Chacun voit l'autre en ligne dans la sidebar"
echo ""
echo "   b) User 'test' ferme son navigateur"
echo "      ${GREEN}✓ Vérifier:${NC} User 'admin' voit 'test' passer hors ligne (max 10 secondes)"
echo ""

echo "============================================================"
echo "Logs de Debug en Temps Réel"
echo "============================================================"
echo ""

echo "Ouvrez un terminal séparé et exécutez:"
echo ""
echo -e "${BLUE}# Voir la normalisation des IDs${NC}"
echo "docker-compose logs -f gateway | grep NORMALIZE"
echo ""
echo -e "${BLUE}# Voir les événements de typing${NC}"
echo "docker-compose logs -f gateway | grep TYPING"
echo ""
echo -e "${BLUE}# Voir les messages broadcastés${NC}"
echo "docker-compose logs -f gateway | grep 'Broadcasting message'"
echo ""
echo -e "${BLUE}# Voir les rooms rejointes${NC}"
echo "docker-compose logs -f gateway | grep 'rejoint'"
echo ""

echo "============================================================"
echo "Logs Attendus"
echo "============================================================"
echo ""

echo "Quand User 'admin' ouvre /conversations/meeshy:"
echo "  🔄 [NORMALIZE] ObjectId 67abc123... → meeshy"
echo "  👥 Socket xyz789 rejoint conversation_meeshy"
echo ""

echo "Quand User 'test' tape sur /:"
echo "  ⌨️ [TYPING] test commence à taper dans conversation_meeshy"
echo ""

echo "Quand User 'test' envoie message:"
echo "  [PHASE 3.1] 📤 Broadcasting message abc123 vers conversation meeshy"
echo "  🔍 [DEBUG] Room conversation_meeshy a 2 clients connectés"
echo ""

echo "============================================================"
echo "Checklist de Validation"
echo "============================================================"
echo ""

echo "[ ] Typing indicators fonctionnent de / vers /conversations"
echo "[ ] Typing indicators fonctionnent de /conversations vers /"
echo "[ ] Messages de / arrivent instantanément sur /conversations"
echo "[ ] Messages de /conversations arrivent instantanément sur /"
echo "[ ] Traductions visibles en temps réel sur les deux pages"
echo "[ ] Présence synchronisée entre les pages"
echo "[ ] Déconnexions détectées correctement"
echo ""

echo -e "${GREEN}✅ Prêt pour les tests !${NC}"
echo ""
echo "Astuce: Utilisez deux navigateurs différents (Chrome + Firefox)"
echo "        ou deux fenêtres en navigation privée pour tester."

