# UserSession Migration — Design

**Date** : 2026-05-26
**Status** : Approved (design phase)
**Worktree (recommended)** : `.claude/worktrees/feat+user-session-migration`
**Owner** : Architecte logiciel
**Related** :
- Audit `@Published` (2026-05-26) — inventaire des 47 singletons + 13 stores user-scoped sans isolation
- `apps/ios/decisions.md` — MVVM + singletons (sera amendé par cette spec)
- MEMORY `project_conversation_vm_split_staged_2026_05_24` — refonte parallèle des handlers CVM
- MEMORY `feedback_check_existing_work_before_implementing` — git log avant chaque phase
- `packages/MeeshySDK/CLAUDE.md` — règle de pureté SDK

---

## 1. Contexte et objectif

### 1.1 Problème

L'audit `@Published` du 2026-05-26 a identifié **13 singletons SDK + 5 singletons app qui détiennent du state user-scoped en `@Published`**, sans isolation de session. Les conséquences mesurées :

- **Privacy** : APNS device token, blocklist, prefs, presence map, notifications unread — tous survivent à `AuthManager.logout()` et peuvent fuiter vers une session B sur le même device
- **Race conditions** : `logout()` lance un `Task { await reset… }` non-attendu (`AuthManager.swift:386`) ; l'UI bascule vers Login avant que le reset soit terminé
- **Dette structurelle** : chaque nouveau service user-scoped ajoute un `reset()` à maintenir manuellement ; pas de garantie au compile-time
- **Cross-instance pollution** : `ConversationAudioCoordinator.shared` est unique au process mais joue de l'audio pour la conversation courante d'un user ; après logout+login rapide, son callback `onAttachmentFinished` continue de pointer vers l'ancienne CVM

### 1.2 Objectif

Introduire un objet **`UserSession`** qui détient TOUS les services et state user-scoped. Le logout devient `currentSession = nil` ; ARC garantit la libération en cascade. **Pattern industriel adopté par Signal, Telegram-iOS, Slack, Discord, Instagram.**

### 1.3 Contraintes

- **Pré-launch** : pas de back-compat utilisateurs, schema migration franche possible (cf. CLAUDE.md "since app is pre-launch")
- **iOS 16+ target** maintenu (pas d'`@Observable` iOS 17+)
- **Refonte parallèle CVM** en cours (split staged) : ne pas créer de conflit large-diff sur les handlers
- **Extensions iOS** (NSE, Widget, VoIPPush, ShareExtension) tournent dans des process séparés et **ne peuvent pas détenir une `UserSession`** SwiftUI ; nécessite un pattern `SessionSnapshot` léger en Keychain App Group
- **Sockets** : un seul WebSocket par device aujourd'hui (`MessageSocketManager.shared`) ; nouveau contrat = un socket par session
- **Compatibilité ascendante temporaire** : pendant la migration, certains services restent accessibles via `.shared` ; doivent rediriger vers `AuthManager.shared.currentSession?.xxx`

### 1.4 Non-goals

- **PAS** de migration vers `@Observable` (iOS 17+) — chantier distinct
- **PAS** de migration MessageStore vers `ValueObservation` GRDB pure — chantier distinct
- **PAS** de refonte CallKit (CallManager reste process-wide singleton — special case justifié §2)
- **PAS** de multi-account natif simultané (un seul UserSession actif à la fois pour V1 — switch nécessite logout intermédiaire ; multi-account = V2)

---

## 2. Décisions architecturales

| # | Décision | Justification |
|---|---|---|
| **D-1** | `UserSession` est un `@MainActor final class : ObservableObject` détenu par `AuthManager.currentSession: UserSession?` | Une seule source de vérité pour "qui est connecté". `@Published` sur `currentSession` permet aux Views de switcher Login↔App via observation native SwiftUI. |
| **D-2** | `currentSession = nil` libère TOUS les services user-scoped via ARC | Logout = O(1) côté code, garantie compile-time. Aucun `reset()` à maintenir. |
| **D-3** | Les services user-scoped deviennent **non-singletons** instanciés par `UserSession.init()` | Couplage explicite. Aucune `.shared` user-scoped possible après migration. |
| **D-4** | Les services **process-wide** restent singletons mais chacun expose un hook de cleanup au logout. Liste : `NetworkMonitor` (no-op), `CallManager` (gate D-5), `VoIPPushManager` (no-op), `APIClient` (`authToken = nil`), `ThemeManager` (no-op), `MediaSessionCoordinator` (no-op), `LinkPreviewStore` (`wipeDisk()` — voir Q2), `ToastManager` (`clearAll()` — voir Q1), `DependencyContainer` (no-op global, mais `retryEngine.stop()` — voir D-13), `RetryEngine` (quiesce avant purge outbox) | Ces resources sont device-bound ou cross-session par nature. Les hooks de cleanup garantissent qu'aucune donnée user-bound transitoire ne fuit. |
| **D-5** | `CallManager.shared` reste singleton mais **gate sur `authManager.currentSession`** avant tout state mutation | Les appels VoIP entrants peuvent arriver avant que la session ne soit construite. Le CallManager doit pouvoir afficher CallKit (5s SLA Apple) mais drop le call si pas de session valide. |
| **D-6** | `AuthManager.logout()` devient `async` et **attend** `await currentSession?.disconnect()` avant `currentSession = nil` | Élimine la race "UI bascule avant fin du reset". Le SLA UI accepte un spinner 200-500ms (cf. WhatsApp pattern). |
| **D-7** | Extensions iOS lisent un `SessionSnapshot` chiffré en Keychain App Group | Process séparés, pas d'accès UserSession. Le snapshot porte `userId + authToken + lastSocketCursor + e2eeKeyHandle`. Wipe synchrone du snapshot AU TOUT DÉBUT de `logout()`. |
| **D-8** | Migration progressive : pendant phase de transition, `.shared` des services migrés **redirige** vers `AuthManager.shared.currentSession?.xxx ?? FallbackEmpty()` | Permet d'éviter un PR de 80 fichiers monolithique. Compatibilité temporaire pendant ~3-5 PRs intermédiaires. |
| **D-9** | Pattern ViewModel inchangé : `init(session: UserSession, ...)` injection explicite | Conforme CLAUDE.md ("ViewModels accept dependencies via init injection"). Substitue `BlockService.shared` par `session.blockService`. |
| **D-10** | Sockets per-session : `userSession.messageSocket` et `userSession.socialSocket` | Disconnect au `UserSession.disconnect()` ; nouveau socket au login B. 1-2s de "blank" toléré au rapid-switch (opération <1% du trafic). |
| **D-11** | `E2EEService` et `E2ESessionManager` migrent dans `UserSession` (clés cryptographiques wipe garanti) | Privacy P0. Les clés Signal Protocol ne doivent JAMAIS survivre au logout. |
| **D-12** | Sortie d'erreur compile-time pour les `.shared` user-scoped restants | Après migration, marquer les anciennes `.shared` `@available(*, unavailable)` pour qu'un nouvel ajout ne puisse pas réintroduire le pattern. |
| **D-13** | **RetryEngine** (dans `DependencyContainer.shared.retryEngine`) reste process-wide, MAIS doit être quiesce avant la purge outbox au logout. Sans ça, race entre flush de la queue et delete des rows. | Le RetryEngine est process-wide (le DB pool est process-wide). Mais l'outbox est par-user. Au logout : 1) `retryEngine.stop()` — bloque jusqu'à fin du flush en cours, 2) `messagePersistence.deleteOutboxRows(userId:)` — purge atomique, 3) `retryEngine.start()` au prochain login. |
| **D-14** | **Pas de méthode `.shared` qui résolve dynamiquement vers `currentSession`** (anti-pattern V2-bloquant). Toute API publique nécessite injection explicite ou est device-wide. | Q5 — convention V2-ready. Si demain on bascule en multi-account, un `.shared.xxx` qui retourne "la session courante" devient ambigu (laquelle ?). On exige init injection dès V1. |
| **D-15** | **SessionSnapshot versionné** : champ `version: Int = 1` dans le snapshot Keychain App Group. | Q5 — convention V2-ready. Permet cohabitation V1 (1 snapshot) et V2 (N snapshots) sur même device sans casse. Migration de schema transparente. |

---

## 3. Architecture

### 3.1 Modèle objet

```
┌─────────────────────────────────────────────────────────────┐
│ Process-wide singletons (D-4)                               │
│ - NetworkMonitor.shared                                     │
│ - CallManager.shared (gated by currentSession, D-5)         │
│ - VoIPPushManager.shared                                    │
│ - APIClient.shared                                          │
│ - DependencyContainer.shared (GRDB pool, persistence actors)│
│ - ThemeManager.shared                                       │
│ - MediaSessionCoordinator.shared                            │
│ - ToastManager.shared (UI transient)                        │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ owns
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ AuthManager.shared (@MainActor, singleton)                  │
│ - @Published var currentSession: UserSession?               │
│ - func login() async    → constructs UserSession            │
│ - func logout() async   → awaits session.disconnect()       │
│ - func switchUser()     → logout + login chaîne            │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ owns (nullable)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ UserSession (@MainActor, ObservableObject)                  │
│ Ownership: AuthManager.currentSession (strong, nullable)    │
│                                                             │
│ User identity                                               │
│   let userId: String                                        │
│   let authToken: String (rotates via tokenDidRotate)        │
│   @Published var user: MeeshyUser                           │
│                                                             │
│ Sockets (D-10)                                              │
│   let messageSocket: MessageSocketManager                   │
│   let socialSocket: SocialSocketManager                     │
│                                                             │
│ Data services                                               │
│   let blockService: BlockService                            │
│   let friendshipCache: FriendshipCache                      │
│   let preferences: UserPreferencesManager                   │
│   let presenceManager: PresenceManager                      │
│                                                             │
│ Notifications                                               │
│   let notificationCoordinator: NotificationCoordinator      │
│   let notificationManager: NotificationManager              │
│   let pushManager: PushNotificationManager                  │
│                                                             │
│ Encryption (D-11)                                           │
│   let e2eeService: E2EEService                              │
│   let e2eeSessionManager: E2ESessionManager                 │
│                                                             │
│ Audio                                                       │
│   let conversationAudio: ConversationAudioCoordinator       │
│   let audioPlayer: AudioPlayerManager                       │
│                                                             │
│ Stores                                                      │
│   let messageStore: MessageStore                            │
│   let feedStore: FeedStore                                  │
│   let starredMessages: StarredMessagesStore                 │
│   let editHistory: EditHistoryStore                         │
│                                                             │
│ Lifecycle                                                   │
│   func disconnect() async   → sockets close + flush         │
│   deinit                    → no async work allowed (sync)  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Cycle de vie d'une session

```
T0  AppDelegate.didFinishLaunching
        ↓
T1  AuthManager.checkExistingSession() async
        ↓ Keychain hit
T2  AuthManager.currentSession = UserSession(userId, authToken)
        ↓ ARC retain
T3  Sockets opens, services hydrate from disk cache
        ↓
T4  RootView observes currentSession via @Published
        ↓
T5  RootView renders MainTabView(session: currentSession)
        ↓ user interacts...
        ↓
Tn  user taps Logout
        ↓
Tn+1 RootView shows blocking spinner "Déconnexion en cours…"
        ↓
Tn+2 await AuthManager.logout() :
        ├── E2EE keys wipe (synchronous, sub-100ms)
        ├── Keychain SessionSnapshot delete (D-7)
        ├── await currentSession.disconnect()
        │     ├── messageSocket.disconnect()
        │     ├── socialSocket.disconnect()
        │     ├── conversationAudio.close()
        │     ├── presenceManager.stop()
        │     └── pendingOutbox.cancel()
        ├── currentSession = nil → ARC purge tout en cascade
        └── isAuthenticated = false (en dernier, déclenche router)
        ↓
Tn+3 RootView observes isAuthenticated=false → LoginView
```

### 3.3 Pattern d'injection ViewModel (D-9)

**Avant** (statu quo) :
```swift
@MainActor
class ConversationListViewModel: ObservableObject {
    private let blockService = BlockService.shared
    private let messageSocket = MessageSocketManager.shared

    init() { /* ... */ }
}
```

**Après** (migré) :
```swift
@MainActor
class ConversationListViewModel: ObservableObject {
    private let session: UserSession
    private var blockService: BlockService { session.blockService }
    private var messageSocket: MessageSocketManager { session.messageSocket }

    init(session: UserSession, ...) {
        self.session = session
        // ...
    }
}
```

**Création depuis View** :
```swift
struct ConversationListView: View {
    @EnvironmentObject var session: UserSession
    @StateObject private var vm: ConversationListViewModel

    init(session: UserSession) {
        // @StateObject init pattern Apple — créé une seule fois
        _vm = StateObject(wrappedValue: ConversationListViewModel(session: session))
    }

    var body: some View { /* ... */ }
}

// Parent qui a la session :
struct RootView: View {
    @EnvironmentObject var session: UserSession

    var body: some View {
        ConversationListView(session: session)
    }
}
```

### 3.4 SessionSnapshot — pattern extensions iOS (D-7)

```swift
public struct SessionSnapshot: Codable, Sendable {
    public let userId: String
    public let authToken: String
    public let tokenExpiresAt: Date
    public let e2eeKeyHandle: String        // identifiant du Keychain entry
    public let lastSocketCursor: String?     // pour resume Socket.IO côté NSE
    public let userDisplayName: String       // pour push notification preview
    public let preferredContentLanguages: [String]
}

// SDK
public enum SessionSnapshotStore {
    static let keychainKey = "me.meeshy.session.snapshot.v1"
    static let appGroupSuite = "group.me.meeshy.apps"

    public static func write(_ snapshot: SessionSnapshot) throws { /* Keychain App Group */ }
    public static func read() -> SessionSnapshot? { /* … */ }
    public static func wipe() { /* synchronous */ }
}

// Extension iOS (NSE, Widget) :
guard let snapshot = SessionSnapshotStore.read() else {
    // No session — no-op, ne pas afficher de notification
    return
}
// Construct EphemeralSession minimal (API client + decoder only)
let ephemeral = EphemeralSession(snapshot: snapshot)
// Use ephemeral.decode(payload) etc.
```

**Invariant** : `SessionSnapshotStore.wipe()` est la **toute première opération** de `AuthManager.logout()`. Si l'app crash entre `wipe()` et la fin du logout, le pire scénario est une session app principale qui apparaît authentifiée au redémarrage mais sans snapshot pour les extensions — détectable au boot et résolu par un `checkExistingSession()` qui reconstruit le snapshot ou force un re-login.

---

## 4. Contrats d'interface

### 4.1 UserSession (SDK)

```swift
// packages/MeeshySDK/Sources/MeeshySDK/Auth/UserSession.swift

@MainActor
public final class UserSession: ObservableObject {
    public let userId: String
    public let createdAt: Date

    @Published public private(set) var authToken: String
    @Published public private(set) var user: MeeshyUser

    // Services — let pour interdire le remplacement, instanciés en init
    public let messageSocket: MessageSocketManager
    public let socialSocket: SocialSocketManager
    public let blockService: BlockService
    public let friendshipCache: FriendshipCache
    public let preferences: UserPreferencesManager
    public let presenceManager: PresenceManager
    public let notificationCoordinator: NotificationCoordinator
    public let notificationManager: NotificationManager
    public let pushManager: PushNotificationManager
    public let e2eeService: E2EEService
    public let e2eeSessionManager: E2ESessionManager
    public let conversationAudio: ConversationAudioCoordinator
    public let audioPlayer: AudioPlayerManager
    public let messageStore: MessageStore
    public let feedStore: FeedStore
    public let starredMessages: StarredMessagesStore
    public let editHistory: EditHistoryStore

    public init(
        userId: String,
        authToken: String,
        user: MeeshyUser,
        dependencyContainer: DependencyContainer = .shared,
        apiClient: APIClient = .shared
    ) {
        self.userId = userId
        self.authToken = authToken
        self.user = user
        self.createdAt = Date()

        // Order matters: sockets last to avoid event delivery to half-built services
        self.preferences = UserPreferencesManager(userId: userId)
        self.blockService = BlockService(userId: userId, api: apiClient)
        self.friendshipCache = FriendshipCache(userId: userId)
        self.e2eeService = E2EEService(userId: userId)
        self.e2eeSessionManager = E2ESessionManager(userId: userId, e2ee: e2eeService)
        self.notificationCoordinator = NotificationCoordinator(userId: userId)
        self.notificationManager = NotificationManager(coordinator: notificationCoordinator)
        self.pushManager = PushNotificationManager(userId: userId)
        self.presenceManager = PresenceManager(userId: userId)
        self.audioPlayer = AudioPlayerManager()
        self.conversationAudio = ConversationAudioCoordinator(audioPlayer: audioPlayer)
        self.starredMessages = StarredMessagesStore(userId: userId, dbPool: dependencyContainer.dbPool)
        self.editHistory = EditHistoryStore(userId: userId, dbPool: dependencyContainer.dbPool)
        self.messageStore = MessageStore(persistence: dependencyContainer.messagePersistence, userId: userId)
        self.feedStore = FeedStore(persistence: dependencyContainer.feedPersistence, userId: userId)

        // Sockets last
        self.messageSocket = MessageSocketManager(userId: userId, authToken: authToken)
        self.socialSocket = SocialSocketManager(userId: userId, authToken: authToken)
    }

    /// Quiesce ordering :
    /// 1. Stop accepting new mutations (sockets)
    /// 2. Drain in-flight operations (outbox, presence ping)
    /// 3. Close persistent connections
    /// Caller MUST await this before dropping the session reference.
    public func disconnect() async {
        messageSocket.disconnect()
        socialSocket.disconnect()
        await presenceManager.stop()
        await conversationAudio.close()
        // ARC handles the rest when the strong ref is dropped
    }

    /// Called by AuthManager when the gateway rotates the JWT for the
    /// SAME userId. Re-arms sockets without tearing down the session.
    public func applyRotatedToken(_ newToken: String) async {
        self.authToken = newToken
        await messageSocket.forceReconnect(with: newToken)
        await socialSocket.forceReconnect(with: newToken)
    }
}
```

### 4.2 AuthManager modifications

```swift
@MainActor
public final class AuthManager: ObservableObject {
    public static let shared = AuthManager()

    @Published public private(set) var currentSession: UserSession?
    @Published public var isAuthenticated = false  // derived from currentSession != nil
    // ... (autres @Published existants conservés)

    /// New: async logout with quiesce-before-purge.
    public func logout() async {
        guard let session = currentSession else {
            isAuthenticated = false
            return
        }

        // D-7: wipe the cross-process snapshot FIRST so extensions
        // can't pick up the soon-to-be-stale credentials.
        SessionSnapshotStore.wipe()

        // Server logout (best-effort, doesn't block)
        Task { await self.performServerLogoutWithRetries(token: session.authToken) }

        // Quiesce + drain
        await session.disconnect()

        // Wipe local credentials
        keychain.delete(forKey: tokenKey(for: session.userId), account: nil)
        keychain.delete(forKey: sessionTokenKey(for: session.userId), account: nil)
        keychain.delete(forKey: userKey(for: session.userId), account: nil)
        removeFromSavedAccounts(userId: session.userId)

        APIClient.shared.authToken = nil

        // Drop the session — ARC purges all user-scoped services
        currentSession = nil
        currentUser = nil
        isAuthenticated = false
    }

    public func login(username: String, password: String) async {
        // ... existing login logic ...
        // On success:
        let session = UserSession(userId: ..., authToken: ..., user: ...)
        try? SessionSnapshotStore.write(SessionSnapshot(...))
        self.currentSession = session
        self.currentUser = session.user
        self.isAuthenticated = true
    }
}
```

### 4.3 CallManager gate (D-5)

```swift
extension CallManager {
    private func acceptIncomingCall(uuid: UUID, payload: CallPayload) async {
        guard AuthManager.shared.currentSession != nil else {
            // Pas de session valide — drop le call et notifier CallKit
            cxProvider.reportCall(with: uuid, endedAt: Date(), reason: .failed)
            return
        }
        // ... existing flow ...
    }
}
```

---

## 5. Plan de migration — phases

### Phase 0 — Préalables (0.5j, séquentiel)

- **P0.1** Créer la branche `feat/user-session-migration` à partir de `dev`
- **P0.2** Créer `UserSession.swift` skeleton (juste `userId`, `authToken`, `disconnect()` async)
- **P0.3** Ajouter `@Published var currentSession` à AuthManager (sans encore l'utiliser ailleurs)
- **P0.4** Créer `SessionSnapshot.swift` + `SessionSnapshotStore` avec tests Keychain App Group
- **P0.5** Test de leak baseline : `UserSessionMemoryTests.test_disconnect_releasesSession` avec `weak var` + `addTeardownBlock`

**Gate** : tests verts, build Xcode OK avant de continuer.

### Phase 1 — Hotfix S1 privacy (0.5-0.75j, séquentiel, PR séparée)

Indépendant de la migration UserSession — landed avant pour sécuriser la prod.

- **P1.1** `AuthManager.logout()` devient `async` (signature change)
- **P1.2** Ordre **quiesce-then-purge** implémenté :
  1. `SessionSnapshotStore.wipe()` — première opération (D-7, D-15)
  2. `MessageSocketManager.shared.disconnect()` + `SocialSocketManager.shared.disconnect()`
  3. `DependencyContainer.shared.retryEngine.stop()` (D-13)
  4. Purge outbox par userId (Q3)
  5. Méthodes `reset()` sur les 8 singletons SDK
  6. `ToastManager.shared.clearAll()` (Q1) + `LinkPreviewStore.shared.wipeDisk()` (Q2)
  7. Keychain delete + savedAccount remove (existant)
  8. `currentUser = nil` + `isAuthenticated = false` (déclenche router)
- **P1.3** Méthodes `reset()` ajoutées aux 8 singletons SDK manquants :
  - `BlockService.reset()` (nouveau)
  - `UserPreferencesManager.resetSession()` (nouveau — différent de `resetToDefaults` qui touche le disque)
  - `PushNotificationManager.resetSession()` (clearPending + resetBadge ; **ne touche PAS** `isAuthorized` selon §critique du review)
  - `NotificationCoordinator.reset()` — déjà existant l.88, juste appelé
  - `NotificationManager.reset()` — déjà existant l.97, juste appelé
  - `FriendshipCache.clear()` — déjà existant l.360, juste appelé
  - `MessageSocketManager.disconnect()` — existant
  - `SocialSocketManager.disconnect()` — existant
- **P1.4** `SessionSnapshotStore` stub créé (V1 simplifié : juste `wipe()` ; le `write()` complet vient en P6)
- **P1.5** UI inline spinner sur bouton "Se déconnecter" + `.disabled()` pendant l'await (Q6)
- **P1.6** Test `MultiUserSessionLeakTests` (S4.T1 du plan initial)

**Critère de merge** : test de leak passe, hotfix mergé sur `dev`.

### Phase 2 — Stores data purs (1.25j, parallélisable, 1 worktree)

Migration des services à faible couplage UI :

| Service | Source actuelle | Migration |
|---|---|---|
| `BlockService` | `BlockService.shared` (SDK) | Instance dans `UserSession.blockService` |
| `FriendshipCache` | `FriendshipCache.shared` (SDK) | Instance dans `UserSession.friendshipCache` |
| `UserPreferencesManager` | `UserPreferencesManager.shared` (SDK) | Instance dans `UserSession.preferences` |
| `StarredMessagesStore` | `StarredMessagesStore.shared` (app) | Instance dans `UserSession.starredMessages` |
| `EditHistoryStore` | `EditHistoryStore.shared` (app) | Instance dans `UserSession.editHistory` |
| `DraftStore` (Q4) | `DraftStore.shared` (app, UserDefaults non-préfixé — **fuite active**) | Instance dans `UserSession.drafts` avec clés `meeshy_draft_{userId}_{convId}`. Migration data : importer les anciennes clés au premier login post-déploiement |

**Stratégie compatibilité (D-8)** : maintenir les `.shared` qui délèguent à `currentSession` pendant la phase :
```swift
extension BlockService {
    @available(*, deprecated, message: "Use UserSession.blockService")
    public static var shared: BlockService {
        AuthManager.shared.currentSession?.blockService ?? .empty
    }
    static let empty = BlockService(userId: "", api: APIClient.shared)
}
```

**Tests** : chaque service a un test de scoping (création de 2 instances, vérification de non-partage de state).

### Phase 3 — Notifications + Push + E2EE (1j, parallélisable, 1 worktree)

| Service | Migration |
|---|---|
| `NotificationCoordinator` | UserSession.notificationCoordinator |
| `NotificationManager` | UserSession.notificationManager |
| `PushNotificationManager` | UserSession.pushManager |
| `E2EEService` | UserSession.e2eeService — **KEYS WIPE GARANTI** |
| `E2ESessionManager` | UserSession.e2eeSessionManager |
| `PresenceManager` | UserSession.presenceManager |

**Critère privacy** : test `E2EEKeysWipedOnLogoutTests` qui prouve que les clés en RAM sont libérées après `currentSession = nil`.

### Phase 4 — Sockets + Audio (1j, parallélisable, 1 worktree)

| Service | Migration | Note |
|---|---|---|
| `MessageSocketManager` | UserSession.messageSocket | Disconnect au session.disconnect() |
| `SocialSocketManager` | UserSession.socialSocket | Idem |
| `ConversationAudioCoordinator` | UserSession.conversationAudio | Close au session.disconnect() |
| `AudioPlayerManager` (app) | UserSession.audioPlayer | |

**Risque** : `MessageSocketManager` est référencé partout (signal de socket events). Vérifier que le `.shared` deprecated wrapper fonctionne pendant la transition.

### Phase 5 — Stores principaux (1.5j, séquentiel, PR critique)

| Service | Migration | Tests requis |
|---|---|---|
| `MessageStore` | UserSession.messageStore | Tests d'isolation par userId (déjà partiellement présents) |
| `FeedStore` | UserSession.feedStore | Idem |

Ces deux stores sont les plus gros consommateurs ; touchent ConversationViewModel + FeedViewModel + 20+ Views. **PR séparée**, séquentielle.

**Coordination avec CVM split staged** : vérifier sur la branche `feat/conversation-vm-split` (commit 3f4b574) que la migration MessageStore reste compatible. Si conflict, rebase + retest.

### Phase 6 — Extensions iOS (1.5j, parallélisable, 1 worktree)

- **P6.1** Wirer `SessionSnapshotStore.write()` dans le flow login
- **P6.2** NotificationServiceExtension lit le snapshot pour décoder les push
- **P6.3** Widget lit le snapshot pour les unread counts
- **P6.4** VoIPPushManager : pas de changement (déjà process-wide singleton)
- **P6.5** ShareExtension construit une EphemeralSession depuis snapshot

**Tests** : forcer un logout pendant que NSE traite un push entrant → vérifier que NSE no-op silencieusement (pas de notification cross-user).

### Phase 7 — Cleanup + tests d'intégration (1j, séquentiel)

- **P7.1** Marquer les anciennes `.shared` user-scoped `@available(*, unavailable, message: "Use UserSession")` — bloque les nouveaux usages au compile-time (D-12)
- **P7.2** Supprimer le shim `.shared → currentSession?.xxx` (D-8)
- **P7.3** Test d'intégration `MultiUserRapidSwitchTests` :
  - Login A → peuple 15 stores
  - Logout → assert tous les stores libérés (XCTest `addTeardownBlock` + `weak var session: UserSession?`)
  - Login B → assert pas de contamination
- **P7.4** Mettre à jour `apps/ios/decisions.md` avec la décision architecturale
- **P7.5** Mettre à jour `apps/ios/CLAUDE.md` avec le pattern d'injection
- **P7.6** Capturer lessons dans MEMORY

**Critère final** : `./apps/ios/meeshy.sh test` passe (full suite). Instruments Leaks zero retain cycles.

---

## 6. Test strategy — 4 niveaux

### 6.1 Niveau unitaire (par service)

Chaque service migré a un test de scoping :
```swift
func test_blockService_isIsolatedByUserId() {
    let a = BlockService(userId: "userA", api: ...)
    let b = BlockService(userId: "userB", api: ...)
    a.blockedUserIds = ["x"]
    XCTAssertTrue(b.blockedUserIds.isEmpty)
}
```

### 6.2 Niveau UserSession (lifecycle)

```swift
func test_userSession_disconnectQuiescesAllServices() async {
    let session = UserSession(userId: "u1", authToken: "t1", user: stubUser)
    XCTAssertTrue(session.messageSocket.isConnected || /* connecting */)
    await session.disconnect()
    XCTAssertFalse(session.messageSocket.isConnected)
}

func test_userSession_isDeallocatedAfterReferencesDropped() async throws {
    weak var weakSession: UserSession?
    do {
        let session = UserSession(userId: "u1", ...)
        weakSession = session
        await session.disconnect()
    }
    // ARC drop
    try await Task.sleep(nanoseconds: 100_000_000)
    XCTAssertNil(weakSession, "Retain cycle detected")
}
```

### 6.3 Niveau AuthManager (logout flow)

```swift
func test_logout_purgesSessionAndWipesSnapshot() async {
    try await sut.login(username: "a", password: "p")
    let session = sut.currentSession
    weak var weakSession = session
    let _ = session  // silence warning

    await sut.logout()

    XCTAssertNil(sut.currentSession)
    XCTAssertNil(SessionSnapshotStore.read())
    try await Task.sleep(nanoseconds: 200_000_000)
    XCTAssertNil(weakSession)  // ARC purged
}
```

### 6.4 Niveau intégration multi-user

```swift
func test_rapidSwitch_doesNotLeakStateBetweenUsers() async {
    try await sut.login(username: "userA", ...)
    sut.currentSession?.blockService.blockedUserIds = ["target1"]
    sut.currentSession?.notificationManager.unreadCount = 12

    await sut.logout()
    try await sut.login(username: "userB", ...)

    XCTAssertTrue(sut.currentSession?.blockService.blockedUserIds.isEmpty ?? false)
    XCTAssertEqual(sut.currentSession?.notificationManager.unreadCount, 0)
}
```

### 6.5 Niveau race condition

Tests de race :
- Login A → CallKit push entrant → Logout pendant l'appel → Login B → vérifier que CallManager ne route PAS vers B
- Login A → upload story en cours → Logout → vérifier que l'upload échoue (pas posté sous B)
- Login A → message:new arrive sur socket pendant logout → vérifier que MessageStore ne persiste pas

---

## 7. Risques et mitigations

| # | Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | Conflit avec CVM split staged (commit 3f4b574) sur les handlers | Haute | Moyen | Rebase fréquent ; coordonner via worktree (cf. MEMORY parallel-agents-need-worktrees) ; P5 (MessageStore migration) attend que CVM split soit landed |
| **R2** | Race condition pendant logout async (push entrant pendant disconnect) | Moyenne | Haut | Tests §6.5 ; CallManager gate (D-5) ; SessionSnapshotStore.wipe() en premier (D-7) |
| **R3** | Test suite devient flaky pendant migration | Moyenne | Moyen | Strict TDD par phase ; MEMORY `feedback_ios_test_suite_flaky` rappelle de re-run avant assert regression |
| **R4** | Compilation casse en cascade sur 80 fichiers de ViewModels | Haute | Moyen | Shim `.shared` deprecated (D-8) maintenu jusqu'à P7 ; migration par groupe ViewModel (5-10 fichiers par PR) |
| **R5** | Extensions iOS NSE/Widget cassent au déploiement (snapshot mal écrit) | Faible | Haut | Tests P6 spécifiques ; fallback NSE = no-op silencieux si snapshot absent |
| **R6** | Memory leak résiduel non détecté (retain cycle via closure) | Moyenne | Moyen | Tests §6.2 (`weakSession` après dispose) ; Instruments Leaks profile à chaque phase |
| **R7** | Performance dégradation au cold-start (UserSession init plus lourd) | Faible | Moyen | Benchmark avant/après ; init UserSession doit rester <100ms |
| **R8** | `@StateObject init` ne reçoit pas la session correctement (pattern §3.3) | Moyenne | Moyen | Pattern testé en P0.2 sur 1 View pilote ; validé avant de scale |

---

## 8. Alternatives considérées (et rejetées)

### Alt-1 — Protocol `SessionResettable` + registry (plan initial S3)

```swift
protocol SessionResettable { func resetSessionState() async }
AuthManager.registerSessionResettable(MyService.shared)
```

**Rejeté** car :
- Maintient les singletons mutables → ne résout pas la cause racine
- Pas de garantie compile-time qu'un nouveau service sera enregistré
- Ordre de reset non déterministe sans protocole de priorité
- Pattern Slack 2018-2020 qui a forcé refonte
- Coût marginal vs UserSession : ~4j gagnés vs 5-7j d'UserSession, mais dette qui grossit linéairement

### Alt-2 — Migration vers `@Observable` (iOS 17+) avant UserSession

**Rejeté** car :
- iOS 16 target maintenu (CLAUDE.md)
- Résout les re-render storms mais PAS la cross-instance pollution
- Chantier orthogonal — peut venir après UserSession

### Alt-3 — DB-only state (ValueObservation GRDB)

**Rejeté pour V1** car :
- Refonte massive (~3 semaines)
- Touche le contrat entre ViewModels et persistence
- Mieux comme chantier P2 après UserSession stabilisé
- Compatible avec UserSession (les stores deviennent des thin wrappers sur ValueObservation)

### Alt-4 — Multi-account simultané (Telegram pattern)

**Rejeté pour V1** car :
- UI/UX non spec'ée
- Quadruple la surface (sockets parallèles, CallKit conflict, push routing complexe)
- UserSession V1 est conçue pour évoluer vers multi-account V2 : changer `currentSession: UserSession?` en `sessions: [UserId: UserSession]` + `activeSessionId: UserId?`

---

## 9. Métriques de succès

### 9.1 Quantitatives

- **0 singleton user-scoped** post-migration (audit grep `static let shared` filtré sur les services migrés doit retourner 0)
- **0 retain cycle** détecté par Instruments Leaks après logout
- **Logout < 800ms** wall-clock sur iPhone 13 (vs ~50ms aujourd'hui mais avec fuite)
- **Session init < 100ms** sur cold start
- **100% des tests `MultiUserSessionLeakTests` verts**
- **Bundle binary size** : delta ±2% acceptable

### 9.2 Qualitatives

- Un nouveau dev ajoutant un service user-scoped DOIT le déclarer dans `UserSession` — pas d'autre chemin valide
- Le code `currentSession?.xxx` rend explicite que le service requiert un user authentifié
- Crash reports doivent montrer une baisse des "post-logout @Published mutation" exceptions

### 9.3 Critères No-go (rollback)

- Crash rate > +0.1% post-déploiement → rollback
- Logout > 2s p95 sur device cible → rollback
- Test suite flake rate > +5% → bloquer merge

---

## 10. Décisions actées sur questions ouvertes (2026-05-26)

Analyse détaillée pros/cons disponible dans la conversation d'architecte (2026-05-26). Décisions actées :

| # | Question | Décision | Justification clé |
|---|---|---|---|
| **Q1** | `ToastManager` lifecycle | **Singleton process-wide + `clearAll()` au logout (D-4)** | Toasts transitoires <6s, pas de data persistante. Aligné Slack/WhatsApp pattern. |
| **Q2** | `LinkPreviewStore` lifecycle | **Singleton process-wide + `wipeDisk()` au logout (D-4)** | Privacy équivalente à per-session avec moins de complexité. Cache hit en session, miss au switch user (rare). |
| **Q3** | Outbox table au logout | **Drop par userId + `RetryEngine.stop()` AVANT purge (D-13)** | Safe par construction. Pattern Signal. Évite race entre flush et delete. |
| **Q4** | `DraftStore` scope | **Per-user dans `UserSession.drafts`** (clés UserDefaults `meeshy_draft_{userId}_{convId}`) | Bug privacy actif aujourd'hui (DraftStore.swift:76 = UserDefaults standard sans prefixage). Fix obligatoire. |
| **Q5** | Multi-account V2 roadmap | **Single-user V1, design V2-ready (D-14, D-15)** | Meeshy plus proche WhatsApp/Signal que Telegram/Slack. Multi-account = mois de dev backend + CallKit complexity. Pattern V2-ready = pas de `.shared → currentSession`, snapshot versionné. |
| **Q6** | UI logout async | **Inline spinner sur bouton + `.disabled()`** | Logout p50 ~300ms / p95 ~800ms. Spinner full-screen trop lourd, toast non-bloquant ne prévient pas double-tap. Si p95 > 1.5s en prod → escalader vers spinner full-screen. |

### Impact iOS 16 vérifié

Toutes les décisions Q1-Q6 utilisent des APIs disponibles depuis iOS 14-15 (`ProgressView`, `.disabled`, Combine, FileManager, UserDefaults App Group, Keychain). **Zéro dépendance à `@Observable` (iOS 17+) ou SwiftData (iOS 17+).** Compatible iOS 16 cible projet.

### Conventions V2-ready (Q5 — à appliquer dès V1)

1. **Aucune méthode `.shared.xxx` qui résolve dynamiquement vers `currentSession`** (D-14). Toute API publique = init injection explicite ou device-wide.
2. **`SessionSnapshot` porte `version: Int = 1`** (D-15) pour cohabitation future V1↔V2.
3. **Logs et crash reports taggés `userId`** pour filtrabilité post-V2.
4. **API contracts qui prennent `userId`** en paramètre explicite (au lieu de "user courant implicite") quand un service expose une méthode publique.

---

## 11. Estimation finale

| Phase | Durée | Parallélisable |
|---|---|---|
| P0 Préalables | 0.5j | Non |
| P1 Hotfix privacy (PR séparée) | 0.5j | Non |
| P2 Data stores | 1j | Oui (worktree 1) |
| P3 Notifications + E2EE | 1j | Oui (worktree 2) |
| P4 Sockets + Audio | 1j | Oui (worktree 3) |
| P5 Stores principaux | 1.5j | Non (PR critique) |
| P6 Extensions iOS | 1.5j | Oui (worktree 4) |
| P7 Cleanup + intégration | 1j | Non |
| **Total séquentiel** | **8j** | |
| **Total wall-clock (parallèle)** | **~5j** | dont 3-4j parallélisables |

---

## 12. Décision finale

Ce design est approuvé pour exécution. **Ordre** :

1. **P1 hotfix landed** d'abord sur `dev` (cf. plan initial S1 modifié pour async logout)
2. **P0 démarré en parallèle** dès que P1 est en review
3. **P2/P3/P4 en parallèle** via worktrees dès que P0 mergé
4. **P5 séquentiel** après P2/P3/P4 et après CVM split staged landed
5. **P6 en parallèle** avec P5
6. **P7 finalise** la migration

**Prochaine action** : créer la branche `feat/user-session-migration` et démarrer P0.
