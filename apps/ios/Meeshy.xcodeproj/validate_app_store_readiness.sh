#!/bin/bash

# ============================================================================
# MEESHY - SCRIPT DE VALIDATION PRÉ-SOUMISSION APP STORE
# ============================================================================
# Ce script vérifie que votre application est prête pour la soumission
# ============================================================================

echo "🚀 Meeshy - Validation pré-soumission App Store"
echo "================================================"
echo ""

# Couleurs pour l'output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Compteurs
ERRORS=0
WARNINGS=0
SUCCESS=0

# ============================================================================
# FONCTION DE VÉRIFICATION
# ============================================================================

check_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((SUCCESS++))
}

check_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARNINGS++))
}

check_error() {
    echo -e "${RED}❌ $1${NC}"
    ((ERRORS++))
}

# ============================================================================
# 1. VÉRIFICATION DE L'ENVIRONNEMENT
# ============================================================================

echo "📋 1. Vérification de l'environnement"
echo "======================================"

# Vérifier Xcode
if command -v xcodebuild &> /dev/null; then
    XCODE_VERSION=$(xcodebuild -version | head -n 1)
    check_success "Xcode installé : $XCODE_VERSION"
else
    check_error "Xcode n'est pas installé ou n'est pas dans le PATH"
fi

# Vérifier Swift
if command -v swift &> /dev/null; then
    SWIFT_VERSION=$(swift --version | head -n 1)
    check_success "Swift installé : $SWIFT_VERSION"
else
    check_error "Swift n'est pas installé"
fi

echo ""

# ============================================================================
# 2. VÉRIFICATION DU PROJET
# ============================================================================

echo "📁 2. Vérification du projet"
echo "=============================="

# Chercher le fichier .xcodeproj ou .xcworkspace
PROJECT_FILE=""
WORKSPACE_FILE=""

if ls *.xcworkspace &> /dev/null; then
    WORKSPACE_FILE=$(ls *.xcworkspace | head -n 1)
    check_success "Workspace trouvé : $WORKSPACE_FILE"
    PROJECT_TYPE="workspace"
elif ls *.xcodeproj &> /dev/null; then
    PROJECT_FILE=$(ls *.xcodeproj | head -n 1)
    check_success "Projet trouvé : $PROJECT_FILE"
    PROJECT_TYPE="project"
else
    check_error "Aucun fichier .xcodeproj ou .xcworkspace trouvé"
    exit 1
fi

echo ""

# ============================================================================
# 3. VÉRIFICATION INFO.PLIST
# ============================================================================

echo "📄 3. Vérification Info.plist"
echo "=============================="

# Chercher Info.plist
INFO_PLIST=""
if [ -f "Info.plist" ]; then
    INFO_PLIST="Info.plist"
elif [ -f "Meeshy/Info.plist" ]; then
    INFO_PLIST="Meeshy/Info.plist"
elif [ -f "ios-dynamic/Info.plist" ]; then
    INFO_PLIST="ios-dynamic/Info.plist"
else
    check_error "Info.plist non trouvé"
    INFO_PLIST=""
fi

if [ -n "$INFO_PLIST" ]; then
    check_success "Info.plist trouvé : $INFO_PLIST"
    
    # Vérifier les clés de confidentialité obligatoires
    PRIVACY_KEYS=(
        "NSCameraUsageDescription"
        "NSMicrophoneUsageDescription"
        "NSPhotoLibraryUsageDescription"
        "NSPhotoLibraryAddUsageDescription"
    )
    
    for KEY in "${PRIVACY_KEYS[@]}"; do
        if /usr/libexec/PlistBuddy -c "Print :$KEY" "$INFO_PLIST" &> /dev/null; then
            check_success "Clé présente : $KEY"
        else
            check_error "Clé manquante : $KEY (OBLIGATOIRE pour CallKit/Caméra/Photos)"
        fi
    done
    
    # Vérifier UIBackgroundModes
    if /usr/libexec/PlistBuddy -c "Print :UIBackgroundModes" "$INFO_PLIST" &> /dev/null; then
        check_success "UIBackgroundModes présent"
    else
        check_warning "UIBackgroundModes manquant (nécessaire pour VoIP/Audio)"
    fi
fi

echo ""

# ============================================================================
# 4. VÉRIFICATION DES ENTITLEMENTS
# ============================================================================

echo "🔐 4. Vérification Entitlements"
echo "==============================="

# Chercher fichier .entitlements
ENTITLEMENTS=""
if ls *.entitlements &> /dev/null; then
    ENTITLEMENTS=$(ls *.entitlements | head -n 1)
    check_success "Entitlements trouvé : $ENTITLEMENTS"
    
    # Vérifier les capabilities critiques
    if grep -q "aps-environment" "$ENTITLEMENTS"; then
        check_success "Push Notifications configuré"
    else
        check_error "Push Notifications manquant dans entitlements"
    fi
    
    if grep -q "com.apple.developer.associated-domains" "$ENTITLEMENTS"; then
        check_success "Associated Domains configuré"
    else
        check_warning "Associated Domains manquant (nécessaire pour Universal Links)"
    fi
else
    check_warning "Aucun fichier .entitlements trouvé"
fi

echo ""

# ============================================================================
# 5. VÉRIFICATION DES ASSETS
# ============================================================================

echo "🎨 5. Vérification Assets"
echo "========================="

# Chercher Assets.xcassets
ASSETS_PATH=""
if [ -d "Assets.xcassets" ]; then
    ASSETS_PATH="Assets.xcassets"
elif [ -d "Meeshy/Assets.xcassets" ]; then
    ASSETS_PATH="Meeshy/Assets.xcassets"
elif [ -d "ios-dynamic/Assets.xcassets" ]; then
    ASSETS_PATH="ios-dynamic/Assets.xcassets"
fi

if [ -n "$ASSETS_PATH" ]; then
    check_success "Assets.xcassets trouvé : $ASSETS_PATH"
    
    # Vérifier AppIcon
    if [ -d "$ASSETS_PATH/AppIcon.appiconset" ]; then
        check_success "AppIcon.appiconset trouvé"
        
        # Vérifier l'icône 1024x1024
        if [ -f "$ASSETS_PATH/AppIcon.appiconset/1024.png" ] || \
           [ -f "$ASSETS_PATH/AppIcon.appiconset/AppIcon-1024.png" ] || \
           ls "$ASSETS_PATH/AppIcon.appiconset/"*1024* &> /dev/null; then
            check_success "Icône 1024x1024 présente"
        else
            check_error "Icône 1024x1024 MANQUANTE (OBLIGATOIRE pour App Store)"
        fi
    else
        check_error "AppIcon.appiconset MANQUANT"
    fi
    
    # Vérifier AccentColor
    if [ -d "$ASSETS_PATH/AccentColor.colorset" ]; then
        check_success "AccentColor défini"
    else
        check_warning "AccentColor non défini (recommandé)"
    fi
else
    check_error "Assets.xcassets NON TROUVÉ"
fi

echo ""

# ============================================================================
# 6. VÉRIFICATION BUNDLE IDENTIFIER
# ============================================================================

echo "📦 6. Vérification Bundle Identifier"
echo "====================================="

# Cette vérification nécessite l'accès au projet Xcode
# On va chercher dans les fichiers .pbxproj

if [ -n "$PROJECT_FILE" ]; then
    PBXPROJ="$PROJECT_FILE/project.pbxproj"
elif [ -n "$WORKSPACE_FILE" ]; then
    # Chercher le premier .xcodeproj dans le workspace
    PBXPROJ=$(find . -name "project.pbxproj" | head -n 1)
fi

if [ -n "$PBXPROJ" ] && [ -f "$PBXPROJ" ]; then
    BUNDLE_ID=$(grep -m 1 "PRODUCT_BUNDLE_IDENTIFIER" "$PBXPROJ" | sed 's/.*= \(.*\);/\1/' | tr -d ' "')
    
    if [ "$BUNDLE_ID" = "me.meeshy.app" ]; then
        check_success "Bundle Identifier correct : $BUNDLE_ID"
    elif [ -n "$BUNDLE_ID" ]; then
        check_warning "Bundle Identifier trouvé : $BUNDLE_ID (attendu: me.meeshy.app)"
    else
        check_warning "Bundle Identifier non détecté automatiquement"
    fi
else
    check_warning "Impossible de vérifier le Bundle Identifier automatiquement"
fi

echo ""

# ============================================================================
# 7. VÉRIFICATION DES FICHIERS DE DOCUMENTATION
# ============================================================================

echo "📚 7. Vérification Documentation"
echo "================================="

# Vérifier politique de confidentialité
if [ -f "PRIVACY_POLICY.md" ]; then
    check_success "PRIVACY_POLICY.md présent"
else
    check_error "PRIVACY_POLICY.md MANQUANT (doit être hébergé en ligne)"
fi

# Vérifier conditions d'utilisation
if [ -f "TERMS_OF_SERVICE.md" ]; then
    check_success "TERMS_OF_SERVICE.md présent"
else
    check_warning "TERMS_OF_SERVICE.md manquant (recommandé)"
fi

echo ""

# ============================================================================
# 8. COMPILATION TEST (OPTIONNEL)
# ============================================================================

echo "🔨 8. Test de compilation (optionnel)"
echo "======================================"
echo "⏭️  Ignoré (lancez manuellement : xcodebuild clean build)"
echo ""

# Décommentez pour activer le test de compilation
# if [ -n "$WORKSPACE_FILE" ]; then
#     echo "Test de compilation du workspace..."
#     xcodebuild clean build -workspace "$WORKSPACE_FILE" -scheme Meeshy -configuration Release -destination 'generic/platform=iOS' | grep -A 5 "error:"
# elif [ -n "$PROJECT_FILE" ]; then
#     echo "Test de compilation du projet..."
#     xcodebuild clean build -project "$PROJECT_FILE" -scheme Meeshy -configuration Release -destination 'generic/platform=iOS' | grep -A 5 "error:"
# fi

# ============================================================================
# 9. RÉSUMÉ
# ============================================================================

echo ""
echo "📊 RÉSUMÉ DE LA VALIDATION"
echo "=========================="
echo ""
echo -e "${GREEN}✅ Succès : $SUCCESS${NC}"
echo -e "${YELLOW}⚠️  Avertissements : $WARNINGS${NC}"
echo -e "${RED}❌ Erreurs : $ERRORS${NC}"
echo ""

# ============================================================================
# 10. CHECKLIST MANUELLE
# ============================================================================

echo "📝 CHECKLIST MANUELLE À VÉRIFIER"
echo "================================="
echo ""
echo "Vérifiez manuellement les points suivants :"
echo ""
echo "□ Compte Apple Developer actif (99\$/an)"
echo "□ Certificats de distribution installés"
echo "□ Profils de provisionnement App Store créés"
echo "□ App ID enregistré : me.meeshy.app"
echo "□ Capabilities activées dans Developer Portal :"
echo "  □ Push Notifications"
echo "  □ Associated Domains"
echo "  □ Background Modes"
echo "  □ App Groups (si utilisé)"
echo ""
echo "□ Politique de confidentialité hébergée (HTTPS) :"
echo "  URL : https://meeshy.me/privacy"
echo ""
echo "□ Conditions d'utilisation hébergées (HTTPS) :"
echo "  URL : https://meeshy.me/terms"
echo ""
echo "□ Captures d'écran préparées :"
echo "  □ iPhone 6.7\" (1290 x 2796) - 3 à 10 images"
echo "  □ iPhone 6.5\" (1242 x 2688) - 3 à 10 images"
echo "  □ iPad (si applicable)"
echo ""
echo "□ Métadonnées App Store préparées :"
echo "  □ Nom : Meeshy (max 30 caractères)"
echo "  □ Sous-titre (max 30 caractères)"
echo "  □ Description (max 4000 caractères)"
echo "  □ Mots-clés (max 100 caractères)"
echo "  □ Notes de version"
echo "  □ URL de support"
echo ""
echo "□ App testée sur vrais appareils"
echo "□ Aucun crash détecté"
echo "□ Performance acceptable"
echo "□ Compte de démo créé pour Apple (si nécessaire)"
echo ""

# ============================================================================
# 11. RECOMMANDATIONS
# ============================================================================

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo -e "${RED}⚠️  ATTENTION : Des erreurs ont été détectées !${NC}"
    echo "Corrigez ces erreurs avant de soumettre à l'App Store."
    echo ""
    echo "Consultez les guides suivants :"
    echo "- APP_STORE_SUBMISSION_GUIDE.md"
    echo "- BUILD_AND_CODE_SIGNING.md"
    echo "- APP_STORE_ASSETS_REQUIREMENTS.md"
    echo ""
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}⚠️  Des avertissements ont été détectés.${NC}"
    echo "Vérifiez ces points avant la soumission."
    echo ""
    exit 0
else
    echo ""
    echo -e "${GREEN}🎉 FÉLICITATIONS !${NC}"
    echo -e "${GREEN}Votre projet semble prêt pour la soumission !${NC}"
    echo ""
    echo "Prochaines étapes :"
    echo "1. Archive votre app dans Xcode (Product > Archive)"
    echo "2. Distribuez sur App Store Connect"
    echo "3. Remplissez les métadonnées dans App Store Connect"
    echo "4. Soumettez pour révision"
    echo ""
    echo "Consultez APP_STORE_SUBMISSION_GUIDE.md pour les détails."
    echo ""
    exit 0
fi
