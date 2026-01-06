# Guide de Démarrage Rapide Meeshy iOS

Lancez-vous avec Meeshy iOS en moins de 10 minutes!

---

## Prérequis

Avant de commencer, assurez-vous d'avoir:

- ✅ **macOS** 13.0+ (Ventura ou supérieur)
- ✅ **Xcode** 15.2 ou version ultérieure
- ✅ **Swift** 5.9+
- ✅ **Ruby** 2.7+ (pré-installé sur macOS)
- ✅ **Git**
- ✅ **Compte Apple Developer** (pour tests sur device)

---

## Installation en 5 Étapes

### 1. Cloner le Repository

```bash
# Cloner le projet
git clone <repository-url>
cd Meeshy/ios
```

### 2. Installer les Dépendances Ruby

```bash
# Installer Bundler si nécessaire
gem install bundler

# Installer les gems (Fastlane, etc.)
bundle install
```

### 3. Configuration Firebase

```bash
# Télécharger GoogleService-Info.plist depuis Firebase Console
# Placer le fichier dans: Meeshy/GoogleService-Info.plist
```

**Note:** Si vous n'avez pas accès à Firebase:
- Utilisez le fichier de mock fourni dans `Configuration/Mock/`
- Certaines fonctionnalités (push notifications) seront désactivées

### 4. Ouvrir le Projet Xcode

```bash
# Ouvrir le projet
open Meeshy.xcodeproj
```

Xcode installera automatiquement les Swift Package Dependencies au premier build.

### 5. Build & Run

1. Dans Xcode, sélectionner le **scheme** `Meeshy (Debug)`
2. Choisir un **simulateur** (recommandé: iPhone 15 Pro)
3. Appuyer sur **Cmd+R** ou cliquer sur le bouton Play

L'application devrait se compiler et se lancer dans le simulateur!

---

## Premier Lancement

### Écran de Login

Au premier lancement, vous verrez l'écran de connexion:

#### Option 1: Compte de Test (Recommandé)

Utilisez les credentials de test pré-configurés:

```
Email: test@meeshy.me
Password: Test1234!
```

#### Option 2: Créer un Compte

1. Cliquer sur "S'inscrire"
2. Remplir le formulaire
3. Vérifier l'email (si en local, check logs backend)
4. Se connecter

#### Option 3: Mode Debug

Si l'app est en mode Debug, vous pouvez:
- Skip l'authentification (visible via un bouton debug)
- Accéder directement à l'app

---

## Structure des Schemes

L'app a 3 schemes Xcode:

### 1. Meeshy (Debug)

**Pour:** Développement local
**API:** `http://localhost:3000` (ou dev.gate.meeshy.me)
**Features:**
- Logging complet
- Debug menu accessible
- Pas d'optimisations
- Simulateur + Device

**Utiliser quand:**
- Développement quotidien
- Tests locaux
- Debug de bugs

### 2. Meeshy (Staging)

**Pour:** Tests pré-production
**API:** `https://staging.gate.meeshy.me`
**Features:**
- Logging verbose
- Debug menu disponible
- Optimisations activées
- Similaire à production

**Utiliser quand:**
- Tests avant release
- Validation de features
- Tests avec backend staging

### 3. Meeshy (Production)

**Pour:** App Store
**API:** `https://gate.meeshy.me`
**Features:**
- Logging minimal (erreurs)
- Pas de debug menu
- Optimisations max
- Device uniquement

**Utiliser quand:**
- Build pour TestFlight
- Release App Store
- Tests finaux

---

## Workflow de Développement

### Démarrer le Backend Local (Optionnel)

Si vous développez avec le backend local:

```bash
# Dans le repo backend
cd ../backend
npm install
npm run dev

# Le backend sera disponible sur http://localhost:3000
```

L'app iOS en mode Debug utilisera automatiquement `localhost:3000`.

### Hot Reload

SwiftUI supporte le hot reload:

1. Activer Canvas dans Xcode (Editor → Canvas)
2. Les changements UI sont reflétés instantanément
3. Pas besoin de rebuild pour les modifications UI

### Tests Rapides

```bash
# Tests unitaires
cmd+U dans Xcode

# Ou via terminal
xcodebuild test \
  -scheme Meeshy \
  -destination 'platform=iOS Simulator,name=iPhone 15 Pro'
```

---

## Fonctionnalités de Debug

### Debug Menu

En mode Debug, accéder au menu via:
- Shake du device
- Ou Settings → Advanced → Debug Menu

**Options disponibles:**
- 🌐 Changer l'API endpoint
- 📱 Simuler push notifications
- 💾 Voir le cache CoreData
- 🗑️ Clear cache
- 📊 Voir les logs réseau
- 🔄 Reset app state

### Logging

Les logs sont visibles dans la Console Xcode:

```swift
// Filtrer les logs par niveau
- [INFO] - Informations générales
- [DEBUG] - Détails de debug
- [WARNING] - Avertissements
- [ERROR] - Erreurs
```

**Filtrer dans Console:**
- Cmd+F puis taper: `[ERROR]`
- Ou utiliser les filtres prédéfinis

---

## Résolution de Problèmes Courants

### 1. "No Such Module 'SocketIO'"

**Cause:** Swift Package Dependencies pas installés

**Solution:**
```bash
# Dans Xcode:
File → Packages → Reset Package Caches
File → Packages → Resolve Package Versions
```

### 2. Build Failed: "Command PhaseScriptExecution failed"

**Cause:** SwiftLint ou autre script échoue

**Solution:**
```bash
# Installer SwiftLint
brew install swiftlint

# Ou désactiver temporairement dans Build Phases
```

### 3. "GoogleService-Info.plist not found"

**Cause:** Fichier Firebase manquant

**Solution:**
- Télécharger depuis Firebase Console
- Ou utiliser le mock: `cp Configuration/Mock/GoogleService-Info.plist Meeshy/`

### 4. Simulateur ne démarre pas

**Solution:**
```bash
# Réinitialiser le simulateur
xcrun simctl erase all

# Ou dans Xcode:
Device → Erase All Content and Settings
```

### 5. "Too many arguments to function call"

**Cause:** Version de Swift incompatible

**Solution:**
- Vérifier Xcode version (min 15.2)
- Build Settings → Swift Language Version = Swift 5.9

---

## Commandes Utiles

### Clean Build

```bash
# Clean dans Xcode
Cmd+Shift+K

# Ou via terminal
xcodebuild clean -scheme Meeshy
```

### Supprimer DerivedData

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/Meeshy-*
```

### Lister les Simulateurs

```bash
xcrun simctl list devices available
```

### Rebuild Indexing

```bash
# Dans Xcode
File → Close Workspace
# Puis supprimer:
rm -rf ~/Library/Developer/Xcode/DerivedData
# Réouvrir le projet
```

---

## Prochaines Étapes

Maintenant que l'app tourne, voici ce que vous devriez faire:

1. **Lire l'Architecture**
   - [Vue d'ensemble Architecture](../02-Architecture/OVERVIEW.md)
   - [Modules Features](../02-Architecture/FEATURE_MODULES.md)

2. **Comprendre le Code**
   - Parcourir `Features/Auth/` pour l'authentification
   - Examiner `Features/Chat/` pour la messagerie
   - Étudier `Core/Services/` pour les services

3. **Setup Environnement Complet**
   - [Configuration Environnement](./ENVIRONMENT_SETUP.md)
   - [Dépendances](./DEPENDENCIES.md)

4. **Développer votre Première Feature**
   - [Standards de Code](../03-Development/CODING_STANDARDS.md)
   - [Tests](../03-Development/TESTING.md)

---

## Ressources Supplémentaires

- [Documentation API](../04-API/REST_API.md)
- [Troubleshooting](../06-Troubleshooting/COMMON_ISSUES.md)
- [FAQ](../06-Troubleshooting/FAQ.md)

---

**Besoin d'aide?**
- Check la [FAQ](../06-Troubleshooting/FAQ.md)
- Lire le [Guide de Dépannage](../06-Troubleshooting/COMMON_ISSUES.md)
- Ouvrir une issue GitHub

---

**Dernière Mise à Jour:** 25 Novembre 2025
