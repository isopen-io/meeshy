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
    /// Typing usernames indexed by conversationId. NOT @Published to avoid triggering
    /// a full list re-render on every typing event from any conversation.
    /// Rows read this during natural re-renders (scroll, message arrival).
    var typingUsernames: [String: String] = [:]  // conversationId → displayName
    var previewMessages: [String: [Message]] = [:]  // conversationId → recent messages (non-Published — only used in context menu preview)
    private var previewLoadingInFlight: Set<String> = []
    private var typingTimers: [String: Timer] = [:]

    var totalUnreadCount: Int {
        conversations.reduce(0) { $0 + $1.unreadCount }
    }

    private let api: APIClientProviding
    private let conversationService: ConversationServiceProviding
    private let preferenceService: PreferenceServiceProviding
    private let messageSocket: MessageSocketProviding
    private let messageService: MessageServiceProviding
    private let authManager: AuthManaging
    private let storyService: StoryServiceProviding
    private let syncEngine: ConversationSyncEngineProviding
    /// Number of conversations fetched per `loadMore` page. Tuned at
    /// 30 to match the spec's 30-row windows: large enough to fill a
    /// screen on most devices without scrolling, small enough that the
    /// cursor request stays under ~50KB even with rich metadata.
    private let pageLimit = 30
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
        return _convIdIndex![id]
    }

    // MARK: - List Mutators (centralised write surface)
    //
    // Every code path that wants to replace, extend or re-order
    // `conversations` must funnel through these helpers so the
    // invariant "sorted by lastMessageAt DESC" holds at every step.
    // Direct writes to `conversations = …` are reserved for the
    // narrow case of mutating a SINGLE row's property (unread count,
    // pin, mute, etc.) where the order doesn't change.

    /// Replace the entire list with `items` re-sorted by lastMessageAt DESC.
    /// Use this when you've fetched a fresh snapshot (cache reload, REST
    /// page, full sync result). Internal so unit tests can drive it without
    /// reflection while keeping the surface invisible to view layers.
    func setConversations(_ items: [Conversation]) {
        conversations = items.sorted { $0.lastMessageAt > $1.lastMessageAt }
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
        guard let idx = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        var updated = conversations[idx]
        updated.lastMessageAt = newLastMessageAt
        conversations.remove(at: idx)
        conversations.insert(updated, at: 0)
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
        syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared
    ) {
        self.api = api
        self.conversationService = conversationService
        self.preferenceService = preferenceService
        self.messageSocket = messageSocket
        self.messageService = messageService
        self.authManager = authManager
        self.storyService = storyService
        self.syncEngine = syncEngine
        subscribeToSocketEvents()
        syncBadgeOnUnreadChange()
        setupBackgroundProcessing()
        observeMarkAsRead()
        observeSync()
    }

    private var groupingTask: Task<Void, Never>?
    /// Fire-and-forget persistence of the merged list + cursor after a
    /// successful `loadMore`. Stored so `pullToRefresh()` (and `loadMore`
    /// itself) can cancel any in-flight save before invalidating the
    /// cache — otherwise an orphaned task could re-save the pre-refresh
    /// blob *after* `invalidateAll()` wiped L2, leaving stale data on
    /// disk for the next cold start.
    private var persistTask: Task<Void, Never>?

    // MARK: - Background Processing
    private func setupBackgroundProcessing() {
        // Single unified pipeline: conversations, search, filter, or categories change
        // → filter + group in one pass → single @Published update (groupedConversations).
        // Eliminates the old 3-broadcast chain ($conversations → $filteredConversations → $groupedConversations).
        Publishers.CombineLatest4($conversations, $searchText, $selectedFilter, $userCategories)
            .debounce(for: .milliseconds(150), scheduler: DispatchQueue.main)
            .sink { [weak self] (convs, text, filter, categories) in
                guard let self else { return }
                let filtered = Self.filterConversations(convs, searchText: text, filter: filter)
                self.filteredConversations = filtered
                self.groupingTask?.cancel()
                self.groupingTask = Task.detached(priority: .userInitiated) { [weak self] in
                    guard !Task.isCancelled else { return }
                    let grouped = Self.groupConversations(filtered, categories: categories)
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
    nonisolated private static func filterConversations(
        _ conversations: [Conversation],
        searchText: String,
        filter: ConversationFilter
    ) -> [Conversation] {
        return conversations.filter { c in
            let filterMatch: Bool
            switch filter {
            case .all: filterMatch = c.isActive
            case .unread: filterMatch = c.unreadCount > 0
            case .personnel: filterMatch = c.type == .direct && c.isActive
            case .privee: filterMatch = c.type == .group && c.isActive
            case .ouvertes: filterMatch = (c.type == .public || c.type == .community) && c.isActive
            case .globales: filterMatch = c.type == .global && c.isActive
            case .channels: filterMatch = c.isAnnouncementChannel && c.isActive
            case .favoris: filterMatch = c.reaction != nil && c.isActive
            case .archived: filterMatch = !c.isActive
            }
            let searchMatch = searchText.isEmpty || c.name.localizedCaseInsensitiveContains(searchText)
            return filterMatch && searchMatch
        }
    }

    /// Groupe les conversations par section et les trie
    /// - Peut s'exécuter sur n'importe quel thread (pas d'accès à self)
    nonisolated private static func groupConversations(
        _ filtered: [Conversation],
        categories: [ConversationSection]
    ) -> [(section: ConversationSection, conversations: [Conversation])] {
        // No categories → flat list, no section headers needed
        let hasPinned = filtered.contains { $0.isPinned && $0.sectionId == nil }
        if categories.isEmpty && !hasPinned {
            let sorted = filtered.sorted { a, b in
                if a.isPinned != b.isPinned { return a.isPinned }
                return a.lastMessageAt > b.lastMessageAt
            }
            return sorted.isEmpty ? [] : [(ConversationSection.other, sorted)]
        }

        var result: [(section: ConversationSection, conversations: [Conversation])] = []

        // O(1) lookup sets
        let categoryIds = Set(categories.map(\.id))

        // Groupement O(n) unique — remplace les k passes filter O(n×k)
        let bySection = Dictionary(grouping: filtered) { conv -> String in
            if conv.isPinned && conv.sectionId == nil { return "__pinned__" }
            return conv.sectionId ?? "__other__"
        }

        // Pinned section
        if let pinned = bySection["__pinned__"], !pinned.isEmpty {
            result.append((ConversationSection.pinned, pinned.sorted { $0.lastMessageAt > $1.lastMessageAt }))
        }

        // User categories (order preserved)
        for category in categories {
            if let sectionConvs = bySection[category.id], !sectionConvs.isEmpty {
                let sorted = sectionConvs.sorted { a, b in
                    if a.isPinned != b.isPinned { return a.isPinned }
                    return a.lastMessageAt > b.lastMessageAt
                }
                result.append((category, sorted))
            }
        }

        // Orphaned (catégorie supprimée) + non-catégorisées → section "other"
        let otherConvs = (bySection["__other__"] ?? []) + filtered.filter { conv in
            guard let sid = conv.sectionId else { return false }
            return !categoryIds.contains(sid)
        }
        if !otherConvs.isEmpty {
            result.append((ConversationSection.other, otherConvs.sorted { $0.lastMessageAt > $1.lastMessageAt }))
        }

        return result
    }

    // MARK: - Sync Engine Observation

    func observeSync() {
        let publisher = syncEngine.conversationsDidChange
        publisher
            .receive(on: DispatchQueue.main)
            .debounce(for: .milliseconds(200), scheduler: DispatchQueue.main)
            .sink { [weak self] in
                Task { @MainActor [weak self] in
                    await self?.reloadFromCache()
                }
            }
            .store(in: &cancellables)
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
            setConversations(data)
        case .expired, .empty:
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
                typingUsernames[event.conversationId] = event.username
                scheduleTypingCleanup(for: event.conversationId)
            }
            .store(in: &cancellables)

        messageSocket.typingStopped
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                self?.clearTyping(for: event.conversationId)
            }
            .store(in: &cancellables)

        messageSocket.userPreferencesUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let convId = event.conversationId else { return }
                if let idx = conversations.firstIndex(where: { $0.id == convId }) {
                    var conv = conversations[idx]
                    if let isPinned = event.isPinned { conv.isPinned = isPinned }
                    if let isMuted = event.isMuted { conv.isMuted = isMuted }
                    conversations[idx] = conv
                }
            }
            .store(in: &cancellables)

        messageSocket.conversationUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                // Apply the in-place metadata updates first; the gateway
                // can piggy-back rename/avatar changes on the same event
                // that carries lastMessageAt, so we want the row data fresh
                // BEFORE we bump it to position 0 (otherwise the bumped
                // row would render stale title for one frame).
                if let title = event.title { self.conversations[index].title = title }
                if let description = event.description { self.conversations[index].description = description }
                if let avatar = event.avatar { self.conversations[index].avatar = avatar }
                if let banner = event.banner { self.conversations[index].banner = banner }
                if let isAnnouncement = event.isAnnouncementChannel {
                    self.conversations[index].isAnnouncementChannel = isAnnouncement
                }

                // Bump the row to the top when the gateway tells us a new
                // message advanced lastMessageAt. We compare strictly
                // greater-than so a re-broadcast of the same timestamp
                // (e.g. metadata-only update echoed back to the user
                // room) doesn't pointlessly reshuffle the list and
                // trigger a re-render of every cell behind it.
                if let newLastAt = event.lastMessageAt,
                   newLastAt > self.conversations[index].lastMessageAt {
                    self.bumpToTop(conversationId: event.conversationId, newLastMessageAt: newLastAt)
                }
            }
            .store(in: &cancellables)

        messageSocket.participantSelfLeft
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                self.conversations[index].memberCount -= 1
            }
            .store(in: &cancellables)

        messageSocket.participantBanned
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                self.conversations[index].memberCount -= 1
            }
            .store(in: &cancellables)

        messageSocket.participantUnbanned
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in
                guard let self, let index = self.convIndex(for: event.conversationId) else { return }
                self.conversations[index].memberCount += 1
            }
            .store(in: &cancellables)

        // On socket reconnection, pull the delta so the list reflects anything
        // that changed while the socket was down (renames, new conversations,
        // archived/deleted, unread counts). Without this the user lands on a
        // stale list after coming back from background until they pull to
        // refresh manually.
        messageSocket.didReconnect
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                // Random 0-500ms jitter before firing the delta sync so that
                // a server blip that drops every client simultaneously
                // doesn't produce a thundering herd of `/conversations?updatedSince=…`
                // requests the instant the gateway comes back online.
                let jitter = UInt64.random(in: 0...500_000_000)
                Task { [weak self] in
                    try? await Task.sleep(nanoseconds: jitter)
                    await self?.syncEngine.syncSinceLastCheckpoint()
                    await self?.reloadFromCache()
                }
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

    private func clearTyping(for conversationId: String) {
        typingTimers[conversationId]?.invalidate()
        typingTimers[conversationId] = nil
        typingUsernames.removeValue(forKey: conversationId)
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
                for (a, b) in zip(lhs, rhs) where a.id != b.id || a.unreadCount != b.unreadCount || a.isPinned != b.isPinned {
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

    func loadCategories() async {
        do {
            let categories = try await preferenceService.getCategories()
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
        } catch {
            // Categories are optional, keep empty
        }
    }

    // MARK: - Load Conversations

    func loadConversations() async {
        guard !isLoading else { return }

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
            let reloaded = await CacheCoordinator.shared.conversations.load(for: "list")
            if let data = reloaded.value {
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
        let reloaded = await CacheCoordinator.shared.conversations.load(for: "list")
        if let data = reloaded.value {
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
            let page = try await conversationService.listPage(
                before: nextCursor,
                limit: pageLimit,
                currentUserId: userId
            )
            // Hydrate presence so the next render shows accurate online
            // dots without waiting for the socket to backfill. We pass
            // the raw API payload (which still has the per-participant
            // isOnline flags) because the domain model strips them.
            PresenceManager.shared.seed(from: page.rawItems, currentUserId: userId)
            appendConversations(page.items)
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
                await CacheCoordinator.shared.conversations.save(snapshot, for: "list")
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
        // The forceRefresh() below calls invalidateCache() which wipes
        // both items AND cache_metadata via invalidateAll, so the
        // persisted cursor is cleared along the way — no separate
        // saveCursor(nil, true, …) call needed.
        await forceRefresh()
    }

    // MARK: - Persist Category Expansion

    func persistCategoryExpansion(id: String, isExpanded: Bool) {
        Task {
            let _: APIResponse<AnyCodable>? = try? await api.patch(
                endpoint: "/me/preferences/categories/\(id)",
                body: ["isExpanded": isExpanded]
            )
        }
    }

    // MARK: - Toggle Pin

    func togglePin(for conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
        let newValue = !conversations[index].isPinned

        conversations[index].isPinned = newValue

        do {
            try await preferenceService.updateConversationPreferences(
                conversationId: conversationId,
                request: .init(isPinned: newValue)
            )
        } catch {
            conversations[index].isPinned = !newValue
        }
    }

    // MARK: - Toggle Mute

    func toggleMute(for conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
        let newValue = !conversations[index].isMuted

        conversations[index].isMuted = newValue

        do {
            try await preferenceService.updateConversationPreferences(
                conversationId: conversationId,
                request: .init(isMuted: newValue)
            )
        } catch {
            conversations[index].isMuted = !newValue
        }
    }

    // MARK: - Mark as Read

    func markAsRead(conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
        let previousCount = conversations[index].unreadCount

        conversations[index].unreadCount = 0
        await syncEngine.markConversationReadLocally(conversationId)

        guard UserPreferencesManager.shared.privacy.showReadReceipts else { return }
        do {
            try await conversationService.markRead(conversationId: conversationId)
        } catch {
            conversations[index].unreadCount = previousCount
        }
    }

    // MARK: - Mark as Unread

    func markAsUnread(conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
        let previousCount = conversations[index].unreadCount

        // Optimistic update
        if conversations[index].unreadCount == 0 {
            conversations[index].unreadCount = 1
        }

        do {
            try await conversationService.markUnread(conversationId: conversationId)
        } catch {
            conversations[index].unreadCount = previousCount
        }
    }

    // MARK: - Archive Conversation

    func archiveConversation(conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
        let wasActive = conversations[index].isActive

        conversations[index].isActive = false

        do {
            try await preferenceService.updateConversationPreferences(
                conversationId: conversationId,
                request: .init(isArchived: true)
            )
        } catch {
            conversations[index].isActive = wasActive
        }
    }

    // MARK: - Unarchive Conversation

    func unarchiveConversation(conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
        let wasActive = conversations[index].isActive

        conversations[index].isActive = true

        do {
            try await preferenceService.updateConversationPreferences(
                conversationId: conversationId,
                request: .init(isArchived: false)
            )
        } catch {
            conversations[index].isActive = wasActive
        }
    }

    // MARK: - Delete Conversation

    func deleteConversation(conversationId: String) async {
        guard let index = convIndex(for: conversationId) else { return }
        let removed = conversations.remove(at: index)

        do {
            try await conversationService.deleteForMe(conversationId: conversationId)
        } catch {
            conversations.insert(removed, at: min(index, conversations.count))
        }
    }

    // MARK: - Move to Section

    func moveToSection(conversationId: String, sectionId: String) {
        guard let index = convIndex(for: conversationId) else { return }
        let previousSectionId = conversations[index].sectionId
        let newSectionId: String? = sectionId.isEmpty ? nil : sectionId
        conversations[index].sectionId = newSectionId

        Task {
            do {
                try await preferenceService.updateConversationPreferences(
                    conversationId: conversationId,
                    request: .init(categoryId: newSectionId)
                )
            } catch {
                conversations[index].sectionId = previousSectionId
            }
        }
    }

    // MARK: - Favorite Reaction

    func setFavoriteReaction(conversationId: String, emoji: String?) async {
        guard let index = convIndex(for: conversationId) else { return }
        let previous = conversations[index].reaction
        conversations[index].reaction = emoji
        do {
            try await preferenceService.updateConversationPreferences(
                conversationId: conversationId,
                request: .init(reaction: emoji)
            )
        } catch {
            conversations[index].reaction = previous
        }
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
                conversationId: conversationId, offset: 0, limit: 5, includeReplies: false
            )
            let userId = currentUserId
            let username = AuthManager.shared.currentUser?.username
            let msgs = response.data.reversed().map { $0.toMessage(currentUserId: userId, currentUsername: username) }
            previewMessages[conversationId] = msgs
        } catch { }
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
                    let cached = await CacheCoordinator.shared.messages.load(for: conversationId).value ?? []
                    if !cached.isEmpty { continue }

                    group.addTask {
                        do {
                            let response = try await messageService.list(
                                conversationId: conversationId,
                                offset: 0,
                                limit: 20,
                                includeReplies: true
                            )
                            if response.success {
                                let messages = response.data.reversed().map {
                                    $0.toMessage(currentUserId: userId, currentUsername: username)
                                }
                                await CacheCoordinator.shared.messages.save(Array(messages), for: conversationId)
                            }
                        } catch { }
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

                await CacheCoordinator.shared.stories.save(storyGroups, for: "recent_tray")
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
            let cached = await CacheCoordinator.shared.stories.load(for: "recent_tray")
            switch cached {
            case .stale, .expired, .empty:
                prefetchRecentStories()
            case .fresh:
                break
            }
        }
    }

    // MARK: - Mark as Read (local update from ConversationView)

    private func observeMarkAsRead() {
        NotificationCenter.default.addObserver(
            forName: .conversationMarkedRead,
            object: nil,
            queue: nil
        ) { [weak self] notification in
            guard let cid = notification.object as? String else { return }
            Task { @MainActor [weak self] in
                guard let self else { return }
                guard let idx = self.convIndex(for: cid) else { return }
                self.conversations[idx].unreadCount = 0
                for i in 0..<self.groupedConversations.count {
                    if let rowIdx = self.groupedConversations[i].conversations.firstIndex(where: { $0.id == cid }) {
                        self.groupedConversations[i].conversations[rowIdx].unreadCount = 0
                        break
                    }
                }
            }
        }
    }

    // MARK: - Lifecycle

    nonisolated deinit {
        storyPrefetchTask?.cancel()
        groupingTask?.cancel()
    }

    // MARK: - Helpers

    private var currentUserId: String {
        authManager.currentUser?.id ?? ""
    }
}

extension Notification.Name {
    static let conversationMarkedRead = Notification.Name("conversationMarkedRead")
}
