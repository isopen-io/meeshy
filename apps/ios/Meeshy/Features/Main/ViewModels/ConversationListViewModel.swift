import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK

@MainActor
class ConversationListViewModel: ObservableObject {
    /// Conversation qui quitte la liste (supprimée, quittée, retirée) ou marquée non lue : l'iPad la désélectionne.
    let conversationLeavesDetail = PassthroughSubject<String, Never>()

    @Published var conversations: [Conversation] = [] {
        didSet {
            _convIdIndex = nil
            // G-124 — point de composition de `GatewayBridgeProvider`
            // (`ConversationBridgeProviding`, LWS-2bis/M-048, `Lentille/Core/
            // GatewayBridgeProvider.swift`). `didSet` est le SEUL endroit où
            // convergent le chargement REST initial (`setConversations`) et
            // les rechargements déclenchés par le socket
            // (`observeSync` → `reloadFromCache` → `setConversations`, sur
            // `conversationsDidChange` — lui-même émis par
            // `ConversationSyncEngine.handleUnreadUpdated`, qui recopie déjà
            // `event.bridge` sur la conversation en cache) : « alimenté par
            // la liste + le socket », exactement ce que demande l'en-tête du
            // provider. Derrière le drapeau (R19, câblage OFF ⇒ zéro effet
            // mesurable) — même garde que `groupConversations` (§4.4, seul
            // point de greffe voisin de ce fichier).
            if LentilleFeatureFlag.isLentilleListEnabled {
                gatewayBridgeProvider.noteBridges(from: conversations)
            }
        }
    }
    @Published var userCategories: [ConversationSection] = []
    var isLoading = false
    /// `true` when the last cold-start sync failed and the cache is still
    /// empty. The view reads this to swap the empty-state placeholder for
    /// a retryable error panel. We don't reuse `isLoading` because the
    /// user should see a distinct "failed — tap to retry" affordance, not
    /// a confusing empty list.
    @Published var loadFailed = false
    /// High-level state for the list surface (cache status / cold load
    /// / error). Computed alongside `isLoading` so consumers that want
    /// the cache-first nuances (`cachedStale` keeps showing data while
    /// silent revalidate runs) can react without inspecting multiple
    /// booleans. `isLoading` remains for binary "show big spinner?"
    /// consumers; new code should prefer `loadState`.
    @Published var loadState: LoadState = .idle
    /// State of the cursor-paginated infinite scroll. `.idle` when ready
    /// to fetch, `.loadingMore` while a `loadMore()` call is in flight,
    /// `.exhausted` once the gateway signalled `hasMore=false` (so the
    /// view can hide the spinner permanently), `.error` for transient
    /// failures the user can retry by scrolling back.
    @Published var paginationState: PaginationState = .idle
    /// Mirror of `paginationState`'s "more pages exist" signal. Kept as
    /// a separate @Published so views that already bound to a Bool
    /// (footer visibility, "load more" affordance) don't have to migrate
    /// to switching on the enum. Stays in sync via `paginationState`'s
    /// transitions.
    @Published var hasMore: Bool = true
    /// Opaque cursor returned by the last `listPage` call. `nil` until
    /// the first page is fetched, then carries the gateway-issued id of
    /// the page tail. `loadMore()` forwards it as the `before` query
    /// parameter so the next page filters `lastMessageAt < cursor`.
    var nextCursor: String?

    // MARK: - Reactive Filters & Prepared Data
    /// Le texte de recherche vit dans SON modèle, pas sur celui-ci (#7158).
    ///
    /// Ce modèle est déclaré en `@EnvironmentObject` par la racine de la
    /// liste ; un `@Published` ici ré-exécute ~99 rangées à CHAQUE caractère,
    /// l'anti-rebond du pipeline ne protégeant que le calcul. La valeur reste
    /// lisible et écrivable sous le même nom — propriété CALCULÉE, donc aucune
    /// publication — et le pipeline s'abonne directement à sa source.
    let searchTextModel = ConversationSearchTextModel()

    var searchText: String {
        get { searchTextModel.text }
        set { searchTextModel.text = newValue }
    }
    /// **Les filtres RETENUS** — un ensemble, plus une valeur (#4069).
    ///
    /// Le filtrage utile est le CROISÉ (« non lus, parmi les directs ») et il
    /// était impossible : choisir un filtre remplaçait le précédent. Le sens de
    /// la combinaison ne vit pas ici mais dans `ConversationFilterComposition`,
    /// qui sait que deux TYPES s'additionnent et que deux ÉTATS se croisent.
    @Published var selectedFilters: Set<ConversationFilter> = ConversationFilterComposition.neutral
    /// Filtre par ÉTIQUETTE (2026-08-21, carte de focus Lentille : toucher un
    /// tag ⇒ « toutes les conversations avec ce tag ») — `nil` = aucun filtre.
    @Published var activeTagFilter: String? = nil

    private(set) var filteredConversations: [Conversation] = []
    @Published var groupedConversations: [(section: ConversationSection, conversations: [Conversation])] = []
    /// Taille du corpus que `groupedConversations` a groupé en dernier — voir
    /// `groupingAwaitsCorpus(...)` (#8759).
    private(set) var groupedCorpusCount = 0
    /// Brouillons actifs indexés par conversationId. Alimente le badge
    /// « Brouillon » de la ligne et la priorité de tri. Concept client-local
    /// — jamais stocké dans le modèle SDK `Conversation`.
    @Published var draftSummaries: [String: DraftSummary] = [:]
    /// Typing usernames indexed by conversationId. @Published — ConversationRowItem
    /// + ThemedConversationRow are Equatable with .equatable() applied
    /// (ConversationListView+Rows.swift:70), so only the row whose typingUsername
    /// changed re-evaluates its body. The full list does NOT re-render.
    @Published var typingUsernames: [String: String] = [:]  // conversationId → displayName (derived view of `typers`)
    /// conversationId → PSEUDO du frappeur retenu pour cette conversation.
    /// Dérivé du même choix que `typingUsernames`, donc désignant toujours la
    /// même personne : la ligne de liste affiche son nom, la pastille de
    /// synchronisation son `@pseudo`. Une divergence entre les deux se lirait
    /// comme deux personnes en train d'écrire.
    @Published var typingUsers: [String: String] = [:]
    /// Qui écrit où (état par membre, échéances 15 s, abonnements) : voir
    /// `ConversationListTypingTracker`, qui réaligne `typingUsernames` et
    /// `typingUsers` par `applyTypingSelection`.
    private let typingTracker = ConversationListTypingTracker()
    typealias TypingUser = ConversationListTypingTracker.TypingUser
    /// Aperçu d'appui long — publié par `ConversationListPreviewLoader`, que seule la
    /// sous-vue feuille de l'aperçu observe : la liste le tient sans s'y abonner.
    let previewLoader: ConversationListPreviewLoader
    var previewMessages: [String: [Message]] { previewLoader.messages }
    /// Écriture du cache disque de la liste : voir `ConversationListPersister`.
    private let persister = ConversationListPersister()
    private let markedReadObserver = ConversationMarkedReadObserver()

    var totalUnreadCount: Int {
        conversations.reduce(0) { $0 + $1.userState.unreadCount }
    }

    let conversationService: ConversationServiceProviding
    let preferenceService: PreferenceServiceProviding
    let messageSocket: MessageSocketProviding
    let messageService: MessageServiceProviding
    let authManager: AuthManaging
    let storyService: StoryServiceProviding
    let syncEngine: ConversationSyncEngineProviding
    /// Mutation source of truth for per-user conversation state (pin, mute,
    /// archive, read, section, reaction, tags). The VM hydrates it from the
    /// loaded list and observes it back so a mutation from any surface
    /// (list swipe, context menu, options sheet) lands here optimistically
    /// with outbox-backed offline replay. Metadata + ordering stay owned by
    /// this VM (the store only sorts by `lastMessageAt`).
    let store: ConversationStore
    /// Source of truth for the user's conversation categories (sections). The
    /// VM seeds it from the cache-first load and observes it back, so a
    /// cross-device category event (created/renamed/reordered/deleted, routed
    /// by `ConversationStoreSocketBridge`) or a local expand/collapse reflects
    /// into `userCategories` via its publisher.
    let categoryStore: UserCategoryStore
    /// Publisher des notifications push « message » (conversationId +
    /// messageId). Injecté pour la testabilité ; en production, branché sur
    /// `PushNotificationManager.shared.messageNotificationReceived`.
    let messageNotificationPublisher: AnyPublisher<MessageActivitySignal, Never>
    /// Source des brouillons persistés (UserDefaults). Injecté pour la
    /// testabilité ; en production, `DraftStore.shared`.
    let draftStore: DraftStore
    /// Number of conversations fetched per `loadMore` page.
    ///
    /// Tuned at 100 (gateway max) so the first paginated page after the
    /// cold cache covers the long tail of the user's conversation list
    /// in a SINGLE request — empirically every user falls under this
    /// ceiling, so the second `loadMore` call returns hasMore=false and
    /// the infinite-scroll sentinel goes silent. Keeping it at 30 forced
    /// the sentinel to fire 4-5 times for a 100-row account, every onAppear
    /// re-trigger amplifying any pagination glitch (cf. the May 2026
    /// `cursorPagination` schema strip bug that turned this into an
    /// uncapped loop). The payload at limit=100 stays well under 200 KB
    /// even with rich metadata.
    let pageLimit = 100
    var cancellables = Set<AnyCancellable>()
    var storyPrefetchTask: Task<Void, Never>?
    lazy var messagePrefetcher = ConversationListMessagePrefetcher(messageService: messageService)

    /// Registre du pont ✦ gateway (G-124) — voir le commentaire du `didSet`
    /// de `conversations` ci-dessus pour l'alimentation, et l'en-tête de
    /// `GatewayBridgeProvider.swift` pour le contrat complet. Pas encore lu
    /// par un rang : `LentilleConversationRow` lit `conversation.bridge`
    /// directement (même donnée, posée par le SDK — voir son commentaire),
    /// donc ce registre n'est consommateur d'AUCUN call site aujourd'hui —
    /// même posture que `LocalLiveCallProvider` (câblé, pas encore branché à
    /// un site d'appel). `let`, pas injecté : c'est un registre pur, aucune
    /// dépendance externe à substituer en test (contrairement à `syncEngine`
    /// ci-dessus).
    let gatewayBridgeProvider = GatewayBridgeProvider()

    // O(1) conversation lookup by ID
    private var _convIdIndex: [String: Int]?
    func convIndex(for id: String) -> Int? {
        if _convIdIndex == nil {
            var index = [String: Int](minimumCapacity: conversations.count)
            for (i, c) in conversations.enumerated() { index[c.id] = i }
            _convIdIndex = index
        }
        return _convIdIndex?[id]
    }

    /// Retire la ligne dont MON appartenance vient de s'arrêter — départ
    /// volontaire depuis un autre appareil, retrait par un admin,
    /// bannissement.
    ///
    /// Le geste est celui de `conversation:deleted`, et pour la même raison :
    /// `GET /conversations` exige `participants.some({ userId, isActive: true })`,
    /// donc la ligne n'existe plus côté serveur. Les trois autres fins
    /// d'appartenance sont d'ailleurs déjà unifiées dans le DELTA — le gateway
    /// les rend toutes dans `deletedConversationIds`
    /// (`services/gateway/src/routes/conversations/utils/delta-tombstones.ts`) —
    /// et seul le chemin TEMPS RÉEL les traitait différemment.
    ///
    /// `schedulePersist` sauvegarde l'INSTANTANÉ complet de `conversations` :
    /// retirer la ligne ici la retire donc aussi du cache disque, qui la
    /// gardait sinon jusqu'au prochain delta. Les messages partent avec elle,
    /// comme dans `ConversationSyncEngine.handleConversationDeleted`.
    ///
    /// Jumeau web : `dropConversationFromCache`
    /// (`apps/web/hooks/queries/use-socket-cache-sync.ts`).
    func dropConversationLeftByMe(at index: Int) {
        let conversationId = conversations[index].id
        conversations.remove(at: index)
        conversationLeavesDetail.send(conversationId)
        schedulePersist()
        Task { await CacheCoordinator.shared.messages.invalidate(for: conversationId) }
    }

    /// Effectif à POSER sur une ligne de liste après un événement
    /// d'appartenance (adhésion, départ, bannissement, levée).
    ///
    /// Les quatre événements du gateway portent un `memberCount` ABSOLU, et ils
    /// le portent pour une raison précise : **un delta ne rattrape jamais un
    /// événement manqué**. Hors ligne, hors room, trou de reconnexion — chaque
    /// événement perdu laissait une dérive définitive, qu'iOS PERSISTE
    /// (`schedulePersist` écrit la valeur fausse dans le cache disque, et rien
    /// ne relit spontanément l'effectif ensuite). Un total, lui, se rattrape au
    /// premier événement suivant.
    ///
    /// Le delta n'est donc plus qu'un REPLI pour un gateway antérieur au
    /// contrat, jamais le chemin nominal. Jumeau web : `applyMemberCount`
    /// (`apps/web/hooks/queries/use-socket-cache-sync.ts`), qui porte la même
    /// règle — toute évolution touche les deux.
    ///
    /// Le plancher à zéro vaut pour les DEUX branches : un décrément de repli
    /// sur un cache déjà à zéro rendrait un effectif négatif, et un absolu
    /// aberrant n'a pas plus le droit d'en produire un.
    ///
    /// Cap 199+ : l'absolu arrive avec son drapeau `memberCountCapped` et les
    /// deux se POSENT ensemble (drapeau absent sur un absolu = exact). Sans
    /// absolu, un compteur local plafonné reste GELÉ : « 199+ » décrit un
    /// effectif au-delà du seuil, un ±1 de repli ne peut pas le faire bouger
    /// sans mentir — le vrai compte est inconnu du client.
    static func memberCountAfterMembershipEvent(
        current: Int,
        currentCapped: Bool,
        absolute: Int?,
        absoluteCapped: Bool?,
        delta: Int
    ) -> (count: Int, capped: Bool) {
        if let absolute {
            return (max(0, absolute), absoluteCapped == true)
        }
        if currentCapped {
            return (current, true)
        }
        return (max(0, current + delta), false)
    }

    // MARK: - List Mutators (centralised write surface)
    //
    // Every code path that wants to replace, extend or re-order
    // `conversations` must funnel through these helpers so the
    // invariant "sorted by lastMessageAt DESC" holds at every step.
    // Direct writes to `conversations = …` are reserved for the
    // narrow case of mutating a SINGLE row's property (unread count,
    // pin, mute, etc.) where the order doesn't change.

    /// Replace the entire list with `items` re-sorted by lastMessageAt DESC,
    /// preserving any entry created locally within `recentlyCreatedTTL` that
    /// the incoming snapshot doesn't yet contain. Without this protection,
    /// a foreground delta sync that races a fresh creation can clobber the
    /// new row because the gateway aggregate has eventual-consistency lag
    /// (the conv was inserted server-side a few hundred ms ago but the
    /// `/conversations` aggregate hasn't caught up yet). The TTL bounds the
    /// "force-keep" window so a legitimate cross-device delete still applies
    /// after 30 s.
    func setConversations(_ items: [Conversation]) {
        let merged = mergePreservingRecentlyCreated(incoming: items, current: conversations, now: dateProvider())
        // MÊME règle de non-lu que le cache disque (`saveSorted`) et que le
        // store RAM (`hydrateMetadata`) : `ConversationSyncEngine.reconcileUnread`.
        // Ce chemin-ci reverse un instantané de cache dans les lignes
        // AFFICHÉES ; sans la règle, un instantané pris avant que l'écriture
        // de lecture locale ait atteint GRDB rallumait la pastille le temps
        // d'une frame — le store la corrigeait ensuite, ce qui EST le
        // clignotement. Les trois porteurs appliquent la règle, donc aucun
        // n'a d'avis propre sur ce qu'« ouverte » ou « déjà lue » veut dire.
        let reconciled = ConversationSyncEngine.reconcileUnread(
            incoming: merged,
            existing: conversations,
            openConversationIds: syncEngine.openConversationIds
        )
        let drafts = draftSummaries
        let sorted = reconciled.sorted { Self.conversationsAreInOrder($0, $1, draftSummaries: drafts) }
        conversations = sorted
        // Hydrate the mutation store with the latest metadata snapshot.
        // `hydrateMetadata` version-gates the per-user state so an in-flight
        // optimistic mutation draining through the outbox is NOT clobbered by
        // a concurrent server/cache refresh.
        storeHydrationTask = Task { [store] in
            await store.hydrateMetadata(sorted)
        }
    }

    /// Local-creation registry: maps conversationId → insertion timestamp.
    /// Populated by `fetchAndPrependMissingConversation` whenever a fresh
    /// row lands locally (any discovery source — `conversation:new`,
    /// `notification:new` legacy, or `conversation:updated` for unknown id).
    /// Read by `setConversations` to defend the row against same-window
    /// destructive snapshots that race the gateway aggregate's eventual
    /// consistency. `internal` so tests can inspect / drive directly.
    var recentlyCreatedAt: [String: Date] = [:]
    /// Window during which a freshly-inserted row is force-preserved across
    /// destructive snapshots. Sized to comfortably cover the worst-case
    /// gateway aggregate-replication lag we've observed (~3 s) plus the
    /// debounced cache persist (~200 ms) plus a safety margin.
    let recentlyCreatedTTL: TimeInterval = 30
    /// Injectable `now()` for deterministic TTL tests. Production code uses
    /// the system clock; tests stub it to advance time synthetically.
    var dateProvider: () -> Date = { Date() }

    /// Pure helper: returns the merged set of `incoming` plus any `current`
    /// row whose id is in `recentlyCreatedAt` (after pruning expired
    /// entries) and absent from `incoming`. Order/sort handled by the
    /// caller.
    /// - Note: mutates `recentlyCreatedAt` to drop expired entries — done
    ///   here so we get a single pass over the map instead of one per
    ///   `setConversations` call.
    private func mergePreservingRecentlyCreated(
        incoming: [Conversation],
        current: [Conversation],
        now: Date
    ) -> [Conversation] {
        recentlyCreatedAt = recentlyCreatedAt.filter { now.timeIntervalSince($0.value) < recentlyCreatedTTL }
        let incomingIds = Set(incoming.map(\.id))
        let preserved = current.filter { conv in
            recentlyCreatedAt[conv.id] != nil && !incomingIds.contains(conv.id)
        }
        return incoming + preserved
    }

    #if DEBUG
    /// Test-only: nombre de sauvegardes réellement menées à terme.
    var persistCallCount: Int {
        get { persister.persistCallCount }
        set { persister.persistCallCount = newValue }
    }
    #endif

    /// Coalesced persistence: saves the current `conversations` snapshot
    /// + pagination cursor + hasMore flag to the L2 cache after a short
    /// debounce so a burst of mutations produces ONE GRDB write rather than N
    /// (voir `ConversationListPersister`). Callers MUST be on the MainActor
    /// (snapshot is read here, before the detached Task captures it).
    func schedulePersist(debounce: TimeInterval = 0.2) {
        persister.schedule(snapshot: conversations, cursor: nextCursor, hasMore: hasMore, debounce: debounce)
    }

    /// Annule la sauvegarde en vol — avant un rechargement ou un pull-to-refresh
    /// qui invalide le cache, pour qu'une tâche orpheline ne ré-écrive pas le
    /// blob d'avant.
    func cancelPendingPersist() {
        persister.cancel()
    }

    /// Sauvegarde immédiate de la liste fusionnée + du curseur après un
    /// `loadMore` réussi.
    func persistLoadedPage() {
        persister.persistNow(snapshot: conversations, cursor: nextCursor, hasMore: hasMore)
    }

    /// Append paginated rows to the existing list, deduplicating by id and
    /// re-sorting. The dedup is defensive (paginated fetches and socket
    /// updates can race so the same conversation can appear in both),
    /// the sort guarantees newer rows from a backend page that interleaves
    /// recent activity end up at the right spot rather than at the tail.
    func appendConversations(_ items: [Conversation]) {
        var seen = Set<String>(conversations.map(\.id))
        var merged = conversations
        for item in items where seen.insert(item.id).inserted {
            merged.append(item)
        }
        setConversations(merged)
    }

    /// Bump a conversation to position 0 with a refreshed lastMessageAt.
    /// Used by the socket relay when CONVERSATION_UPDATED carries a newer
    /// lastMessageAt, and by the push-notification path. No-op when the id
    /// isn't currently loaded so the engine's full-row prepend in
    /// handleNewMessage stays the source of truth for unknown conversations.
    ///
    /// `facet` porte ce que l'appelant sait RÉELLEMENT du nouveau dernier
    /// message. Les champs qu'il ne connaît pas sont remis à neutre plutôt que
    /// laissés à ceux du message PRÉCÉDENT — cf. `LastMessageFacet.bumped`.
    func bumpToTop(conversationId: String, facet: LastMessageFacet) {
        guard let idx = convIndex(for: conversationId) else {
            Logger.messages.warning("[bumpToTop] conversation introuvable id=\(conversationId, privacy: .public)")
            return
        }
        var updated = conversations[idx]
        updated.applyLastMessage(facet)
        conversations = [updated] + conversations.enumerated().filter { $0.offset != idx }.map(\.element)
        schedulePersist()
    }

    /// Track in-flight `getById` fetches launched by `conversationUpdated` so
    /// a burst of events for the same brand-new DM doesn't issue N parallel
    /// HTTP requests. Cleared synchronously on the MainActor inside
    /// `fetchAndPrependMissingConversation`.
    var pendingMissingFetches: Set<String> = []

    /// Where a conversation discovery signal originated. Used purely for
    /// structured logging so a production support ticket "I created a DM
    /// and don't see it" can be traced to the path that should have
    /// surfaced it (or proven that none did). The categories mirror the
    /// real wire-up sites — ADD a case rather than reusing one if a new
    /// surface starts firing prepends.
    enum ConversationDiscoverySource: String {
        case socketNew              // conversation:new (typed event, primary path)
        case socketNotification     // notification:new legacy fallback (~3-month deprecation window)
        case socketUpdated          // CONVERSATION_UPDATED (first activity on unknown id)
        case pushNotification       // APNs message notification for an unknown conversation
    }

    /// Fetch a conversation that the gateway just told us about via
    /// `CONVERSATION_UPDATED` but that we don't have locally — typically a
    /// brand-new direct message where the user hasn't joined
    /// `ROOMS.conversation(id)` yet (so they never received `MESSAGE_NEW`).
    /// Mirrors the SyncEngine pattern for missing-conversation prepends so
    /// the row appears in real time without forcing a pull-to-refresh.
    func fetchAndPrependMissingConversation(id: String, source: ConversationDiscoverySource = .socketUpdated) {
        guard !pendingMissingFetches.contains(id) else {
            Logger.messages.info("[Discovery] source=\(source.rawValue, privacy: .public) id=\(id, privacy: .public) action=skip-dedup")
            return
        }
        pendingMissingFetches.insert(id)
        Logger.messages.info("[Discovery] source=\(source.rawValue, privacy: .public) id=\(id, privacy: .public) action=fetch-start")
        let userId = currentUserId
        let service = conversationService
        Task { [weak self] in
            defer { Task { @MainActor [weak self] in self?.pendingMissingFetches.remove(id) } }
            do {
                let domain = try await ConversationDiscoveryRowFetcher(service: service).row(id: id, currentUserId: userId)
                guard let self else { return }
                // Defensive dedup: a concurrent fullSync / socket event
                // may have surfaced the conversation between the fetch
                // start and this point.
                if let existing = self.convIndex(for: domain.id) {
                    self.conversations.remove(at: existing)
                }
                self.conversations.insert(domain, at: 0)
                // Mark this id as recently-created so the next destructive
                // snapshot (foreground delta sync, cache reload after
                // fullSync, etc.) doesn't clobber it during the gateway
                // aggregate's eventual-consistency window.
                self.recentlyCreatedAt[domain.id] = self.dateProvider()
                self.schedulePersist()
                Logger.messages.info("[Discovery] source=\(source.rawValue, privacy: .public) id=\(id, privacy: .public) action=insert")
            } catch {
                Logger.messages.error("[Discovery] source=\(source.rawValue, privacy: .public) id=\(id, privacy: .public) action=fetch-error error=\(error.localizedDescription, privacy: .public)")
            }
        }
    }

    var lastFetchedAt: Date? = nil
    let cacheTTL: TimeInterval = 30

    var isCacheValid: Bool {
        guard let ts = lastFetchedAt else { return false }
        return Date().timeIntervalSince(ts) < cacheTTL
    }

    init(
        conversationService: ConversationServiceProviding = ConversationService.shared,
        preferenceService: PreferenceServiceProviding = PreferenceService.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        authManager: AuthManaging = AuthManager.shared,
        storyService: StoryServiceProviding = StoryService.shared,
        syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared,
        messageNotificationPublisher: AnyPublisher<MessageActivitySignal, Never> = PushNotificationManager.shared.messageNotificationReceived.eraseToAnyPublisher(),
        draftStore: DraftStore = DraftStore.shared,
        store: ConversationStore = .shared,
        categoryStore: UserCategoryStore = .shared
    ) {
        self.conversationService = conversationService
        self.preferenceService = preferenceService
        self.messageSocket = messageSocket
        self.messageService = messageService
        self.authManager = authManager
        self.storyService = storyService
        self.syncEngine = syncEngine
        self.messageNotificationPublisher = messageNotificationPublisher
        self.draftStore = draftStore
        self.store = store
        self.categoryStore = categoryStore
        self.previewLoader = ConversationListPreviewLoader(messageService: messageService)
        reloadDraftSummaries()
        observeTyping()
        subscribeToSocketEvents()
        subscribeToPushNotifications()
        subscribeToDrafts()
        syncBadgeOnUnreadChange()
        setupBackgroundProcessing()
        observeMarkAsRead()
        observeSync()
        observeStore()
        observeCategoryStore()
    }

    /// Latest store-hydration task spawned by `setConversations`
    /// (fire-and-forget). Exposed `internal` so tests can await deterministic
    /// hydration before driving `store.apply(...)`.
    var storeHydrationTask: Task<Void, Never>?

    private var groupingTask: Task<Void, Never>?

    /// Task de chargement en vol. Coalesce les appelants concurrents : au
    /// lancement, le `.task` de `RootView` ET celui de `ConversationListView`
    /// appellent `loadConversations()` sur le MÊME VM partagé. L'ancien
    /// `guard !isLoading` ne couvrait que la branche cold-sync — sur cache
    /// chaud (`.fresh`/`.stale`, cas courant) `isLoading` n'est jamais posé,
    /// donc les deux tournaient en entier (double loadCategories, double
    /// prefetch stories + messages). On partage la Task pour 1 seul chargement.
    var loadConversationsTask: Task<Void, Never>?

    // MARK: - Background Processing
    private func setupBackgroundProcessing() {
        // Single unified pipeline: conversations, search, filter, or categories change
        // → filter + group in one pass → single @Published update (groupedConversations).
        // Eliminates the old 3-broadcast chain ($conversations → $filteredConversations → $groupedConversations).
        Publishers.CombineLatest4($conversations, searchTextModel.$text, Publishers.CombineLatest($selectedFilters, $activeTagFilter), $userCategories)
            .debounce(for: .milliseconds(16), scheduler: DispatchQueue.main)
            .sink { [weak self] (convs, text, filters, categories) in
                guard let self else { return }
                let (filter, tag) = filters
                let corpusCount = convs.count
                let filtered = Self.filterConversations(convs, searchText: text, filters: filter, tag: tag)
                self.filteredConversations = filtered
                let drafts = self.draftSummaries
                self.groupingTask?.cancel()
                self.groupingTask = Task.detached(priority: .userInitiated) { [weak self] in
                    guard !Task.isCancelled else { return }
                    let grouped = Self.groupConversations(filtered, categories: categories, draftSummaries: drafts)
                    guard !Task.isCancelled else { return }
                    await MainActor.run { [weak self] in
                        self?.groupedCorpusCount = corpusCount
                        self?.groupedConversations = grouped
                    }
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Static Processing Methods (thread-safe)

    /// Filtre les conversations selon le texte de recherche et le filtre sélectionné
    /// - Peut s'exécuter sur n'importe quel thread (pas d'accès à self)
    nonisolated static func filterConversations(
        _ conversations: [Conversation],
        searchText: String,
        filters: Set<ConversationFilter>,
        tag: String? = nil
    ) -> [Conversation] {
        return conversations.filter { c in
            // Étiquette active (carte de focus) : seules celles qui la portent.
            if let tag, !c.tags.contains(where: { $0.name == tag }) { return false }
            // Soft delete (`.deleteForUser` / `.leave` set `deletedForUserAt`):
            // the store keeps the row in RAM until a refresh drops it, so the
            // list must hide it from EVERY filter (incl. .archived). Matches
            // `ConversationUserState.isVisible`.
            guard c.userState.deletedForUserAt == nil else { return false }
            // Les ARCHIVES changent de corpus, elles ne restreignent pas : sans
            // ce gate, une archivée reparaîtrait dans « Non lus » parce qu'elle
            // porte encore des messages non lus.
            let wantsArchived = ConversationFilterComposition.includesArchived(filters)
            guard wantsArchived == c.userState.isArchived else { return false }
            // Une archivée n'a pas à être encore ACTIVE pour se montrer : c'est
            // le seul corpus où l'inactivité est attendue.
            guard wantsArchived || c.isActive else { return false }

            // TYPES : un OU. Vide ⇒ aucun type n'est exigé.
            let types = ConversationFilterComposition.selectedTypes(filters)
            let typeMatch = types.isEmpty || types.contains { type in
                switch type {
                case .personnel: return c.type == .direct
                case .privee: return c.type == .group
                case .ouvertes: return c.type == .public || c.type == .community
                case .globales: return c.type == .global
                case .channels: return c.isAnnouncementChannel
                default: return false
                }
            }

            // ÉTATS : un ET. Vide ⇒ aucune restriction.
            let states = ConversationFilterComposition.selectedStates(filters)
            let stateMatch = states.allSatisfy { state in
                switch state {
                case .unread: return c.userState.unreadCount > 0
                case .favoris: return c.userState.reaction != nil
                default: return true
                }
            }

            let filterMatch = typeMatch && stateMatch
            // `displayName` (not `name`): a conversation renamed locally via
            // `userState.customName` must remain findable by the name the
            // row actually shows, not just the server-side title/identifier.
            let searchMatch = searchText.isEmpty || c.displayName.localizedCaseInsensitiveContains(searchText)
            return filterMatch && searchMatch
        }
    }

    // MARK: - Sync Engine Observation

    /// Slot dédié remplacé à chaque appel : `observeSync()` est invoqué par
    /// l'init ET par RootView/iPadRootView (`.task`) sur la même instance
    /// partagée — avec `.store(in: &cancellables)` chaque signal sync
    /// déclenchait deux pipelines debounce → deux `reloadFromCache()` (double
    /// lecture GRDB + double regroupement) dès le boot.
    var syncCancellable: AnyCancellable? {
        willSet { syncCancellable?.cancel() }
    }

    /// Ids présents dans la dernière émission du store. Une conversation qui
    /// DISPARAÎT d'une émission à la suivante a été supprimée (`conversation:deleted`
    /// → `applyConversationDeleted`) : c'est le seul signal de suppression que
    /// le store publie. Comparer à l'absence pure serait faux — le store peut
    /// être moins hydraté que la liste, et toutes les lignes s'évaporeraient.
    var lastStoreSnapshotIds: Set<String> = []

    // MARK: - Lifecycle

    nonisolated deinit {
        storyPrefetchTask?.cancel()
        groupingTask?.cancel()
    }

    // MARK: - Typing

    /// Branche le suivi de frappe sur le socket ; `typingUsernames` et
    /// `typingUsers` sont réalignés ensemble sur la sélection du suivi.
    private func observeTyping() {
        typingTracker.observe(
            typingStarted: messageSocket.typingStarted,
            typingStopped: messageSocket.typingStopped,
            messageReceived: messageSocket.messageReceived,
            currentUserId: { [weak self] in self?.currentUserId ?? "" },
            onSelectionChanged: { [weak self] conversationId, selection in
                self?.applyTypingSelection(selection, for: conversationId)
            }
        )
    }

    private func applyTypingSelection(_ selection: TypingUser?, for conversationId: String) {
        if typingUsernames[conversationId] != selection?.displayName { typingUsernames[conversationId] = selection?.displayName }
        if typingUsers[conversationId] != selection?.username { typingUsers[conversationId] = selection?.username }
    }

    static func typingSelection(for typers: [String: TypingUser]?) -> TypingUser? {
        ConversationListTypingTracker.typingSelection(for: typers)
    }

    // MARK: - Preview Messages

    func loadPreviewMessages(for conversationId: String, refresh: Bool = false, intent: ConversationListPreviewLoader.LoadIntent? = nil, isDirect: Bool? = nil) async {
        await previewLoader.load(for: conversationId, intent: intent ?? (refresh ? .open : .ensure), isDirect: isDirect, currentUserId: { [weak self] in self?.currentUserId ?? "" })
    }

    // MARK: - Mark as Read (local update from ConversationView)

    private func observeMarkAsRead() {
        markedReadObserver.observe { [weak self] cid in
            guard let self else { return }
            // La ligne AFFICHÉE d'abord, le store ensuite : `clearUnreadLocally`
            // est synchrone, `store.applyReadReceipt` traverse un acteur.
            // Les enchaîner dans l'autre sens faisait attendre à la pastille
            // un aller-retour d'acteur — visible en split-view iPad, où la
            // liste reste à l'écran pendant qu'on ouvre la conversation.
            self.clearUnreadLocally(cid)
            // Corrige le `ConversationStore` (RAM, tiers) : ce store
            // n'apprend autrement jamais qu'une
            // conversation vient d'être lue par CE chemin (rattrapage,
            // quick-action push, widget — tous postent `.conversationMarkedRead`,
            // aucun ne route vers `store.apply(.markAsRead, …)`). Sa
            // prochaine republication — déclenchée par N'IMPORTE QUELLE
            // mutation sur N'IMPORTE QUELLE AUTRE conversation, `commit()`
            // republiant tout le snapshot — regreffait sinon un `unreadCount`
            // périmé sur cette ligne pourtant déjà lue : le badge persistait
            // indéfiniment jusqu'au prochain `reloadFromCache()` (bug user
            // 2026-08-11). `applyReadReceipt` est LOCAL (jamais de réseau,
            // contrairement à `.markAsRead` — cf. `shouldDispatchListMarkAsRead` :
            // cet endpoint liste poste un mark-read « sans corps » auquel le
            // gateway retombe sur un repli par fenêtre temporelle, déclarant
            // lus des messages jamais montrés) et monotone sur `lastReadAt`
            // (inoffensif si un accusé plus récent est déjà en place).
            await self.store.applyReadReceipt(
                ReadStatusEvent(conversationId: cid, unreadCount: 0, lastReadAt: Date())
            )
        }
    }

    // MARK: - Helpers

    var currentUserId: String {
        authManager.currentUser?.id ?? ""
    }

    /// Le mot qui me désigne dans le préfixe d'auteur d'une ligne de liste
    /// (#6921) — « Vous : », clé `message.author.self` de la matrice validée
    /// (#7548), traduite dans les sept langues. Le fil garde son « Toi »
    /// (`focal.row.you`) : la liste vouvoie, comme ses autres libellés.
    /// Posé dans le SDK au démarrage (`MeeshyApp`), qui le relaie partout.
    static let youAuthorLabel = String(localized: "message.author.self", defaultValue: "Vous", bundle: .main)

    /// Dans le corps de la classe, pas dans `+Loading` : `ConversationListLaunchTests`
    /// la redéfinit (`override`), et une méthode déclarée en extension ne se redéfinit pas.
    func loadConversations() async {
        // Coalesce concurrent callers : si un chargement est déjà en vol, on
        // l'attend au lieu d'en lancer un second. Les appels réellement
        // séquentiels (après que la Task se soit terminée et remise à nil)
        // relancent normalement un chargement frais.
        if let task = loadConversationsTask {
            await task.value
            return
        }
        let task = Task { [weak self] in
            guard let self else { return }
            await self.performLoadConversations()
        }
        loadConversationsTask = task
        await task.value
        loadConversationsTask = nil
    }
}

extension Notification.Name {
    static let conversationMarkedRead = Notification.Name("conversationMarkedRead")
}
