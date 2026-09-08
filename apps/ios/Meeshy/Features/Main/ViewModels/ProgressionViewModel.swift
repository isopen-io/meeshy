import SwiftUI
import Combine
import MeeshySDK

/// L'écran « Progression » (#5698) — badges, série et niveau de l'utilisateur,
/// lus depuis `GET /me/engagement` et DÉRIVÉS par la loi partagée
/// (`EngagementProgressResolver`, miroir de `packages/shared/utils/engagement-progress.ts`).
///
/// Cache-first comme le reste de l'app (Pattern I1) : le dernier instantané
/// connu se peint immédiatement, la revalidation se fait en silence ; le
/// squelette n'apparaît qu'à froid, jamais sur un instantané. Hors ligne,
/// l'instantané reste affiché — `CacheFirstLoader` récupère même un cache
/// expiré (cache-04) plutôt que de rendre un écran vide.
///
/// Ce ViewModel ne lit JAMAIS l'historique des notifications : les quatre
/// types de réengagement restent le canal de LIVRAISON des paliers, cet écran
/// restitue l'ÉTAT courant (modèle § 9).
@MainActor
final class ProgressionViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free au démontage hors d'une tâche. `revalidationTask`
    // est un `Task` (Sendable) : l'annuler depuis une deinit non isolée est
    // le motif de `ConversationListViewModel`. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {
        revalidationTask?.cancel()
    }

    @Published private(set) var progress: EngagementProgress?
    @Published private(set) var loadState: LoadState = .idle

    private let service: EngagementProgressProviding
    private let networkMonitor: any NetworkMonitorProviding
    private let cacheKey: String
    private var revalidationTask: Task<Void, Never>?

    init(
        service: EngagementProgressProviding = EngagementProgressService.shared,
        networkMonitor: any NetworkMonitorProviding = NetworkMonitor.shared,
        currentUserId: String = AuthManager.shared.currentUser?.id ?? ""
    ) {
        self.service = service
        self.networkMonitor = networkMonitor
        self.cacheKey = "engagement:\(currentUserId)"
    }

    /// Squelette : cache FROID et rien encore peint — jamais un spinner sur un instantané.
    var showsSkeleton: Bool {
        progress == nil && loadState == .loading
    }

    var isOffline: Bool {
        loadState == .offline
    }

    var errorMessage: String? {
        if case .error(let message) = loadState { return message }
        return nil
    }

    func load(forceNetwork: Bool = false) async {
        let service = self.service
        let store = await CacheCoordinator.shared.engagementProgress
        let loader = CacheFirstLoader(store: store, key: cacheKey, networkMonitor: networkMonitor)
        revalidationTask?.cancel()

        let fetch: @Sendable () async throws -> [APIEngagementProgress] = { [try await service.fetchProgress()] }
        let setLoadState: @MainActor @Sendable (LoadState) -> Void = { [weak self] state in
            guard let self else { return }
            switch state {
            case .error:
                // Le message du loader est celui de l'erreur système — on lui
                // préfère la phrase de l'écran, la même dans les sept langues.
                self.loadState = .error(String(localized: "progression.load_error", defaultValue: "Impossible de charger la progression", bundle: .main))
            default:
                self.loadState = state
            }
        }
        let apply: @MainActor @Sendable ([APIEngagementProgress]) -> Void = { [weak self] snapshots in
            guard let self, let snapshot = snapshots.first else { return }
            self.progress = EngagementProgressResolver.resolve(snapshot)
        }

        if forceNetwork {
            await loader.refresh(fetch: fetch, setLoadState: setLoadState, apply: apply)
            return
        }
        revalidationTask = await loader.load(fetch: fetch, setLoadState: setLoadState, apply: apply)
    }
}
