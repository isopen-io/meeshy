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
                guard let self else { return }
                switch state {
                case .cachedFresh, .cachedStale, .loaded:
                    self.loadState = .loaded
                case .loading:
                    self.loadState = .loading
                case .offline:
                    self.loadState = .offline
                case .error:
                    self.loadState = .error("Erreur lors du chargement")
                case .idle:
                    self.loadState = .idle
                }
            },
            apply: { [weak self] records in
                self?.calls = records
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
