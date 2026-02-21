# Decisions - packages/MeeshySDK (Swift SDK)

## 2025-02: Architecture - Dual-Target (MeeshySDK + MeeshyUI)
**Statut**: Accept
**Contexte**: Sparation logique mtier et UI pour rutilisabilit
**Decision**: Deux targets SPM: `MeeshySDK` (core, pas de SwiftUI) et `MeeshyUI` (composants SwiftUI, dpend de MeeshySDK)
**Alternatives rejet**: Target unique (force dpendance SwiftUI pour le core), framework spar (overhead maintenance), micro-packages (trop fragment)
**Cons**: Possibilit d'utiliser le SDK sans UI (tests, extensions, widgets)

## 2025-02: Dpendance unique - Socket.IO Client
**Statut**: Accept
**Contexte**: Minimiser les dpendances externes pour stabilit et taille du binaire
**Decision**: Seule dpendance: `socket.io-client-swift 16.1+`. URLSession pour HTTP, Foundation pour JSON, Combine pour streams
**Alternatives rejet**: Alamofire (URLSession suffit), Starscream (Socket.IO l'inclut dj), SwiftyJSON (Codable natif suffit)
**Cons**: Plus de code custom pour HTTP, mais contrle total et zro dpendance transitoire

## 2025-02: Networking - APIClient gnrique async/await
**Statut**: Accept
**Contexte**: Client HTTP type-safe avec refresh token automatique
**Decision**: APIClient singleton, mthode gnrique `request<T: Decodable>()`, retry automatique sur 401 avec token refresh, dcodage ISO8601 fractionnaire
**Alternatives rejet**: Alamofire (dpendance inutile), async URLSession brut (boilerplate), Moya (trop abstrait)
**Cons**: Code custom  maintenir, mais type-safe et sans dpendance

## 2025-02: Sockets - Deux managers spars
**Statut**: Accept
**Contexte**: Messages et feed social ont des cycles de vie diffrents
**Decision**: `MessageSocketManager` (messages temps rel) et `SocialSocketManager` (posts, stories, statuts) comme singletons spars
**Alternatives rejet**: Manager unique (reconnexion d'un type affecte l'autre), trois+ managers (fragmentation excessive)
**Cons**: Code dupliqu (connexion, reconnexion, auth), mais reconnexion indpendante

## 2025-02: Cache Mdia - Swift Actor
**Statut**: Accept
**Contexte**: Accs concurrent au cache depuis multiple threads
**Decision**: `actor MediaCacheManager` avec double couche (NSCache mmoire + FileManager disque 7j TTL), dduplification in-flight
**Alternatives rejet**: Class avec locks (error-prone), DispatchQueue (legacy), Kingfisher seul (pas de cache audio/vido)
**Cons**: Syntaxe `await` obligatoire pour chaque accs au cache

## 2025-02: Models - Decodable + toDomain() pattern
**Statut**: Accept
**Contexte**: Les rponses API et les modles de domaine ont des formes diffrentes
**Decision**: Modles `APIxxx: Decodable` (forme API) avec extensions `toDomain()` vers modles de domaine (forme app)
**Alternatives rejet**: Modle unique (mlange concerns API et UI), DTO manual mapping (plus verbeux), Codable bidirectionnel (pas toujours ncessaire)
**Cons**: Double modle  maintenir, mais sparation claire API vs domaine

## 2025-02: Auth - UserDefaults (DETTE TECHNIQUE)
**Statut**: Accept (temporaire)
**Contexte**: Rapidit de dveloppement, simplicit en simulateur
**Decision**: Tokens JWT et session stocks dans `UserDefaults.standard` sous cls `meeshy_auth_token` et `meeshy_session_token`
**Alternatives rejet**: Keychain (solution correcte mais complexit entitlements)
**Cons**: **RISQUE SCURIT** - UserDefaults non chiffr, extractible depuis backup device
**Action requise**: Migrer vers Keychain avant release production (priorit haute)

## 2025-02: Events - Combine PassthroughSubject
**Statut**: Accept
**Contexte**: Les socket managers doivent publier des vnements de manire ractive
**Decision**: `PassthroughSubject<EventType, Never>` pour chaque type d'vnement, subscribers via `.sink()` + `AnyCancellable`
**Alternatives rejet**: Callbacks/closures (pas composables), AsyncStream (moins flexible pour multi-subscribers), NotificationCenter (pas type-safe)
**Cons**: Gestion manuelle des `AnyCancellable`, `[weak self]` obligatoire dans closures

## 2025-02: Configuration - MeeshyConfig centralis
**Statut**: Accept
**Contexte**: URLs et timeouts doivent tre configurables par environnement
**Decision**: `MeeshyConfig` avec URLs de base (API, WebSocket, media), timeouts, feature flags
**Alternatives rejet**: Hardcod (pas multi-env), xcconfig seul (pas accessible au runtime), UserDefaults (pas de dfauts types)
**Cons**: Un seul point de configuration pour tout le SDK
