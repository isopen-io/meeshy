import SwiftUI
import MeeshySDK

/// Drives the People hub **Calls** tab — the call journal. Cache-first
/// (`CacheCoordinator.callHistory` via `CacheFirstLoader`): the cached page
/// renders instantly with no spinner, then revalidates silently in the
/// background. The 3-month server window keeps the first page (30) sufficient
/// for the overwhelming majority of users, so the journal is single-page.
@MainActor
final class CallsViewModel: ObservableObject {
    @Published private(set) var calls: [APICallRecord] = []
    @Published private(set) var loadState: LoadState = .idle
    @Published var filter: CallHistoryFilter = .all

    private let service: CallHistoryServiceProviding
    private let networkMonitor: any NetworkMonitorProviding
    private var revalidationTask: Task<Void, Never>?

    /// Bumped on every `loadCalls()` invocation. `CacheFirstLoader.load` awaits
    /// (cache read, then network fetch) before ever touching `calls`/
    /// `loadState`, so two overlapping invocations — e.g. the initial
    /// `.task` load still in flight when `setFilter` fires a second one — can
    /// resolve out of order. Without this guard, an older invocation for a
    /// filter the user has already navigated away from can complete AFTER the
    /// current one and clobber `calls` with stale-filter results. Mirrors the
    /// `generation` pattern in `VideoSurvivalController`.
    private var loadGeneration = 0

    private var cacheKey: String { "calls:list:\(filter.rawValue)" }

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

    func loadCalls() async {
        loadGeneration += 1
        let generation = loadGeneration
        let service = self.service
        let filter = self.filter
        let store = await CacheCoordinator.shared.callHistory
        let loader = CacheFirstLoader(store: store, key: cacheKey, networkMonitor: networkMonitor)
        revalidationTask?.cancel()
        revalidationTask = await loader.load(
            fetch: {
                let page = try await service.history(limit: 30, cursor: nil, filter: filter)
                return page.records
            },
            setLoadState: { [weak self] state in
                guard let self, self.loadGeneration == generation else { return }
                switch state {
                case .cachedFresh, .cachedStale, .loaded:
                    self.loadState = .loaded
                case .loading:
                    self.loadState = .loading
                case .offline:
                    self.loadState = .offline
                case .error:
                    self.loadState = .error(String(localized: "calls.history.error", defaultValue: "Erreur lors du chargement", bundle: .main))
                case .idle:
                    self.loadState = .idle
                }
            },
            apply: { [weak self] records in
                guard let self, self.loadGeneration == generation else { return }
                self.calls = records
            }
        )
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
}
