#!/bin/bash

# Script de configuration automatique du projet Xcode Meeshy
# Compatible Apple M3 Pro (macOS)

echo "🏗️  Configuration du projet Xcode Meeshy..."

# Vérifier que nous sommes dans le bon dossier
if [ ! -d "Meeshy" ]; then
    echo "❌ Dossier Meeshy non trouvé. Veuillez exécuter depuis le dossier ios/"
    exit 1
fi

# Supprimer Package.swift si présent (non nécessaire pour une app iOS)
if [ -f "Package.swift" ]; then
    echo "📦 Suppression de Package.swift (non nécessaire pour une app iOS)"
    rm Package.swift
fi

# Vérifier si CocoaPods est installé
if ! command -v pod &> /dev/null; then
    echo "📥 Installation de CocoaPods..."
    if command -v brew &> /dev/null; then
        # Utiliser Homebrew sur macOS (recommandé pour Apple Silicon)
        brew install cocoapods
    else
        # Fallback vers gem
        sudo gem install cocoapods
    fi
else
    echo "✅ CocoaPods déjà installé"
fi

# Initialiser CocoaPods si nécessaire
if [ ! -f "Podfile.lock" ]; then
    echo "🔧 Initialisation de CocoaPods..."
    pod setup
fi

# Installer les dépendances
echo "📚 Installation des dépendances ML Kit et Socket.IO..."
pod install

# Vérifier que l'installation s'est bien passée
if [ -f "Meeshy.xcworkspace" ]; then
    echo "✅ Configuration terminée avec succès!"
    echo ""
    echo "🚀 Étapes suivantes:"
    echo "1. Ouvrir le workspace: open Meeshy.xcworkspace"
    echo "2. Sélectionner votre équipe de développement"
    echo "3. Configurer le Bundle Identifier"
    echo "4. Compiler et tester l'application"
    echo ""
    echo "📱 L'application utilisera:"
    echo "   - Socket.IO pour la communication WebSocket"
    echo "   - Google ML Kit pour la traduction on-device"
    echo "   - SwiftUI pour l'interface utilisateur"
    echo ""
    echo "🌐 Serveur backend: http://localhost:5500"
else
    echo "❌ Erreur lors de l'installation des dépendances"
    echo "Vérifiez les logs ci-dessus pour plus de détails"
    exit 1
fi

