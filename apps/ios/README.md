# 📱 Meeshy iOS - Application de Communication Temps Réel

Application iOS native en SwiftUI pour la plateforme Meeshy, permettant la communication multilingue en temps réel avec traduction automatique.

## 🎯 Vue d'ensemble

Cette application iOS réplique les fonctionnalités principales du frontend web Meeshy avec une interface native optimisée pour iOS.

### Fonctionnalités Principales

- ✨ **Onboarding interactif** - Introduction en 4 étapes
- 🔐 **Authentification complète** - Login, inscription, OAuth (Google, Apple, Facebook)
- 👤 **Mode anonyme** - Rejoindre des conversations sans compte
- 💬 **Chat temps réel** - WebSocket pour messagerie instantanée
- 🌐 **Traduction automatique** - Support de 8 langues avec traduction en temps réel
- 🔗 **Deep links** - `meeshy://join/{linkId}`
- ⚡ **Indicateurs de frappe** - Savoir qui écrit en temps réel
- 🎨 **Interface moderne** - SwiftUI avec support Dark Mode
- 📱 **Architecture MVVM** - Code propre et maintenable

## 🏗️ Architecture

### Technologies

- **SwiftUI** - Framework UI déclaratif
- **Combine** - Gestion réactive des données
- **Socket.IO** - Communication temps réel
- **URLSession** - Requêtes HTTP REST
- **MVVM** - Pattern d'architecture

### Structure

```
Meeshy/
├── Models/              # Structures de données
├── Services/            # Logique métier & réseau
├── ViewModels/          # États et logique UI
├── Views/               # Interfaces SwiftUI
└── MeeshyApp.swift     # Point d'entrée
```

## 🚀 Démarrage Rapide

### Prérequis

- macOS 14+
- Xcode 15+ (Beta installé)
- iOS 16+ Simulator ou Device
- Backend Meeshy sur `gate.meeshy.me`

### Installation

1. **Ouvrez Xcode-beta**
```bash
open -a Xcode-beta /Users/smpceo/Documents/Services/Meeshy/ios
```

2. **Créez un nouveau projet iOS App**
   - Product Name: **Meeshy**
   - Interface: **SwiftUI**
   - Language: **Swift**

3. **Importez les fichiers sources**
   - Glissez-déposez tous les dossiers du projet dans Xcode

4. **Ajoutez Socket.IO**
   - File > Add Package Dependencies...
   - URL: `https://github.com/socketio/socket.io-client-swift`
   - Version: 16.1.0

5. **Build & Run**
   - Cmd+R ou Product > Run

Voir [BUILD_INSTRUCTIONS.md](./BUILD_INSTRUCTIONS.md) pour des instructions détaillées.

## 📖 Guide d'Utilisation

### Première Utilisation

1. **Onboarding** - L'app affiche automatiquement l'introduction
2. **Connexion** - Créez un compte ou connectez-vous
3. **Conversations** - Accédez à vos conversations ou créez-en une nouvelle
4. **Chat** - Envoyez des messages, ils seront traduits automatiquement

### Mode Anonyme

Pour rejoindre une conversation sans compte :

1. Obtenez un lien d'invitation (format: `meeshy://join/{linkId}`)
2. Ouvrez le lien sur votre appareil iOS
3. Remplissez le formulaire (prénom, nom, langue)
4. Commencez à chatter !

### Traduction des Messages

- **Automatique** : Les messages sont traduits selon votre langue système
- **Manuel** : Long-press sur un message > Sélectionnez une langue
- **Original** : Cliquez sur "Afficher l'original" pour voir le texte source

## 🎨 Captures d'Écran

(À ajouter après le premier build)

## 🔧 Configuration

### API Backend

Configuré dans `Services/APIService.swift` :

```swift
#if DEBUG
baseURL = "http://localhost:3000/api"
socketURL = "http://localhost:3000"
#else
baseURL = "https://gate.meeshy.me/api"
socketURL = "https://gate.meeshy.me"
#endif
```

### Langues Supportées

Définies dans `Models/Language.swift` :

- 🇫🇷 Français
- 🇬🇧 English
- 🇪🇸 Español
- 🇩🇪 Deutsch
- 🇵🇹 Português
- 🇨🇳 中文
- 🇯🇵 日本語
- 🇸🇦 العربية

## 📱 Compatibilité

- **iOS** : 16.0+
- **Simulateur** : Tous les simulateurs iOS 16+
- **Device** : iPhone, iPad

## 🧪 Tests

Pour tester l'application :

1. **Backend local** : Lancez le gateway sur `localhost:3000`
2. **Backend production** : Utilisez `gate.meeshy.me`
3. **Compte test** : Créez un compte via l'inscription

### Scénarios de Test

- ✅ Onboarding complet
- ✅ Inscription nouveau compte
- ✅ Connexion compte existant
- ✅ Création conversation
- ✅ Envoi/réception messages
- ✅ Traduction temps réel
- ✅ Connexion anonyme via lien
- ✅ Indicateurs de frappe
- ✅ Deep links

## 🔐 Sécurité

- JWT tokens pour authentification
- Session tokens pour utilisateurs anonymes
- HTTPS pour toutes les communications
- Pas de stockage de mots de passe en clair

## 🐛 Débogage

### Logs

Activez la console Xcode :
```
View > Debug Area > Activate Console (Cmd+Shift+Y)
```

### Erreurs Courantes

**"No such module 'SocketIO'"**
→ Ajoutez le package via SPM

**"WebSocket connection failed"**
→ Vérifiez que le backend est accessible

**"Signing certificate"**
→ Activez "Automatically manage signing"

## 📚 Documentation

- [BUILD_INSTRUCTIONS.md](./BUILD_INSTRUCTIONS.md) - Guide de build détaillé
- [.cursorrules](./.cursorrules) - Règles de développement SwiftUI
- Backend API: Documentation dans `/gateway/docs/`

## 🤝 Contribution

Ce projet suit les best practices SwiftUI définies dans `.cursorrules` :

- Architecture MVVM stricte
- Code déclaratif SwiftUI
- Pas de force unwrapping
- Gestion d'erreurs complète
- Tests unitaires des ViewModels

## 📄 Licence

Propriétaire - Meeshy

## 👨‍💻 Développement

Développé avec SwiftUI et les dernières technologies iOS en suivant les meilleures pratiques Apple.

### Stack Technique

- SwiftUI pour l'UI
- Combine pour la réactivité
- Socket.IO pour le temps réel
- MVVM pour l'architecture
- Swift Concurrency (async/await)

---

**Fait avec ❤️ pour Meeshy**
