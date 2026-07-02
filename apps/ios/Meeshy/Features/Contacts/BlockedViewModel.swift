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

    /// R6-4 incr.2 — unblock via l'outbox durable (survit offline + kill), pas
    /// l'appel REST direct online-only. Retrait optimiste de la liste + flip de
    /// la blocklist canonique (`setBlockedOptimistic`, lue par les swipe labels
    /// ailleurs) ; le dispatcher outbox possède le DELETE réseau. Rollback des
    /// deux sur enqueue-fail ET sur `.exhausted` (miroir UserProfileViewModel).
    func unblock(userId: String) async {
        let snapshot = blockedUsers
        let cmid = ClientMutationId.generate()
        blockedUsers.removeAll { $0.id == userId }
        blockService.setBlockedOptimistic(userId: userId, blocked: false)
        HapticFeedback.medium()
        observeUnblockOutcome(cmid: cmid, userId: userId, snapshot: snapshot)
        let payload = UnblockUserPayload(clientMutationId: cmid, targetUserId: userId)
        do {
            try await OfflineQueue.shared.enqueue(.unblockUser, payload: payload)
            FeedbackToastManager.shared.showSuccess("Utilisateur debloque")
        } catch {
            blockedUsers = snapshot
            blockService.setBlockedOptimistic(userId: userId, blocked: true)
            HapticFeedback.error()
            FeedbackToastManager.shared.showError("Impossible de debloquer")
        }
    }

    private func observeUnblockOutcome(cmid: String, userId: String, snapshot: [BlockedUser]) {
        Task { @MainActor [weak self] in
            let stream = await OfflineQueue.shared.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    guard let self else { return }
                    self.blockedUsers = snapshot
                    self.blockService.setBlockedOptimistic(userId: userId, blocked: true)
                    FeedbackToastManager.shared.showError("Impossible de debloquer")
                    HapticFeedback.error()
                }
            }
        }
    }
}
