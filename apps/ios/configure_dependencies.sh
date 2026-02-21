#!/bin/bash

# Script de configuration des dépendances Meeshy iOS
# Permet de choisir entre Swift Package Manager et CocoaPods

echo "🎯 Configuration des Dépendances Meeshy iOS"
echo "============================================"
echo ""
echo "Deux approches sont disponibles :"
echo ""
echo "1️⃣  Swift Package Manager (SPM)"
echo "   ✅ Simple et intégré à Xcode"
echo "   ✅ Pas de fichiers supplémentaires"
echo "   ⚠️  ML Kit via wrapper non officiel"
echo ""
echo "2️⃣  CocoaPods"
echo "   ✅ Support officiel Google ML Kit"
echo "   ✅ Configuration stable et testée"
echo "   ⚠️  Fichiers supplémentaires (Podfile, workspace)"
echo ""

read -p "Quelle approche voulez-vous utiliser ? (1 ou 2): " choice

case $choice in
    1)
        echo ""
        echo "🔧 Configuration Swift Package Manager..."
        echo ""
        echo "📋 Instructions manuelles :"
        echo "1. Ouvrir Xcode : open Meeshy.xcodeproj"
        echo "2. File → Add Package Dependencies..."
        echo "3. Ajouter Socket.IO :"
        echo "   URL: https://github.com/socketio/socket.io-client-swift"
        echo "   Version: 16.0.0+"
        echo "4. Ajouter ML Kit (wrapper non officiel) :"
        echo "   URL: https://github.com/d-date/google-mlkit-swiftpm"
        echo "   Version: 6.0.0+"
        echo "   Produits: MLKitTranslate, MLKitLanguageID"
        echo ""
        echo "🚀 Ouverture du projet..."
        if [ -f "Meeshy.xcodeproj/project.pbxproj" ]; then
            open Meeshy.xcodeproj
        else
            echo "❌ Projet Xcode non trouvé. Créez d'abord le projet dans Xcode."
            echo "   File → New → Project → iOS → App"
            echo "   Product Name: Meeshy"
            echo "   Interface: SwiftUI"
        fi
        ;;
    2)
        echo ""
        echo "🔧 Configuration CocoaPods..."
        
        # Vérifier si CocoaPods est installé
        if ! command -v pod &> /dev/null; then
            echo "📥 Installation de CocoaPods..."
            if command -v brew &> /dev/null; then
                brew install cocoapods
            else
                sudo gem install cocoapods
            fi
        fi
        
        # Vérifier si Podfile existe
        if [ ! -f "Podfile" ]; then
            echo "❌ Podfile non trouvé. Création automatique..."
            cat > Podfile << 'EOF'
# Podfile pour Meeshy iOS
platform :ios, '17.0'

target 'Meeshy' do
  use_frameworks!

  # Socket.IO pour la communication WebSocket
  pod 'Socket.IO-Client-Swift', '~> 16.0'
  
  # Google ML Kit pour la traduction (méthode officielle)
  pod 'GoogleMLKit/Translate', '~> 6.0.0'
  pod 'GoogleMLKit/LanguageID', '~> 6.0.0'

  target 'MeeshyTests' do
    inherit! :search_paths
  end
end

post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
    end
  end
end
EOF
            echo "✅ Podfile créé"
        fi
        
        # Installer les dépendances
        echo "📚 Installation des dépendances..."
        pod install
        
        # Vérifier que l'installation s'est bien passée
        if [ -f "Meeshy.xcworkspace" ]; then
            echo ""
            echo "✅ Configuration CocoaPods terminée !"
            echo ""
            echo "🚀 Ouverture du workspace..."
            open Meeshy.xcworkspace
            echo ""
            echo "⚠️  IMPORTANT : Utilisez toujours Meeshy.xcworkspace"
            echo "   (pas Meeshy.xcodeproj) après installation CocoaPods"
        else
            echo "❌ Erreur lors de l'installation"
            echo "Vérifiez que le projet Xcode existe et réessayez"
        fi
        ;;
    *)
        echo ""
        echo "❌ Choix invalide. Veuillez choisir 1 ou 2."
        exit 1
        ;;
esac

echo ""
echo "📱 Configuration terminée !"
echo ""
echo "🔗 Prochaines étapes :"
echo "1. Configurer votre équipe de développement dans Xcode"
echo "2. Modifier le Bundle Identifier si nécessaire"
echo "3. Tester la compilation"
echo "4. Connecter au serveur backend sur http://localhost:5500"

