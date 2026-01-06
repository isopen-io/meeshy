#!/bin/bash
echo "🚀 Lancement de l'application iOS Meeshy..."

# Vérifier que le serveur backend fonctionne
if ! curl -s http://localhost:5500/api/health > /dev/null; then
    echo "⚠️  Le serveur backend n'est pas en cours d'exécution"
    echo "Veuillez d'abord lancer: ../backend/start_server.sh"
    echo ""
    read -p "Voulez-vous lancer le serveur automatiquement? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🔄 Lancement du serveur backend..."
        cd ../backend
        ./start_server.sh &
        cd ../ios
        sleep 5
    else
        exit 1
    fi
fi

# Ouvrir le projet Xcode
if [ -f "Meeshy.xcodeproj/project.pbxproj" ]; then
    echo "📱 Ouverture du projet Xcode..."
    open Meeshy.xcodeproj
else
    echo "❌ Projet Xcode non trouvé"
    echo "Veuillez d'abord exécuter: ./setup_ios_macos.sh"
fi
