#!/bin/bash

# Script de création du projet Xcode Meeshy

PROJECT_DIR="/Users/smpceo/Documents/Services/Meeshy/ios"
PROJECT_NAME="Meeshy"

cd "$PROJECT_DIR"

echo "🚀 Création du projet iOS Meeshy..."

# Créer le projet avec swift package
swift package init --type executable --name $PROJECT_NAME

# Créer la structure Package.swift pour une app iOS
cat > Package.swift << 'EOF'
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
            path: "Meeshy"
        )
    ]
)
EOF

echo "✅ Projet créé avec succès!"
echo "📱 Ouvrez Xcode-beta et créez un nouveau projet iOS depuis File > New > Project"
echo "📦 Ensuite, ajoutez le package Socket.IO via SPM:"
echo "   File > Add Package Dependencies..."
echo "   URL: https://github.com/socketio/socket.io-client-swift"
echo "   Version: 16.1.0"
echo ""
echo "📂 Tous les fichiers sources sont dans le dossier Meeshy/"
echo "📄 Fichiers créés:"
echo "   - Models: User, Message, Conversation, Language"
echo "   - Services: APIService, SocketService, AuthService"
echo "   - ViewModels: AuthViewModel, ConversationViewModel, ChatViewModel"  
echo "   - Views: LoginView, RegisterView, OnboardingView, ChatView, etc."
echo ""
echo "🎯 Pour builder et lancer l'app:"
echo "   1. Ouvrez le projet dans Xcode"
echo "   2. Sélectionnez un simulateur iOS"
echo "   3. Appuyez sur Cmd+R pour build & run"
EOF
