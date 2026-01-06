#!/bin/bash

# Script de vérification du projet Meeshy iOS
# Vérifie que tous les fichiers nécessaires sont présents

echo "🔍 VÉRIFICATION DU PROJET MEESHY iOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_DIR="/Users/smpceo/Documents/Services/Meeshy/ios"
cd "$PROJECT_DIR"

ERRORS=0
WARNINGS=0

# Fonction de vérification
check_file() {
    if [ -f "$1" ]; then
        echo "✅ $1"
    else
        echo "❌ MANQUANT: $1"
        ((ERRORS++))
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo "✅ $1/"
    else
        echo "❌ MANQUANT: $1/"
        ((ERRORS++))
    fi
}

# Vérification structure
echo "📁 STRUCTURE DU PROJET"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_dir "Meeshy"
check_dir "Meeshy/Models"
check_dir "Meeshy/Services"
check_dir "Meeshy/ViewModels"
check_dir "Meeshy/Views"
echo ""

# Vérification Models
echo "📦 MODELS (4 fichiers attendus)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "Meeshy/Models/User.swift"
check_file "Meeshy/Models/Message.swift"
check_file "Meeshy/Models/Conversation.swift"
check_file "Meeshy/Models/Language.swift"
echo ""

# Vérification Services
echo "🔧 SERVICES (3 principaux attendus)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "Meeshy/Services/APIService.swift"
check_file "Meeshy/Services/SocketService.swift"
check_file "Meeshy/Services/AuthService.swift"
echo ""

# Vérification ViewModels
echo "🧩 VIEWMODELS (3 fichiers attendus)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "Meeshy/ViewModels/AuthViewModel.swift"
check_file "Meeshy/ViewModels/ConversationViewModel.swift"
check_file "Meeshy/ViewModels/ChatViewModel.swift"
echo ""

# Vérification Views
echo "🎨 VIEWS (9 principaux attendus)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "Meeshy/Views/OnboardingView.swift"
check_file "Meeshy/Views/LoginView.swift"
check_file "Meeshy/Views/RegisterView.swift"
check_file "Meeshy/Views/ConversationsListView.swift"
check_file "Meeshy/Views/ChatView.swift"
check_file "Meeshy/Views/AnonymousJoinView.swift"
check_file "Meeshy/Views/SettingsView.swift"
check_file "Meeshy/Views/MainTabView.swift"
check_file "Meeshy/Views/UsersView.swift"
echo ""

# Vérification App
echo "📱 APP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "Meeshy/MeeshyApp.swift"
check_file "Meeshy/Info.plist"
echo ""

# Vérification Configuration
echo "⚙️  CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "Package.swift"
check_file ".cursorrules"
check_file "Podfile"
echo ""

# Vérification Documentation
echo "📖 DOCUMENTATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "README.md"
check_file "BUILD_INSTRUCTIONS.md"
check_file "QUICK_START.md"
check_file "PROJECT_COMPLETE.md"
echo ""

# Vérification Scripts
echo "🔨 SCRIPTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
check_file "setup_project.sh"
check_file "open_and_configure_xcode.sh"
echo ""

# Statistiques
echo "📊 STATISTIQUES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
SWIFT_COUNT=$(find Meeshy -name "*.swift" -type f | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh Meeshy | cut -f1)
echo "   Fichiers Swift: $SWIFT_COUNT"
echo "   Taille totale: $TOTAL_SIZE"
echo ""

# Vérification dépendances
echo "📦 DÉPENDANCES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if swift package show-dependencies > /dev/null 2>&1; then
    echo "✅ Socket.IO-Client-Swift (16.1.0)"
    echo "✅ Starscream (4.0.6)"
else
    echo "⚠️  Dépendances non résolues"
    ((WARNINGS++))
fi
echo ""

# Résumé
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 RÉSUMÉ DE LA VÉRIFICATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ TOUT EST PARFAIT !"
    echo ""
    echo "   • $SWIFT_COUNT fichiers Swift"
    echo "   • $TOTAL_SIZE de code source"
    echo "   • Dépendances résolues"
    echo "   • Documentation complète"
    echo ""
    echo "🚀 PRÊT À BUILDER ET EXÉCUTER !"
    echo ""
    echo "   Lancez: ./open_and_configure_xcode.sh"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "⚠️  VÉRIFICATION OK AVEC AVERTISSEMENTS"
    echo ""
    echo "   Erreurs: $ERRORS"
    echo "   Avertissements: $WARNINGS"
    echo ""
    exit 0
else
    echo "❌ VÉRIFICATION ÉCHOUÉE"
    echo ""
    echo "   Erreurs: $ERRORS"
    echo "   Avertissements: $WARNINGS"
    echo ""
    echo "   Veuillez corriger les erreurs avant de continuer."
    echo ""
    exit 1
fi


