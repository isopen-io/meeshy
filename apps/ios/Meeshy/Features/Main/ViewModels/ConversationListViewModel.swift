import Foundation
import SwiftUI
import Combine
import os
import MeeshySDK

@MainActor
class ConversationListViewModel: ObservableObject {
    @Published var conversations: [Conversation] = [] {
        didSet { _convIdIndex = nil }
    }
    @Published var userCategories: [ConversationSection] = []
    @Published var isLoading = false
    /// Convenience accessor mirroring `paginationState == .loadingMore`.
    /// Kept for compatibility with views that still bind to the boolean
    /// (e.g. the spinner footer in ConversationListView). Updates flow
    /// through `paginationState`'s @Published wrapper, so SwiftUI
    /// re-evaluates dependents when this transitions.
    var isLoadingMore: Bool { paginationState == .loadingMore }
    /// `true` when the last cold-start sync failed and the cache is still
    /// empty. The view reads this to swap the empty-state placeholder for
    /// a retryable error panel. We don't reuse `isLoading` because the
    /// user should see a distinct "failed — tap to retry" affordance, not
    /// a confusing empty list.
    @Published private(set) var loadFailed = false
    /// High-level state for the list surface (cache status / cold load
    /// / error). Computed alongside `isLoading` so consumers that want
    /// the cache-first nuances (`cachedStale` keeps showing data while
    /// silent revalidate runs) can react without inspecting multiple
    /// booleans. `isLoading` remains for binary "show big spinner?"
    /// consumers; new code should prefer `loadState`.
    @Published private(set) var loadState: LoadState = .idle
    /// State of the cursor-paginated infinite scroll. `.idle` when ready
    /// to fetch, `.loadingMore` while a `loadMore()` call is in flight,
    /// `.exhausted` once the gateway signalled `hasMore=false` (so the
    /// view can hide the spinner permanently), `.error` for transient
    /// failures the user can retry by scrolling back.
    @Published private(set) var paginationState: PaginationState = .idle
    /// Mirror of `paginationState`'s "more pages exist" signal. Kept as
    /// a separate @Published so views that already bound to a Bool
    /// (footer visibility, "load more" affordance) don't have to migrate
    /// to switching on the enum. Stays in sync via `paginationState`'s
    /// transitions.
    @Published private(set) var hasMore: Bool = true
    /// Opaque cursor returned by the last `listPage` call. `nil` until
    /// the first page is fetched, then carries the gateway-issued id of
    /// the page tail. `loadMore()` forwards it as the `before` query
    /// parameter so the next page filters `lastMessageAt < cursor`.
    private var nextCursor: String?

    // MARK: - Reactive Filters & Prepared Data
    @Published var searchText: String = ""
    @Published var selectedFilter: ConversationFilter = .all
    private(set) var filteredConversations: [Conversation] = []
    @Published var groupedConversations: [(section: ConversationSection, conversations: [Conversation])] = []
    /// Brouillons actifs indexés par conversationId. Alimente le badge
    /// « Brouillon » de la ligne et la priorité de tri. Concept client-local
    /// — jamais stocké dans le modèle SDK `Conversation`.
    @Published private(set) var draftSummaries: [String: DraftSummary] = [:]
    /// Typing usernames indexed by conversationId. @Published — ConversationRowItem
    /// + ThemedConversationRow are Equatable with .equatable() applied
    /// (ConversationListView+Rows.swift:70), so only the row whose typingUsername
    /// changed re-evaluates its body. The full list does NOT re-render.
    @Published var typingUsernames: [String: String] = [:]  // conversationId → displayName (derived view of `typers`)
    /// Per-user source of truth: conversationId → (userId → displayName). The
    /// public `typingUsernames` is derived from this so a `typing:stop` from ONE
    /// member of a group no longer wipes the whole row's indicator while OTHER
    /// members are still typing (displayed "personne n'écrit" ≠ real "B écrit").
    private var typers: [String: [String: String]] = [:]
    var previewMessages: [String: [Message]] = [:]  // conversationId → recent messages (non-Published — only used in context menu preview)
    private var previewLoadingInFlight: Set<String> = []
    // `nonisolated(unsafe)` : muté uniquement sur le MainActor, lu une fois
    // par le `nonisolated deinit` pour invalider les timers de typing 15 s
    // encore armés (sinon ils survivaient au VM en no-ops weak-self) —
    // même pattern que `ConversationSocketHandler.typingSafetyTimers`.
    nonisolated(unsafe) private var typingTimers: [String: Timer] = [:]

    var totalUnreadCount: Int {
        conversations.reduce(0) { $0 + $1.userState.unreadCount }
    }

    private let api: APIClientProviding
    private let conversationService: ConversationServiceProviding
    private let preferenceService: PreferenceServiceProviding
    private let messageSocket: MessageSocketProviding
    private let messageService: MessageServiceProviding
    private let authManager: AuthManaging
    private let storyService: StoryServiceProviding
    private let syncEngine: ConversationSyncEngineProviding
    /// Mutation source of truth for per-user conversation state (pin, mute,
    /// archive, read, section, reaction, tags). The VM hydrates it from the
    /// loaded list and observes it back so a mutation from any surface
    /// (list swipe, context menu, options sheet) lands here optimistically
    /// with outbox-backed offline replay. Metadata + ordering stay owned by
    /// this VM (the store only sorts by `lastMessageAt`).
    private let store: ConversationStore
    /// Source of truth for the user's conversation categories (sections). The
    /// VM seeds it from the cache-first load and observes it back, so a
    /// cross-device category event (created/renamed/reordered/deleted, routed
    /// by `ConversationStoreSocketBridge`) or a local expand/collapse reflects
    /// into `userCategories` via its publisher.
    private let categoryStore: UserCategoryStore
    /// Publisher des notifications push « message » (conversationId). Injecté
    /// pour la testabilité ; en production, branché sur
    /// `PushNotificationManager.shared.messageNotificationReceived`.
    private let messageNotificationPublisher: AnyPublisher<String, Never>
    /// Source des brouillons persistés (UserDefaults). Injecté pour la
    /// testabilité ; en production, `DraftStore.shared`.
    private let draftStore: DraftStore
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
    private let pageLimit = 100
    private var cancellables = Set<AnyCancellable>()
    var storyPrefetchTask: Task<Void, Never>?

    // O(1) conversation lookup by ID
    private var _convIdIndex: [String: Int]?
    private func convIndex(for id: String) -> Int? {
        if _convIdIndex == nil {
            var index = [String: Int](minimumCapacity: conversations.count)
            for (i, c) in conversations.enumerated() { index[c.id] = i }
            _convIdIndex = index
        }
        return _convIdIndex?[id]
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
        let drafts = draftSummaries
        let sorted = merged.sorted { Self.conversationsAreInOrder($0, $1, draftSummaries: drafts) }
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

    /// Test-only counter: incremented every time `schedulePersist`'s task
    /// actually completes a save (i.e. survived the debounce window). Used
    /// by unit tests to assert coalescing without mocking the GRDB-backed
    /// `CacheCoordinator` actor. Production code never reads this.
    #if DEBUG
    var persistCallCount = 0
    #endif

    /// Coalesced persistence: saves the current `conversations` snapshot
    /// + pagination cursor + hasMore flag to the L2 cache after a short
    /// debounce so a burst of mutations (a `fetchAndPrependMissingConversation`
    /// followed immediately by a `bumpToTop`, or N rapid socket events on
    /// the same conversation) produces ONE GRDB write rather than N.
    ///
    /// Cancels any prior in-flight persist task so the latest snapshot
    /// always wins — same discipline as `loadMore`'s inline persist
    /// (line 841) and `pullToRefresh`'s pre-invalidate cancel (line 873).
    /// Callers MUST be on the MainActor (snapshot is read here, before
    /// the detached Task captures it).
    func schedulePersist(debounce: TimeInterval = 0.2) {
        persistTask?.cancel()
        let snapshot = conversations
        let cursor = nextCursor
        let more = hasMore
        persistTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(debounce * 1_000_000_000))
            guard !Task.isCancelled else { return }
            // Cache .save() est devenu throwing (Wave 1 Local-First) :
            // utilise try? pour preserver le comportement historique
            // best-effort. Une defaillance d'ecriture (encryption, disque
            // plein) est loggee par GRDBCacheStore et ne doit pas casser
            // le persist debounce.
            try? await CacheCoordinator.shared.conversations.save(snapshot, for: "list")
            await CacheCoordinator.shared.conversations.saveCursor(
                nextCursor: cursor, hasMore: more, for: "list"
            )
            #if DEBUG
            await MainActor.run { self?.persistCallCount += 1 }
            #endif
        }
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
    /// lastMessageAt — the row's other fields stay intact, only the
    /// timestamp + position move. No-op when the id isn't currently
    /// loaded so the engine's full-row prepend in handleNewMessage
    /// stays the source of truth for unknown conversations.
    func bumpToTop(conversationId: String, newLastMessageAt: Date) {
        guard let idx = convIndex(for: conversationId) else {
            Logger.messages.warning("[bumpToTop] conversation introuvable id=\(conversationId, privacy: .public)")
            return
        }
        var updated = conversations[idx]
        updated.lastMessageAt = newLastMessageAt
        conversations.remove(at: idx)
        conversations.insert(updated, at: 0)
        schedulePersist()
    }

    /// Track in-flight `getById` fetches launched by `conversationUpdated` so
    /// a burst of events for the same brand-new DM doesn't issue N parallel
    /// HTTP requests. Cleared synchronously on the MainActor inside
    /// `fetchAndPrependMissingConversation`.
    private var pendingMissingFetches: Set<String> = []

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
        case syncDelta              // syncSinceLastCheckpoint (foreground / reconnect)
        case pullRefresh            // user pulled to refresh
        case coldCache              // initial cache load on app start
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
                let apiConv = try await service.getById(id)
                let domain = apiConv.toConversation(currentUserId: userId)
                await MainActor.run { [weak self] in
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
                }
            } catch {
                Logger.messages.error("[Discovery] source=\(source.rawValue, privacy: .public) id=\(id, privacy: .public) action=fetch-error error=\(error.localizedDescription, privacy: .public)")
            }
        }
    }

    private var lastFetchedAt: Date? = nil
    private let cacheTTL: TimeInterval = 30

    private var isCacheValid: Bool {
        guard let ts = lastFetchedAt else { return false }
        return Date().timeIntervalSince(ts) < cacheTTL
    }

    func invalidateCache() {
        lastFetchedAt = nil
        Task.detached { await CacheCoordinator.shared.conversations.invalidateAll() }
    }

    init(
        api: APIClientProviding = APIClient.shared,
        conversationService: ConversationServiceProviding = ConversationService.shared,
        preferenceService: PreferenceServiceProviding = PreferenceService.shared,
        messageSocket: MessageSocketProviding = MessageSocketManager.shared,
        messageService: MessageServiceProviding = MessageService.shared,
        authManager: AuthManaging = AuthManager.shared,
        storyService: StoryServiceProviding = StoryService.shared,
        syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared,
        messageNotificationPublisher: AnyPublisher<String, Never> = PushNotificationManager.shared.messageNotificationReceived.eraseToAnyPublisher(),
        draftStore: DraftStore = DraftStore.shared,
        store: ConversationStore = .shared,
        categoryStore: UserCategoryStore = .shared
    ) {
        self.api = api
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
        reloadDraftSummaries()
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
    /// Fire-and-forget persistence of the merged list + cursor after a
    /// successful `loadMore`. Stored so `pullToRefresh()` (and `loadMore`
    /// itself) can cancel any in-flight save before invalidating the
    /// cache — otherwise an orphaned task could re-save the pre-refresh
    /// blob *after* `invalidateAll()` wiped L2, leaving stale data on
    /// disk for the next cold start.
    private var persistTask: Task<Void, Never>?

    /// Task de chargement en vol. Coalesce les appelants concurrents : au
    /// lancement, le `.task` de `RootView` ET celui de `ConversationListView`
    /// appellent `loadConversations()` sur le MÊME VM partagé. L'ancien
    /// `guard !isLoading` ne couvrait que la branche cold-sync — sur cache
    /// chaud (`.fresh`/`.stale`, cas courant) `isLoading` n'est jamais posé,
    /// donc les deux tournaient en entier (double loadCategories, double
    /// prefetch stories + messages). On partage la Task pour 1 seul chargement.
    private var loadConversationsTask: Task<Void, Never>?

    // MARK: - Background Processing
    private func setupBackgroundProcessing() {
        // Single unified pipeline: conversations, search, filter, or categories change
        // → filter + group in one pass → single @Published update (groupedConversations).
        // Eliminates the old 3-broadcast chain ($conversations → $filteredConversations → $groupedConversations).
        Publishers.CombineLatest4($conversations, $searchText, $selectedFilter, $userCategories)
            .debounce(for: .milliseconds(16), scheduler: DispatchQueue.main)
            .sink { [weak self] (convs, text, filter, categories) in
                guard let self else { return }
                let filtered = Self.filterConversations(convs, searchText: text, filter: filter)
                self.filteredConversations = filtered
                let drafts = self.draftSummaries
                self.groupingTask?.cancel()
                self.groupingTask = Task.detached(priority: .userInitiated) { [weak self] in
                    guard !Task.isCancelled else { return }
                    let grouped = Self.groupConversations(filtered, categories: categories, draftSummaries: drafts)
                    guard !Task.isCancelled else { return }
                    await MainActor.run { [weak self] in
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
        filter: ConversationFilter
    ) -> [Conversation] {
        return conversations.filter { c in
            // Soft delete (`.deleteForUser` / `.leave` set `deletedForUserAt`):
            // the store keeps the row in RAM until a refresh drops it, so the
            // list must hide it from EVERY filter (incl. .archived). Matches
            // `ConversationUserState.isVisible`.
            guard c.userState.deletedForUserAt == nil else { return false }
            let filterMatch: Bool
            // Hide user-archived conversations from all filters except .archived
            let userArchiveOk = filter == .archived ? c.userState.isArchived : !c.userState.isArchived
            switch filter {
            case .all: filterMatch = c.isActive && userArchiveOk
            case .unread: filterMatch = c.userState.unreadCount > 0 && userArchiveOk
            case .personnel: filterMatch = c.type == .direct && c.isActive && userArchiveOk
            case .privee: filterMatch = c.type == .group && c.isActive && userArchiveOk
            case .ouvertes: filterMatch = (c.type == .public || c.type == .community) && c.isActive && userArchiveOk
            case .globales: filterMatch = c.type == .global && c.isActive && userArchiveOk
            case .channels: filterMatch = c.isAnnouncementChannel && c.isActive && userArchiveOk
            case .favoris: filterMatch = c.userState.reaction != nil && c.isActive && userArchiveOk
            case .archived: filterMatch = c.userState.isArchived
            }
            let searchMatch = searchText.isEmpty || c.name.localizedCaseInsensitiveContains(searchText)
            return filterMatch && searchMatch
        }
    }

    /// Groupe les conversations par section et les trie
    /// - Peut s'exécuter sur n'importe quel thread (pas d'accès à self)
    nonisolated private static func groupConversations(
        _ filtered: [Conversation],
        categories: [ConversationSection],
        draftSummaries: [String: DraftSummary]
    ) -> [(section: ConversationSection, conversations: [Conversation])] {
        // No categories → flat list, no section headers needed
        let hasPinned = filtered.contains { $0.userState.isPinned && $0.userState.sectionId == nil }
        if categories.isEmpty && !hasPinned {
            let sorted = filtered.sorted { conversationsAreInOrder($0, $1, draftSummaries: draftSummaries) }
            return sorted.isEmpty ? [] : [(ConversationSection.other, sorted)]
        }

        var result: [(section: ConversationSection, conversations: [Conversation])] = []

        // O(1) lookup sets
        let categoryIds = Set(categories.map(\.id))

        // Groupement O(n) unique — remplace les k passes filter O(n×k)
        let bySection = Dictionary(grouping: filtered) { conv -> String in
            if conv.userState.isPinned && conv.userState.sectionId == nil { return "__pinned__" }
            return conv.userState.sectionId ?? "__other__"
        }

        // Pinned section
        if let pinned = bySection["__pinned__"], !pinned.isEmpty {
            result.append((ConversationSection.pinned, pinned.sorted { conversationsAreInOrder($0, $1, draftSummaries: draftSummaries) }))
        }

        // User categories (order preserved)
        for category in categories {
            if let sectionConvs = bySection[category.id], !sectionConvs.isEmpty {
                let sorted = sectionConvs.sorted { conversationsAreInOrder($0, $1, draftSummaries: draftSummaries) }
                result.append((category, sorted))
            }
        }

        // Orphaned (catégorie supprimée) + non-catégorisées → section "other"
        let otherConvs = (bySection["__other__"] ?? []) + filtered.filter { conv in
            guard let sid = conv.userState.sectionId else { return false }
            return !categoryIds.contains(sid)
        }
        if !otherConvs.isEmpty {
            result.append((ConversationSection.other, otherConvs.sorted { conversationsAreInOrder($0, $1, draftSummaries: draftSummaries) }))
        }

        return result
    }

    /// Ordre total de la liste de conversations. Épinglées d'abord ; parmi les
    /// non-épinglées, les conversations avec un brouillon actif flottent en
    /// tête (brouillon le plus récemment édité d'abord) ; le reste retombe sur
    /// `lastMessageAt` décroissant. Les épinglées conservent leur tri
    /// `lastMessageAt` — la priorité brouillon ne s'applique qu'aux
    /// non-épinglées.
    nonisolated static func conversationsAreInOrder(
        _ a: Conversation,
        _ b: Conversation,
        draftSummaries: [String: DraftSummary]
    ) -> Bool {
        if a.userState.isPinned != b.userState.isPinned { return a.userState.isPinned }
        if a.userState.isPinned && b.userState.isPinned { return a.lastMessageAt > b.lastMessageAt }
        let aHasDraft = draftSummaries[a.id] != nil
        let bHasDraft = draftSummaries[b.id] != nil
        if aHasDraft != bHasDraft { return aHasDraft }
        if let aDraft = draftSummaries[a.id], let bDraft = draftSummaries[b.id] {
            return aDraft.updatedAt > bDraft.updatedAt
        }
        return a.lastMessageAt > b.lastMessageAt
    }

    // MARK: - Sync Engine Observation

    /// Slot dédié remplacé à chaque appel : `observeSync()` est invoqué par
    /// l'init ET par RootView/iPadRootView (`.task`) sur la même instance
    /// partagée — avec `.store(in: &cancellables)` chaque signal sync
    /// déclenchait deux pipelines debounce → deux `reloadFromCache()` (double
    /// lecture GRDB + double regroupement) dès le boot.
    private var syncCancellable: AnyCancellable? {
        willSet { syncCancellable?.cancel() }
    }

    func observeSync() {
        let publisher = syncEngine.conversationsDidChange
        syncCancellable = publisher
            .receive(on: DispatchQueue.main)
            .debounce(for: .milliseconds(200), scheduler: DispatchQueue.main)
            .sink { [weak self] in
                Task { @MainActor [weak self] in
                    await self?.reloadFromCache()
                }
            }
        // (Removed) ConversationPreferencesBroadcaster subscription: the options
        // sheet now mutates via ConversationStore (increment 2), so a pref change
        // reflects on the row through `observeStore` (the store merge sink) in the
        // same Combine tick — the broadcaster bridge is redundant and deleted.
    }

    // MARK: - Conversation Store Observation

    /// Subscribe to the mutation store and reconcile its per-user state back
    /// into the displayed list. The store is the source of truth for
    /// `userState` (pin/mute/archive/read/section/reaction/tags); this VM keeps
    /// ownership of metadata + ordering. A mutation from ANY surface that calls
    /// `store.apply(...)` lands here in the same Combine tick.
    private func observeStore() {
        store.listPublisher()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] snapshot in
                self?.mergeUserStateFromStore(snapshot)
            }
            .store(in: &cancellables)
    }

    /// Subscribe to the category store and mirror its snapshot into
    /// `userCategories` (the grouping pipeline's section source). The store is
    /// the SoT for categories: a local expand/collapse (`setExpanded`) and a
    /// cross-device category event (`applyRemote`, routed by the socket bridge)
    /// both land here through its publisher.
    private func observeCategoryStore() {
        categoryStore.publisher()
            // Drop the CurrentValueSubject's initial replay: at init the store
            // is empty and `userCategories` is already empty, so the first
            // emission is redundant. `loadCategories` re-emits via
            // `hydrateFromSnapshot` (a post-subscribe emission, not dropped) for
            // the actual paint; only real changes (hydrate / setExpanded /
            // applyRemote) drive `userCategories` thereafter.
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] categories in
                self?.applyCategories(categories)
            }
            .store(in: &cancellables)
    }

    /// Graft the store's `userState` onto the matching rows. Metadata and
    /// ordering are untouched. Guarded so an echo of an unchanged snapshot
    /// (e.g. the publish that follows our own hydration) doesn't churn the
    /// grouping pipeline.
    private func mergeUserStateFromStore(_ snapshot: [MeeshyConversation]) {
        guard !conversations.isEmpty else { return }
        var stateById = [String: ConversationUserState](minimumCapacity: snapshot.count)
        for conv in snapshot { stateById[conv.id] = conv.userState }
        var updated = conversations
        var changed = false
        for i in updated.indices {
            guard let newState = stateById[updated[i].id], updated[i].userState != newState else { continue }
            updated[i].userState = newState
            changed = true
        }
        if changed { conversations = updated }
    }

    private func reloadFromCache() async {
        // Restore the cursor BEFORE swapping the conversations array so
        // that any consumer reacting to `setConversations` (or a follow-
        // up `loadMore` triggered by a near-end scroll) sees a coherent
        // (cursor, items) pair rather than a fresh list paired with the
        // old cursor that may already be invalidated.
        if let cursor = await CacheCoordinator.shared.conversations.loadCursor(for: "list") {
            nextCursor = cursor.nextCursor
            hasMore = cursor.hasMore
            paginationState = cursor.hasMore ? .idle : .exhausted
        }
        let cached = await CacheCoordinator.shared.conversations.load(for: "list")
        switch cached {
        case .fresh(let data, _), .stale(let data, _):
            Logger.messages.debug("[ConversationListVM] reloadFromCache hit count=\(data.count)")
            setConversations(data)
        case .expired, .empty:
            // Trou silencieux historique : un signal `conversationsDidChange`
            // avec un cache expiré laissait la liste figée sans trace.
            Logger.messages.info("[ConversationListVM] reloadFromCache MISS (expired/empty) — liste non rafraîchie")
            break
        }
    }

    // MARK: - Real-time Socket Subscriptions

    private func subscribeToSocketEvents() {
        // Typing indicator — affiche "<Auteur> écrit..." dans le row
        messageSocket.typingStarted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                // Don't surface YOUR OWN typing — the gateway echoes typing to every
                // participant including the author, so on multi-device this would show
                // "<You> écrit…" on your own conversation row. Mirror the per-conversation
                // guard in ConversationSocketHandler.
                guard event.userId != currentUserId else { return }
                typers[event.conversationId, default: [:]][event.userId] = event.preferredDisplayName
                typingUsernames[event.conversationId] = Self.typingDisplayName(for: typers[event.conversationId])
                scheduleTypingCleanup(for: event.conversationId)
            }
            .store(in: &cancellables)

        messageSocket.typingStopped
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.handleTypingStopped(userId: event.userId, conversationId: event.conversationId)
            }
            .store(in: &cancellables)

        messageSocket.userPreferencesUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let convId = event.conversationId else { return }
                if let idx = convIndex(for: convId) {
                    var conv = conversations[idx]
                    if let isPinned = event.isPinned { conv.userState.isPinned = isPinned }
                    if let isMuted = event.isMuted { conv.userState.isMuted = isMuted }
                    if let isArchived = event.isArchived { conv.userState.isArchived = isArchived }
                    if let mentionsOnly = event.mentionsOnly { conv.userState.mentionsOnly = mentionsOnly }
                    if let categoryId = event.categoryId { conv.userState.sectionId = categoryId }
                    if let reaction = event.reaction { conv.userState.reaction = reaction }
                    if let customName = event.customName { conv.userState.customName = customName }
                    if let tags = event.tags {
                        conv.tags = tags.enumerated().map { index, name in
                            MeeshyConversationTag(name: name, color: MeeshyConversationTag.colors[index % MeeshyConversationTag.colors.count])
                        }
                    }
                    conversations[idx] = conv
                    schedulePersist()
                }
            }
            .store(in: &cancellables)

        messageSocket.conversationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                guard let index = self.convIndex(for: event.conversationId) else {
                    // Conversation pas encore connue côté client : c'est le cas
                    // d'un DM tout neuf (ou d'un groupe qu'on vient d'ajouter
                    // à l'utilisateur) où le gateway a déjà émis
                    // CONVERSATION_UPDATED dans ROOMS.user(self) MAIS
                    // self n'a jamais reçu MESSAGE_NEW (il n'avait pas joint
                    // ROOMS.conversation(id) avant ce moment). Sans fetch
                    // d'appoint la conversation reste invisible jusqu'à un
                    // pull-to-refresh manuel.
                    self.fetchAndPrependMissingConversation(id: event.conversationId, source: .socketUpdated)
                    return
                }
                // Apply the in-place metadata updates first; the gateway
                // can piggy-back rename/avatar changes on the same event
                // that carries lastMessageAt, so we want the row data fresh
                // BEFORE we bump it to position 0 (otherwise the bumped
                // row would render stale title for one frame).
                // Un DM n'est jamais renommable : son `title` client est le
                // nom du participant, dérivé à la conversion REST
                // (`toConversation` écarte le titre DB). Le payload socket
                // porte le titre BRUT — le greffer sur un DM écrase le nom
                // affiché (« sandra raveloson » → « Sany » au premier
                // pin/mute, vu 2026-07-04). Greffe réservée aux
                // conversations renommables.
                if let title = event.title, self.conversations[index].type != .direct {
                    self.conversations[index].title = title
                }
                if let description = event.description { self.conversations[index].description = description }
                if let avatar = event.avatar { self.conversations[index].avatar = avatar }
                if let banner = event.banner { self.conversations[index].banner = banner }
                if let isAnnouncement = event.isAnnouncementChannel {
                    self.conversations[index].isAnnouncementChannel = isAnnouncement
                }
                if let writeRole = event.defaultWriteRole {
                    self.conversations[index].defaultWriteRole = writeRole
                }
                if let slowMode = event.slowModeSeconds {
                    self.conversations[index].slowModeSeconds = slowMode
                }
                if let autoTranslate = event.autoTranslateEnabled {
                    self.conversations[index].autoTranslateEnabled = autoTranslate
                }
                // Message-driven bump also carries the new preview text so
                // the row shows the latest message without waiting for the
                // next full sync (lastMessageTranslations arrive separately).
                if let msgId = event.lastMessageId { self.conversations[index].lastMessageId = msgId }
                if let preview = event.lastMessagePreview { self.conversations[index].lastMessagePreview = preview.meeshyPreviewTruncated }

                // Bump the row to the top when the gateway tells us a new
                // message advanced lastMessageAt. We compare strictly
                // greater-than so a re-broadcast of the same timestamp
                // (e.g. metadata-only update echoed back to the user
                // room) doesn't pointlessly reshuffle the list and
                // trigger a re-render of every cell behind it.
                if let newLastAt = event.lastMessageAt,
                   newLastAt > self.conversations[index].lastMessageAt {
                    Logger.messages.debug("[conversationUpdated] bump websocket id=\(event.conversationId, privacy: .public)")
                    self.bumpToTop(conversationId: event.conversationId, newLastMessageAt: newLastAt)
                } else {
                    // Metadata-only mutation (rename, avatar swap, broadcast
                    // toggle) still needs to land in L2 so a cold restart
                    // doesn't show the pre-event title for a frame. bumpToTop
                    // already calls schedulePersist when it runs.
                    self.schedulePersist()
                }
            }
            .store(in: &cancellables)

        // Primary discovery path for newly-created conversations.
        //
        // Per the 2026-05-11 socket-event audit (see
        // tasks/socketio-events-cleanup.md), the gateway now emits a typed
        // `conversation:new` event to the user-rooms of EVERY participant —
        // creator included — when a conversation is created. Before this,
        // the creator received no socket signal at all (the legacy
        // notification:new loop in core.ts:922 only iterated over
        // `uniqueParticipantIds`, excluding `userId`), and invitees relied
        // on a string-discriminated `notification:new` with type
        // `new_conversation_*`. The typed event removes both quirks.
        //
        // We still subscribe to the legacy `notification:new` block below
        // as a fallback for ~3 months while older clients/server versions
        // are in production. `pendingMissingFetches` dedups the two paths
        // when both fire for the same id within a few hundred ms.
        messageSocket.conversationNew
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self,
                      self.convIndex(for: event.conversationId) == nil else { return }
                self.fetchAndPrependMissingConversation(id: event.conversationId, source: .socketNew)
            }
            .store(in: &cancellables)

        // Legacy path: pre-CONVERSATION_NEW gateway sends a generic
        // `notification:new` with `type=new_conversation_direct|group|added_to_conversation`.
        // Kept active during the ~3-month rollout window so older gateways
        // still surface fresh conversations. Once min-deployed-server-version
        // ships CONVERSATION_NEW everywhere, this branch can be removed.
        messageSocket.notificationReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self else { return }
                switch event.type {
                case "new_conversation_direct",
                     "new_conversation_group",
                     "added_to_conversation":
                    guard let convId = event.context?.conversationId,
                          self.convIndex(for: convId) == nil else { return }
                    self.fetchAndPrependMissingConversation(id: convId, source: .socketNotification)
                default:
                    break
                }
            }
            .store(in: &cancellables)

        messageSocket.participantSelfLeft
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                self.conversations[index].memberCount -= 1
                self.schedulePersist()
            }
            .store(in: &cancellables)

        messageSocket.participantBanned
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                self.conversations[index].memberCount -= 1
                self.schedulePersist()
            }
            .store(in: &cancellables)

        messageSocket.participantUnbanned
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                self.conversations[index].memberCount += 1
                self.schedulePersist()
            }
            .store(in: &cancellables)

        // NOTE: `messageSocket.didReconnect` is intentionally NOT observed here.
        // `ConversationSyncEngine.startSocketRelay()` already handles the
        // reconnect → `syncSinceLastCheckpoint()` chain at the SDK boundary,
        // and any resulting list mutation flows back into this view-model
        // through `syncEngine.conversationsDidChange` (subscribed in
        // `observeSync()` above) which triggers `reloadFromCache()`.
        // Subscribing twice produced N× delta-sync calls per flap — the
        // 2026-05-11 audit traced a `/conversations` request burst back to
        // exactly this duplication. Keeping the relay in the engine keeps
        // one and only one delta sync per reconnect.
    }

    // MARK: - Push Notification Subscription

    /// Remonte une conversation en tête dès qu'une notification push
    /// « message » arrive — couvre les messages reçus alors que le websocket
    /// était déconnecté (app en arrière-plan). Le payload push ne porte pas
    /// l'horodatage du message ; on utilise `dateProvider()` (instant de
    /// réception). La conséquence — `lastMessageAt` légèrement dans le futur
    /// jusqu'au prochain sync — est documentée comme bénigne dans le spec.
    private func subscribeToPushNotifications() {
        messageNotificationPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] conversationId in
                guard let self else { return }
                if self.convIndex(for: conversationId) != nil {
                    self.bumpToTop(conversationId: conversationId, newLastMessageAt: self.dateProvider())
                } else {
                    self.fetchAndPrependMissingConversation(id: conversationId, source: .pushNotification)
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Draft Summaries

    /// Recharge `draftSummaries` depuis le `DraftStore`. `internal` pour que
    /// les tests pilotent la synchro de façon déterministe.
    func reloadDraftSummaries() {
        draftSummaries = draftStore.allNonEmptyDrafts().mapValues { draft in
            DraftSummary(
                previewText: draft.text.trimmingCharacters(in: .whitespacesAndNewlines),
                updatedAt: draft.updatedAt
            )
        }
    }

    /// S'abonne aux mutations de brouillon. Le composer persiste à chaque
    /// frappe, donc `changed` émet en rafale — d'où le debounce de 300 ms qui
    /// évite de recharger tous les brouillons + re-trier à chaque caractère.
    /// Le re-`setConversations` ré-émet `$conversations`, ce qui relance le
    /// pipeline de groupement avec les `draftSummaries` fraîchement rechargés.
    private func subscribeToDrafts() {
        draftStore.changed
            .receive(on: DispatchQueue.main)
            .debounce(for: .milliseconds(300), scheduler: DispatchQueue.main)
            .sink { [weak self] in
                guard let self else { return }
                self.reloadDraftSummaries()
                self.setConversations(self.conversations)
            }
            .store(in: &cancellables)
    }

    // MARK: - Typing Cleanup

    private func scheduleTypingCleanup(for conversationId: String) {
        typingTimers[conversationId]?.invalidate()
        typingTimers[conversationId] = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.clearTyping(for: conversationId)
            }
        }
    }

    /// A `typing:stop` removes ONLY the member who stopped. The row's indicator
    /// stays up (re-derived from the remaining typers) until the last one stops.
    /// Falls back to a full clear when we have no per-user tracking for the
    /// conversation (e.g. the display was seeded out-of-band), preserving the
    /// legacy "a stop clears the row" contract for that case.
    private func handleTypingStopped(userId: String, conversationId: String) {
        guard var convTypers = typers[conversationId], !convTypers.isEmpty else {
            clearTyping(for: conversationId)
            return
        }
        convTypers.removeValue(forKey: userId)
        if convTypers.isEmpty {
            clearTyping(for: conversationId)
            return
        }
        typers[conversationId] = convTypers
        typingUsernames[conversationId] = Self.typingDisplayName(for: convTypers)
    }

    private func clearTyping(for conversationId: String) {
        typingTimers[conversationId]?.invalidate()
        typingTimers[conversationId] = nil
        typingUsernames.removeValue(forKey: conversationId)
        typers.removeValue(forKey: conversationId)
    }

    /// Picks the single name surfaced on the row from the set of current typers.
    /// The row API is single-name; sorting keeps the choice deterministic (and
    /// stable across re-renders) when several members type at once.
    nonisolated static func typingDisplayName(for typers: [String: String]?) -> String? {
        guard let typers, !typers.isEmpty else { return nil }
        return typers.values.sorted().first
    }

    // MARK: - Badge Sync
    //
    // The coordinator owns the badge + widget shared store. We simply forward the
    // latest conversation snapshot whenever the list mutates; the coordinator debounces
    // the downstream writes so we don't need to.

    private func syncBadgeOnUnreadChange() {
        $conversations
            .removeDuplicates { lhs, rhs in
                guard lhs.count == rhs.count else { return false }
                for (a, b) in zip(lhs, rhs) where a.id != b.id || a.userState.unreadCount != b.userState.unreadCount || a.userState.isPinned != b.userState.isPinned {
                    return false
                }
                return true
            }
            .debounce(for: .milliseconds(200), scheduler: DispatchQueue.main)
            .sink { convs in
                NotificationCoordinator.shared.registerConversations(convs)
            }
            .store(in: &cancellables)
    }

    // MARK: - Load Categories
    //
    // Cache-first per the architecture bible (Pattern I1). Without this the
    // grouping pipeline (CombineLatest4 line 230) fires immediately after
    // setConversations and groups every row into the "Other" bucket because
    // `userCategories = []` at that point — then 100-300ms later the API
    // response arrives, userCategories repopulates, the grouping re-runs,
    // and the user sees the section headers flash in. With cache-first the
    // categories are populated synchronously on cold start (sub-100ms via
    // the GRDB actor hop) and the grouping has the right buckets from the
    // very first frame.

    func loadCategories() async {
        if let cached = await preferenceService.loadCachedCategories() {
            // Paint synchronously for the cold-start frame (no grouping flash),
            // then seed the category store as the SoT. Its publisher
            // (`observeCategoryStore`) drives every subsequent update —
            // expand/collapse via `setExpanded`, and cross-device category
            // events via `applyRemote`.
            applyCategories(cached)
            await categoryStore.hydrateFromSnapshot(cached)
        }
        // Background revalidate so the next session picks up server-truth
        // changes (new category created on web, color renamed, etc.). The
        // store publisher repaints `userCategories`; errors are non-fatal —
        // we keep whatever snapshot we already painted.
        do {
            let fresh = try await preferenceService.revalidateCategories()
            await categoryStore.hydrateFromSnapshot(fresh)
        } catch {
            // Network blip or unauthorized: cached value (if any) stays.
        }
    }

    /// Convert + sort the API model into the section model the grouping
    /// pipeline consumes. Idempotent — calling with the same input twice
    /// produces the same `userCategories` array.
    private func applyCategories(_ categories: [ConversationCategory]) {
        userCategories = categories.map { cat in
            ConversationSection(
                id: cat.id,
                name: cat.name,
                icon: cat.icon ?? "folder.fill",
                color: cat.color?.replacingOccurrences(of: "#", with: "") ?? "45B7D1",
                isExpanded: cat.isExpanded ?? true,
                order: cat.order ?? 0
            )
        }.sorted { $0.order < $1.order }
    }

    // MARK: - Load Conversations

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

    private func performLoadConversations() async {
        Logger.messages.debug("[ConversationListVM] loadConversations called")

        // Defensive: a re-entrant load (e.g. post-logout/login) should
        // not race a still-running persist from a previous session's
        // loadMore. Cancellation is cheap when there's nothing to cancel.
        persistTask?.cancel()

        async let categoriesTask: () = loadCategories()

        // Restore the persisted cursor BEFORE the cache load so that a
        // subsequent loadMore (e.g. user scrolls right after launch)
        // resumes from the deepest tail reached in the previous session
        // rather than refetching page 1.
        if let cursor = await CacheCoordinator.shared.conversations.loadCursor(for: "list") {
            nextCursor = cursor.nextCursor
            hasMore = cursor.hasMore
            paginationState = cursor.hasMore ? .idle : .exhausted
        }

        let cached = await CacheCoordinator.shared.conversations.load(for: "list")
        switch cached {
        case .fresh(let data, _):
            setConversations(data)
            loadFailed = false
            loadState = .cachedFresh
            lastFetchedAt = Date()
        case .stale(let data, _):
            setConversations(data)
            loadFailed = false
            loadState = .cachedStale
            lastFetchedAt = Date()
            Task { [weak self] in
                await self?.syncEngine.syncSinceLastCheckpoint()
                await MainActor.run { [weak self] in
                    self?.loadState = .loaded
                }
            }
        case .expired, .empty:
            isLoading = true
            loadFailed = false
            loadState = .loading
            let succeeded = await syncEngine.fullSync()
            // Post-sync snapshot: the sync engine just wrote the canonical
            // list to cache, so a freshness-aware switch would add no signal.
            // `snapshot()` is the explicit-intent read for this pattern.
            let reloaded = await CacheCoordinator.shared.conversations.load(for: "list")
            if let data = reloaded.snapshot() {
                setConversations(data)
                // Full sync just completed: snapshot is authoritative, so reconcile
                // overrides anything the coordinator tracked from earlier socket events.
                NotificationCoordinator.shared.reconcileConversationUnreads(data)
                loadFailed = false
                loadState = .loaded
            } else if !succeeded {
                // Cache is still empty AND the sync failed. Surface the
                // failure so the view can offer a retry instead of the
                // confusing "no conversations" empty state that historically
                // appeared after a cold start with network issues.
                loadFailed = true
                loadState = .error("Sync failed")
            }
            lastFetchedAt = Date()
            isLoading = false
        }

        // Précharger en arrière-plan
        prefetchRecentStories()
        prefetchTopConversationMessages()

        await categoriesTask
    }

    // MARK: - Force Refresh (pull-to-refresh)
    // Recharge les conversations depuis l'API puis continue en arrière-plan

    func forceRefresh() async {
        invalidateCache()
        isLoading = true
        loadFailed = false
        loadState = .loading
        let succeeded = await syncEngine.fullSync()
        // Pull-to-refresh: the sync engine just wrote the canonical list to
        // cache; `snapshot()` is the explicit-intent read for that.
        let reloaded = await CacheCoordinator.shared.conversations.load(for: "list")
        if let data = reloaded.snapshot() {
            setConversations(data)
            // User-triggered full sync: snapshot is authoritative, reconcile counts.
            NotificationCoordinator.shared.reconcileConversationUnreads(data)
            loadFailed = false
            loadState = .loaded
        } else if !succeeded {
            loadFailed = true
            loadState = .error("Refresh failed")
        }
        lastFetchedAt = Date()
        isLoading = false
        prefetchRecentStories()
    }

    // MARK: - Refresh

    func refresh() async {
        await syncEngine.syncSinceLastCheckpoint()
        await reloadFromCache()
    }

    // MARK: - Load More (cursor-based infinite scroll)
    //
    // Cache strategy: Option 1 (blob save) per spec §4.3 recommendation —
    // the entire merged list is persisted as a single JSON blob via
    // `CacheCoordinator.shared.conversations.save(snapshot, for: "list")`.
    // Row-per-conversation (Option 2: one `cache_entries` row per id with
    // partial reads via `LIMIT/OFFSET`) is deferred to a future migration
    // if user counts grow beyond ~500 cached conversations. Today's blob
    // approach round-trips a few KB of JSON per save which is well within
    // budget for the realistic upper bound, and keeps the cache surface
    // identical to every other GRDBCacheStore consumer.

    /// Fetch the next page of conversations using the gateway's
    /// cursor-paginated endpoint. Cursor-based pagination removes two
    /// classes of bugs from the previous offset-based code path:
    ///   (a) duplicate or skipped rows when a new message arrived
    ///       between two pages (offset shifts in the underlying sort);
    ///   (b) the artificial `autoLoadCap = 1000` ceiling that stranded
    ///       users on accounts above the cap.
    /// Caller is responsible for triggering this on scroll-near-end;
    /// concurrent calls are coalesced via the `.loadingMore` guard.
    func loadMore() async {
        // Refuse re-entry while a request is in flight, and refuse to
        // ask the gateway when we already know there's nothing more.
        // The `isLoading` check keeps cold-start full-syncs from
        // racing the first paginated fetch.
        guard hasMore, paginationState != .loadingMore, !isLoading else { return }

        paginationState = .loadingMore

        do {
            let userId = currentUserId
            // Curseur de secours quand aucun `nextCursor` n'est connu (full
            // sync partiel, curseur jamais persisté) : la conversation
            // chargée la plus ancienne par `lastMessageAt` — même sémantique
            // que le curseur gateway (`before` pagine par lastMessageAt
            // strictement plus ancien). Sans lui, on refetcherait la page 1
            // déjà affichée et le zero-progress guard ci-dessous forcerait
            // `.exhausted`, bloquant l'infinite scroll sur les comptes dont
            // le full sync s'est arrêté en cours de route.
            let previousCursor = nextCursor
                ?? conversations.min(by: { $0.lastMessageAt < $1.lastMessageAt })?.id
            let knownIds = Set(conversations.map(\.id))
            let page = try await conversationService.listPage(
                before: previousCursor,
                limit: pageLimit,
                currentUserId: userId
            )
            // Hydrate presence so the next render shows accurate online
            // dots without waiting for the socket to backfill. We pass
            // the raw API payload (which still has the per-participant
            // isOnline flags) because the domain model strips them.
            PresenceManager.shared.seed(from: page.rawItems, currentUserId: userId)
            appendConversations(page.items)

            // Loop guard 1 : zero-progress detection. If the gateway
            // returned items but ALL of them were already known locally,
            // or if the cursor did not advance, we are looping. This
            // happened in May 2026 when `fast-json-stringify` stripped
            // `cursorPagination` from the response (schema didn't
            // declare it), so `page.nextCursor` came back nil despite
            // the server having more rows — the sentinel kept refiring
            // `loadMore`, every page request returned the same first 30
            // rows, and the user saw a runaway burst of GET /conversations
            // until the socket-driven render eventually unblocked things.
            let newIds = Set(page.items.map(\.id)).subtracting(knownIds)
            let cursorAdvanced = page.nextCursor != nil && page.nextCursor != previousCursor
            let madeProgress = !newIds.isEmpty && cursorAdvanced
            if !madeProgress, !page.items.isEmpty {
                Logger.messages.error("[ConversationListVM] loadMore zero-progress (cursor=\(self.nextCursor ?? "nil") → \(page.nextCursor ?? "nil"), newIds=\(newIds.count)) — forcing exhausted to break loop")
                nextCursor = page.nextCursor
                hasMore = false
                paginationState = .exhausted
                // PERSIST the exhausted state. Without this, every
                // `reloadFromCache()` triggered by a socket event
                // (`syncEngine.conversationsDidChange` fires on each
                // message/preference update) reads the cached cursor
                // back as `hasMore=true`, flips `paginationState = .idle`,
                // and the pagination footer sentinel re-fires `loadMore`.
                // That re-loop was visible as 3-4 consecutive
                // `forcing exhausted` lines in the May 2026 device log
                // even though the in-memory guard was working correctly.
                let exhaustedSnapshot = conversations
                Task {
                    await CacheCoordinator.shared.conversations.saveCursor(
                        nextCursor: nil,
                        hasMore: false,
                        for: "list"
                    )
                    try? await CacheCoordinator.shared.conversations.save(exhaustedSnapshot, for: "list")
                }
                return
            }

            nextCursor = page.nextCursor
            hasMore = page.hasMore
            paginationState = page.hasMore ? .idle : .exhausted

            // Persist the merged list AND the cursor so the next cold
            // start serves the user the deepest scroll position they
            // reached AND resumes pagination from the same tail —
            // without the cursor we'd refetch page 1 on the first
            // post-restart loadMore (spec AC §4.8.3). `setConversations`
            // already re-sorted the array, so we save what's actually
            // displayed.
            let snapshot = conversations
            let persistedCursor = nextCursor
            let persistedHasMore = hasMore
            // Cancel any prior persist still in flight so we never race
            // a stale blob over a fresher one — the latest snapshot is
            // always the one that should win.
            persistTask?.cancel()
            persistTask = Task {
                // try? : Wave 1 Local-First a rendu .save() throwing.
                // Best-effort persist — l'erreur est loggee en aval.
                try? await CacheCoordinator.shared.conversations.save(snapshot, for: "list")
                await CacheCoordinator.shared.conversations.saveCursor(
                    nextCursor: persistedCursor,
                    hasMore: persistedHasMore,
                    for: "list"
                )
            }
        } catch {
            // Transient errors (network blip, rate limit) keep
            // `hasMore = true` so the next scroll attempt can retry.
            // We surface the error in the published state so the view
            // can show a discreet retry prompt at the tail.
            Logger.messages.error("[ConversationListVM] loadMore error cursor=\(self.nextCursor ?? "nil"): \(error.localizedDescription)")
            paginationState = .error(error.localizedDescription)
        }
    }

    // MARK: - Pull to Refresh

    /// Reset cursor + hasMore and refetch from the top. The view should
    /// route the SwiftUI `.refreshable` action here so that pulling
    /// down both clears the pagination cursor (otherwise the next
    /// `loadMore` would page from the old tail) and triggers the
    /// usual cache-first reload.
    ///
    /// Pull-to-refresh invalide AUSSI les caches transverses utilisés
    /// par la home : préférences utilisateur/conversation, catégories
    /// et tags personnalisés, profils (mood, last seen) et assets
    /// visuels (avatars + bannières). La logique reset+fullSync ensuite
    /// repeuple uniquement la listing — les autres stores se
    /// rehydratent paresseusement à la prochaine lecture, cache-first.
    func pullToRefresh() async {
        // Cancel any in-flight persist BEFORE we reset the cursor or
        // invalidate the cache. Otherwise a `loadMore` save scheduled
        // moments before the pull could re-write the old blob on disk
        // *after* `invalidateAll()` wiped L2, leaving the next cold
        // start with the very rows the user just refreshed away.
        persistTask?.cancel()
        nextCursor = nil
        hasMore = true
        paginationState = .idle
        await invalidatePullRefreshScope()
        // forceRefresh() rappelle invalidateCache() (conversations) sur
        // sa propre piste — l'idempotence d'invalidateAll garantit que
        // ce double appel est gratuit (L1 vide → no-op, L2 already
        // dropped → no-op).
        await forceRefresh()
    }

    /// Périmètre d'invalidation déclenché par le pull-to-refresh sur la
    /// home. Sépare l'orchestration de cache du fetch reseau qui suit
    /// (forceRefresh), pour que les tests unitaires puissent vérifier
    /// la liste exacte des stores touchés.
    ///
    /// Couvre 9 caches de métadonnées pertinents pour la home :
    /// - Listing + pagination (re-fetché immédiatement par forceRefresh)
    /// - Stories (re-fetché actif par StoryViewModel.loadStories forceNetwork)
    /// - Messages cached par conversation (l'ouverture d'une conv après
    ///   refresh re-fetchera depuis le serveur)
    /// - Préférences user/conversation, catégories, tags
    /// - Profils (mood, presence, last seen)
    /// - Caches mémoire de traduction/transcription : re-traduction
    ///   garantie après refresh (utile si modèle NLLB côté serveur a
    ///   été mis à jour ou si l'utilisateur a changé sa langue préférée)
    ///
    /// Stores intentionnellement laissés intacts (autres écrans ou
    /// coût bande passante prohibitif) : feed, comments, stats,
    /// notifications, friends, friendRequests, blockedUsers, userSearch,
    /// timeline, affiliateTokens, shareLinks, trackingLinks, communityLinks.
    ///
    /// Les stores MÉDIA (images, thumbnails, audio, video) ne sont JAMAIS
    /// invalidés ici : exigence local-first « téléchargé une fois = jamais
    /// re-téléchargé tant que l'app est installée ». Les URLs médias sont
    /// immuables côté gateway (max-age=1 an) — si un avatar change, son URL
    /// change, donc invalider les octets ne rafraîchit rien de plus que le
    /// refetch des métadonnées ci-dessus. (Audit 2026-07-10 : chaque pull
    /// re-téléchargeait l'intégralité des avatars/covers, ~3 Mo minimum.)
    private func invalidatePullRefreshScope() async {
        // Listing + pagination (re-fetché immédiatement par forceRefresh)
        await CacheCoordinator.shared.conversations.invalidateAll()
        // Messages cached par conversation. Les previews dans la listing
        // viennent de l'API (forceRefresh), mais l'historique cached est
        // re-fetché à l'ouverture de la conv pour avoir le dernier état.
        await CacheCoordinator.shared.messages.invalidateAll()
        // Participants / membres des conversations (groupes, communautés)
        await CacheCoordinator.shared.participants.invalidateAll()
        // Stories : redondant avec StoryViewModel.loadStories(forceNetwork:)
        // qui écrase via .save, mais explicite garantit que si le fetch
        // échoue le cache stale ne persiste pas.
        await CacheCoordinator.shared.stories.invalidateAll()
        // Préférences (re-fetch lazy au prochain accès paramètres conv)
        await CacheCoordinator.shared.conversationPreferences.invalidateAll()
        await CacheCoordinator.shared.userPreferences.invalidateAll()
        // Filtrage métadonnées (catégories + tags)
        await CacheCoordinator.shared.categories.invalidateAll()
        await CacheCoordinator.shared.userTags.invalidateAll()
        // Profils (mood, presence cachée, dernière vue)
        await CacheCoordinator.shared.profiles.invalidateAll()
        // Caches in-memory de traduction/transcription/audio + DB. Force
        // une retraduction si le serveur a publié de nouvelles versions
        // ou si l'utilisateur a changé sa langue préférée entre temps.
        await CacheCoordinator.shared.invalidateTranslationCaches()
    }

    // MARK: - Persist Category Expansion

    func persistCategoryExpansion(id: String, isExpanded: Bool) {
        // Route through the category store: optimistic update + persist via the
        // unified `/me/preferences/categories/{id}` PATCH, and the publisher
        // reflects the new `isExpanded` into `userCategories` (cross-surface).
        Task { [categoryStore] in
            _ = try? await categoryStore.setExpanded(id, expanded: isExpanded)
        }
    }

    // MARK: - Toggle Pin

    func togglePin(for conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
        let newValue = !conversations[index].userState.isPinned
        // Strategy B: the store owns the optimistic update, outbox-backed
        // offline replay and rollback. The result lands back on the row via
        // `observeStore` (merge sink). `try?` — a 4xx rollback is already
        // reflected by the store's publisher; a transient failure keeps the
        // optimistic value and retries via the outbox.
        try? await store.apply(.setPinned(newValue), for: conversationId)
    }

    // MARK: - Toggle Mute

    func toggleMute(for conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
        let newValue = !conversations[index].userState.isMuted
        try? await store.apply(.setMuted(newValue), for: conversationId)
    }

    // MARK: - Rename

    /// Renomme une conversation (groupes / communautés). Enqueue via l'outbox
    /// (`PUT /conversations/:id`) ; le nouveau nom se propage au retour serveur
    /// via l'event socket `conversationUpdated` déjà observé par ce VM.
    func renameConversation(conversationId: String, title: String) async {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let payload = UpdateConversationPayload(
            clientMutationId: ClientMutationId.generate(),
            conversationId: conversationId,
            title: trimmed,
            description: nil,
            avatarUrl: nil
        )
        do {
            try await OfflineQueue.shared.enqueue(.updateConversation, payload: payload, conversationId: conversationId)
        } catch {
            Logger.messages.error("[Rename] enqueue failed id=\(conversationId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Mark as Read

    func markAsRead(conversationId: String) async {
        guard convIndex(for: conversationId) != nil else { return }
        // Local-first read sync (cache + cross-VM `.conversationMarkedRead`).
        await syncEngine.markConversationReadLocally(conversationId)
        // Server mark-read via the store: optimistic unreadCount=0 + outbox
        // offline replay. The gateway gates the read-RECEIPT broadcast to the
        // sender by the user's `showReadReceipts` preference (see
        // routes/conversations/messages.ts → broadcastReadStatus), so the old
        // client-side `showReadReceipts` gate was redundant for privacy.
        // Dropping it also fixes cross-device unread sync when receipts are off
        // (the server now records the read position regardless).
        try? await store.apply(.markAsRead, for: conversationId)
    }

    // MARK: - Mark as Unread

    func markAsUnread(conversationId: String) async {
        guard convIndex(for: conversationId) != nil else { return }
        // Store sets unreadCount ≥ 1 optimistically + dispatches markUnread.
        try? await store.apply(.markAsUnread, for: conversationId)
    }

    // MARK: - Archive Conversation

    func archiveConversation(conversationId: String) async {
        guard convIndex(for: conversationId) != nil else { return }
        try? await store.apply(.setArchived(true), for: conversationId)
    }

    // MARK: - Unarchive Conversation

    func unarchiveConversation(conversationId: String) async {
        guard convIndex(for: conversationId) != nil else { return }
        try? await store.apply(.setArchived(false), for: conversationId)
    }

    // MARK: - Delete Conversation

    func deleteConversation(conversationId: String) async {
        guard convIndex(for: conversationId) != nil else { return }
        // `.deleteForUser` sets userState.deletedForUserAt (soft delete)
        // optimistically + dispatches deleteForMe via the outbox. The row
        // disappears because `filterConversations` hides deletedForUserAt != nil;
        // on a 4xx the store clears deletedForUserAt and the row reappears.
        try? await store.apply(.deleteForUser, for: conversationId)
        await sweepLocalCallTranscripts(forConversation: conversationId)
    }

    /// Every local call transcript for this conversation, swept alongside the
    /// (optimistic, rollback-capable) conversation delete. No secondary index
    /// needed — the existing local messages cache already carries each call
    /// message's `callSummary.callId`, which IS the join from "this
    /// conversation" to "its calls". Accepted, low-severity edge case: a
    /// rolled-back delete (4xx) doesn't un-sweep already-invalidated
    /// transcripts — same risk class already accepted for other local-cache-only
    /// invalidations elsewhere in the app. See
    /// docs/superpowers/specs/2026-07-11-call-transcript-history-design.md.
    private func sweepLocalCallTranscripts(forConversation conversationId: String) async {
        let messages = await CacheCoordinator.shared.messages.load(for: conversationId).snapshot() ?? []
        for callId in messages.compactMap(\.callSummary?.callId) {
            await CallTranscriptStore.shared.invalidate(for: callId)
        }
    }

    // MARK: - Move to Section

    func moveToSection(conversationId: String, sectionId: String) {
        guard convIndex(for: conversationId) != nil else { return }
        let newSectionId: String? = sectionId.isEmpty ? nil : sectionId
        Task { [store] in
            try? await store.apply(.setSection(categoryId: newSectionId), for: conversationId)
        }
    }

    // MARK: - Favorite Reaction

    func setFavoriteReaction(conversationId: String, emoji: String?) async {
        guard convIndex(for: conversationId) != nil else { return }
        try? await store.apply(.setReaction(emoji), for: conversationId)
    }

    // MARK: - Message Prefetch

    func loadPreviewMessages(for conversationId: String) async {
        guard previewMessages[conversationId] == nil,
              !previewLoadingInFlight.contains(conversationId) else { return }
        previewLoadingInFlight.insert(conversationId)
        defer { previewLoadingInFlight.remove(conversationId) }
        let cached = await CacheCoordinator.shared.messages.load(for: conversationId)
        switch cached {
        case .fresh(let data, _):
            previewMessages[conversationId] = Array(data.suffix(5))
            return
        case .stale(let data, _):
            previewMessages[conversationId] = Array(data.suffix(5))
            Task { [weak self] in await self?.refreshPreview(for: conversationId) }
            return
        case .expired, .empty:
            await refreshPreview(for: conversationId)
        }
    }

    private func refreshPreview(for conversationId: String) async {
        do {
            let response = try await messageService.list(
                conversationId: conversationId, offset: 0, limit: 5, includeReplies: false, includeTranslations: true
            )
            let userId = currentUserId
            let username = AuthManager.shared.currentUser?.username
            let msgs = response.data.reversed().map { $0.toMessage(currentUserId: userId, currentUsername: username) }
            previewMessages[conversationId] = msgs
        } catch {
            Logger.messages.warning("[ConversationList] previewMessages fetch failed for \(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Précharge les messages des top 20 conversations qui n'ont pas encore de cache.
    private func prefetchTopConversationMessages() {
        let topConversations = Array(conversations.prefix(20))
        let messageService = self.messageService
        let userId = AuthManager.shared.currentUser?.id ?? ""
        let username = AuthManager.shared.currentUser?.username

        Task.detached(priority: .utility) {
            await withTaskGroup(of: Void.self) { group in
                for conversation in topConversations {
                    let conversationId = conversation.id
                    // SWR: prefetch only when the cache cannot already serve a
                    // preview. `.fresh` / `.stale` both surface usable data
                    // (the row's preview path reads them directly), so we
                    // skip the network round-trip. `.expired` / `.empty`
                    // mean the row would render an empty preview — fetch.
                    let result = await CacheCoordinator.shared.messages.load(for: conversationId)
                    switch result {
                    case .fresh(let cached, _) where !cached.isEmpty,
                         .stale(let cached, _) where !cached.isEmpty:
                        continue
                    case .fresh, .stale, .expired, .empty:
                        break
                    }

                    group.addTask {
                        do {
                            let response = try await messageService.list(
                                conversationId: conversationId,
                                offset: 0,
                                limit: 20,
                                includeReplies: true,
                                includeTranslations: true
                            )
                            if response.success {
                                let messages = response.data.reversed().map {
                                    $0.toMessage(currentUserId: userId, currentUsername: username)
                                }
                                try? await CacheCoordinator.shared.messages.save(Array(messages), for: conversationId)
                            }
                        } catch {
                            Logger.messages.warning("[ConversationList] prefetch failed for \(conversationId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                        }
                    }
                }
            }
        }
    }

    // MARK: - Story Prefetch

    /// Précharge les stories : 2 premières de chaque groupe + 3 premiers groupes complets.
    /// Utilise les DiskCacheStore existants (images/video) avec cache-hit check.
    func prefetchRecentStories() {
        storyPrefetchTask?.cancel()

        storyPrefetchTask = Task.detached(priority: .utility) { [storyService = self.storyService] in
            // Cache-first : `StoryViewModel.loadStories()` récupère déjà le feed
            // (limit=50) et préfetch ses médias au lancement, en écrivant le
            // MÊME `storiesCacheKey`. On saute notre fetch réseau redondant
            // (limit=30) quand ce cache est déjà peuplé — sinon les deux partent
            // au cold start, tapant /posts/feed/stories deux fois et churnant la
            // même clé de cache.
            switch await CacheCoordinator.shared.stories.load(for: StoryViewModel.storiesCacheKey) {
            case .fresh, .stale:
                return
            case .expired, .empty:
                break
            }
            do {
                let response = try await storyService.list(cursor: nil, limit: 30)
                guard response.success, !Task.isCancelled else { return }

                let storyGroups = response.data.toStoryGroups()
                guard !storyGroups.isEmpty else { return }

                // Collecter les URLs à précharger (2 par groupe + reste des 3 premiers)
                var imageURLs: [String] = []
                var videoURLs: [String] = []
                for (i, group) in storyGroups.enumerated() {
                    let limit = i < 3 ? group.stories.count : min(2, group.stories.count)
                    for story in group.stories.prefix(limit) {
                        for media in story.media {
                            guard let url = media.url, !url.isEmpty else { continue }
                            switch media.type {
                            case .video:
                                videoURLs.append(url)
                            default:
                                imageURLs.append(url)
                            }
                        }
                    }
                }

                // Précharger images par lots de 8
                let imageStore = await CacheCoordinator.shared.images
                let uniqueImageURLs = Array(Set(imageURLs))
                for chunk in stride(from: 0, to: uniqueImageURLs.count, by: 8) {
                    guard !Task.isCancelled else { return }
                    let end = min(chunk + 8, uniqueImageURLs.count)
                    await withTaskGroup(of: Void.self) { taskGroup in
                        for urlString in uniqueImageURLs[chunk..<end] {
                            taskGroup.addTask {
                                _ = await imageStore.image(for: urlString)
                            }
                        }
                    }
                }

                // Précharger vidéos par lots de 4 (plus lourds)
                let videoStore = await CacheCoordinator.shared.video
                let uniqueVideoURLs = Array(Set(videoURLs))
                for chunk in stride(from: 0, to: uniqueVideoURLs.count, by: 4) {
                    guard !Task.isCancelled else { return }
                    let end = min(chunk + 4, uniqueVideoURLs.count)
                    await withTaskGroup(of: Void.self) { taskGroup in
                        for urlString in uniqueVideoURLs[chunk..<end] {
                            taskGroup.addTask {
                                _ = try? await videoStore.data(for: urlString)
                            }
                        }
                    }
                }

                try? await CacheCoordinator.shared.stories.save(storyGroups, for: StoryViewModel.storiesCacheKey)
                Logger.messages.info("[ConversationListVM] Stories prefetched: \(storyGroups.count) groups, \(uniqueImageURLs.count) images, \(uniqueVideoURLs.count) videos")
            } catch {
                Logger.messages.error("[ConversationListVM] Story prefetch failed: \(error.localizedDescription)")
            }
        }
    }

    func refreshStoriesPrefetch() {
        prefetchRecentStories()
    }

    /// Called when app returns to foreground — refresh stories if stale
    func handleForegroundReturn() {
        guard isCacheValid else { return }
        Task {
            let cached = await CacheCoordinator.shared.stories.load(for: StoryViewModel.storiesCacheKey)
            switch cached {
            case .stale, .expired, .empty:
                prefetchRecentStories()
            case .fresh:
                break
            }
        }
    }

    /// Appelée quand la liste de conversations revient au premier plan.
    /// Re-trie la liste en mémoire immédiatement (retour instantané), puis
    /// lance un delta sync pour que les messages reçus via APNs pendant que
    /// l'app était en arrière-plan remontent et réordonnent la liste.
    /// Distinct de `handleForegroundReturn()`, qui ne rafraîchit que les
    /// stories.
    func handleForegroundReactivation() {
        setConversations(conversations)
        Task { [weak self] in
            await self?.refresh()
        }
    }

    // MARK: - Mark as Read (local update from ConversationView)

    private func observeMarkAsRead() {
        if let existing = markAsReadObserver {
            NotificationCenter.default.removeObserver(existing)
        }
        markAsReadObserver = NotificationCenter.default.addObserver(
            forName: .conversationMarkedRead,
            object: nil,
            queue: nil
        ) { [weak self] notification in
            guard let cid = notification.object as? String else { return }
            Task { @MainActor [weak self] in
                guard let self else { return }
                guard let idx = self.convIndex(for: cid) else { return }
                self.conversations[idx].userState.unreadCount = 0
                for i in 0..<self.groupedConversations.count {
                    if let rowIdx = self.groupedConversations[i].conversations.firstIndex(where: { $0.id == cid }) {
                        self.groupedConversations[i].conversations[rowIdx].userState.unreadCount = 0
                        break
                    }
                }
            }
        }
    }

    // MARK: - Lifecycle

    /// Token for the `.conversationMarkedRead` block observer, held so `deinit`
    /// can remove it. Block-based `NotificationCenter` observers are never
    /// auto-removed: without this the closure stays registered for the rest of
    /// the process (firing no-ops through `[weak self]`), accumulating one stale
    /// observer per VM across login/logout cycles that recreate the `@StateObject`.
    /// `nonisolated(unsafe)`: set once on the main actor, read once in the
    /// nonisolated `deinit`, never accessed concurrently.
    nonisolated(unsafe) private var markAsReadObserver: (any NSObjectProtocol)?

    nonisolated deinit {
        storyPrefetchTask?.cancel()
        groupingTask?.cancel()
        typingTimers.values.forEach { $0.invalidate() }
        if let markAsReadObserver {
            NotificationCenter.default.removeObserver(markAsReadObserver)
        }
    }

    // MARK: - Helpers

    private var currentUserId: String {
        authManager.currentUser?.id ?? ""
    }
}

extension Notification.Name {
    static let conversationMarkedRead = Notification.Name("conversationMarkedRead")
}
