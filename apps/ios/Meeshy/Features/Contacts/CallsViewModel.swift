import SwiftUI
import MeeshySDK

/// Drives the People hub **Calls** tab — the call journal. Cache-first
/// (`CacheCoordinator.callHistory` via `CacheFirstLoader`): the cached first
/// page renders instantly with no spinner, then revalidates silently in the
/// background. Older pages follow by cursor as the list scrolls, over the
/// whole 3-month server window (#8066); the cursor is the last listed call's
/// id — the gateway's own `nextCursor` — so a page restored from cache can
/// continue just as well as a fetched one.
///
/// Erasing is for the reader alone (`DELETE /calls/history[/:callId]`) and
/// optimistic: the row (or the journal) leaves at once, and comes back at its
/// place if the gateway refuses, with `eraseFailed` raised for the banner.
@MainActor
final class CallsViewModel: ObservableObject {
    @Published private(set) var calls: [APICallRecord] = []
    @Published private(set) var loadState: LoadState = .idle
    @Published var filter: CallHistoryFilter = .all
    @Published var searchQuery: String = ""
    @Published private(set) var isLoadingMore = false
    @Published private(set) var reachedEnd = false
    @Published private(set) var eraseFailed = false

    static let pageSize = 30
    private static let cacheKeys = CallHistoryFilter.allCases.map { "calls:list:\($0.rawValue)" }

    private let service: CallHistoryServiceProviding
    private let networkMonitor: any NetworkMonitorProviding
    private var revalidationTask: Task<Void, Never>?
    private var pendingHides: Set<String> = []

    /// Bumped on every `loadCalls()` invocation. `CacheFirstLoader.load` awaits
    /// (cache read, then network fetch) before ever touching `calls`/
    /// `loadState`, so two overlapping invocations — e.g. the initial
    /// `.task` load still in flight when `setFilter` fires a second one — can
    /// resolve out of order. Without this guard, an older invocation for a
    /// filter the user has already navigated away from can complete AFTER the
    /// current one and clobber `calls` with stale-filter results. Mirrors the
    /// `generation` pattern in `VideoSurvivalController`. A page of `loadMore`
    /// and a `clearAll` obey the same guard.
    private var loadGeneration = 0

    private var cacheKey: String { "calls:list:\(filter.rawValue)" }

    private var unknownName: String {
        String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main)
    }

    var isSearching: Bool {
        !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// The journal as shown: every loaded call, narrowed by the search.
    var visibleCalls: [APICallRecord] {
        guard isSearching else { return calls }
        let fallback = unknownName
        return calls.filter { $0.matches(query: searchQuery, fallback: fallback) }
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
        let filter = self.filter
        let pageSize = Self.pageSize
        let store = await CacheCoordinator.shared.callHistory
        let loader = CacheFirstLoader(store: store, key: cacheKey, networkMonitor: networkMonitor)
        revalidationTask?.cancel()
        let fetch: @Sendable () async throws -> [APICallRecord] = { [weak self] in
                let page = try await service.history(limit: pageSize, cursor: nil, filter: filter)
                await self?.noteFirstPage(hasMore: page.hasMore, generation: generation)
                return page.records
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

    /// The next older page, after the last listed call. A failed page keeps
    /// the list as it is; the next scroll to the bottom retries it.
    func loadMore() async {
        guard !isLoadingMore, !reachedEnd, let cursor = calls.last?.callId else { return }
        let generation = loadGeneration
        isLoadingMore = true
        defer { isLoadingMore = false }
        guard let page = try? await service.history(limit: Self.pageSize, cursor: cursor, filter: filter),
              loadGeneration == generation else { return }
        let known = Set(calls.map(\.callId)).union(pendingHides)
        calls += page.records.filter { !known.contains($0.callId) }
        reachedEnd = !page.hasMore
    }

    /// A search reaches the whole 90-day journal, not only what is loaded:
    /// older pages follow one after another while a query is typed.
    func searchAcrossHistory() async {
        while isSearching, !reachedEnd, !Task.isCancelled {
            let before = calls.count
            await loadMore()
            guard calls.count > before || reachedEnd else { return }
        }
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
            await updateCachedJournals { $0.filter { $0.callId != callId } }
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
            await updateCachedJournals { _ in [] }
        } catch {
            calls = snapshot
            reachedEnd = snapshotReachedEnd
            eraseFailed = true
        }
    }

    func dismissEraseFailure() {
        eraseFailed = false
    }

    private func updateCachedJournals(_ mutate: @escaping @Sendable ([APICallRecord]) -> [APICallRecord]) async {
        let store = await CacheCoordinator.shared.callHistory
        for key in Self.cacheKeys {
            await store.update(for: key, mutate: mutate)
        }
    }
}
