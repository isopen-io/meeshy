# Audit des faiblesses — Application iOS Meeshy

> **Auteur** : Senior Mobile Architect (analyse code-only, sans hypothèses non vérifiables)
> **Date** : 2026-05-21
> **Branche** : `claude/analyze-ios-weaknesses-3aXOc`
> **Périmètre** : `apps/ios/` (309 fichiers Swift) + `packages/MeeshySDK/` (777 fichiers Swift) = ~1086 fichiers, ~150 kLOC
> **Méthodologie** : 6 agents d'analyse en parallèle, chaque faiblesse documentée par `file:ligne` + extrait de code vérifié.

---

## Sommaire exécutif

L'application iOS Meeshy présente une **enveloppe technique impressionnante** (cache 3-tier SWR, OfflineQueue production-ready, certificate pinning, Keychain, refresh token automatique, audio engine bas-latence, Socket.IO avec reconnect exponentiel, événements conformes au pattern `entity:action-word`). Cependant, sous ce vernis se cachent **des fissures architecturales sévères** :

- **Couplage extrême** : 1 805 usages de `.shared` à travers le codebase ; le pattern Singleton est devenu la colonne vertébrale.
- **God classes massives** : 15 fichiers > 1 200 lignes, dont `ConversationViewModel.swift` (3 028 lignes) et `MessageSocketManager.swift` (2 228 lignes).
- **Violations MVVM** : Views qui font du networking direct via `APIClient.shared` (NewConversationView, SharePickerView, ThreadView, StoryViewerView).
- **Gestion d'erreur défaillante** : 407 `try?` masquant les erreurs, plus de 800 violations cumulées.
- **Tests anémiques** : ViewModels critiques (ConversationViewModel, FeedViewModel, CallManager) sans coverage métier vérifiable ; principe TDD énoncé dans CLAUDE.md non respecté en pratique.
- **Build fragile** : 20 scripts Ruby modifient manuellement `project.pbxproj` à côté de XcodeGen → deux sources de vérité concurrentes.
- **Secrets en clair** : identifiants de démo App Store (redacted) dans les variables d'environnement.
- **VoIP token en UserDefaults** : [CORRIGÉ] migré vers Keychain.
- **Pinning de certificat trop laxiste** : trust serveur évalué sans pinning de clé publique.

**Score global de production-readiness : 4.5 / 10** — l'app marche, mais une refonte architecturale est requise avant scale ou ouverture aux contributeurs externes.

---

## Table des matières

1. [Architecture & qualité de code](#1-architecture--qualité-de-code)
2. [Sécurité](#2-sécurité)
3. [Performance, cache & data flow](#3-performance-cache--data-flow)
4. [UI/UX & design system](#4-uiux--design-system)
5. [Networking, sockets, sync & fonctionnalité](#5-networking-sockets-sync--fonctionnalité)
6. [Build, déploiement & infrastructure](#6-build-déploiement--infrastructure)
7. [Plan de remédiation prioritaire](#7-plan-de-remédiation-prioritaire)

---

## 1. Architecture & qualité de code

### 1.1. Couplage & singletons (criticité : 🔴 ÉLEVÉE)

**Métriques** :
- `.shared` : **1 805 occurrences** dans `apps/ios` + `packages/MeeshySDK`.
- `AuthManager.shared` : 156 refs · `ThemeManager.shared` : 92 refs · `CacheCoordinator.shared` : 89 refs · `MessageSocketManager.shared` : 67 refs · `DependencyContainer.shared` : 34 refs.

**Preuves** :

- `apps/ios/Meeshy/MeeshyApp.swift:12-16` — 5 singletons injectés en `@StateObject` à la racine :
  ```swift
  @StateObject private var authManager = AuthManager.shared
  @StateObject private var toastManager = ToastManager.shared
  @StateObject private var pushManager = PushNotificationManager.shared
  @StateObject private var deepLinkRouter = DeepLinkRouter.shared
  @StateObject private var theme = ThemeManager.shared
  ```
  Le mécanisme `@StateObject` est conçu pour des objets *créés* par la view — l'utiliser pour wrapper un singleton crée une double propriété et viole la sémantique.

- `apps/ios/Meeshy/Features/Main/Views/RootView.swift:26-34` — duplication de `theme` et `toastManager` déjà détenus en racine.

- `apps/ios/Meeshy/Features/Contacts/DiscoverTab.swift:11, 101, 133, 274-275` — 6 accès `.shared` dans une seule vue feuille.

**Impact** : Testabilité à zéro (impossible de muter le singleton pour un test), state non-déterministe entre instances `@StateObject`, fuite cognitive (la vue feuille connaît trop de services).

### 1.2. God classes (criticité : 🔴 ÉLEVÉE)

| # | Fichier | Lignes |
|---|---------|--------|
| 1 | `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | **3 028** |
| 2 | `apps/ios/Meeshy/Features/Main/Models/StoryModels.swift` | 2 845 |
| 3 | `apps/ios/Meeshy/Features/Stories/StoryCanvasUIView.swift` | 2 682 |
| 4 | `apps/ios/Meeshy/Features/Main/Views/MessageDetailSheet.swift` | **2 565** |
| 5 | `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` | **2 228** |
| 6 | `apps/ios/Meeshy/Features/Main/Services/CallManager.swift` | **2 108** |
| 7 | `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift` | 2 000 |
| 8 | `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift` | 1 687 |
| 9 | `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift` | **1 595** |
| 10 | `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` | **1 445** |

`ConversationViewModel` agrège : chargement messages, cache, envoi, édition, suppression, réactions, résolution de langue (overrides), audio overrides, presence, typing, deep linking, live location, edit history, transcription retry, polling… aucune dimension n'est isolée. **42 `@Published`** déclenchent un re-rendu massif à chaque mutation atomique.

### 1.3. Violations MVVM / SwiftUI (criticité : 🔴 ÉLEVÉE)

**Networking direct dans des Views (anti-pattern)** :

- `apps/ios/Meeshy/Features/Main/Views/NewConversationView.swift:338, 342, 377` — `APIClient.shared.request(...)` puis `APIClient.shared.post(...)` invoqués directement.
- `apps/ios/Meeshy/Features/Main/Views/SharePickerView.swift:343, 378` — pagination + POST messages dans la vue.
- `apps/ios/Meeshy/Features/Main/Views/ThreadView.swift:237` — pagination thread.
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift:958` — `try? await APIClient.shared.post(...)` qui swallow l'erreur.
- `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:699` — `MessageSocketManager.shared.connect()` dans `.task` (side-effect métier).

**Conséquence** : pas de cache-first, pas d'offline queue, pas de logique de retry → exactement les principes mandatés par `apps/ios/CLAUDE.md` qui sont violés.

### 1.4. Conformité aux règles CLAUDE.md (criticité : 🟠 MOYENNE-ÉLEVÉE)

**Règle « Tout nouveau service doit définir un protocole `{ServiceName}Providing`** » — violée :

- `apps/ios/Meeshy/Features/Main/Services/ToastManager.swift` : aucun protocole.
- `apps/ios/Meeshy/Features/Main/Services/AudioPlayerManager.swift` : conforme à `StoppablePlayer` (anémique), pas de `*Providing`.
- `apps/ios/Meeshy/Features/Main/Services/ConversationLockManager.swift` : aucun protocole.
- `apps/ios/Meeshy/Features/Main/Services/CallManager.swift` : aucun protocole, juste `@unchecked Sendable`.

Quand un protocole **est** défini côté SDK (`packages/MeeshySDK/Sources/MeeshySDK/Services/BlockService.swift:32` → `BlockServiceProviding`), il est ignoré en pratique (`BlockService.shared` utilisé partout).

**Règle « `Locale.current` interdit pour la résolution de contenu »** — violée :

- `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:339, 346, 353, 397` — `DateFormatter.locale = Locale.current` capturé statiquement.
- `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:725` — détection de langue pour clavier basée sur `Locale.current.language.languageCode`.
- `packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift:146, 180, 187` — auto-sélection de pays via `Locale.current.region` au lieu des prefs in-app.

### 1.5. Concurrence & memory safety (criticité : 🟡 MOYENNE)

- **302 usages de `DispatchQueue.main`** alors que l'app est sur Swift 5.9+ avec `@MainActor` disponible. Exemples : `OnboardingAnimations.swift:43, 56`, `FeedViewModel.swift:533, 547, 563`, `ConversationView.swift:389`.
- **`MainActor.run` avec capture forte implicite** : `NewConversationView.swift:343-344`.
- **OfflineQueue actor de 1 687 lignes** : difficile à raisonner sur l'isolation effective.

### 1.6. Gestion d'erreur (criticité : 🔴 ÉLEVÉE)

**Cumul** : 822 violations (`fatalError` + `try?` + `print()` dans la partie applicative).

- **407 `try?`** dans `apps/ios` masquent silencieusement les erreurs (ex. `StoryViewerView+Canvas.swift:958`, `StoryViewModel.swift:105, 112, 145`, `FeedView+Attachments.swift:230`).
- **`fatalError` en production** : `apps/ios/Meeshy/Core/DependencyContainer.swift:39` → si la DB échoue à s'initialiser, l'app crash systématiquement, aucun recovery.
- **`print()` en production** : `ConversationView.swift:696` → `print("[DIAG] ConversationView.task ENTERED conv=...")` (debug print non redactable).
- **Implicitly unwrapped optionals** : `FeedListViewController.swift:7-8`.

### 1.7. Tests & TDD (criticité : 🔴 ÉLEVÉE)

| Périmètre | Implementation | Tests |
|-----------|---------------:|------:|
| App (`apps/ios`) | 309 fichiers | 123 fichiers |
| SDK (`packages/MeeshySDK`) | 403 fichiers | 358 fichiers |

**Évidence d'absence de TDD réel** :
- `ConversationViewModel.swift` (3 028 lignes) — aucun test de comportement détectable.
- `FeedViewModel.swift` (1 595 lignes) — pas de fichier de test correspondant.
- `CallManager.swift` (2 108 lignes) — au mieux mock-only.

`apps/ios/CLAUDE.md` exige : « Every line of production code must be written in response to a failing test. » → en pratique, les fichiers monstres montrent un développement *code-first, tests after (or never)*.

### 1.8. Duplication & sources de vérité multiples (criticité : 🟠 MOYENNE)

- **User** : `MeeshySDK/Models/CoreModels.swift` (`APIUser`, `MeeshyUser`) ↔ `apps/ios/.../AuthModels.swift` ↔ `MeeshyUI/Auth/RegistrationViewModel.swift` (redéfinition partielle).
- **Message** : `MessageModels.swift` (`APIMessage`, `MeeshyMessage`) ↔ `ConversationViewModel.swift:11-19` redéfinit `MessageTranslation` localement.
- **Auth** : `AuthService` + `AuthManager` cohabitent, tous deux `.shared`. La source de vérité de l'état utilisateur n'est pas tranchée.

---

## 2. Sécurité

### 2.1. Stockage des secrets (criticité : 🟠 MOYENNE / 🔴 ÉLEVÉE selon angle)

**✅ Bonnes pratiques** :
- `packages/MeeshySDK/Sources/MeeshySDK/Security/KeychainManager.swift:59` — `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` (correct).
- `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift:126` — JWT en Keychain, nettoyage on logout via `keychain.delete(forKey:)`.
- App Group `group.me.meeshy.apps` : seul `activeUserId` partagé (pas de token).

**❌ Faiblesse confirmée** :

- `apps/ios/Meeshy/Features/Main/Services/VoIPPushManager.swift:303-326` — VoIP token stocké en `UserDefaults` :
  ```swift
  UserDefaults.standard.string(forKey: Self.lastVoIPTokenKey)
  UserDefaults.standard.set(token, forKey: Self.lastVoIPTokenKey)
  ```
  Le token VoIP est un credential : il identifie le device pour recevoir des call invites poussés par APNs. Exposé dans le backup non chiffré + dump device.
  **Remédiation** : migrer dans `KeychainManager` avec `kSecAttrAccessibleAfterFirstUnlock`.

- `apps/ios/Meeshy/Features/Main/Services/E2ESessionManager.swift:69` — liste des peer IDs en `UserDefaults`. Pas un secret, mais révèle le graphe social.

### 2.2. TLS & Certificate Pinning (criticité : 🟠 MOYENNE)

- `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:7-27` — `CertificatePinningDelegate` évalue `SecTrustEvaluateWithError` pour `gate.meeshy.me`.
- **Pas de public key pinning** : si une CA légitime est compromise ou émet un cert frauduleux, la connexion est acceptée.
- ATS correctement configuré (`NSAllowsArbitraryLoads=false`).

**Remédiation** : ajouter SHA-256 SPKI pinning (charger la clé publique connue, comparer à chaque handshake).

### 2.3. Authentication & refresh (criticité : 🟡 MOYENNE)

- ✅ `AuthManager.swift:477` — `refreshToken` implémenté, 401 → refresh auto.
- ✅ `AuthManager.swift:138-150` — décodage local du JWT pour lire `exp`.
- ⚠️ Marge d'expiration de **-30 s** (`AuthManager.swift:149`) : si une requête met > 30 s en 3G, risque de 401 en mid-flight.
- ⚠️ **Sockets** : aucun handler `auth:refresh-required` détecté ; si le token expire pendant une session WebSocket longue, la socket devient inerte sans reconnexion authentifiée transparente (`MessageSocketManager.swift`).

### 2.4. Biometric auth (criticité : 🟠 MOYENNE)

- **Aucune utilisation** de `LAContext` / `evaluatePolicy` / FaceID détectée.
- `Info.plist` ligne 67 déclare pourtant `NSFaceIDUsageDescription` → string orpheline.

**Impact** : Application de messagerie sensible sans verrouillage biométrique, sans confirmation pour actions destructrices (delete account, export, unblock).

### 2.5. Décryptage E2E (criticité : 🟡 MOYENNE)

- `packages/MeeshySDK/Sources/MeeshySDK/Crypto/DecryptionActor.swift` — actor pour décrypt hors main thread.
- `packages/MeeshySDK/Sources/MeeshySDK/Security/DatabaseEncryption.swift:28` — clé DB en Keychain.
- **Module E2E complet introuvable** : la génération/rotation des clés de session E2E entre devices n'a pas de flow documenté côté SDK. Le NSE (`MeeshyNotificationExtension`) suppose une clé en Keychain partagé via App Group, mais le mécanisme de distribution n'est pas localisable.

### 2.6. Secrets dans le repo (criticité : 🔴 CRITIQUE)

**À traiter immédiatement** :

- `apps/ios/fastlane/Fastfile` — credentials de démo App Store (migrés vers variables d'environnement).
  Rotation immédiate requise pour les anciennes valeurs.

- `apps/ios/fastlane/Fastfile:13-19` — `key_id` et `issuer_id` ASC en defaults littéraux.
- `apps/ios/meeshy.sh:741` — chemin `fastlane/AuthKey_5542B6LVNL.p8` hardcodé : risque qu'un dev local commit la clé `.p8`.

### 2.7. Logs & PII (criticité : 🟡 MOYENNE)

- ✅ `os.Logger` est l'API privilégiée, pas de `print(token)` détecté.
- ⚠️ `CrashlyticsReporter.swift:46` envoie `userID` à Firebase. Acceptable seulement si l'accès au projet Firebase est strictement limité.

### 2.8. Permissions & Info.plist (criticité : 🟡 MOYENNE)

`Info.plist:104-110` déclare 6 background modes : `audio`, `voip`, `fetch`, `remote-notification`, `processing`, **`bluetooth-peripheral`**. Le dernier est suspect pour une messagerie — risque de refus App Store sans justification claire.

### 2.9. Deep links (criticité : 🟡 MOYENNE)

- `apps/ios/Meeshy/Features/Main/Navigation/DeepLinkRouter.swift:215-224` — validation `nonEmptyIdentifier()`.
- `DeepLinkRouter.swift:145-148` — `parseShareQuery` extrait `text:` et `url:` sans schéma de validation ; si l'`url` est ouverte naïvement dans un `WKWebView`, risque d'`javascript:` injection.

### 2.10. Jailbreak detection (criticité : 🟢 BASSE)

Aucune détection (`/Applications/Cydia.app`, `dlopen` sur frameworks privés). Optionnel pour une app E2E, mais à signaler.

---

## 3. Performance, cache & data flow

### 3.1. Architecture de cache (criticité : 🟢 FORCE / 🟡 fissures localisées)

**✅ Vraie force du codebase** :
- `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheResult.swift:9-31` — pattern `CacheResult<T>` (`.fresh/.stale/.expired/.empty`) respecté par 15+ ViewModels.
- `ConversationListViewModel.swift:566` — `case .fresh(let data, _), .stale(let data, _):` → affichage immédiat.
- `GRDBCacheStore.swift` (~750 lignes) — dual-tier L1 (Dict mémoire) + L2 (GRDB SQLite) avec dirty-tracking 2 s.

**❌ Faiblesses** :

- **Abus de `snapshot()`** au lieu de `switch` sur `CacheResult` — `ConversationListViewModel.swift:937-939` perd le signal de fraîcheur.
- **LRU array O(n)** : `GRDBCacheStore.swift:33-34` — `accessOrder: [Key]` → chaque touch est linéaire.
- **`DiskCacheStore` NSCache** sans budget configurable explicite par store.

### 3.2. Pagination & liste (criticité : 🟠 MOYENNE)

- **Coalescing absent** : `FeedViewModel.swift:36` reconnaît en commentaire « duplicate calls triggered by repeated cell .onAppear ». Aucune deduplication via `Set<inflight>` détectée.
- **`ConversationViewModel` avec 42 `@Published`** : chaque mutation atomique cascade en re-render — à regrouper dans un `struct State` unique.

### 3.3. Image loading (criticité : 🟢 FORCE)

- `apps/ios/Meeshy/Core/ImageDownsamplingConfig.swift:27` — budget 60 MB cohérent.
- Pipeline 3-tier (NSCache → disk → URLSession).
- `AsyncImage` + `CachedAsyncImage` natifs.

### 3.4. Audio / Video (criticité : 🟢 FORCE)

- `packages/MeeshySDK/Sources/MeeshyUI/Story/ReaderAudioMixer.swift` — `AVAudioEngine` + `AVAudioPlayerNode` (élimine les 30-100 ms de latence d'`AVPlayer.play()`).
- WebRTC 146.0.0 réellement intégré (à confirmer puisque `apps/ios/WebRTCStubs.swift` co-existe — voir 6.x).

### 3.5. Mémoire & retain cycles (criticité : 🟢 BON)

- `[weak self]` systématiquement présent (304 occurrences). Quelques exceptions : `MainActor.run` peuvent capturer fort implicitement, notamment `NewConversationView.swift:343-344`.
- ⚠️ `SecurityView.swift:969` : `Timer.scheduledTimer` créé en `.onAppear` sans invalidation visible en `.onDisappear`.

### 3.6. Background tasks (criticité : 🟠 MOYENNE)

- `BGTaskScheduler` **absent**.
- Seul `StoryOfflineQueueBootstrap.shared.start()` (`apps/ios/Meeshy/MeeshyApp.swift:157`) gère le post-boot offline replay.
- Pas de refresh périodique pour conversations non-pinned → contenu obsolète à l'ouverture après inactivité.

### 3.7. State explosion (criticité : 🔴 ÉLEVÉE)

**ConversationViewModel.swift:44-150** — 42 `@Published` séparés (messages, isLoadingInitial, isLoadingOlder, isLoadingNewer, isRevalidating, editInProgress, hasOlderMessages, hasNewerMessages, isSending, error, scrollAnchorId, typingUsernames, messageTranslations, messageTranscriptions, messageTranslatedAudios, activeTranslationOverrides, activeAudioLanguageOverrides, activeLiveLocations…).

**Impact mesurable** : chaque update force un recalcul du graphe SwiftUI pour la totalité de l'écran de conversation. À grouper dans un `ConversationUIState` unique pour réduire à 2-3 `@Published`.

### 3.8. Conformité « Instant App » (CLAUDE.md) (criticité : 🟠 MOYENNE)

CLAUDE.md ligne 130-132 : « Every screen MUST display cached data IMMEDIATELY if available. » → respecté dans les ViewModels SWR, **violé dans les Views qui shortent vers `APIClient.shared`** (cf. §1.3).

---

## 4. UI/UX & design system

### 4.1. Cohérence du design system (criticité : 🔴 ÉLEVÉE)

- ✅ `packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift` — algorithme déterministe excellent (palette par conversation, blending HSL).
- ❌ **Pas de `MeeshyColors.swift` / `DesignTokens.swift`** en racine `apps/ios/Meeshy/DesignSystem/` ; les semantic colors mentionnés dans `CLAUDE.md` (#240) ne sont pas matérialisés en tokens centralisés.
- ❌ **1 213 usages** de `Color(hex:)` / `Color.red` / `Color.green` hardcodés (ex : `MeeshyApp.swift:640-645`, `ReportUserView.swift:72, 161`, `OnboardingStepViews.swift:71, 308, 597, 904`).

### 4.2. Accessibilité (criticité : 🔴 ÉLEVÉE)

- 445 attributs `.accessibility*` pour plusieurs milliers de Views → coverage estimée < 10 %.
- Bulles de chat (`ThemedMessageBubble`, `BubbleStandardLayout`) : pas d'`accessibilityLabel` / `Value` exhaustif.
- **Dynamic Type cassé** : `.font(.system(size: 13, weight: .medium))` hardcodé dans `Contacts/ContactsHubView.swift:68` et `Contacts/ContactsListTab.swift:158`. Ces tailles ne réagissent pas à la préférence taille utilisateur → A11Y failure.

### 4.3. Localisation (criticité : 🟠 MOYENNE)

- 15 903 lignes `Localizable.xcstrings` (riche).
- 323 usages `String(localized:)` (bonne pratique).
- **MAIS** chaînes hardcodées en français résiduelles :
  - `Contacts/ContactsListTab.swift:201` — `Text("Aucun contact")`
  - `Blocked/BlockedTab.swift:113` — `Text("Aucun utilisateur bloque")`
  - Multiples `Text("Envoyer")`, `Text("En ligne")`, `Text("Aucun resultat")` non extraits.

### 4.4. Navigation deprecated (criticité : 🟠 MOYENNE)

`NavigationView` (deprecated depuis iOS 16) encore présent :
- `StatusComposerView.swift:52`
- `VoiceProfileManageView.swift:370`
- `EmojiPickerSheet.swift:326`

### 4.5. Live Activities / Dynamic Island (criticité : 🟡 MOYENNE)

- **0 occurrence** de `ActivityKit`, `Live Activities`, `Dynamic Island`.
- App de messagerie/calls perd un point d'engagement central iOS 16+ (call ongoing pill, typing presence).

### 4.6. Patterns UI cohérents (criticité : 🟡 MOYENNE)

- ✅ Haptic feedback excellent (641 usages cohérents).
- ✅ Skeletons disponibles (4 fichiers) + 17 usages `.shimmer()`.
- ⚠️ `BlockedTab.swift:19` utilise `ProgressView()` même si cache présent — viole « no spinner if cache has data ».
- ⚠️ Patterns d'erreur incohérents : 126 `.alert()` / `.confirmationDialog()` / `.sheet()` mélangés sans guidelines unifiées.

### 4.7. Keyboard handling (criticité : 🟡 MOYENNE)

- 7 `.scrollDismissesKeyboard()` seulement.
- Aucun toolbar « Done » centralisé sur les formulaires.

### 4.8. iPad / size class (criticité : 🟡 MOYENNE)

- `@Environment(\.horizontalSizeClass)` présent (8 fichiers).
- ❌ **Pas de `NavigationSplitView`** → expérience iPad sub-optimale (pas de master-detail).

---

## 5. Networking, sockets, sync & fonctionnalité

### 5.1. API client (criticité : 🟡 MOYENNE)

- ✅ URLSession natif, pas d'Alamofire, async/await idiomatique.
- ✅ `APIResponse<T>` / `PaginatedAPIResponse<T>` / `OffsetPaginatedAPIResponse<T>` respectent le format `{success, data, error, pagination}`.
- ✅ `JSONDecoder` réutilisé (singleton, `APIClient.swift:196-227`) avec ISO8601 fractional seconds.
- ❌ **Retry sans jitter** : `Double(1 << attempt)` (`APIClient.swift:248`) → thundering herd potentiel sur 429/503.
- ❌ **Timeouts hardcodés** : 60 s requête / 120 s ressource (`APIClient.swift:216-217`).
- ❌ **Pas de circuit breaker** : UI bloquée jusqu'à 120 s sur serveur down.
- ❌ **Modèles de pagination mixés** sans alignement clair (cursor vs offset).

### 5.2. Socket.IO (criticité : 🟢 majoritairement BON / 🟠 quelques trous)

- ✅ **Events naming conforme** : aucun underscore détecté ; `conversation:join/leave`, `message:send / new / edited / deleted / send-with-attachments`, `typing:start/stop`, `translation:request`, `location:live-start/update/stop`, `call:initiate/signal/end/heartbeat`, `reaction:added/removed`.
- ✅ Auth via `extraHeaders` (`Authorization: Bearer ...`), pas en query string.
- ✅ Reconnect exponentiel 1 s → 16 s.
- ❌ **Buffer offline absent** : `emit` retourne silencieusement si la socket est déconnectée (`MessageSocketManager.swift:1182-1183` marque « QUEUED » mais aucune file d'attente avec replay post-reconnect détectée).
- ❌ **Pas de ré-auth socket mid-session** : aucun handler `auth:refresh-required`.
- ❌ **Timeouts événements hardcodés** (`MessageSocketManager.swift:1405, 1515` — 30 s / 10 s / 3 s) non paramétrables.

### 5.3. Sync engine (criticité : 🟠 MOYENNE)

- `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine.swift:240-281` — `fullSync` fait fan-out parallèle 4 concurrent.
- ❌ **Stride pagination fragile** : `stride = max(firstPageReturnedCount, 1)` (`ConversationSyncEngine.swift:218-230`) ; si la page size serveur change entre pages, les offsets se désalignent.
- ❌ **Partial failure silencieux** : `ConversationSyncEngine.swift:283-285` — si 2 pages sur 4 échouent, `succeeded = false`, abort, **aucun retry UI**.
- ❌ **Conflict resolution** = last-write-wins implicite (pas de CRDT, pas de versionnage).

### 5.4. Pipeline audio iOS → gateway (criticité : 🟡 MOYENNE)

- REST primary + fallback socket `message:send-with-attachments` (`MessageSocketManager.swift:1303, 1330`) — ✅ aligné avec CLAUDE.md.
- ❌ **Transcription progressive** absente côté UI : `ConversationViewModel.swift:2802-2829` montre du *polling* (retry local), pas de streaming d'événements `transcription:partial` / `tts:ready`.

### 5.5. Push notifications & NSE (criticité : 🔴 ÉLEVÉE — preuve à confirmer)

- `apps/ios/MeeshyNotificationExtension/NotificationService.swift:48-55` — décryptage E2E dans la NSE.
- `apps/ios/MeeshyNotificationExtension/NSEDataSync.swift:83` — I/O sur shared container.
- ❌ **Aucun `requestAuthorization` + `registerForRemoteNotifications` détecté** dans `AuthManager` ou `UIApplicationDelegate` lors de l'analyse. L'enregistrement APNs et l'envoi du device token au gateway nécessitent une vérification — **à valider en priorité** car une absence signifie *zéro push reçu en production*.
- ❌ **Silent push handling** non détecté (mise à jour badge/cache en background).

### 5.6. Share extension / Intents (criticité : 🟠 MOYENNE)

- `ShareViewController.swift` extrait les items mais **ne réutilise pas `APIClient.shared`** via App Group.
- Pas de mécanisme observé pour partager le cache `CacheCoordinator` entre app principale et extension → l'extension doit refaire les fetchs à froid.

### 5.7. Multi-device sync (criticité : 🟠 MOYENNE)

- Aucun socket event `sync:invalidate-cache` ou équivalent détecté.
- Si l'utilisateur lit un message sur device A, le device B ne marque pas comme lu (sauf via re-fetch full).

### 5.8. Résolution de langue (Prisme Linguistique) (criticité : 🟡 MOYENNE)

- `ConversationViewModel.swift:2790-2799` — `preferredTranslation` retourne `nil` si pas de traduction → UI affiche original ✅ conforme à CLAUDE.md.
- ❌ Mais **`resolveUserLanguage()` du SDK absent** (selon CLAUDE.md ligne 38, la source de vérité gateway est `packages/shared/utils/conversation-helpers.ts` ; iOS est censé avoir un pendant). L'app a sa propre heuristique `preferredLanguages` — risque de divergence avec le backend.

---

## 6. Build, déploiement & infrastructure

### 6.1. Gestion du projet Xcode (criticité : 🔴 ÉLEVÉE)

**20 scripts Ruby** modifient `project.pbxproj` à la main :
```
apps/ios/add_bubble_files.rb · add_bubble_files_v2.rb · add_bubble_files_v3.rb
apps/ios/add_new_files.rb · add_missing_files.rb · add_missing_to_build.rb · add_missing_models.rb
apps/ios/add_onboarding_files.rb · add_onboarding_coordinator.rb · add_extension_targets.rb
apps/ios/add_design_system_files.rb · add_transcription_files.rb
apps/ios/fix_stale_refs.rb · fix_file_refs.rb · fix_project_refs.rb · fix_bubble_files.rb
apps/ios/remove_target_language_resolver.rb · remove_ml_models.rb · check_group_path.rb
```

**ET** `apps/ios/project.yml` (XcodeGen) coexiste : **deux sources de vérité** concurrentes. Chaque merge sur le `.pbxproj` risque conflit/corruption ; le nombre de scripts révèle la fragilité du process.

### 6.2. Build script `meeshy.sh` (criticité : 🟡 MOYENNE)

1 440 lignes, bien organisé (signing fallback pour devices physiques, three-level clean), mais :
- Polling avec timeouts hardcodés (`meeshy.sh:409-450` — jusqu'à 50 min de wait).
- `strip_entitlements()` (`meeshy.sh:189-219`) fait backup `.bak` puis restore — **non thread-safe** : deux instances concurrentes du script corrompraient les entitlements.
- Chemin clé ASC hardcodé `meeshy.sh:741` → `fastlane/AuthKey_5542B6LVNL.p8` (risque de commit accidentel).

### 6.3. CI/CD & Fastlane (criticité : 🔴 ÉLEVÉE)

- ✅ `fastlane match` (signing via Git encrypted).
- ✅ Versioning auto sur lanes `beta` (`Fastfile:137-139`) et `release` (`Fastfile:169-171`).
- ❌ **Secrets commités** : [CORRIGÉ] identifiants de démo App Store retirés du code source.
- ❌ **API Key defaults inline** : `Fastfile:13-19` → `key_id: ENV["ASC_KEY_ID"] || "5542B6LVNL"`, `issuer_id: ... || "69a6de89-..."`. Si l'ENV n'est pas set, l'app utilise des IDs commitées.
- ❌ **Tests skip en release** : `.github/workflows/ios-release.yml` passe `skip_tests:true` (ligne 89) à Fastlane → **aucune exécution de tests sur le pipeline de release**. Un workflow `ios-tests.yml` séparé existe mais peut diverger.

### 6.4. Dépendances (criticité : 🟡 MOYENNE)

- ✅ SPM pur, pas de mélange CocoaPods.
- ✅ Firebase 12.12.1, WebRTC 141 (M141), WhisperKit 0.9.0.
- ⚠️ Socket.IO 16.1.0 (la 17.x est sortie).
- ⚠️ ONNX Runtime documenté comme « manual integration via CocoaPods » → si ajouté, casse la pureté SPM.

### 6.5. Configurations xcconfig (criticité : 🟠 MOYENNE)

- `apps/ios/Configuration/Production.xcconfig` : `API_BASE_URL = https:/$()/gate.meeshy.me` — **syntaxe `$()/` douteuse** (probable workaround xcconfig pour `//`, à valider).
- `Staging.xcconfig` existe mais non référencé dans `project.yml` ni `meeshy.sh` → probablement orphelin.

### 6.6. Targets & extensions (criticité : 🟡 MOYENNE)

- `project.yml` déclare **3 targets** : `Meeshy`, `MeeshyWidgets`, `MeeshyNotificationExtension`.
- **MeeshyContextMenu, MeeshyIntents, MeeshyShareExtension** présents en arborescence (`apps/ios/MeeshyShareExtension/`, etc.) mais **absents du `project.yml`** → potentiellement non-buildés ou pilotés exclusivement par les scripts Ruby. À clarifier.

### 6.7. Privacy & App Store readiness (criticité : 🟢 BON)

- ✅ `PrivacyInfo.xcprivacy` complet (UserID, Email, Phone, Photos, Audio, Contacts, Location, NSPrivacyTracking=false, APIs déclarées).
- ✅ `ITSAppUsesNonExemptEncryption=false` cohérent (Info.plist:52).
- ✅ dSYM upload auto via Crashlytics SPM plugin.

### 6.8. WebRTC Stubs ambigu (criticité : 🟡 MOYENNE)

`apps/ios/WebRTCStubs.swift` à la racine — coexiste avec `WebRTC 141` réellement intégré. Présence d'un fichier « Stubs » à la racine d'apps/ios suggère un héritage de la phase d'intégration ou un fallback non documenté. À auditer pour éviter de shipper du code mort.

### 6.9. Documentation chaotique (criticité : 🟡 MOYENNE)

20+ `.md` à la racine `apps/ios/` (`APP_STORE_SUBMISSION_GUIDE_FINAL.md`, `PROJECT_COMPLETE.md`, `MASTER_ACTION_PLAN.md`, `LAUNCH_SUCCESS.md`, `PRODUCTION_READINESS_REPORT.md`, `EXPERT_ANALYSIS_AND_RECOMMENDATION.md`, etc.) → **snapshots d'itérations, pas de docs vivantes**. Indique un cycle de planification verbeux mais sans single source of truth.

### 6.10. Permissions Info.plist (criticité : 🟡 MOYENNE)

Background mode `bluetooth-peripheral` (Info.plist:104-110) sans justification métier évidente — risque de rejet App Store. `aps-environment` hardcodé à `development` dans `Meeshy.entitlements` → manipulation au moment du build via `meeshy.sh` (fragile, préférer xcconfig).

---

## 7. Plan de remédiation prioritaire

### 🔴 Critique (à traiter dans la semaine)

1. **Rotation immédiate des credentials de démo App Store** + suppression de `Fastfile:189-191` au profit de secrets CI.
2. **Migration du VoIP token vers Keychain** (`VoIPPushManager.swift:303-326`).
3. **Vérifier la présence d'`UNUserNotificationCenter.requestAuthorization` + `registerForRemoteNotifications`** → sans ça, zéro push reçu en prod.
4. **Public key pinning** sur `APIClient` (en plus de la validation cert).
5. **Suppression de `fatalError` en production** dans `DependencyContainer.swift:39` → recovery + UI dégradée.

### 🟠 Élevée (dans le mois)

6. **Découpage de `ConversationViewModel.swift` (3 028 lignes)** en 5 ViewModels orientés use-case (Messages, Sending, Translation, Presence, Reactions) + grouper les 42 `@Published` en `struct ConversationUIState`.
7. **Suppression des appels `APIClient.shared` depuis les Views** (NewConversationView, SharePickerView, ThreadView, StoryViewerView) → encapsuler dans ViewModels respectifs avec cache-first.
8. **Élimination des scripts Ruby `add_*.rb` / `fix_*.rb`** → tout passe par `xcodegen generate` ; CI check de cohérence du `.pbxproj`.
9. **Coalescing des `loadOlder/Newer`** dans `FeedViewModel` et `ConversationViewModel` (Set d'IDs en vol).
10. **Buffer de replay socket** : queue locale persistée + flush post-reconnect.
11. **Re-auth socket mid-session** : handler `auth:refresh-required`.
12. **Suppression des `Locale.current`** pour résolution de contenu (4 sites identifiés).
13. **Audit accessibilité** : `.accessibilityLabel` sur toutes les bubbles, boutons, images ; remplacer `.font(.system(size:))` par fonts sémantiques.

### 🟡 Moyenne (dans le trimestre)

14. **Tokens de design** (`MeeshyColors`, `MeeshySpacing`, `MeeshyTypography`) → remplacer 1 213 `Color(hex:)` hardcodés.
15. **Localisation des Texts résiduels** (Contacts, Blocked, Onboarding).
16. **`NavigationView` → `NavigationStack`** (3 fichiers).
17. **Biometric auth** (LAContext) pour actions sensibles (delete, export, unblock).
18. **`BGTaskScheduler`** pour refresh périodique des conversations.
19. **Pagination cursor-safe** dans `ConversationSyncEngine` (le SDK définit déjà `CursorPagination`).
20. **`NavigationSplitView`** pour expérience iPad.
21. **Live Activities / Dynamic Island** pour calls et typing.
22. **Migration `DispatchQueue.main` → `@MainActor`** (302 sites).
23. **`try?` → `try` avec gestion explicite** (407 sites prioriser ceux dans Views).
24. **Couverture de tests** : ViewModels critiques (`ConversationViewModel`, `FeedViewModel`, `CallManager`) avec mocks via protocoles `*Providing`.

### 🟢 Basse (backlog)

25. **Jailbreak detection** légère.
26. **Anti-tampering** (intégrité binaire au démarrage).
27. **Multi-device sync** via socket event `sync:invalidate-cache`.
28. **Documentation vivante** : remplacer les 20 `.md` snapshot par une seule `apps/ios/ARCHITECTURE.md` à jour.

---

## Annexe — méthodologie

Analyse menée par 6 agents Explore en parallèle (Sonnet/Opus), chacun avec un périmètre dédié :

1. Architecture & qualité (couplage, MVVM, god classes, tests, CLAUDE.md compliance)
2. Sécurité (Keychain, TLS, crypto, biométrie, deeplinks, Info.plist, secrets repo)
3. Performance (cache, listes, mémoire, audio, background tasks, state explosion)
4. UI/UX (design system, accessibilité, localisation, navigation, A11Y)
5. Networking (APIClient, Socket.IO, sync engine, push, share extension, multi-device)
6. Build & infra (XcodeGen vs Ruby, Fastlane, CI, dépendances, entitlements, privacy)

Toutes les références sont au format `chemin:ligne` issu de `grep`/`wc -l`/lecture directe. **Aucune extrapolation** : si une faiblesse n'a pu être prouvée par le code, elle est marquée « à valider » ou exclue.

**Métriques principales recensées** :
- 1 086 fichiers Swift (309 app + 777 SDK)
- 1 805 références à `.shared`
- 822 violations de gestion d'erreur (`try?` + `fatalError` + `print()`)
- 407 `try?` (apps/ios uniquement)
- 302 `DispatchQueue.main` (Swift 6 era)
- 1 213 `Color(hex:)` / colors hardcodés
- 20 scripts Ruby touchant `project.pbxproj`
- 15 fichiers > 1 200 lignes (top : 3 028 lignes)
