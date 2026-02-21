# Decisions - apps/ios (SwiftUI iOS App)

## 2025-01: Architecture - MVVM strict
**Statut**: Accept
**Contexte**: SwiftUI ncessite un pattern clair pour sparer UI et logique mtier
**Decision**: MVVM avec `@MainActor class` ViewModels, `@Published` properties, Views pures SwiftUI
**Alternatives rejet**: MVC (pas adapt SwiftUI), VIPER (trop complexe pour l'quipe), TCA (courbe d'apprentissage)
**Cons**: Boilerplate (ViewModel+View+Model par feature), Combine ncessaire pour les streams

## 2025-01: Navigation - ZStack custom (pas NavigationStack)
**Statut**: Accept
**Contexte**: Besoin d'animations personnalises (scale+fade+slide) et d'un UI immersif sans chrome
**Decision**: ZStack avec `@State` boolens, `.transition(.asymmetric())` avec spring animations, callbacks `onBack`
**Alternatives rejet**: NavigationStack (animations limites, barre de navigation impose), TabView (pas adapt au chat)
**Cons**: Pas de deep linking, bouton retour manuel, pas de swipe-to-dismiss natif, vues en mmoire

## 2025-01: Services - Singletons (`static let shared`)
**Statut**: Accept
**Contexte**: Managers coteux (connexions rseau, modles ML) ne doivent pas tre recrs
**Decision**: Singleton pour AuthManager, APIClient, MessageSocketManager, PresenceManager, MediaCacheManager, ThemeManager
**Alternatives rejet**: Dependency injection (setup container complexe), Environment Objects (pas adapt aux services), Service Locator (indirection inutile)
**Cons**: Difficile  tester (tat global), dpendances caches

## 2025-01: Networking - URLSession natif + Socket.IO + Combine
**Statut**: Accept
**Contexte**: REST pour API, WebSocket pour temps rel, streams d'vnements ractifs
**Decision**: APIClient gnrique `async/await`, deux Socket Managers spars (Message + Social), Combine PassthroughSubject pour events
**Alternatives rejet**: Alamofire/Moya (URLSession suffit), un seul socket manager (reconnexion indpendante ncessaire), callbacks (obsolte)
**Cons**: Code dupliqu entre les deux socket managers, gestion manuelle des `AnyCancellable`

## 2025-01: Property Wrappers - Convention StateObject/ObservedObject/EnvironmentObject
**Statut**: Accept
**Contexte**: SwiftUI exige le bon wrapper pour viter les recrations de ViewModels
**Decision**: `@StateObject` quand la View CRE le VM, `@ObservedObject` pour les singletons, `@EnvironmentObject` pour VMs partags dans la hirarchie
**Alternatives rejet**: Tout en @StateObject (lifecycle incorrect pour singletons), tout en @ObservedObject (recration inattendue)
**Cons**: Subtil  comprendre, `@EnvironmentObject` manquant = crash runtime (pas compile-time)

## 2025-01: Media - Kingfisher + Actor MediaCacheManager
**Statut**: Accept
**Contexte**: Images frquentes et petites vs audio/vido rares et volumineux = politiques de cache diffrentes
**Decision**: Kingfisher pour images, Actor custom pour audio/vido/documents (NSCache mmoire + FileManager disque, 7j TTL)
**Alternatives rejet**: SDWebImage (moins Swift-natif), cache unique (politiques incompatibles)
**Cons**: Deux systmes de cache  maintenir, pas d'viction automatique du disque au-del de l'ge

## 2025-01: Design System - Glass UI + View Modifiers custom
**Statut**: Accept
**Contexte**: Design language personnalis avec `.ultraThinMaterial`, gradients, et animations spring
**Decision**: ThemeManager singleton, modifiers rutilisables (`.glassCard()`, `.pressable()`, `.shimmer()`, `.pulse()`), Color(hex:) extension
**Alternatives rejet**: UI kit tiers (pas assez de contrle), styles hardcods (pas de thming)
**Cons**: Performance des effets empils (blur+shadow+gradient), courbe d'apprentissage des modifiers

## 2025-01: Concurrence - async/await + @MainActor + Actor
**Statut**: Accept
**Contexte**: Swift concurrency moderne pour thread safety et performance
**Decision**: ViewModels `@MainActor class`, `actor` pour le cache (MediaCacheManager), `async/await` pour le rseau, Combine pour les streams
**Alternatives rejet**: GCD (legacy, pas de structured concurrency), tout Combine (trop verbeux pour single-value), tout async/await (Combine meilleur pour streams)
**Cons**: Paradigmes mixtes (Combine + async/await), retain cycles dans les closures Combine

## 2025-01: Tokens - UserDefaults (DETTE TECHNIQUE)
**Statut**: Accept (temporaire)
**Contexte**: Simplicit de dveloppement, pas de problmes Keychain en simulateur
**Decision**: JWT et session tokens stocks dans `UserDefaults.standard`
**Alternatives rejet**: Keychain (complexit et entitlements) - DEVRAIT TRE LA SOLUTION FINALE
**Cons**: **RISQUE SCURIT** - UserDefaults non chiffr, tokens extractibles depuis backup
**Action requise**: Migrer vers Keychain avant release production

## 2025-01: Build - Script shell custom (`meeshy.sh`)
**Statut**: Accept
**Contexte**: Automatisation build/run/test/archive sans dpendance externe
**Decision**: Script bash 601 lignes wrappant xcodebuild, dtection auto simulateur, log streaming avec crash monitoring
**Alternatives rejet**: Fastlane (overkill, dpendance Ruby), Xcode GUI (pas automatable)
**Cons**: Fragilit du bash (whitespace, quoting), macOS+Xcode obligatoire

## 2025-02: Dpendances - 5 librairies SPM
**Statut**: Accept
**Contexte**: Dpendances minimales, Swift Package Manager natif
**Decision**: Firebase 10.29+, Socket.IO 16.1+, WebRTC 120.0+, Kingfisher 7.10+, WhisperKit 0.9+
**Alternatives rejet**: CocoaPods (ncessite Ruby, pas natif)
**Cons**: Firebase + WebRTC ajoutent ~30MB au binaire, vendor lock-in Firebase
