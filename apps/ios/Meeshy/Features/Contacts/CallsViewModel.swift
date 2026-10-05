import SwiftUI
import MeeshySDK

/// What the journal asks the gateway for: the direction filter, the media
/// type and the typed name (#8203). Each query owns its cache entry, so a
/// search already made answers again at once, even offline.
struct CallJournalQuery: Equatable, Sendable {
    var filter: CallHistoryFilter = .all
    var type: CallHistoryType = .all
    var search: String = ""

    var cacheKey: String {
        let base = "calls:list:\(filter.rawValue)"
        let typed = type == .all ? base : "\(base):type=\(type.rawValue)"
        guard !search.isEmpty else { return typed }
        let folded = search.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
        return "\(typed):q=\(folded)"
    }
}

/// Drives the People hub **Calls** tab — the call journal. Cache-first
/// (`CacheCoordinator.callHistory` via `CacheFirstLoader`): the cached journal
/// renders instantly with no spinner, then revalidates silently in the
/// background. Older pages follow by cursor as the list scrolls, over the
/// whole 3-month server window (#8066); the cursor is the last listed call's
/// id — the gateway's own `nextCursor` — so a page restored from cache can
/// continue just as well as a fetched one. Every page read joins the cache
/// (#8204): reopened offline, the journal shows what was already scrolled.
///
/// The media type and the search are answered by the gateway in one request
/// (`type` / `q`, #8203); until it answers, the loaded rows that match the
/// typed name stay on screen.
///
/// Erasing is for the reader alone (`DELETE /calls/history[/:callId]`) and
/// optimistic: the row (or the journal) leaves at once, and comes back at its
/// place if the gateway refuses, with `eraseFailed` raised for the banner.
@MainActor
final class CallsViewModel: ObservableObject {
    @Published private(set) var calls: [APICallRecord] = []
    @Published private(set) var loadState: LoadState = .idle
    @Published var filter: CallHistoryFilter = .all
    @Published private(set) var type: CallHistoryType = .all
    @Published var searchQuery: String = ""
    @Published private(set) var isLoadingMore = false
    @Published private(set) var reachedEnd = false
    @Published private(set) var eraseFailed = false

    static let pageSize = 30
    nonisolated static let journalWindow: TimeInterval = 90 * 86_400
    private static let baseCacheKeys = CallHistoryFilter.allCases.map { CallJournalQuery(filter: $0).cacheKey }

    private let service: CallHistoryServiceProviding
    private let networkMonitor: any NetworkMonitorProviding
    private var revalidationTask: Task<Void, Never>?
    private var pendingHides: Set<String> = []
    private var requestedSearch = ""
    /// The query whose answer `calls` holds — `nil` until one was applied.
    private var shownQuery: CallJournalQuery?

    /// Bumped on every `loadCalls()` invocation. `CacheFirstLoader.load` awaits
    /// (cache read, then network fetch) before ever touching `calls`/
    /// `loadState`, so two overlapping invocations — e.g. the initial
    /// `.task` load still in flight when `setFilter` fires a second one — can
    /// resolve out of order. Without this guard, an older invocation for a
    /// query the user has already navigated away from can complete AFTER the
    /// current one and clobber `calls` with stale results. Mirrors the
    /// `generation` pattern in `VideoSurvivalController`. A page of `loadMore`
    /// and a `clearAll` obey the same guard.
    private var loadGeneration = 0

    private var query: CallJournalQuery {
        CallJournalQuery(filter: filter, type: type, search: requestedSearch)
    }

    private var unknownName: String {
        String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main)
    }

    private var typedSearch: String {
        searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var isSearching: Bool { !typedSearch.isEmpty }

    /// True once `calls` answers exactly what is typed and selected.
    var showsCurrentQuery: Bool {
        shownQuery == CallJournalQuery(filter: filter, type: type, search: typedSearch)
    }

    /// The journal as shown: the gateway's answer for the current query, or —
    /// while it is still on its way — the loaded rows matching the typed name.
    var visibleCalls: [APICallRecord] {
        guard isSearching, shownQuery?.search != typedSearch else { return calls }
        let fallback = unknownName
        return calls.filter { $0.matches(query: typedSearch, fallback: fallback) }
    }

    init(
        service: CallHistoryServiceProviding = CallHistoryService.shared,
        networkMonitor: any NetworkMonitorProviding = NetworkMonitor.shared
    ) {
        self.service = service
        self.networkMonitor = networkMonitor
    }

    deinit {
        revalidationTask?.cancel()
    }

    func loadCalls(forceNetwork: Bool = false) async {
        loadGeneration += 1
        let generation = loadGeneration
        reachedEnd = false
        let service = self.service
        let query = self.query
        let pageSize = Self.pageSize
        let store = await CacheCoordinator.shared.callHistory
        let loader = CacheFirstLoader(store: store, key: query.cacheKey, networkMonitor: networkMonitor)
        revalidationTask?.cancel()
        let keepsCachedTail = !forceNetwork
        let fetch: @Sendable () async throws -> [APICallRecord] = { [weak self] in
            let page = try await service.history(
                limit: pageSize,
                cursor: nil,
                filter: query.filter,
                type: query.type,
                search: query.search.isEmpty ? nil : query.search
            )
            await self?.noteFirstPage(hasMore: page.hasMore, generation: generation)
            guard keepsCachedTail, page.hasMore,
                  let cached = await store.loadIgnoringExpiry(for: query.cacheKey)?.items else {
                return Self.capped(page.records)
            }
            return Self.capped(Self.joining(firstPage: page.records, cachedJournal: cached))
        }
        let setLoadState: @MainActor @Sendable (LoadState) -> Void = { [weak self] state in
            guard let self, self.loadGeneration == generation else { return }
            self.loadState = state.collapsedForList(
                errorMessage: String(localized: "calls.history.error", defaultValue: "Erreur lors du chargement", bundle: .main)
            )
        }
        let apply: @MainActor @Sendable ([APICallRecord]) -> Void = { [weak self] records in
            guard let self, self.loadGeneration == generation else { return }
            self.calls = records.filter { !self.pendingHides.contains($0.callId) }
            self.shownQuery = query
        }
        if forceNetwork {
            await loader.refresh(fetch: fetch, setLoadState: setLoadState, apply: apply)
            return
        }
        revalidationTask = await loader.load(fetch: fetch, setLoadState: setLoadState, apply: apply)
    }

    private func noteFirstPage(hasMore: Bool, generation: Int) {
        guard loadGeneration == generation else { return }
        reachedEnd = !hasMore
    }

    /// A fresh first page that reaches a row already cached is contiguous with
    /// the older pages behind it: they stay. Across a gap (more new calls than
    /// a page), the cached tail could no longer be continued by cursor — the
    /// fresh page replaces it. Cached rows that left the 3-month window go.
    nonisolated static func joining(firstPage: [APICallRecord], cachedJournal: [APICallRecord]) -> [APICallRecord] {
        guard let last = firstPage.last,
              let joint = cachedJournal.firstIndex(where: { $0.callId == last.callId }) else { return firstPage }
        let fresh = Set(firstPage.map(\.callId))
        let tail = cachedJournal[(joint + 1)...].filter { !fresh.contains($0.callId) }
        return firstPage + withinWindow(Array(tail))
    }

    /// What the store may hold, newest first, cut from the OLD end — the
    /// store's own trim keeps the tail, which would drop the newest calls.
    nonisolated static func capped(_ records: [APICallRecord]) -> [APICallRecord] {
        guard let cap = CachePolicy.callHistory.maxItemCount else { return records }
        return Array(records.prefix(cap))
    }

    nonisolated static func withinWindow(_ records: [APICallRecord], now: Date = Date()) -> [APICallRecord] {
        let horizon = now.addingTimeInterval(-journalWindow)
        return records.filter { $0.startedAt >= horizon }
    }

    /// The next older page, after the last listed call, for the query shown.
    /// The page joins the cache. A failed page keeps the list as it is; the
    /// next scroll to the bottom retries it.
    func loadMore() async {
        guard !isLoadingMore, !reachedEnd, let shown = shownQuery, shown == query,
              let cursor = calls.last?.callId else { return }
        let generation = loadGeneration
        isLoadingMore = true
        defer { isLoadingMore = false }
        guard let page = try? await service.history(
                limit: Self.pageSize,
                cursor: cursor,
                filter: shown.filter,
                type: shown.type,
                search: shown.search.isEmpty ? nil : shown.search
              ),
              loadGeneration == generation else { return }
        let known = Set(calls.map(\.callId)).union(pendingHides)
        calls += page.records.filter { !known.contains($0.callId) }
        reachedEnd = !page.hasMore
        let journal = Self.capped(Self.withinWindow(calls))
        let store = await CacheCoordinator.shared.callHistory
        await store.update(for: shown.cacheKey) { _ in journal }
    }

    /// Sends the typed name to the gateway — called once the typing settles.
    /// Clearing the field brings the whole journal back from its cache.
    func applySearch() async {
        let search = typedSearch
        guard search != requestedSearch else { return }
        requestedSearch = search
        await loadCalls()
    }

    func setFilter(_ newFilter: CallHistoryFilter) {
        guard newFilter != filter else { return }
        filter = newFilter
        // No synchronous `calls = []` here: loadCalls() is cache-first and
        // its `apply` closure replaces `calls` once the new filter's
        // cache/network result is ready — clearing eagerly would flash the
        // list to empty even when a cached page for the new filter exists.
        Task { await loadCalls() }
    }

    func setType(_ newType: CallHistoryType) {
        guard newType != type else { return }
        type = newType
        Task { await loadCalls() }
    }

    // MARK: - Erase (#8066)

    func hide(callId: String) async {
        guard let index = calls.firstIndex(where: { $0.callId == callId }) else { return }
        let record = calls[index]
        eraseFailed = false
        pendingHides.insert(callId)
        calls.remove(at: index)
        do {
            try await service.hide(callId: callId)
            pendingHides.remove(callId)
            let store = await CacheCoordinator.shared.callHistory
            await store.removeEverywhere(itemId: callId)
        } catch {
            pendingHides.remove(callId)
            guard !calls.contains(where: { $0.callId == callId }) else { return }
            calls.insert(record, at: min(index, calls.count))
            eraseFailed = true
        }
    }

    func clearAll() async {
        loadGeneration += 1
        revalidationTask?.cancel()
        let snapshot = calls
        let snapshotReachedEnd = reachedEnd
        eraseFailed = false
        calls = []
        reachedEnd = true
        do {
            _ = try await service.clearAll()
            let store = await CacheCoordinator.shared.callHistory
            await store.invalidateAll()
            for key in Self.baseCacheKeys {
                try? await store.save([], for: key)
            }
        } catch {
            calls = snapshot
            reachedEnd = snapshotReachedEnd
            eraseFailed = true
        }
    }

    func dismissEraseFailure() {
        eraseFailed = false
    }
}
