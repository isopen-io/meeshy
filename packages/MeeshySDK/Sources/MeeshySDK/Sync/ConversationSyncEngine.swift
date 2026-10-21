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
    /// `marksEdited` recopie l'`isEdited` servi : `false` pour un avis que le
    /// SERVEUR complète sur place (la ligne d'arrivées, #8633) — le contenu
    /// suit, le drapeau « modifié » ne se pose pas.
    case edited(messageId: String, content: String, editedAt: Date, marksEdited: Bool = true)
    /// `message:edited` porteur d'un résumé d'appel : la transition live →
    /// terminal (« en cours » → « Appel · 04:32 »). Distincte de `.edited`
    /// parce qu'un avis d'appel ne doit JAMAIS porter le drapeau « modifié ».
    case callNoticeUpdated(messageId: String, content: String, callSummaryJson: Data?, serverUpdatedAt: Date)
    case deleted(messageId: String, deletedAt: Date)
    /// `message:expired` (#7960) — un éphémère échu, brûlé par le SERVEUR.
    /// Distinct de `.deleted` : l'hôte l'applique comme la conversation
    /// OUVERTE (`ConversationSocketHandler`), sans épargner une vue unique.
    case expired(messageId: String, expiredAt: Date)
    /// `message:cited-post-withdrawn` (#7969) — le post que des messages de
    /// `conversationId` citent a été retiré : chaque citation devient
    /// « Story indisponible ».
    case citedPostWithdrawn(postId: String, conversationId: String, deletedAt: Date)
    /// `ownerUserId` (le `User.id` de l'auteur) est ce qui reconnaît MA
    /// réaction posée d'un autre appareil (#7927) : sans lui, le relais d'une
    /// conversation fermée l'écrivait sous mon `Participant.id`, jamais
    /// « mienne » ici.
    case reactionAdded(messageId: String, reactionId: String, emoji: String, participantId: String?,
                       maxCount: Int?, ownerUserId: String?)
    /// L'agrégat servi (`aggregateCount`, `aggregateParticipantIds`) cale le
    /// compte quand les lignes locales n'ont pas d'auteur (rechargées REST).
    case reactionRemoved(messageId: String, emoji: String, participantId: String?,
                         ownerUserId: String?, aggregateCount: Int?, aggregateParticipantIds: [String]?)
    case consumed(messageId: String, viewOnceCount: Int)
    /// La vue unique est « déjà ouverte » pour CE lecteur, ou son contenu a été
    /// purgé par le serveur : vider le contenu local, garder la bulle (#7579).
    case viewOnceOpened(messageId: String)
    /// `message:starred` (#7939) — l'étoile PERSONNELLE posée depuis un autre
    /// appareil du lecteur. Hors de la table `messages` : l'hôte la range dans
    /// son magasin de favoris, en composant l'instantané depuis GRDB.
    case starred(messageId: String, conversationId: String, starredAt: Date)
    case unstarred(messageId: String)
    /// `user:updated` (#9307) — un pair renommé ou repeint : l'expéditeur
    /// dénormalisé de SES messages suit, toutes conversations confondues
    /// (`MessagePersistenceActor.repaintSender`).
    case senderRepainted(UserUpdatedEvent)
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

    /// Ce qui reste non lu dans la conversation OUVERTE après une lecture
    /// partielle (#7350) — redonné à sa ligne quand elle se ferme, au lieu du
    /// 0 transitoire de l'ouverture. Ignoré si `conversationId` n'est plus la
    /// conversation ouverte.
    func noteUnreadRemaining(_ conversationId: String, _ remaining: Int)

    /// La conversation ouverte le plus récemment, ou `nil`. Plusieurs peuvent
    /// l'être (iPad multi-fenêtre) : `openConversationIds` les nomme toutes,
    /// et c'est lui que lisent les règles de non-lu.
    var currentlyOpenConversationId: String? { get }

    /// **Multi-fenêtre** : une scène affiche cette conversation. Compté par conversation — la même peut être ouverte
    /// dans deux fenêtres, seule la fermeture de la DERNIÈRE la rend au décompte. Une ouverture, une fermeture.
    func openConversation(_ conversationId: String)

    /// Une scène quitte cette conversation. Sans effet si elle n'était pas ouverte ; à la dernière fermeture, la ligne
    /// retrouve ce qui lui reste à lire (#7350), indépendamment des autres conversations ouvertes.
    func closeConversation(_ conversationId: String)

    /// Toutes les conversations qu'au moins une scène affiche.
    var openConversationIds: Set<String> { get }
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

    /* partagé entre les fichiers du moteur (#4172) */ static let logger = MeeshyLog.logger(.sync, subsystem: .sdk)

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

    /* partagé entre les fichiers du moteur (#4172) */ let openLedger = Locked(OpenConversationLedger())
    /// L'état du moteur propre à ce fichier, sous UN verrou : propriétaire de la
    /// synchro et ses attentes, persisteurs, anti-rafale du delta, rattrapage.
    ///
    /// Le compte dont une synchronisation est EN VOL — jamais un simple
    /// booléen (#8651). Un booléen confondait « ce compte synchronise déjà »
    /// (coalescer) et « le compte QUITTÉ synchronise encore » (périmé) : au
    /// changement de compte, la synchronisation du compte suivant rendait
    /// `true` sans rien lire, pendant que celle de l'ancien, arrivée en retard,
    /// écrivait SA liste dans le cache fraîchement purgé.
    private let engineState = Locked(SyncEngineState())

    /// Réserve la synchronisation pour `owner`. Refusée seulement quand CE
    /// compte en a déjà une en vol ; celle d'un autre compte est périmée et
    /// cède la place — ses écritures seront refusées par `ownsSession()`.
    /* partagé entre les fichiers du moteur (#4172) */ func claimSync(for owner: String) -> Bool {
        let outcome = engineState.mutate { $0.ownership.claim(owner) }
        outcome.released.forEach { $0.resume() }
        return outcome.claimed
    }

    /* partagé entre les fichiers du moteur (#4172) */ func releaseSync(for owner: String) {
        let released = engineState.mutate { $0.ownership.release(owner) }
        released.forEach { $0.resume() }
    }

    /// #10927 — rend la main quand `owner` ne tient plus le verrou, tout de
    /// suite s'il ne le tient déjà plus. L'inscription et le test se font sous
    /// le même verrou : une libération ne peut pas tomber entre les deux.
    /// Volontairement NON annulable : `rejoinsLaSynchroEnVol` relance
    /// `fullSync()` au retour, une tâche annulée bouclerait.
    /* partagé entre les fichiers du moteur (#10927) */ func awaitSyncRelease(for owner: String) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let resumesNow = engineState.mutate { $0.ownership.admit(owner, continuation) }
            if resumesNow { continuation.resume() }
        }
    }

    /// Le compte pour lequel la tâche COURANTE synchronise. Porté par la tâche
    /// (et ses enfants), pas par le moteur : deux synchronisations de deux
    /// comptes peuvent se chevaucher le temps d'un changement de compte, et
    /// chacune doit juger ses propres écritures.
    @TaskLocal static var syncOwner: String?

    /// Le compte pour lequel la tâche courante écrit — lu par les persisteurs
    /// de l'app (`apiMessagePersistor`) pour viser la base locale de CE compte
    /// et aucune autre (#8656). `nil` hors d'une écriture attribuée.
    public static var currentSyncOwner: String? { syncOwner }

    /// La tâche courante synchronise-t-elle toujours pour le compte ACTIF ?
    /// Vrai hors synchronisation (aucun propriétaire déclaré).
    /* partagé entre les fichiers du moteur (#4172) */ func ownsSession() async -> Bool {
        guard let owner = Self.syncOwner else { return true }
        return await currentUserId() == owner
    }
    /// Public for the `ConversationSyncEngineProviding` read requirement (used by
    /// `ConversationViewModel.deinit` for the order-safe, identity-conditional
    /// gate release). `setCurrentlyOpenConversation(_:)` remains the canonical
    /// mutation entry point.
    public var currentlyOpenConversationId: String? {
        get { openLedger.read { $0.currentlyOpenId } }
        set { setCurrentlyOpenConversation(newValue) }
    }

    public var openConversationIds: Set<String> {
        openLedger.read { Set($0.openCounts.keys) }
    }

    public func isConversationOpen(_ conversationId: String) -> Bool {
        openLedger.read { $0.openCounts[conversationId] != nil }
    }
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
    public var apiMessagePersistor: (@Sendable @concurrent ([APIMessage]) async -> Void)? {
        get { engineState.read { $0.apiMessagePersistor } }
        set { engineState.mutate { $0.apiMessagePersistor = newValue } }
    }

    /// Sibling of `apiMessagePersistor` for the mutations that carry no
    /// `APIMessage` payload: edit, delete, reaction add/remove and view-once
    /// consumption. Those four broadcasts only ever reached `cache.messages`
    /// (a namespace the conversation screen does not render) — the canonical
    /// GRDB table was refreshed by the REST refetch on reopen alone, so
    /// offline the timeline still showed the pre-edit text, the deleted
    /// bubble and the missing reaction. Installed by the host app, which owns
    /// the store; `nil` in tests that only exercise the cache surfaces.
    public var realtimeMessagePersistor: (@Sendable @concurrent (RealtimeMessageMutation) async -> Void)? {
        get { engineState.read { $0.realtimeMessagePersistor } }
        set { engineState.mutate { $0.realtimeMessagePersistor = newValue } }
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
    /* partagé entre les fichiers du moteur (#4172) */ let markAsReceivedWindow: TimeInterval

    // Cooldown between successive delta syncs. The gateway delta endpoint
    // is cheap (~10-50 ms) but a chatty socket that flaps reconnect every
    // 200 ms used to spam `/conversations?updatedSince=...` once per flap
    // — multiplied by N listeners (we historically had two for the same
    // `didReconnect` signal). Cooldown is a small wall-clock window: if
    // a delta sync just ran, skip until the window elapses. Cold-start
    // `fullSync` is unaffected because it runs through the `isSyncing`
    // path, not this guard.
    /* partagé entre les fichiers du moteur (#4172) */ var lastDeltaSyncAt: Date {
        get { engineState.read { $0.lastDeltaSyncAt } }
        set { engineState.mutate { $0.lastDeltaSyncAt = newValue } }
    }
    /* partagé entre les fichiers du moteur (#4172) */ let deltaSyncCooldown: TimeInterval = 3

    /// Une reconnexion du socket demande un rattrapage qui ne s'absorbe NI dans
    /// l'anti-rafale NI dans une synchro déjà en vol : celle du retour au
    /// premier plan part avant que le socket ait rejoint ses salles, et ce qui
    /// arrive entre son instantané et le retour des salles n'était relu par
    /// personne. La demande reste posée jusqu'à ce qu'une passe la consomme.
    /* partagé entre les fichiers du moteur (#4172) */ func requestReconnectCatchUp() {
        engineState.mutate { $0.reconnectCatchUpPending = true }
    }
    /* partagé entre les fichiers du moteur (#4172) */ func takeReconnectCatchUp() -> Bool {
        engineState.mutate { $0.takeReconnectCatchUp() }
    }
    /* partagé entre les fichiers du moteur (#4172) */ var hasReconnectCatchUpPending: Bool {
        engineState.read { $0.reconnectCatchUpPending }
    }

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

    /// Le client `/sync` INJECTÉ (#4172 tranche 2b, #5089) — `nil` en
    /// production : le client réel se construit PAR APPEL sur `api.baseURL`,
    /// qui peut changer au login. Les tests injectent leur double.
    /* partagé entre les fichiers du moteur (#4172) */ let syncDeltaOverride: SyncDeltaClientProviding?

    /// Le compte ACTIF — injecté pour que les témoins changent de compte
    /// pendant une synchronisation (#8651).
    private let currentUserIdProvider: @Sendable @concurrent () async -> String

    init(
        cache: CacheCoordinator = .shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        socialSocket: SocialSocketProviding = SocialSocketManager.shared,
        api: APIClientProviding = APIClient.shared,
        syncDelta: SyncDeltaClientProviding? = nil,
        fullReconcileInterval: TimeInterval = 86_400,
        markAsReceivedWindow: TimeInterval = 1.0,
        currentUserId: @escaping @Sendable @concurrent () async -> String = {
            await MainActor.run { AuthManager.shared.currentUser?.id ?? "" }
        }
    ) {
        self.currentUserIdProvider = currentUserId
        self.syncDeltaOverride = syncDelta
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

    /// #8674 — le point de reprise du compte ACTIF, pour le garder avec son
    /// cache quand on le quitte sans l'oublier.
    public func currentSyncCheckpoint() -> SyncCheckpoint {
        SyncCheckpoint(
            lastSync: UserDefaults.standard.object(forKey: syncTimestampKey) as? Date,
            lastCleanup: lastCleanupDate,
            lastFullReconcile: lastFullReconcileAt
        )
    }

    /// #8674 — rend au compte qui revient SON point de reprise : le delta
    /// repart de là, jamais de l'époque. Le refroidissement en mémoire repart
    /// à zéro pour que le premier delta du retour ne soit pas avalé.
    public func restoreSyncCheckpoint(_ checkpoint: SyncCheckpoint) {
        resetSyncCheckpoints()
        if let lastSync = checkpoint.lastSync { lastSyncTimestamp = lastSync }
        lastCleanupDate = checkpoint.lastCleanup
        lastFullReconcileAt = checkpoint.lastFullReconcile
    }

    // MARK: - Helpers

    /* partagé entre les fichiers du moteur (#4172) */ func currentUserId() async -> String {
        await currentUserIdProvider()
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
    @discardableResult
    /* partagé entre les fichiers du moteur (#4172) */ func saveSorted(
        _ items: [MeeshyConversation],
        to cacheKey: String,
        baseline: [MeeshyConversation]? = nil
    ) async -> Bool {
        // #8651 — une liste lue pour un compte ne s'écrit jamais sous un autre.
        guard await ownsSession() else {
            Self.logger.notice("[SyncEngine] écriture de liste refusée : le compte a changé pendant la synchronisation")
            return false
        }
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
                openConversationIds: openConversationIds
            )
        } else {
            reconciled = items
        }
        let sorted = reconciled.sorted { $0.listActivityAt > $1.listActivityAt }
        do {
            try await cache.conversations.save(sorted, for: cacheKey)
        } catch {
            Logger.cache.error("ConversationSyncEngine saveSorted failed for \(cacheKey, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
        if cacheKey == "list" {
            await recomputeTotalUnread()
        }
        return true
    }

    // MARK: - Currently-open conversation

    /// **Fenêtre unique** (iPhone, tests) : la conversation affichée REMPLACE toutes les autres ; `nil` les ferme
    /// toutes. Les écrans d'iPad multi-fenêtre passent par `openConversation` / `closeConversation`.
    public func setCurrentlyOpenConversation(_ conversationId: String?) {
        let others = openLedger.mutate { $0.replaceAll(except: conversationId) }
        for other in others { closeConversation(other) }
        guard let id = conversationId else {
            publishTotalUnread()
            Task { await self.recomputeTotalUnread() }
            return
        }
        if isConversationOpen(id) {
            publishTotalUnread()
            zeroOpenRow(id)
        } else {
            openConversation(id)
        }
    }

    public func openConversation(_ conversationId: String) {
        let isFirst = openLedger.mutate { $0.open(conversationId) }
        // SYNCHRONE, avant tout `Task` : l'agrégat doit avoir exclu cette
        // conversation AVANT que l'écran qui vient de s'ouvrir s'abonne. Un
        // `CurrentValueSubject` rejoue sa dernière valeur à l'abonnement —
        // publier depuis le `Task` laissait le premier rendu afficher le total
        // d'AVANT l'ouverture.
        publishTotalUnread()
        guard isFirst else { return }
        zeroOpenRow(conversationId)
    }

    public func closeConversation(_ conversationId: String) {
        let outcome = openLedger.mutate { $0.close(conversationId) }
        guard outcome.closed else { return }
        if let toRestore = outcome.restore {
            restoreUnreadOnClose(conversationId, toRestore)
        }
        publishTotalUnread()
        // Restoring pass-through: recompute from the cache so the closed
        // conversation is counted with a fresh value.
        Task { await self.recomputeTotalUnread() }
    }

    /// On entry, defensively zero the unread count of the open
    /// conversation. The cache may carry an inflated value left over
    /// from a stale `conversation:unread-updated` broadcast or from a
    /// REST refresh that ran against the buggy server fallback.
    private func zeroOpenRow(_ id: String) {
        Task {
            // Re-check the conversation is STILL open before applying the
            // defensive zero. A rapid open→close could otherwise let this
            // deferred zero-write land after — and clobber — a fresh
            // `conversation:unread-updated` that legitimately arrived once the
            // conversation was no longer open (see ConversationSyncEngineTests
            // .test_setCurrentlyOpenConversation_nil_restoresNormalPassThrough).
            guard self.isConversationOpen(id) else {
                await self.recomputeTotalUnread()
                return
            }
            await self.cache.conversations.update(for: "list") { conversations in
                var updated = conversations
                if let idx = updated.firstIndex(where: { $0.id == id }) {
                    // Zéro TRANSITOIRE, sans frontière de lecture (#7350) :
                    // `lastReadAt = Date()` posé ici arrivait toujours APRÈS
                    // le dernier message, et `reconcileUnread` ramenait alors
                    // à 0 tout instantané serveur postérieur à la fermeture —
                    // 99 non-lus, 5 vus, liste à 0 pendant que le serveur
                    // disait 94. La fermeture redonne le compte vrai
                    // (`restoreUnreadOnClose`).
                    updated[idx].userState.unreadCount = 0
                }
                return updated
            }
            self._conversationsDidChange.send()
            await self.recomputeTotalUnread()
        }
    }
}
