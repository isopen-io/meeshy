#!/bin/bash

# Script pour installer XcodeGen et créer automatiquement le projet iOS

set -e

echo "🚀 Installation de XcodeGen et création du projet Meeshy iOS App"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd /Users/smpceo/Documents/Services/Meeshy/ios

# Vérifier si Homebrew est installé
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew n'est pas installé"
    echo "   Installez Homebrew: https://brew.sh"
    echo "   Ou suivez les instructions manuelles"
    exit 1
fi

# Installer XcodeGen
echo "📦 Installation de XcodeGen..."
if ! command -v xcodegen &> /dev/null; then
    brew install xcodegen
    echo "✅ XcodeGen installé"
else
    echo "✅ XcodeGen déjà installé"
fi

echo ""
echo "🔨 Génération du projet Xcode..."
echo ""

# Nettoyer
rm -rf Meeshy.xcodeproj Meeshy.xcworkspace Package.swift Package.resolved .build 2>/dev/null || true

# Générer le projet avec XcodeGen
xcodegen generate

if [ -d "Meeshy.xcodeproj" ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ PROJET XCODE iOS APP CRÉÉ AVEC SUCCÈS !"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📱 Type: Application iOS (pas un package !)"
    echo "📦 Nom: Meeshy"
    echo "🎯 Bundle ID: com.meeshy.app"
    echo "📂 Fichiers: 20 fichiers Swift inclus"
    echo "🔌 Dépendances: Socket.IO configuré"
    echo ""
    echo "🚀 PROCHAINES ÉTAPES:"
    echo ""
    echo "1. Ouvrir le projet:"
    echo "   open Meeshy.xcodeproj"
    echo ""
    echo "2. Dans Xcode:"
    echo "   • Sélectionner votre Team dans Signing & Capabilities"
    echo "   • Sélectionner un simulateur"
    echo "   • Appuyer sur Cmd+R pour build & run"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Ouvrir automatiquement
    read -p "Ouvrir le projet dans Xcode maintenant? (o/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[OoYy]$ ]]; then
        echo "🚀 Ouverture de Xcode..."
        open Meeshy.xcodeproj
    fi
    
    echo ""
    echo "✨ Projet créé avec succès !"
else
    echo "❌ Erreur lors de la génération du projet"
    echo "   Vérifiez que project.yml est correct"
    exit 1
fi

