# CONFIGURATION BUILD ET CODE SIGNING POUR APP STORE

## 🔐 CODE SIGNING (SIGNATURE DU CODE)

### 1. Certificats nécessaires

Vous devez avoir ces certificats dans votre compte Apple Developer :

#### A. Pour le développement
- **Apple Development** : Pour tester sur vos appareils
  - Type : iOS App Development
  - Utilisation : Debug builds

#### B. Pour la distribution
- **Apple Distribution** : Pour l'App Store
  - Type : iOS Distribution
  - Utilisation : Release builds, App Store

### 2. Identifiants d'application (App ID)

Dans Apple Developer Portal (developer.apple.com) :

1. Allez dans **Certificates, Identifiers & Profiles**
2. Créez un **App ID** :
   - **Description** : Meeshy
   - **Bundle ID** : `me.meeshy.app` (EXACT, ne changez pas)
   - **Capabilities à activer** :
     - ✅ Push Notifications
     - ✅ Associated Domains
     - ✅ Background Modes
     - ✅ App Groups (si utilisé)
     - ✅ Keychain Sharing
     - ✅ Sign In with Apple (si utilisé)

### 3. Profils de provisionnement

#### A. Development Profile
- Type : iOS App Development
- App ID : me.meeshy.app
- Certificat : Votre certificat Development
- Appareils : Sélectionnez vos appareils de test

#### B. Distribution Profile
- Type : App Store
- App ID : me.meeshy.app
- Certificat : Votre certificat Distribution

### 4. Configuration dans Xcode

#### Ouvrez votre projet dans Xcode, puis :

1. **Sélectionnez le projet** dans le navigateur
2. **Sélectionnez la target** "Meeshy"
3. Allez dans l'onglet **Signing & Capabilities**

#### Configuration Signing & Capabilities :

```
┌─────────────────────────────────────────────────┐
│ Signing & Capabilities                          │
├─────────────────────────────────────────────────┤
│                                                 │
│ ○ Automatically manage signing                 │
│   Team: [Votre équipe]                          │
│                                                 │
│ OU                                              │
│                                                 │
│ ● Manually manage signing                      │
│                                                 │
│ Debug                                           │
│ ├─ Provisioning Profile: [Development Profile] │
│ ├─ Signing Certificate: Apple Development      │
│ └─ Team: [Votre équipe]                         │
│                                                 │
│ Release                                         │
│ ├─ Provisioning Profile: [Distribution Profile]│
│ ├─ Signing Certificate: Apple Distribution     │
│ └─ Team: [Votre équipe]                         │
│                                                 │
└─────────────────────────────────────────────────┘
```

#### Ajoutez les Capabilities :

**Capabilities à ajouter (+)** :

1. **Push Notifications**
   - Automatiquement configuré avec vos entitlements

2. **Background Modes**
   - ✅ Audio, AirPlay, and Picture in Picture
   - ✅ Voice over IP
   - ✅ Remote notifications
   - ✅ Background fetch

3. **Associated Domains**
   - Domaines : 
     - `applinks:meeshy.me`
     - `applinks:www.meeshy.me`
     - `applinks:app.meeshy.me`

4. **App Groups** (si utilisé)
   - Group : `group.me.meeshy.app`

5. **Keychain Sharing**
   - Keychain Groups : `$(AppIdentifierPrefix)me.meeshy.app`

## ⚙️ BUILD SETTINGS

### Settings critiques à vérifier

Dans Xcode > Build Settings :

```ini
# General
PRODUCT_NAME = Meeshy
PRODUCT_BUNDLE_IDENTIFIER = me.meeshy.app

# Deployment
IPHONEOS_DEPLOYMENT_TARGET = 17.0
TARGETED_DEVICE_FAMILY = 1,2 # iPhone et iPad
SUPPORTS_MACCATALYST = NO # ou YES si vous voulez Mac

# Swift
SWIFT_VERSION = 5.0
ENABLE_BITCODE = NO # Apple ne demande plus Bitcode

# Optimization
SWIFT_OPTIMIZATION_LEVEL = -O # Pour Release
SWIFT_COMPILATION_MODE = wholemodule # Pour Release

# Code Signing
CODE_SIGN_STYLE = Manual # ou Automatic
CODE_SIGN_IDENTITY[sdk=iphoneos*] = Apple Distribution
DEVELOPMENT_TEAM = [VOTRE_TEAM_ID]

# Assets
ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon
ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor

# Info.plist
INFOPLIST_FILE = Info.plist # Chemin vers votre Info.plist
INFOPLIST_KEY_CFBundleDisplayName = Meeshy
INFOPLIST_KEY_LSApplicationCategoryType = public.app-category.social-networking

# Version
MARKETING_VERSION = 1.0.0
CURRENT_PROJECT_VERSION = 1
```

## 📦 BUILD CONFIGURATIONS

### Scheme de Release (pour App Store)

1. Dans Xcode, allez dans **Product > Scheme > Edit Scheme**
2. Sélectionnez **Archive**
3. Build Configuration : **Release**
4. Cochez **Reveal Archive in Organizer**

### Configuration Release optimisée

Assurez-vous que votre configuration Release a :

```
- Optimization Level : Fastest, Smallest [-Os]
- Strip Debug Symbols : YES
- Enable Bitcode : NO
- Validate Built Product : YES
```

## 🏗️ PROCESS DE BUILD POUR APP STORE

### Étape 1 : Nettoyage

```bash
# Dans Terminal (optionnel mais recommandé)
cd [chemin-vers-votre-projet]
xcodebuild clean -workspace Meeshy.xcworkspace -scheme Meeshy
```

### Étape 2 : Archive

Dans Xcode :

1. **Product > Scheme** : Sélectionnez "Meeshy"
2. **Product > Destination** : "Any iOS Device (arm64)"
3. **Product > Archive**

Attendez que l'archive se termine. Cela peut prendre quelques minutes.

### Étape 3 : Organizer

L'Organizer s'ouvre automatiquement avec votre archive.

1. **Sélectionnez votre archive**
2. **Cliquez sur "Distribute App"**

### Étape 4 : Distribution

1. **Sélectionnez** : "App Store Connect"
2. **Cliquez** : "Next"
3. **Upload** ou **Export** :
   - Upload : Envoie directement à App Store Connect
   - Export : Crée un fichier .ipa pour téléchargement manuel
4. **Options** :
   - ✅ Upload your app's symbols to receive symbolicated reports
   - ✅ Manage Version and Build Number (laissez Xcode gérer)
5. **Automatic Signing** : Laissez Xcode signer automatiquement
6. **Review** : Vérifiez les informations
7. **Upload** : Cliquez sur "Upload"

### Étape 5 : Vérification dans App Store Connect

1. Allez sur https://appstoreconnect.apple.com
2. **Mes Apps** > **Meeshy**
3. **TestFlight** : Après quelques minutes, votre build apparaîtra ici
4. Attendez que le statut passe de "Processing" à "Ready to Submit"

## 🚨 PROBLÈMES COURANTS

### Erreur : "No matching provisioning profiles found"

**Solution** :
1. Allez sur developer.apple.com
2. Téléchargez vos profils de provisionnement
3. Double-cliquez dessus pour les installer
4. Redémarrez Xcode

### Erreur : "Code signing entitlements do not match"

**Solution** :
1. Vérifiez que votre fichier .entitlements correspond EXACTEMENT à ce qui est configuré dans App ID
2. Assurez-vous que les capabilities dans Xcode correspondent aux services activés dans le portail développeur

### Erreur : "Invalid Swift Support"

**Solution** :
1. Assurez-vous que "Always Embed Swift Standard Libraries" = YES
2. Dans Build Settings, vérifiez SWIFT_VERSION

### Erreur : "Missing required icon"

**Solution** :
1. Vérifiez que vous avez l'icône 1024x1024 dans Assets.xcassets
2. Vérifiez qu'il n'y a pas de canal alpha
3. Vérifiez que l'icône est au format PNG

## 📋 CHECKLIST PRE-ARCHIVE

Avant de faire Archive, vérifiez :

- [ ] Version et Build Number mis à jour
- [ ] Bundle Identifier correct : `me.meeshy.app`
- [ ] Deployment Target correct (iOS 17.0)
- [ ] Certificats et profils de provisionnement valides
- [ ] Info.plist complet avec toutes les descriptions de confidentialité
- [ ] Entitlements configurés correctement
- [ ] Capabilities activées dans le portail développeur
- [ ] Icônes de toutes tailles présentes
- [ ] Build Configuration = Release
- [ ] Aucune erreur ni warning bloquant
- [ ] Tests passent (recommandé)

## 🔢 VERSIONING

### Semantic Versioning

Utilisez le format : **MAJOR.MINOR.PATCH**

```
1.0.0 = Première version publique
1.0.1 = Correction de bugs
1.1.0 = Nouvelles fonctionnalités mineures
2.0.0 = Changements majeurs / breaking changes
```

### Build Number

- Incrémentez le build number à chaque soumission
- Format : Entier unique (1, 2, 3, etc.)
- Le build number DOIT être supérieur à la version précédente

### Dans Xcode

```
Target > General
├─ Version : 1.0.0 (MARKETING_VERSION)
└─ Build : 1 (CURRENT_PROJECT_VERSION)
```

## 🤖 AUTOMATION (OPTIONNEL)

### Fastlane

Pour automatiser le processus :

```bash
# Installation
gem install fastlane

# Initialisation
cd [votre-projet]
fastlane init
```

Exemple de Fastfile :

```ruby
default_platform(:ios)

platform :ios do
  desc "Push a new release build to App Store"
  lane :release do
    increment_build_number(xcodeproj: "Meeshy.xcodeproj")
    build_app(scheme: "Meeshy")
    upload_to_app_store(skip_metadata: true, skip_screenshots: true)
  end
end
```

## 📞 SUPPORT

En cas de problèmes :

1. **Apple Developer Support** : developer.apple.com/support
2. **App Store Connect Help** : help.apple.com/app-store-connect
3. **Documentation Xcode** : developer.apple.com/documentation

---

**IMPORTANT** : Conservez une copie de vos certificats et profils de provisionnement en lieu sûr !
