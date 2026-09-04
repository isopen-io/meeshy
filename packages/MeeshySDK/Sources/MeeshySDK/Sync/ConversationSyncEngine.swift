import Foundation
import Combine
import os

// MARK: - Realtime message mutations

/// A real-time mutation of an already-persisted message, expressed without any
/// storage vocabulary so the engine stays agnostic of the host app's store.
/// The host maps each case onto its canonical table (GRDB `messages`).
///
/// Every case is idempotent by construction on the receiving side: the same
/// broadcast may reach both this relay and the open conversation's own socket
/// handler, and replaying it must not double-count a reaction or resurrect a
/// stale edit.
public enum RealtimeMessageMutation: Sendable, Equatable {
    case edited(messageId: String, content: String, editedAt: Date)
    /// `message:edited` porteur d'un résumé d'appel : la transition live →
    /// terminal (« en cours » → « Appel · 04:32 »). Distincte de `.edited`
    /// parce qu'un avis d'appel ne doit JAMAIS porter le drapeau « modifié ».
    case callNoticeUpdated(messageId: String, content: String, callSummaryJson: Data?, serverUpdatedAt: Date)
    case deleted(messageId: String, deletedAt: Date)
    case reactionAdded(messageId: String, reactionId: String, emoji: String, participantId: String?, maxCount: Int?)
    case reactionRemoved(messageId: String, emoji: String, participantId: String?)
    case consumed(messageId: String, viewOnceCount: Int)
}

// MARK: - Protocol

public protocol ConversationSyncEngineProviding: AnyObject, Sendable {
    var conversationsDidChange: AnyPublisher<Void, Never> { get }
    var messagesDidChange: AnyPublisher<String, Never> { get }

    /// Sum of `unreadCount` across every cached conversation. CurrentValue-
    /// based: emits the current value on subscribe and again on every
    /// mutation. Consumers must NOT reduce the list themselves.
    var totalConversationsUnread: AnyPublisher<Int, Never> { get }

    /// Synchronous snapshot of the aggregate. Always ≥ 0.
    var totalConversationsUnreadValue: Int { get }

    @discardableResult
    func fullSync() async -> Bool
    @discardableResult
    func syncSinceLastCheckpoint() async -> Bool
    /// Ensure the conversation's recent messages are in cache.
    ///
    /// `force == false` respects the cache freshness TTL (a `.fresh` cache
    /// short-circuits — used by background prefetch where we have no signal
    /// that anything changed). `force == true` bypasses the TTL and always
    /// hits the network: a push notification is authoritative evidence that
    /// a new message exists, so the freshness clock is the wrong heuristic —
    /// we KNOW the cache is behind regardless of how recently it was loaded.
    func ensureMessages(for conversationId: String, force: Bool) async
    func fetchOlderMessages(for conversationId: String, before messageId: String) async
    func cleanupRetentionIfNeeded() async
    func startSocketRelay() async
    func stopSocketRelay() async
    func markConversationReadLocally(_ conversationId: String) async
    /// Efface la frontière de lecture locale (geste « marquer comme non lu »).
    func markConversationUnreadLocally(_ conversationId: String) async
    func updateConversationAfterSend(_ facet: LastMessageFacet, conversationId: String) async

    /// Declare which conversation is currently visible to the user.
    /// While set, the engine will:
    ///   1. Force the open conversation's `unreadCount` to 0 on every
    ///      `conversation:unread-updated` event (the user IS reading it,
    ///      so any non-zero value is a visual lie).
    ///   2. Exclude the open conversation from `totalConversationsUnread`
    ///      so cross-conversation surfaces (back-button pill, side menus)
    ///      count OTHER conversations only.
    ///   3. Reset the open conversation's `unreadCount` to 0 immediately
    ///      on entry, defending against stale snapshots that pushed an
    ///      inflated count (e.g. 75) into the cache before we knew the
    ///      user was looking at it.
    /// Pass `nil` (on view disappear) to restore pass-through behaviour.
    func setCurrentlyOpenConversation(_ conversationId: String?)

    /// The conversation currently forced to unread=0 and excluded from the
    /// cross-conversation aggregate, or `nil`. Read in
    /// `ConversationViewModel.deinit` so the gate is relinquished ONLY when it
    /// still points at this conversation — order-safe across a fast A→B switch
    /// where `deinit(A)` may run after `start(B)` set the gate to B.
    var currentlyOpenConversationId: String? { get }
}

public extension ConversationSyncEngineProviding {
    /// TTL-respecting convenience (`force: false`). Used where there is no
    /// external signal that the cache is stale — e.g. background prefetch.
    func ensureMessages(for conversationId: String) async {
        await ensureMessages(for: conversationId, force: false)
    }
}

// MARK: - Implementation


// LE MOTEUR EST UN TYPE EN QUATRE FICHIERS (#4172, extraction 2026-09-04).
// Le budget de taille (1000-1200 lignes) interdisait toute greffe au fichier
// de 2 213 lignes ; le découpage suit les surfaces (chargement / socket /
// écritures), pas des tranches arbitraires. Les membres partagés entre ces
// fichiers sont `internal` : ils restent invisibles hors du module, et le
// commentaire « partagé entre les fichiers du moteur » en tient lieu de
// portée déclarée. La garde du Prisme (`ConversationSyncEnginePrismTests`)
// balaie la FAMILLE `Sync/ConversationSyncEngine*.swift`, jamais un seul
// fichier — une garde qui lirait l'ancien chemin unique compterait zéro site
// et rougirait.
public final class ConversationSyncEngine: ConversationSyncEngineProviding, @unchecked Sendable {
    public static let shared = ConversationSyncEngine()

    /* partagé entre les fichiers du moteur (#4172) */ static let logger = Logger(subsystem: "me.meeshy.sdk", category: "sync")

    // Internal subjects (send-capable)
    /* partagé entre les fichiers du moteur (#4172) */ let _conversationsDidChange = PassthroughSubject<Void, Never>()
    /* partagé entre les fichiers du moteur (#4172) */ let _messagesDidChange = PassthroughSubject<String, Never>()

    /// Cross-conversation aggregator of `unreadCount`. Rebuilt from the
    /// authoritative cache on every mutation that may change the total —
    /// `conversation:unread-updated`, `conversation:read-status-updated`,
    /// and after each successful sync that overwrites the list. UI surfaces
    /// (back-button pill, side menus) subscribe here instead of reducing
    /// the list themselves so the math lives in one place.
    /* partagé entre les fichiers du moteur (#4172) */ let _totalConversationsUnread = CurrentValueSubject<Int, Never>(0)

    // Protocol-exposed publishers (read-only)
    public var conversationsDidChange: AnyPublisher<Void, Never> { _conversationsDidChange.eraseToAnyPublisher() }
    public var messagesDidChange: AnyPublisher<String, Never> { _messagesDidChange.eraseToAnyPublisher() }

    /// Publisher of the total unread count across all cached conversations.
    /// Emits the current value on subscribe (CurrentValueSubject semantics),
    /// then a new value each time the cache mutates.
    public var totalConversationsUnread: AnyPublisher<Int, Never> { _totalConversationsUnread.eraseToAnyPublisher() }

    /// Synchronous snapshot of the current aggregated total. Always
    /// ≥ 0 — negative `unreadCount` values from the backend are clamped.
    public var totalConversationsUnreadValue: Int { _totalConversationsUnread.value }

    // State (protected by serial queue)
    /* partagé entre les fichiers du moteur (#4172) */ let stateQueue = DispatchQueue(label: "me.meeshy.sync-engine.state")
    private var _isSyncing = false
    /* partagé entre les fichiers du moteur (#4172) */ var isSyncing: Bool {
        get { stateQueue.sync { _isSyncing } }
        set { stateQueue.sync { _isSyncing = newValue } }
    }
    /// Currently-visible conversation. While non-nil the engine forces this
    /// conversation's `unreadCount` to 0 on every server broadcast and
    /// excludes it from the cross-conversation aggregator.
    /* partagé entre les fichiers du moteur (#4172) */ var _currentlyOpenConversationId: String?
    /// Public for the `ConversationSyncEngineProviding` read requirement (used by
    /// `ConversationViewModel.deinit` for the order-safe, identity-conditional
    /// gate release). `setCurrentlyOpenConversation(_:)` remains the canonical
    /// mutation entry point.
    public var currentlyOpenConversationId: String? {
        get { stateQueue.sync { _currentlyOpenConversationId } }
        set { stateQueue.sync { _currentlyOpenConversationId = newValue } }
    }
    /// Miroir SYNCHRONE du `unreadCount` de chaque conversation en cache,
    /// rafraîchi par `recomputeTotalUnread`. Il n'introduit pas une seconde
    /// vérité : c'est une projection du cache, jamais écrite ailleurs — mais
    /// il permet de republier l'agrégat SANS attendre un aller-retour cache,
    /// ce dont dépend l'absence de scintillement à l'ouverture (cf.
    /// `publishTotalUnread`).
    /* partagé entre les fichiers du moteur (#4172) */ var _unreadByConversation: [String: Int] = [:]
    /* partagé entre les fichiers du moteur (#4172) */ var socketSubscriptions = Set<AnyCancellable>()

    /// Optional hook the host app installs to persist raw `APIMessage`
    /// payloads into its on-device message store (GRDB). The engine itself
    /// only maintains the CacheCoordinator surfaces (conversation list,
    /// previews, unread counts) — but the per-conversation timeline the app
    /// renders is read from GRDB, so without this hook a message that
    /// arrives while its conversation is closed (socket broadcast, push
    /// notification refresh) updates the list preview yet is missing from
    /// the open conversation until the next REST revalidation completes.
    /// Invoked from `handleNewMessage`, `ensureMessages` and
    /// `fetchOlderMessages` with the exact decoded payloads.
    private var _apiMessagePersistor: (@Sendable ([APIMessage]) async -> Void)?
    public var apiMessagePersistor: (@Sendable ([APIMessage]) async -> Void)? {
        get { stateQueue.sync { _apiMessagePersistor } }
        set { stateQueue.sync { _apiMessagePersistor = newValue } }
    }

    /// Sibling of `apiMessagePersistor` for the mutations that carry no
    /// `APIMessage` payload: edit, delete, reaction add/remove and view-once
    /// consumption. Those four broadcasts only ever reached `cache.messages`
    /// (a namespace the conversation screen does not render) — the canonical
    /// GRDB table was refreshed by the REST refetch on reopen alone, so
    /// offline the timeline still showed the pre-edit text, the deleted
    /// bubble and the missing reaction. Installed by the host app, which owns
    /// the store; `nil` in tests that only exercise the cache surfaces.
    private var _realtimeMessagePersistor: (@Sendable (RealtimeMessageMutation) async -> Void)?
    public var realtimeMessagePersistor: (@Sendable (RealtimeMessageMutation) async -> Void)? {
        get { stateQueue.sync { _realtimeMessagePersistor } }
        set { stateQueue.sync { _realtimeMessagePersistor = newValue } }
    }

    /// Accusés de RÉCEPTION en attente, par conversation.
    ///
    /// `POST /conversations/{id}/mark-as-received` ne porte AUCUN `messageId` :
    /// son corps est vide, donc dix messages d'une même rafale produisaient dix
    /// requêtes strictement identiques. Ce n'est pas qu'une question d'octets —
    /// la route partage avec `mark-read` un quota de 30 requêtes/minute, qu'une
    /// conversation animée épuise à elle seule, faisant rejeter des accusés de
    /// LECTURE que rien ne rejouera. Une rafale devient donc un envoi unique par
    /// conversation et par fenêtre ; le curseur de livraison étant monotone,
    /// fusionner des requêtes identiques ne perd rien.
    ///
    /// Une entrée présente EST la fenêtre ouverte de cette conversation.
    /* partagé entre les fichiers du moteur (#4172) */ var _markAsReceivedTasks: [String: Task<Void, Never>] = [:]
    /* partagé entre les fichiers du moteur (#4172) */ let markAsReceivedWindow: TimeInterval

    // Cooldown between successive delta syncs. The gateway delta endpoint
    // is cheap (~10-50 ms) but a chatty socket that flaps reconnect every
    // 200 ms used to spam `/conversations?updatedSince=...` once per flap
    // — multiplied by N listeners (we historically had two for the same
    // `didReconnect` signal). Cooldown is a small wall-clock window: if
    // a delta sync just ran, skip until the window elapses. Cold-start
    // `fullSync` is unaffected because it runs through the `isSyncing`
    // path, not this guard.
    private var _lastDeltaSyncAt: Date = .distantPast
    /* partagé entre les fichiers du moteur (#4172) */ var lastDeltaSyncAt: Date {
        get { stateQueue.sync { _lastDeltaSyncAt } }
        set { stateQueue.sync { _lastDeltaSyncAt = newValue } }
    }
    /* partagé entre les fichiers du moteur (#4172) */ let deltaSyncCooldown: TimeInterval = 3

    // Dependencies
    /* partagé entre les fichiers du moteur (#4172) */ let cache: CacheCoordinator
    /* partagé entre les fichiers du moteur (#4172) */ let conversationService: ConversationServiceProviding
    /* partagé entre les fichiers du moteur (#4172) */ let messageService: MessageServiceProviding
    /* partagé entre les fichiers du moteur (#4172) */ let messageSocket: MessageSocketProviding
    private let socialSocket: SocialSocketProviding
    /* partagé entre les fichiers du moteur (#4172) */ let api: APIClientProviding

    // Persisted sync timestamp
    private let syncTimestampKey = "me.meeshy.lastSyncTimestamp"
    /* partagé entre les fichiers du moteur (#4172) */ var lastSyncTimestamp: Date {
        get { UserDefaults.standard.object(forKey: syncTimestampKey) as? Date ?? .distantPast }
        set { UserDefaults.standard.set(newValue, forKey: syncTimestampKey) }
    }

    private let cleanupDateKey = "me.meeshy.lastCleanupDate"
    /* partagé entre les fichiers du moteur (#4172) */ var lastCleanupDate: Date? {
        get { UserDefaults.standard.object(forKey: cleanupDateKey) as? Date }
        set { UserDefaults.standard.set(newValue, forKey: cleanupDateKey) }
    }

    // P7-10 — checkpoint de la dernière réconciliation COMPLÈTE (fullSync).
    // Le delta `?updatedSince=` est upsert-only : une conversation
    // HARD-supprimée côté serveur n'y apparaît jamais (contrairement aux
    // `isActive:false` que mergeDeltaConversations retire) → sans
    // réconciliation périodique, un `conversation:deleted` raté (offline)
    // laisse une ligne fantôme inouvrable à vie — le cache reste
    // perpétuellement fresh/stale via les deltas, donc le fullSync de
    // cold-start ne court jamais (observé E2E 2026-07-02 : « Test Conv »
    // épinglée, absente du serveur, tuée uniquement par pull-to-refresh).
    private let fullReconcileKey = "me.meeshy.lastFullReconcileAt"
    /* partagé entre les fichiers du moteur (#4172) */ var lastFullReconcileAt: Date? {
        get { UserDefaults.standard.object(forKey: fullReconcileKey) as? Date }
        set { UserDefaults.standard.set(newValue, forKey: fullReconcileKey) }
    }
    /// Borne « données jamais rapatriées inutilement » : au plus UN full
    /// refetch par fenêtre. 24 h par défaut ; injectable pour les tests.
    private let fullReconcileInterval: TimeInterval

    /* partagé entre les fichiers du moteur (#4172) */ var isFullReconcileDue: Bool {
        Date().timeIntervalSince(lastFullReconcileAt ?? .distantPast) >= fullReconcileInterval
    }

    init(
        cache: CacheCoordinator = .shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        api: APIClientProviding = APIClient.shared,
        fullReconcileInterval: TimeInterval = 86_400,
        markAsReceivedWindow: TimeInterval = 1.0
    ) {
        self.cache = cache
        self.conversationService = conversationService
        self.messageService = messageService
        self.messageSocket = messageSocket
        self.socialSocket = socialSocket
        self.api = api
        self.fullReconcileInterval = fullReconcileInterval
        self.markAsReceivedWindow = markAsReceivedWindow
    }

    // MARK: - Sync Checkpoints (logout / re-auth reset)

    /// sync-04 — efface les trois checkpoints UserDefaults pour que le compte
    /// suivant (ou une ré-authentification du même compte, dont le cache est
    /// purgé par ailleurs) reparte de `.distantPast` au lieu d'hériter du
    /// watermark de la session sortante — sinon un delta déclenché avant le
    /// premier fullSync réussi persiste une liste PARTIELLE comme fraîche.
    /// `lastDeltaSyncAt` est remis aussi pour que le tout premier delta ne
    /// soit pas avalé par le cooldown en mémoire.
    public func resetSyncCheckpoints() {
        UserDefaults.standard.removeObject(forKey: syncTimestampKey)
        UserDefaults.standard.removeObject(forKey: cleanupDateKey)
        UserDefaults.standard.removeObject(forKey: fullReconcileKey)
        lastDeltaSyncAt = .distantPast
    }

    // MARK: - Helpers

    /* partagé entre les fichiers du moteur (#4172) */ func currentUserId() async -> String {
        await MainActor.run { AuthManager.shared.currentUser?.id ?? "" }
    }

    /* partagé entre les fichiers du moteur (#4172) */ func currentUsername() async -> String? {
        await MainActor.run { AuthManager.shared.currentUser?.username }
    }

    /* partagé entre les fichiers du moteur (#4172) */ func currentUserDisplayName() async -> String? {
        await MainActor.run { AuthManager.shared.currentUser?.displayName }
    }

    /// Prisme ORDONNÉ du lecteur, seule autorité iOS sur cet ordre
    /// (`systemLanguage` > `regionalLanguage` > `customDestinationLanguage` >
    /// `deviceLocale`). Jamais réimplémenté localement. Vide sans session : la
    /// carte d'aperçu est alors `nil` et la ligne rend l'original — même
    /// comportement que le chemin REST pour un participant anonyme.
    /* partagé entre les fichiers du moteur (#4172) */ func currentPreferredLanguages() async -> [String] {
        await MainActor.run { AuthManager.shared.currentUser?.preferredContentLanguages ?? [] }
    }

    /// Persist a conversation list pre-sorted by `lastMessageAt` DESC. Centralising
    /// the sort here keeps the cache invariant consistent across every save site
    /// (full sync, delta sync, parallel pages, sequential tail) so any cold-start
    /// cache hit can be rendered without a second pass through the ViewModel's
    /// grouping pipeline. Backend pagination is not guaranteed to be timestamp-
    /// sorted (interleaved deltas, parallel page merges, server-side tweaks),
    /// so the engine must enforce the order rather than trust the network.
    /// - Parameter baseline: instantané cache pris AVANT le début de la sync.
    ///   Indispensable pour `fullSync`, qui persiste sa première page avant
    ///   d'avoir les suivantes : sans baseline figée, la deuxième écriture
    ///   confronterait les pages 2+ à un cache réduit à la page 1, et leurs
    ///   frontières de lecture — introuvables — seraient silencieusement
    ///   perdues. `nil` relit le cache (appelants à écriture unique).
    /* partagé entre les fichiers du moteur (#4172) */ func saveSorted(
        _ items: [MeeshyConversation],
        to cacheKey: String,
        baseline: [MeeshyConversation]? = nil
    ) async {
        // Chokepoint UNIQUE de toute écriture liste dérivée du serveur (fullSync
        // ×3, deltaSync ×1) : on y réconcilie le non-lu AVANT de persister, sinon
        // un instantané serveur en retard sur un `markAsRead` encore dans
        // l'outbox rallume la pastille (« ça part puis ça revient »).
        let reconciled: [MeeshyConversation]
        if cacheKey == "list" {
            let existing: [MeeshyConversation]
            if let baseline {
                existing = baseline
            } else {
                existing = await cache.conversations.load(for: cacheKey).snapshot() ?? []
            }
            reconciled = Self.reconcileUnread(
                incoming: items,
                existing: existing,
                openConversationId: currentlyOpenConversationId
            )
        } else {
            reconciled = items
        }
        let sorted = reconciled.sorted { $0.lastMessageAt > $1.lastMessageAt }
        do {
            try await cache.conversations.save(sorted, for: cacheKey)
        } catch {
            Logger.cache.error("ConversationSyncEngine saveSorted failed for \(cacheKey, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
        if cacheKey == "list" {
            await recomputeTotalUnread()
        }
    }

    // MARK: - Currently-open conversation

    public func setCurrentlyOpenConversation(_ conversationId: String?) {
        currentlyOpenConversationId = conversationId
        // SYNCHRONE, avant tout `Task` : l'agrégat doit avoir exclu (ou
        // ré-inclus) cette conversation AVANT que l'écran qui vient de
        // s'ouvrir s'abonne. Un `CurrentValueSubject` rejoue sa dernière
        // valeur à l'abonnement — publier depuis le `Task` ci-dessous laissait
        // donc le premier rendu afficher le total d'AVANT l'ouverture.
        publishTotalUnread()
        guard let id = conversationId else {
            // Restoring pass-through: recompute from the cache so the
            // previously-excluded conversation is counted with a fresh value.
            Task { await self.recomputeTotalUnread() }
            return
        }
        // `unreadCount` local à zéro dans le miroir : la ligne est lue dès
        // l'ouverture, et l'agrégat ne doit pas la recompter à la fermeture
        // sur la foi d'une valeur d'avant.
        stateQueue.sync { _unreadByConversation[id] = 0 }
        // On entry, defensively zero the unread count of the open
        // conversation. The cache may carry an inflated value left over
        // from a stale `conversation:unread-updated` broadcast or from a
        // REST refresh that ran against the buggy server fallback.
        Task {
            // Re-check the conversation is STILL the open one before applying the
            // defensive zero. A rapid open→close
            // (setCurrentlyOpenConversation("x") then (nil)) could otherwise let
            // this deferred zero-write land after — and clobber — a fresh
            // `conversation:unread-updated` that legitimately arrived once the
            // conversation was no longer open. Guarding here keeps the
            // pass-through restore correct (see ConversationSyncEngineTests
            // .test_setCurrentlyOpenConversation_nil_restoresNormalPassThrough).
            guard self.currentlyOpenConversationId == id else {
                await self.recomputeTotalUnread()
                return
            }
            await self.cache.conversations.update(for: "list") { conversations in
                var updated = conversations
                if let idx = updated.firstIndex(where: { $0.id == id }) {
                    updated[idx].userState.unreadCount = 0
                    // Frontière de lecture : sans elle, le prochain instantané
                    // serveur (delta au retour en avant-plan, reconnexion socket)
                    // ré-injecterait le compteur d'AVANT l'ouverture.
                    updated[idx].userState.lastReadAt = Date()
                }
                return updated
            }
            self._conversationsDidChange.send()
            await self.recomputeTotalUnread()
        }
    }
}
