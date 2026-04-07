#!/bin/bash

# Script d'automatisation complète du projet Xcode Meeshy
# Ce script crée le projet Xcode, configure les dépendances et ajoute tous les fichiers sources

set -e  # Arrêt en cas d'erreur

PROJECT_DIR="/Users/smpceo/Documents/Services/Meeshy/ios"
PROJECT_NAME="Meeshy"
BUNDLE_ID="me.meeshy.app"
TEAM_ID=""  # À remplir si nécessaire

echo "🚀 Démarrage de la configuration automatique du projet Meeshy iOS..."
echo "📂 Répertoire: $PROJECT_DIR"
echo ""

cd "$PROJECT_DIR"

# Étape 1: Nettoyage
echo "🧹 Étape 1/7: Nettoyage des anciens fichiers..."
rm -rf "$PROJECT_NAME.xcodeproj"
rm -rf "$PROJECT_NAME.xcworkspace"
rm -rf "Pods"
rm -rf "Podfile.lock"
rm -rf "DerivedData"
rm -rf ".build"
echo "✅ Nettoyage terminé"
echo ""

# Étape 2: Création du Package.swift pour SPM
echo "📦 Étape 2/7: Configuration de Swift Package Manager..."
cat > Package.swift << 'PACKAGEEOF'
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Meeshy",
    platforms: [
        .iOS(.v16)
    ],
    products: [
        .library(name: "Meeshy", targets: ["Meeshy"])
    ],
    dependencies: [
        .package(url: "https://github.com/socketio/socket.io-client-swift", from: "16.1.0")
    ],
    targets: [
        .target(
            name: "Meeshy",
            dependencies: [
                .product(name: "SocketIO", package: "socket.io-client-swift")
            ],
            path: "Meeshy",
            exclude: ["Info.plist"]
        )
    ]
)
PACKAGEEOF
echo "✅ Package.swift créé"
echo ""

# Étape 3: Création de la structure Info.plist
echo "📄 Étape 3/7: Création du fichier Info.plist..."
cat > Meeshy/Info.plist << 'INFOEOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>$(DEVELOPMENT_LANGUAGE)</string>
	<key>CFBundleDisplayName</key>
	<string>Meeshy</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>LSRequiresIPhoneOS</key>
	<true/>
	<key>UIApplicationSceneManifest</key>
	<dict>
		<key>UIApplicationSupportsMultipleScenes</key>
		<true/>
	</dict>
	<key>UIApplicationSupportsIndirectInputEvents</key>
	<true/>
	<key>UILaunchScreen</key>
	<dict/>
	<key>UIRequiredDeviceCapabilities</key>
	<array>
		<string>armv7</string>
	</array>
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	<key>UISupportedInterfaceOrientations~ipad</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationPortraitUpsideDown</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleTypeRole</key>
			<string>Editor</string>
			<key>CFBundleURLName</key>
			<string>me.meeshy.app</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>meeshy</string>
			</array>
		</dict>
	</array>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsArbitraryLoads</key>
		<false/>
		<key>NSExceptionDomains</key>
		<dict>
			<key>localhost</key>
			<dict>
				<key>NSExceptionAllowsInsecureHTTPLoads</key>
				<true/>
			</dict>
		</dict>
	</dict>
</dict>
</plist>
INFOEOF
echo "✅ Info.plist créé"
echo ""

# Étape 4: Résolution des dépendances SPM
echo "📥 Étape 4/7: Téléchargement des dépendances Swift Package Manager..."
swift package resolve
echo "✅ Dépendances résolues"
echo ""

# Étape 5: Génération du projet Xcode via SPM
echo "🔨 Étape 5/7: Génération du projet Xcode..."
swift package generate-xcodeproj
echo "✅ Projet Xcode généré"
echo ""

# Étape 6: Liste des fichiers sources
echo "📋 Étape 6/7: Vérification des fichiers sources..."
SWIFT_FILES=$(find Meeshy -name "*.swift" -type f | wc -l | tr -d ' ')
echo "   Fichiers Swift trouvés: $SWIFT_FILES"

echo ""
echo "   📁 Modèles:"
ls -1 Meeshy/Models/*.swift 2>/dev/null | sed 's/^/      - /' || echo "      Aucun"

echo "   📁 Services:"
ls -1 Meeshy/Services/*.swift 2>/dev/null | sed 's/^/      - /' || echo "      Aucun"

echo "   📁 ViewModels:"
ls -1 Meeshy/ViewModels/*.swift 2>/dev/null | sed 's/^/      - /' || echo "      Aucun"

echo "   📁 Views:"
ls -1 Meeshy/Views/*.swift 2>/dev/null | sed 's/^/      - /' || echo "      Aucun"

echo "✅ Vérification terminée"
echo ""

# Étape 7: Instructions finales
echo "🎉 Étape 7/7: Configuration terminée!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 PROJET XCODE PRÊT À L'EMPLOI"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📂 Fichier projet: $PROJECT_NAME.xcodeproj"
echo "📦 Total fichiers Swift: $SWIFT_FILES"
echo ""
echo "🚀 PROCHAINES ÉTAPES:"
echo ""
echo "1. Ouvrir le projet:"
echo "   open $PROJECT_NAME.xcodeproj"
echo ""
echo "2. Dans Xcode:"
echo "   • Sélectionnez le projet dans le navigateur"
echo "   • Allez dans 'Signing & Capabilities'"
echo "   • Cochez 'Automatically manage signing'"
echo "   • Sélectionnez votre Team"
echo ""
echo "3. Build et Run:"
echo "   • Sélectionnez un simulateur (ex: iPhone 15 Pro)"
echo "   • Appuyez sur Cmd+R ou cliquez sur ▶️"
echo ""
echo "📖 Documentation:"
echo "   • README.md - Vue d'ensemble"
echo "   • BUILD_INSTRUCTIONS.md - Instructions détaillées"
echo ""
echo "🌐 Configuration Backend:"
echo "   • Production: https://gate.meeshy.me"
echo "   • Development: http://localhost:3000"
echo ""
echo "✅ Tout est prêt pour le développement!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Optionnel: Ouvrir automatiquement Xcode
read -p "🔧 Voulez-vous ouvrir le projet dans Xcode maintenant? (o/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[OoYy]$ ]]
then
    echo "🚀 Ouverture de Xcode..."
    open "$PROJECT_NAME.xcodeproj"
fi

echo ""
echo "✨ Script terminé avec succès!"

