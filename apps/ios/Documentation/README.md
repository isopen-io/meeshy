# Meeshy iOS - Documentation Complète

<div align="center">

**Plateforme de messagerie en temps réel avec traduction automatique**

[![iOS](https://img.shields.io/badge/iOS-16.0%2B-blue.svg)](https://developer.apple.com/ios/)
[![Swift](https://img.shields.io/badge/Swift-5.9%2B-orange.svg)](https://swift.org/)
[![SwiftUI](https://img.shields.io/badge/SwiftUI-Native-green.svg)](https://developer.apple.com/xcode/swiftui/)
[![Architecture](https://img.shields.io/badge/Architecture-MVVM%20%2B%20Clean-purple.svg)](/)

</div>

---

## Vue d'Ensemble

Meeshy iOS est une application de messagerie instantanée moderne, construite avec **SwiftUI** et suivant les meilleures pratiques de l'architecture iOS moderne. L'application offre une communication en temps réel, une traduction automatique des messages, des appels audio/vidéo et une expérience utilisateur fluide.

### Caractéristiques Principales

- **Messagerie en Temps Réel** - WebSocket (Socket.IO) pour une communication instantanée
- **Traduction Automatique** - Communication multilingue transparente
- **Appels Audio/Vidéo** - WebRTC pour des appels de haute qualité
- **Authentification Sécurisée** - 2FA, Face ID/Touch ID, Optic ID (iOS 17+)
- **Mode Hors Ligne** - Synchronisation intelligente avec cache local
- **Architecture Moderne** - MVVM + Clean Architecture
- **Performance Optimisée** - Lancement < 2s, mémoire < 150MB

### Stack Technique

| Composant | Technologie | Version |
|-----------|-------------|---------|
| Language | Swift | 5.9+ |
| UI Framework | SwiftUI | iOS 16+ compatible |
| Architecture | MVVM + Clean Architecture | - |
| Concurrence | async/await + Combine | - |
| Persistence | CoreData (SwiftData iOS 17+) | - |
| Networking | URLSession + Socket.IO | 16.1.0+ |
| Sécurité | Keychain + Certificate Pinning | - |
| Media | Kingfisher | 7.10.0+ |
| Backend Services | Firebase (Auth, Analytics, Push) | 10.20.0+ |

---

## Navigation Documentation

### Pour Démarrer

| Document | Description |
|----------|-------------|
| [🚀 Guide de Démarrage Rapide](./01-Getting-Started/QUICK_START.md) | Installation et premier lancement en 5 minutes |
| [⚙️ Configuration Environnement](./01-Getting-Started/ENVIRONMENT_SETUP.md) | Setup complet de l'environnement de développement |
| [🔧 Dépendances](./01-Getting-Started/DEPENDENCIES.md) | Installation et gestion des dépendances |
| [🏗️ Build & Run](./01-Getting-Started/BUILD_AND_RUN.md) | Compiler et exécuter l'application |

### Architecture & Conception

| Document | Description |
|----------|-------------|
| [📐 Vue d'Ensemble Architecture](./02-Architecture/OVERVIEW.md) | Architecture générale de l'application |
| [🧩 Modules & Features](./02-Architecture/FEATURE_MODULES.md) | Organisation des modules fonctionnels |
| [💾 Modèles de Données](./02-Architecture/DATA_MODELS.md) | Structure des données et entités |
| [🔄 Flux de Données](./02-Architecture/DATA_FLOW.md) | Circulation des données dans l'app |
| [🎨 Design System](./02-Architecture/DESIGN_SYSTEM.md) | Système de design et composants UI |
| [🔒 Sécurité](./02-Architecture/SECURITY.md) | Architecture de sécurité |
| [⚡ Performance](./02-Architecture/PERFORMANCE.md) | Stratégies d'optimisation |

### Développement

| Document | Description |
|----------|-------------|
| [📝 Standards de Code](./03-Development/CODING_STANDARDS.md) | Conventions et bonnes pratiques |
| [🧪 Tests](./03-Development/TESTING.md) | Stratégie de tests (Unit, UI, Integration) |
| [🐛 Debugging](./03-Development/DEBUGGING.md) | Techniques de débogage |
| [📊 Logging & Monitoring](./03-Development/LOGGING.md) | Logging et observabilité |
| [🔄 Git Workflow](./03-Development/GIT_WORKFLOW.md) | Workflow Git et branches |
| [✨ Feature Flags](./03-Development/FEATURE_FLAGS.md) | Gestion des feature flags |

### API & Intégration

| Document | Description |
|----------|-------------|
| [🌐 API REST](./04-API/REST_API.md) | Documentation des endpoints REST |
| [⚡ WebSocket](./04-API/WEBSOCKET.md) | Intégration WebSocket en temps réel |
| [🔐 Authentification](./04-API/AUTHENTICATION.md) | Flux d'authentification et tokens |
| [🌍 Traduction](./04-API/TRANSLATION.md) | Service de traduction |
| [📞 Appels](./04-API/CALLS.md) | Intégration WebRTC |
| [📱 Notifications Push](./04-API/PUSH_NOTIFICATIONS.md) | Configuration Firebase Cloud Messaging |
| [❌ Gestion d'Erreurs](./04-API/ERROR_HANDLING.md) | Stratégie de gestion des erreurs |

### Déploiement

| Document | Description |
|----------|-------------|
| [🚀 Déploiement](./05-Deployment/DEPLOYMENT_GUIDE.md) | Guide complet de déploiement |
| [📦 Build Configuration](./05-Deployment/BUILD_CONFIGURATION.md) | Configuration Debug/Staging/Production |
| [✈️ TestFlight](./05-Deployment/TESTFLIGHT.md) | Déploiement sur TestFlight |
| [🏪 App Store](./05-Deployment/APP_STORE.md) | Publication sur l'App Store |
| [🔧 CI/CD](./05-Deployment/CICD.md) | Pipeline d'intégration continue |
| [📋 Code Signing](./05-Deployment/CODE_SIGNING.md) | Gestion des certificats |

### Résolution de Problèmes

| Document | Description |
|----------|-------------|
| [🔍 Guide de Dépannage](./06-Troubleshooting/COMMON_ISSUES.md) | Problèmes courants et solutions |
| [🐛 Erreurs de Build](./06-Troubleshooting/BUILD_ERRORS.md) | Résolution des erreurs de compilation |
| [📱 Problèmes Runtime](./06-Troubleshooting/RUNTIME_ISSUES.md) | Problèmes à l'exécution |
| [🌐 Problèmes Réseau](./06-Troubleshooting/NETWORK_ISSUES.md) | Debug des problèmes réseau |
| [💾 Problèmes de Cache](./06-Troubleshooting/CACHE_ISSUES.md) | Gestion du cache et CoreData |
| [📞 FAQ](./06-Troubleshooting/FAQ.md) | Questions fréquemment posées |

---

## Structure du Projet

```
ios/
├── Meeshy/                          # Application principale
│   ├── App/                         # Point d'entrée et lifecycle
│   │   ├── MeeshyApp.swift         # @main entry point
│   │   └── ContentView.swift        # Vue racine
│   │
│   ├── Core/                        # Logique métier core
│   │   ├── Services/               # Services partagés
│   │   │   ├── AuthService.swift   # Authentification
│   │   │   ├── TranslationService.swift
│   │   │   ├── NotificationService.swift
│   │   │   └── MediaService.swift
│   │   │
│   │   ├── Network/                # Couche réseau
│   │   │   ├── APIService.swift    # Client REST
│   │   │   ├── WebSocketService.swift
│   │   │   └── NetworkMonitor.swift
│   │   │
│   │   ├── Persistence/            # Persistence locale
│   │   │   ├── CacheService.swift  # CoreData manager
│   │   │   └── Meeshy.xcdatamodeld
│   │   │
│   │   ├── Security/               # Sécurité
│   │   │   ├── KeychainService.swift
│   │   │   └── CertificatePinning.swift
│   │   │
│   │   └── Models/                 # Modèles de domaine
│   │       ├── User.swift
│   │       ├── Message.swift
│   │       ├── Conversation.swift
│   │       └── ...
│   │
│   ├── Features/                    # Modules fonctionnels
│   │   ├── Auth/                   # Authentification
│   │   │   ├── Views/
│   │   │   ├── ViewModels/
│   │   │   └── Components/
│   │   │
│   │   ├── Chat/                   # Messagerie
│   │   │   ├── Views/
│   │   │   │   ├── ChatView.swift
│   │   │   │   └── MessageBubbleView.swift
│   │   │   ├── ViewModels/
│   │   │   │   └── ChatViewModel.swift
│   │   │   └── Services/
│   │   │       └── MessageService.swift
│   │   │
│   │   ├── Conversations/          # Liste conversations
│   │   ├── Profile/                # Profil utilisateur
│   │   ├── Settings/               # Paramètres
│   │   ├── Calls/                  # Appels audio/vidéo
│   │   ├── Media/                  # Gestion média
│   │   └── Notifications/          # Notifications
│   │
│   ├── DesignSystem/               # Système de design
│   │   ├── Components/             # Composants réutilisables
│   │   │   ├── PrimaryButton.swift
│   │   │   ├── TextField.swift
│   │   │   └── LoadingView.swift
│   │   ├── Theme/
│   │   │   ├── Colors.swift
│   │   │   ├── Typography.swift
│   │   │   └── Spacing.swift
│   │   └── Resources/
│   │       └── Assets.xcassets
│   │
│   ├── Navigation/                 # Navigation
│   │   ├── MainTabView.swift
│   │   ├── NavigationCoordinator.swift
│   │   └── DeepLinkHandler.swift
│   │
│   ├── Configuration/              # Configuration
│   │   ├── Environment.swift       # Environnements (Dev/Staging/Prod)
│   │   └── FeatureFlags.swift      # Feature flags
│   │
│   └── Info.plist                  # Configuration app
│
├── MeeshyTests/                    # Tests unitaires
│   ├── Unit/
│   ├── Integration/
│   └── Mocks/
│
├── MeeshyUITests/                  # Tests UI
│
├── Documentation/                   # 📚 CETTE DOCUMENTATION
│
├── fastlane/                       # Automatisation
│
├── scripts/                        # Scripts utilitaires
│
├── Configuration/                  # Configurations build
│   ├── Debug.xcconfig
│   ├── Staging.xcconfig
│   └── Production.xcconfig
│
├── Meeshy.xcodeproj               # Projet Xcode
├── Package.swift                   # Swift Package Manager
└── Gemfile                         # Dépendances Ruby (Fastlane)
```

---

## Démarrage Rapide

### Prérequis

- macOS 13.0+ (Ventura ou plus récent)
- Xcode 15.2+
- Swift 5.9+
- CocoaPods 1.12+ ou Swift Package Manager
- Ruby 2.7+ (pour Fastlane)
- Git

### Installation en 5 Minutes

```bash
# 1. Cloner le repository
git clone <repository-url>
cd Meeshy/ios

# 2. Installer les dépendances Ruby (Fastlane)
bundle install

# 3. Installer les dépendances Swift
# (Xcode le fera automatiquement au premier build)

# 4. Configurer Firebase
# Placer GoogleService-Info.plist dans Meeshy/

# 5. Ouvrir le projet
open Meeshy.xcodeproj

# 6. Build et Run
# Sélectionner le scheme "Meeshy (Debug)" et appuyer sur Cmd+R
```

Voir [Guide de Démarrage Détaillé](./01-Getting-Started/QUICK_START.md) pour plus d'informations.

---

## Configurations d'Environnement

L'application supporte trois environnements:

### Debug (Développement Local)
- **API:** `http://localhost:3000` ou `https://dev.gate.meeshy.me`
- **Bundle ID:** `com.meeshy.app.debug`
- **Logging:** Complet
- **Optimisations:** Désactivées
- **Usage:** Développement local

### Staging (Pré-production)
- **API:** `https://staging.gate.meeshy.me`
- **Bundle ID:** `com.meeshy.app.staging`
- **Logging:** Verbose
- **Optimisations:** Activées
- **Usage:** Tests internes

### Production
- **API:** `https://gate.meeshy.me`
- **Bundle ID:** `com.meeshy.app`
- **Logging:** Erreurs uniquement
- **Optimisations:** Maximales
- **Usage:** App Store

---

## Architecture MVVM + Clean

```
┌─────────────────────────────────────────────────┐
│                  Presentation                    │
│  ┌───────────┐        ┌──────────────┐         │
│  │   Views   │◄───────┤  ViewModels  │         │
│  │ (SwiftUI) │        │ (@Observable)│         │
│  └───────────┘        └──────┬───────┘         │
└──────────────────────────────┼──────────────────┘
                                │
┌──────────────────────────────┼──────────────────┐
│              Domain          │                   │
│            ┌─────────────────▼────┐             │
│            │   Use Cases /        │             │
│            │   Business Logic     │             │
│            └─────────────────┬────┘             │
└──────────────────────────────┼──────────────────┘
                                │
┌──────────────────────────────┼──────────────────┐
│               Data           │                   │
│  ┌────────────┐  ┌──────────▼───────┐          │
│  │ Repository │◄─┤    Services       │          │
│  └─────┬──────┘  └──────────────────┘          │
│        │                                         │
│   ┌────▼────┐          ┌────────────┐          │
│   │  Cache  │          │  Network   │          │
│   │CoreData │          │  (REST +   │          │
│   └─────────┘          │  WebSocket)│          │
│                        └────────────┘           │
└─────────────────────────────────────────────────┘
```

### Principes

1. **Séparation des Responsabilités** - Chaque couche a une responsabilité claire
2. **Indépendance de l'UI** - La logique métier ne dépend pas de SwiftUI
3. **Testabilité** - Chaque composant peut être testé indépendamment
4. **Réutilisabilité** - Les composants sont réutilisables
5. **Maintenabilité** - Code clair et organisé

---

## Flux de Travail Typiques

### Envoyer un Message

```
ChatView (User types message)
    ↓
ChatViewModel.sendMessage()
    ↓
MessageService.send()
    ↓
┌────────────────────┬─────────────────────┐
│   Optimistic UI    │    Network Call     │
│   (Instant)        │    (Async)          │
│   - Add to list    │    - POST to API    │
│   - Show sending   │    - Emit to Socket │
└────────┬───────────┴─────────┬───────────┘
         │                     │
         ▼                     ▼
    Update UI          Server Response
    (Temporary)        (Confirmed)
         │                     │
         └──────►  Update with server data
                       (Final state)
```

### Recevoir un Message

```
WebSocket Event: "message:received"
    ↓
WebSocketService.handleEvent()
    ↓
ChatViewModel.handleNewMessage()
    ↓
┌────────────────────────────────────┐
│ Is for current conversation?       │
├────────────┬───────────────────────┤
│    YES     │         NO            │
└────┬───────┴───────┬───────────────┘
     │               │
     ▼               ▼
Show in chat    Update badge
Update read     Show notification
CacheService    CacheService
```

---

## Métriques de Performance

| Métrique | Cible | Actuel | Status |
|----------|-------|--------|--------|
| Lancement App | < 2s | 1.5s | ✅ |
| First Contentful Paint | < 1s | 0.8s | ✅ |
| Latence d'envoi message | < 100ms | 80ms | ✅ |
| Mémoire (Idle) | < 100MB | 85MB | ✅ |
| Taille IPA | < 50MB | 42MB | ✅ |
| Couverture Tests | > 80% | 75% | ⚠️ |
| Taux Sans Crash | > 99.9% | 99.95% | ✅ |

---

## Compatibilité iOS

| Version iOS | Support | Notes |
|-------------|---------|-------|
| iOS 16 | ✅ Complet | Version minimum requise |
| iOS 17 | ✅ Complet + Enhanced | SwiftData, Live Activities, Optic ID |
| iOS 18 | ✅ Complet | Toutes fonctionnalités |

### Fonctionnalités par Version

**iOS 16 (Base)**
- SwiftUI avec NavigationStack
- async/await
- CoreData pour persistence
- Face ID / Touch ID

**iOS 17+ (Enhanced)**
- SwiftData (feature-flagged)
- Live Activities
- Optic ID (Vision Pro)
- Interactive Widgets
- Lock Screen Widgets

---

## Contribution

### Standards de Code

- Suivre les [Swift API Design Guidelines](https://swift.org/documentation/api-design-guidelines/)
- Utiliser SwiftLint pour le formatage
- Documentation pour les APIs publiques
- Tests unitaires pour les nouvelles fonctionnalités

### Workflow Git

```bash
# 1. Créer une branche feature
git checkout -b feature/ma-nouvelle-fonctionnalite

# 2. Faire les modifications
# ...

# 3. Commiter avec message conventionnel
git commit -m "feat: ajouter fonctionnalité X"

# 4. Push et créer PR
git push origin feature/ma-nouvelle-fonctionnalite
```

Voir [Git Workflow](./03-Development/GIT_WORKFLOW.md) pour plus de détails.

---

## Ressources Externes

### Documentation Apple
- [Swift Documentation](https://swift.org/documentation/)
- [SwiftUI Tutorials](https://developer.apple.com/tutorials/swiftui)
- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)

### Outils & Frameworks
- [Firebase iOS SDK](https://firebase.google.com/docs/ios)
- [Socket.IO Swift Client](https://github.com/socketio/socket.io-client-swift)
- [Fastlane Documentation](https://docs.fastlane.tools)
- [Kingfisher](https://github.com/onevcat/Kingfisher)

### Communauté
- [Swift Forums](https://forums.swift.org/)
- [iOS Dev Weekly](https://iosdevweekly.com/)

---

## Support & Contact

### Signaler un Problème

Si vous rencontrez un problème:

1. Vérifier la [FAQ](./06-Troubleshooting/FAQ.md)
2. Consulter le [Guide de Dépannage](./06-Troubleshooting/COMMON_ISSUES.md)
3. Créer une issue GitHub avec:
   - Description du problème
   - Steps to reproduce
   - Logs et screenshots
   - Version iOS et d'Xcode

### Contact

- **Email:** support@meeshy.me
- **Documentation API:** https://gate.meeshy.me/docs
- **Repository:** [GitHub](/)

---

## Licence

Copyright © 2025 Meeshy. All rights reserved.

---

## Changelog

### Version 1.0.0 (Janvier 2025)
- 🎉 Première release
- ✅ Messagerie en temps réel
- ✅ Traduction automatique
- ✅ Appels audio/vidéo
- ✅ Authentification 2FA + biométrique
- ✅ Mode hors ligne
- ✅ Support iOS 16-18

---

**Dernière Mise à Jour:** 25 Novembre 2025
**Version Documentation:** 1.0.0
**Maintenu par:** Équipe iOS Meeshy
