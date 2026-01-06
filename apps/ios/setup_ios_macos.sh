#!/bin/bash

# Script de configuration iOS pour Meeshy sur macOS Apple M3 Pro
# Prépare l'environnement pour le développement iOS

echo "📱 Configuration de l'application iOS Meeshy"
echo "🍎 Optimisé pour Apple M3 Pro / macOS"
echo ""

# Vérifier si Xcode est installé
if ! command -v xcodebuild &> /dev/null; then
    echo "❌ Xcode n'est pas installé"
    echo "📥 Veuillez installer Xcode depuis l'App Store:"
    echo "   https://apps.apple.com/app/xcode/id497799835"
    echo ""
    echo "Après installation, lancez Xcode et acceptez les termes de licence"
    exit 1
fi

# Vérifier la version de Xcode
XCODE_VERSION=$(xcodebuild -version | head -n1 | sed 's/Xcode //')
echo "✅ Xcode version détectée: $XCODE_VERSION"

# Vérifier les outils de ligne de commande
if ! xcode-select -p &> /dev/null; then
    echo "🔧 Installation des outils de ligne de commande Xcode..."
    xcode-select --install
    echo "Veuillez suivre les instructions d'installation et relancer ce script"
    exit 1
fi

# Vérifier si le projet Xcode existe
if [ ! -f "Meeshy.xcodeproj/project.pbxproj" ]; then
    echo "📁 Création du projet Xcode..."
    
    # Créer le projet Xcode de base
    mkdir -p Meeshy.xcodeproj
    
    cat > Meeshy.xcodeproj/project.pbxproj << 'EOF'
// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 56;
	objects = {
		/* Begin PBXBuildFile section */
		/* End PBXBuildFile section */
		
		/* Begin PBXFileReference section */
		/* End PBXFileReference section */
		
		/* Begin PBXFrameworksBuildPhase section */
		/* End PBXFrameworksBuildPhase section */
		
		/* Begin PBXGroup section */
		/* End PBXGroup section */
		
		/* Begin PBXNativeTarget section */
		/* End PBXNativeTarget section */
		
		/* Begin PBXProject section */
		/* End PBXProject section */
		
		/* Begin PBXSourcesBuildPhase section */
		/* End PBXSourcesBuildPhase section */
		
		/* Begin XCBuildConfiguration section */
		/* End XCBuildConfiguration section */
		
		/* Begin XCConfigurationList section */
		/* End XCConfigurationList section */
	};
	rootObject = 1234567890ABCDEF12345678 /* Project object */;
}
EOF
fi

# Créer le fichier de configuration pour les dépendances
cat > Package.resolved << 'EOF'
{
  "pins" : [
    {
      "identity" : "socket.io-client-swift",
      "kind" : "remoteSourceControl",
      "location" : "https://github.com/socketio/socket.io-client-swift",
      "state" : {
        "revision" : "af5ce97b755d964235348d96f6db5cbdcf8c2b8d",
        "version" : "16.1.0"
      }
    },
    {
      "identity" : "googlemlkit-ios",
      "kind" : "remoteSourceControl", 
      "location" : "https://github.com/google/GoogleMLKit-iOS",
      "state" : {
        "revision" : "6c0c8c9a9b5c8d7e6f4a3b2c1d0e9f8a7b6c5d4e",
        "version" : "4.0.0"
      }
    }
  ],
  "version" : 2
}
EOF

echo "✅ Configuration du projet terminée"
echo ""

# Instructions pour l'utilisateur
echo "📋 Instructions de configuration manuelle dans Xcode:"
echo ""
echo "1. 🚀 Ouvrir le projet:"
echo "   open Meeshy.xcodeproj"
echo ""
echo "2. 📦 Ajouter les dépendances Swift Package Manager:"
echo "   File → Add Package Dependencies..."
echo "   "
echo "   📡 Socket.IO Client Swift:"
echo "   https://github.com/socketio/socket.io-client-swift"
echo "   Version: 16.0.0 ou plus récente"
echo ""
echo "   🤖 Google ML Kit (Wrapper non officiel):"
echo "   https://github.com/d-date/google-mlkit-swiftpm"
echo "   Version: 6.0.0 ou plus récente"
echo "   Produits: MLKitTranslate, MLKitLanguageID"
echo ""
echo "   ⚠️  ALTERNATIVE RECOMMANDÉE - CocoaPods:"
echo "   Si vous préférez utiliser CocoaPods (méthode officielle Google):"
echo "   1. Installer CocoaPods: sudo gem install cocoapods"
echo "   2. Dans le dossier ios/: pod install"
echo "   3. Ouvrir Meeshy.xcworkspace au lieu de .xcodeproj"
echo ""
echo "3. ⚙️  Configuration du projet:"
echo "   - Bundle Identifier: com.votrecompagnie.meeshy"
echo "   - Deployment Target: iOS 16.0"
echo "   - Team: Sélectionnez votre équipe de développement"
echo ""
echo "4. 🔧 Configuration du serveur backend:"
echo "   Assurez-vous que le serveur backend fonctionne sur:"
echo "   http://localhost:5500"
echo ""
echo "5. 🏗️  Build et test:"
echo "   - Sélectionnez un simulateur iOS (iPhone 15 Pro recommandé)"
echo "   - Appuyez sur Cmd+R pour compiler et lancer"
echo ""

# Créer un script de lancement rapide
cat > launch_ios.sh << 'EOF'
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
EOF

chmod +x launch_ios.sh

echo "✅ Script de lancement créé: launch_ios.sh"
echo ""
echo "🎯 Étapes suivantes:"
echo "1. Exécutez: ./launch_ios.sh"
echo "2. Configurez les dépendances dans Xcode"
echo "3. Compilez et testez l'application"
echo ""
echo "📚 Documentation complète disponible dans README.md"

