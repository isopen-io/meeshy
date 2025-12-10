#!/bin/bash

# Script pour partager le certificat mkcert avec un appareil mobile
# Usage: ./share-cert-to-mobile.sh

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📱 Partage du certificat mkcert pour mobile${NC}"
echo ""

# Vérifier que mkcert est installé
if ! command -v mkcert &> /dev/null; then
    echo -e "${RED}❌ mkcert n'est pas installé${NC}"
    echo -e "${YELLOW}   Installation:${NC}"
    echo -e "   macOS:   brew install mkcert"
    echo -e "   Linux:   https://github.com/FiloSottile/mkcert#linux"
    exit 1
fi

# Localiser le certificat racine
CAROOT=$(mkcert -CAROOT)
CERT_FILE="$CAROOT/rootCA.pem"

if [ ! -f "$CERT_FILE" ]; then
    echo -e "${RED}❌ Certificat racine mkcert non trouvé${NC}"
    echo -e "${YELLOW}   Initialisez mkcert avec: mkcert -install${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Certificat racine trouvé: $CERT_FILE${NC}"
echo ""

# Copier sur le bureau avec un nom plus explicite
DESKTOP_FILE="$HOME/Desktop/mkcert-root-ca-install-on-iphone.pem"
cp "$CERT_FILE" "$DESKTOP_FILE"

echo -e "${GREEN}✅ Certificat copié sur le bureau${NC}"
echo -e "   Fichier: $DESKTOP_FILE"
echo ""

# Détecter l'IP locale
if command -v ipconfig &> /dev/null; then
    # macOS
    LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "192.168.1.39")
elif command -v ip &> /dev/null; then
    # Linux
    LOCAL_IP=$(ip route get 1 2>/dev/null | awk '{print $7; exit}' || echo "192.168.1.39")
else
    LOCAL_IP="192.168.1.39"
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📱 INSTALLATION SUR IPHONE/IPAD${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}Option 1: AirDrop (recommandé)${NC}"
echo "   1. Localisez le fichier sur votre Bureau"
echo "   2. Clic droit → Partager → AirDrop"
echo "   3. Sélectionnez votre iPhone/iPad"
echo ""
echo -e "${GREEN}Option 2: Serveur web temporaire${NC}"
echo "   1. Démarrez le serveur web (il va démarrer automatiquement)"
echo "   2. Sur votre iPhone, ouvrez Safari"
echo "   3. Allez à: ${BLUE}http://${LOCAL_IP}:8765/mkcert-root-ca-install-on-iphone.pem${NC}"
echo ""
echo -e "${GREEN}Option 3: Par email${NC}"
echo "   1. Envoyez-vous un email avec le fichier en pièce jointe"
echo "   2. Ouvrez l'email sur votre iPhone"
echo "   3. Téléchargez la pièce jointe"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📲 APRÈS LE TRANSFERT SUR IPHONE${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "   1️⃣  Réglages → Général → VPN et gestion des appareils"
echo "   2️⃣  Appuyez sur le profil 'mkcert rootCA'"
echo "   3️⃣  Appuyez sur 'Installer' (en haut à droite)"
echo "   4️⃣  Entrez votre code PIN"
echo ""
echo -e "${RED}   ⚠️  ÉTAPE CRUCIALE (sans elle, ça ne fonctionnera pas) :${NC}"
echo ""
echo "   5️⃣  Réglages → Général → Informations → Réglages des certificats"
echo "   6️⃣  Activez le bouton pour 'mkcert [votre ordinateur]'"
echo "   7️⃣  Confirmez 'Activer la confiance totale'"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Demander si on veut démarrer le serveur web
read -p "Voulez-vous démarrer le serveur web temporaire ? (o/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Oo]$ ]]; then
    echo ""
    echo -e "${GREEN}🌐 Démarrage du serveur web sur le port 8765...${NC}"
    echo -e "${YELLOW}   Sur votre iPhone, allez à:${NC}"
    echo -e "${BLUE}   http://${LOCAL_IP}:8765/mkcert-root-ca-install-on-iphone.pem${NC}"
    echo ""
    echo -e "${YELLOW}   Appuyez sur Ctrl+C pour arrêter le serveur${NC}"
    echo ""

    # Démarrer le serveur web
    cd "$HOME/Desktop"
    if command -v python3 &> /dev/null; then
        python3 -m http.server 8765
    elif command -v python &> /dev/null; then
        python -m SimpleHTTPServer 8765
    else
        echo -e "${RED}❌ Python n'est pas installé${NC}"
        exit 1
    fi
else
    echo ""
    echo -e "${GREEN}✅ Vous pouvez maintenant transférer le certificat manuellement${NC}"
    echo -e "   Fichier: $DESKTOP_FILE"
fi
