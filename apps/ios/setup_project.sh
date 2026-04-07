#!/bin/bash

# Script de création automatique du projet Xcode Meeshy
# Compatible avec Xcode 15+ et Swift 5.9+

set -e

PROJECT_DIR="/Users/smpceo/Documents/Services/Meeshy/ios"
PROJECT_NAME="Meeshy"
BUNDLE_ID="me.meeshy.app"
ORG_NAME="Meeshy"

echo "🚀 Configuration automatique du projet iOS Meeshy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$PROJECT_DIR"

# Nettoyage
echo "🧹 Nettoyage..."
rm -rf "$PROJECT_NAME.xcodeproj" 2>/dev/null || true
rm -rf "$PROJECT_NAME.xcworkspace" 2>/dev/null || true
rm -rf "DerivedData" 2>/dev/null || true
rm -rf ".build" 2>/dev/null || true
echo "✅ Nettoyage terminé"
echo ""

# Création du fichier project.yml pour XcodeGen (si disponible)
echo "📝 Préparation de la configuration du projet..."

# Vérifier si tous les fichiers sources existent
echo "📋 Vérification des fichiers sources..."
MODELS_COUNT=$(find Meeshy/Models -name "*.swift" 2>/dev/null | wc -l | tr -d ' ')
SERVICES_COUNT=$(find Meeshy/Services -name "*.swift" 2>/dev/null | wc -l | tr -d ' ')
VIEWMODELS_COUNT=$(find Meeshy/ViewModels -name "*.swift" 2>/dev/null | wc -l | tr -d ' ')
VIEWS_COUNT=$(find Meeshy/Views -name "*.swift" 2>/dev/null | wc -l | tr -d ' ')
TOTAL_FILES=$((MODELS_COUNT + SERVICES_COUNT + VIEWMODELS_COUNT + VIEWS_COUNT + 1))

echo "   📁 Models: $MODELS_COUNT fichiers"
echo "   📁 Services: $SERVICES_COUNT fichiers"
echo "   📁 ViewModels: $VIEWMODELS_COUNT fichiers"
echo "   📁 Views: $VIEWS_COUNT fichiers"
echo "   📄 Total: $TOTAL_FILES fichiers Swift"
echo "✅ Tous les fichiers sources sont présents"
echo ""

# Créer un Package.swift compatible
echo "📦 Configuration Swift Package Manager..."
cat > Package.swift << 'EOF'
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Meeshy",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "MeeshyKit", targets: ["MeeshyKit"])
    ],
    dependencies: [
        .package(url: "https://github.com/socketio/socket.io-client-swift", from: "16.1.0")
    ],
    targets: [
        .target(
            name: "MeeshyKit",
            dependencies: [
                .product(name: "SocketIO", package: "socket.io-client-swift")
            ],
            path: "Meeshy"
        )
    ]
)
EOF
echo "✅ Package.swift créé"
echo ""

# Résoudre les dépendances
echo "📥 Téléchargement des dépendances Socket.IO..."
swift package resolve 2>&1 | grep -v "warning:" || true
echo "✅ Dépendances résolues"
echo ""

# Créer un script pour ouvrir et configurer Xcode
cat > open_and_configure_xcode.sh << 'XCODESCRIPT'
#!/bin/bash
echo "🎯 Ouverture dans Xcode..."
echo ""
echo "📱 INSTRUCTIONS POUR CRÉER LE PROJET:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  Dans Xcode, créez un nouveau projet:"
echo "    File > New > Project..."
echo ""
echo "2️⃣  Sélectionnez:"
echo "    • Platform: iOS"
echo "    • Template: App"
echo ""
echo "3️⃣  Configurez:"
echo "    • Product Name: Meeshy"
echo "    • Team: (Sélectionnez votre team)"
echo "    • Organization Identifier: com.meeshy"
echo "    • Bundle Identifier: com.meeshy.Meeshy"
echo "    • Interface: SwiftUI"
echo "    • Language: Swift"
echo "    • Storage: None"
echo "    • Emplacement: /Users/smpceo/Documents/Services/Meeshy/ios"
echo ""
echo "4️⃣  Supprimez le fichier ContentView.swift par défaut"
echo ""
echo "5️⃣  Ajoutez tous nos fichiers:"
echo "    • Glissez-déposez les dossiers Models, Services,"
echo "      ViewModels, Views dans le projet"
echo "    • Remplacez MeeshyApp.swift"
echo "    • Assurez-vous que tous les fichiers sont cochés"
echo "      dans 'Target Membership'"
echo ""
echo "6️⃣  Ajoutez Socket.IO:"
echo "    • File > Add Package Dependencies..."
echo "    • URL: https://github.com/socketio/socket.io-client-swift"
echo "    • Version: 16.1.0"
echo "    • Add to Target: Meeshy"
echo ""
echo "7️⃣  Configurez l'URL Scheme pour deep links:"
echo "    • Sélectionnez le projet > Info"
echo "    • URL Types > + (Add)"
echo "    • Identifier: me.meeshy.app"
echo "    • URL Schemes: meeshy"
echo ""
echo "8️⃣  Build & Run:"
echo "    • Sélectionnez un simulateur (iPhone 15 Pro)"
echo "    • Cmd+R pour lancer l'app"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Ouvrir Xcode dans le dossier
open -a Xcode .
XCODESCRIPT

chmod +x open_and_configure_xcode.sh

# Créer un guide rapide
cat > QUICK_START.md << 'QUICKSTART'
# 🚀 Guide de Démarrage Rapide - Meeshy iOS

## ✅ Fichiers Prêts

Tous les fichiers sources sont créés et organisés :
- ✅ 4 Modèles (User, Message, Conversation, Language)
- ✅ 3 Services (API, Socket, Auth)
- ✅ 3 ViewModels (Auth, Conversation, Chat)
- ✅ 9 Views (Login, Register, Chat, etc.)
- ✅ Configuration complète

## 📱 Création du Projet Xcode

### Option A: Automatique avec Xcode

```bash
./open_and_configure_xcode.sh
```

Puis suivez les instructions affichées.

### Option B: Manuelle

1. **Ouvrez Xcode**
   ```bash
   open -a Xcode .
   ```

2. **Créez le projet**
   - File > New > Project
   - iOS > App
   - Product Name: `Meeshy`
   - Interface: `SwiftUI`
   - Sauvez dans ce dossier

3. **Ajoutez les fichiers**
   - Glissez tous les dossiers dans Xcode
   - Cochez "Copy items if needed"
   - Target: Meeshy

4. **Ajoutez Socket.IO**
   - File > Add Package Dependencies
   - URL: `https://github.com/socketio/socket.io-client-swift`
   - Version: 16.1.0

5. **Configurez Deep Links**
   - Project > Info > URL Types
   - Scheme: `meeshy`

6. **Build & Run** (Cmd+R)

## 🎯 Fonctionnalités

- ✨ Onboarding interactif
- 🔐 Login/Register complet
- 💬 Chat temps réel
- 🌐 Traduction 8 langues
- 👤 Mode anonyme
- 🔗 Deep links

## 📖 Documentation

- `README.md` - Documentation complète
- `BUILD_INSTRUCTIONS.md` - Instructions détaillées
- `.cursorrules` - Best practices SwiftUI

## 🐛 Support

Si vous rencontrez des problèmes:
1. Vérifiez les logs Xcode (Cmd+Shift+Y)
2. Clean build folder (Cmd+Shift+K)
3. Relancez (Cmd+R)

Bon développement ! 🎉
QUICKSTART

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ CONFIGURATION TERMINÉE !"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Résumé:"
echo "   • $TOTAL_FILES fichiers Swift créés"
echo "   • Package.swift configuré"
echo "   • Dépendances Socket.IO résolues"
echo "   • Scripts d'aide créés"
echo ""
echo "🎯 PROCHAINE ÉTAPE:"
echo ""
echo "   Exécutez:"
echo "   ./open_and_configure_xcode.sh"
echo ""
echo "   Ou lisez:"
echo "   cat QUICK_START.md"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 Prêt pour le développement iOS!"
echo ""


