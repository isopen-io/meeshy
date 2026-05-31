import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

@MainActor
final class BlockedViewModel: ObservableObject {
    @Published var blockedUsers: [BlockedUser] = []
    @Published var loadState: LoadState = .idle

    private let blockService: BlockServiceProviding
    private let networkMonitor: any NetworkMonitorProviding
    private var revalidationTask: Task<Void, Never>?
    private let cacheKey = "blocked:list"

    init(
        blockService: BlockServiceProviding = BlockService.shared,
        networkMonitor: any NetworkMonitorProviding = NetworkMonitor.shared
    ) {
        self.blockService = blockService
        self.networkMonitor = networkMonitor
    }

    deinit {
        revalidationTask?.cancel()
    }

    func loadBlocked() async {
        let blockService = self.blockService
        let store = await CacheCoordinator.shared.blockedUsers
        let loader = CacheFirstLoader(store: store, key: cacheKey, networkMonitor: networkMonitor)
        revalidationTask?.cancel()
        revalidationTask = await loader.load(
            fetch: { try await blockService.listBlockedUsers() },
            setLoadState: { [weak self] state in
                guard let self else { return }
                // Map the loader's transient states into the reduced surface the
                // Blocked screen renders ("loading" vs "loaded" vs "error"). The
                // bible's no-spinner-when-cached rule is honoured: cachedFresh /
                // cachedStale come through as `.loaded`, only a cold start hits
                // `.loading`.
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
            apply: { [weak self] users in
                self?.blockedUsers = users
            }
        )
    }

    func unblock(userId: String) async {
        let snapshot = blockedUsers
        blockedUsers.removeAll { $0.id == userId }
        HapticFeedback.medium()
        do {
            try await blockService.unblockUser(userId: userId)
            FeedbackToastManager.shared.showSuccess("Utilisateur debloque")
        } catch {
            blockedUsers = snapshot
            HapticFeedback.error()
            FeedbackToastManager.shared.showError("Impossible de debloquer")
        }
    }
}
