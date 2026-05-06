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
**Statut**: Accept (rvis 2026-05 — Kingfisher retir)
**Contexte**: Dpendances minimales, Swift Package Manager natif
**Decision**: Firebase 12.12+, Socket.IO 16.1+, WebRTC 141.0+, WhisperKit 0.9+
**Alternatives rejet**: CocoaPods (ncessite Ruby, pas natif)
**Cons**: Firebase + WebRTC ajoutent ~30MB au binaire, vendor lock-in Firebase

## 2026-05: Suppression de Kingfisher (dpendance morte)
**Statut**: Accept
**Contexte**: Kingfisher 7.10 tait dclare dans `apps/ios/Package.swift` depuis le dbut du projet, mais l'audit SOTA 2026-05-06 a dcouvert qu'**aucun fichier Swift ne l'importait** (`grep "import Kingfisher"` = 0 rsultats). L'image loading tait dj fait via `AsyncImage` natif SwiftUI + `CachedAsyncImage` custom (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift`) qui utilise `DiskCacheStore` et `CacheCoordinator.shared.images` (3-tier cache du SDK).
**Decision**: Supprimer Kingfisher de `apps/ios/Package.swift` (dependencies + target product). Aucun changement de code Swift requis (zro import). Conserver `CachedAsyncImage` + `CacheCoordinator` qui sont la stratgie d'image loading active.
**Alternatives rejet** :
- **Bumper Kingfisher 7.10 → 8.9** (recommandation initiale de l'audit) : inutile puisque la lib n'est pas utilise. Maintenir une dpendance non-utilise = dette tech qui pollue le SPM graph et augmente le bundle.
- **Migrer tout vers Kingfisher** : ajouterait une dpendance redondante alors que `CacheCoordinator` 3-tier est dj en place et test.
- **Migrer vers Nuke 13** : non justifi (mme raisonnement).
**Justification SOTA (audit 2026-05-06)** :
- Le pattern actuel (`AsyncImage` SwiftUI + `CachedAsyncImage` + `DiskCacheStore`) est natif iOS 15+ et SOTA 2026
- Le `CacheCoordinator` 3-tier (mmoire NSCache + disk FileManager + rseau) est plus performant qu'une simple `KFImage` car coupl  l'invalidation Socket.IO
- Suppression d'une dpendance morte = -1 paquet SPM, build plus rapide, moins de surface d'attaque
**Cons**: aucun. Le retrait est purement bnfique (rien ne casse, dette tech limine).
**Source**: `docs/superpowers/specs/2026-05-06-composer-based-story-repost-sota-audit.md` Pilier 11 (rvis post-investigation)

## 2026-05: Stories - Immuabilit post-publication
**Statut**: Accept
**Contexte**: Les utilisateurs peuvent crer/diter une story librement dans le composer pre-publish (StoryComposerView : slides, effets, stickers, audio, visibilit). **Aprs publication, aucune dition n'est possible** ; seule la suppression de la story (ou d'une slide individuelle) est offerte. Le menu kebab de l'utilisateur propritaire affiche uniquement "Supprimer".
**Decision**: Les stories sont **immuables** une fois publies. Le menu kebab ne propose JAMAIS d'option "Modifier" pour les stories. La granularit "delete single slide" reste possible.
**Justification SOTA (audit 2026-05-06)** :
- **Alignement industrie 100%** : Instagram, Snapchat, BeReal, TikTok Stories, Threads — toutes les plateformes leaders interdisent l'dition post-publish
- **Trust** : l'immuabilit = preuve de confiance (anti-fake-news, contre-mesure  l'dition silencieuse aprs viralit)
- **Simplicit cognitive** : modle write-once plus simple  expliquer  l'utilisateur
- **Confidentialit** : un follower qui a vu la story originale peut tre sr que ce qu'il a vu n'a pas t modifi  posteriori
**Alternatives rejet** :
- **dition libre 5min aprs publi** (style Threads/X pour les posts) : casse la trust, ncessite badge "Edited" omniprsent, complexifie les caches CDN, et n'est pas attendu pour des stories phmres 24h
- **dition limite au texte seul** : pas de demande utilisateur, complexit pour un gain marginal
**Implications** :
- Pour corriger une erreur, l'utilisateur supprime + recre (workflow universel sur les plateformes leaders)
- Le composer pre-publish doit rester puissant et accessible (pas de friction  l'dition AVANT publication)
- L'option "Add slide" sur story existante est append-only (acceptable, prserve l'immuabilit des slides existants)
**Cons**: aucun (alignement industrie unanime). Risque rsiduel : utilisateur frustr de devoir supprimer pour corriger un typo — accept comme tradeoff.
**Source**: `docs/superpowers/specs/2026-05-06-composer-based-story-repost-sota-audit.md` Pilier 20

## 2026-05: Mdia snapshot - Reflink (COPYFILE_FICLONE) ct gateway
**Statut**: Accept
**Contexte**: Le repost-en-post d'une story duplique les mdias vers de nouveaux paths CDN (snapshot indpendant pour survivre  l'expiration de la story originale). L'implmentation initiale utilisait `fs.copyFile(src, dst)` sans flag — full byte copy systmatique.
**Decision**: Utiliser `fs.copyFile(src, dst, fs.constants.COPYFILE_FICLONE | COPYFILE_EXCL)` dans `services/gateway/src/services/MediaService.ts`. `COPYFILE_FICLONE` = best-effort copy-on-write reflink (zero-copy sur APFS, btrfs, XFS, ext4 5.6+) avec fallback automatique vers full copy. `COPYFILE_EXCL` = guard contre overwrite race (UUID destination).
**Justification SOTA (audit 2026-05-06)** :
- Sur APFS/btrfs/XFS, le reflink est gratuit (~zro I/O, ~zro RAM, atomic)
- Sur les filesystems non-supports, fallback transparent vers full copy (zro impact)
- Gain estim : -90% I/O sur duplication snapshot, support reflinks natif macOS/Linux modern
**Alternatives rejet** :
- **Streams** (`createReadStream.pipe(createWriteStream)`) : universel mais 2 buffers RAM, complexit accrue
- **Server-side copy S3** (`CopyObject`) : non applicable car stockage actuel = volumes Docker locaux. Sera la SOTA quand on migrera vers MinIO/R2 (cf. Pilier 7 audit).
**Cons**: dpend du filesystem hte (mais fallback gracieux)
**Source**: `docs/superpowers/specs/2026-05-06-composer-based-story-repost-sota-audit.md` Pilier 3
