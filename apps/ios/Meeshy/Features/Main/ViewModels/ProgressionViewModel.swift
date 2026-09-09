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
    /// Une frappe est en vol (#5743) — le bouton reste affiché, avec son état
    /// dit : le faire disparaître au tap donnerait l'impression d'un échec.
    @Published private(set) var isMinting = false

    /**
     * L'identifiant d'IDEMPOTENCE, généré une fois par INTENTION de frappe et
     * non par requête : sinon un réessai deviendrait une seconde frappe, ce que
     * cet identifiant est justement là pour empêcher. Il n'est renouvelé
     * qu'après une frappe qui a abouti.
     */
    private var mintRequestId = UUID().uuidString

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
            let resolu = EngagementProgressResolver.resolve(snapshot)
            self.progress = resolu
            // Les rappels de série se REPLANIFIENT à chaque lecture de la
            // progression (#5902) : c'est le seul moment où l'on connaît à la
            // fois le nombre de jours tenus et l'état du geste du jour. Le
            // planificateur retire toujours son jeu précédent, donc l'appeler
            // souvent ne peut pas empiler de rappels.
            Task { await StreakReminderScheduler.shared.replanifier(
                serieEnCours: resolu.streak.currentDays,
                aAgiAujourdhui: StreakActivityMark.aAgiAujourdhui()
            ) }
        }

        if forceNetwork {
            await loader.refresh(fetch: fetch, setLoadState: setLoadState, apply: apply)
            return
        }
        revalidationTask = await loader.load(fetch: fetch, setLoadState: setLoadState, apply: apply)
    }

    /// Frappe une Meesh, puis RELIT depuis le réseau.
    ///
    /// La relecture est forcée : la frappe change les compteurs, le score, les
    /// badges et le solde d'un seul coup, et servir le cache après elle
    /// montrerait un écran qui contredit l'action qu'on vient de faire.
    ///
    /// Un échec ne bloque rien et ne renouvelle PAS l'identifiant : réessayer
    /// avec le même reste idempotent, ce qui est exactement ce qu'on veut quand
    /// on ne sait pas si la première tentative a abouti.
    func mint() async {
        guard !isMinting else { return }
        isMinting = true
        defer { isMinting = false }
        do {
            _ = try await service.mintMeesh(requestId: mintRequestId)
            mintRequestId = UUID().uuidString
            await load(forceNetwork: true)
        } catch {
            loadState = .error(
                String(
                    localized: "progression.meesh.mint_error",
                    defaultValue: "La frappe n'a pas abouti — réessayez",
                    bundle: .main
                )
            )
        }
    }
}
