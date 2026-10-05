import Foundation
import Combine
import MeeshySDK

/// La liste COMPLÈTE des arrivées d'un lien, au-delà des récentes (#7813).
///
/// Cache-first : la liste se peint d'abord des arrivées récentes que la fiche
/// a déjà en main — aucun squelette quand il y a de quoi montrer — puis la
/// première page serveur la remplace. La suite se charge page par page près de
/// la fin, une seule demande à la fois, sans jamais montrer deux fois la même
/// ligne. Un échec de page suivante ne retire rien : il se dit en pied de
/// liste, avec « Réessayer ».
@MainActor
final class ShareLinkArrivalsListViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au
    // démontage hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let pageSize = 30
    /// À combien de lignes de la fin la page suivante se demande.
    static let prefetchDistance = 5

    let totalCount: Int

    @Published private(set) var arrivals: [ShareLinkArrivalEntry]
    @Published private(set) var isLoadingFirstPage = false
    @Published private(set) var isLoadingNextPage = false
    @Published private(set) var firstPageFailed = false
    @Published private(set) var nextPageFailed = false
    @Published private(set) var hasLoadedServerPage = false
    @Published private(set) var nextCursor: String?

    private let linkId: String
    private let service: ShareLinkManaging
    /// Chaque rechargement de la première page ouvre une génération : une page
    /// suivante demandée avant lui ne s'ajoute pas à la liste neuve.
    private var generation = 0

    init(
        linkId: String,
        totalCount: Int,
        seed: [ShareLinkArrivalEntry],
        service: ShareLinkManaging = ShareLinkService.shared
    ) {
        self.linkId = linkId
        self.totalCount = totalCount
        self.arrivals = Self.unique(seed)
        self.service = service
    }

    // MARK: - États

    var hasMore: Bool { hasLoadedServerPage && nextCursor != nil }

    var showsSkeleton: Bool { arrivals.isEmpty && isLoadingFirstPage }

    var showsEmpty: Bool { arrivals.isEmpty && hasLoadedServerPage && !isLoadingFirstPage }

    var showsFullError: Bool { arrivals.isEmpty && firstPageFailed && !isLoadingFirstPage }

    /// Une erreur qui ne cache rien : la liste reste, le pied propose de réessayer.
    var showsFooterError: Bool {
        guard !arrivals.isEmpty else { return false }
        return nextPageFailed || (firstPageFailed && !hasLoadedServerPage)
    }

    // MARK: - Chargement

    func loadFirstPage() async {
        guard !isLoadingFirstPage else { return }
        generation += 1
        let current = generation
        isLoadingFirstPage = true
        firstPageFailed = false
        defer { isLoadingFirstPage = false }
        do {
            let page = try await service.fetchLinkArrivals(linkId: linkId, cursor: nil, limit: Self.pageSize)
            guard current == generation else { return }
            arrivals = Self.unique(page.arrivals)
            nextCursor = page.nextCursor
            nextPageFailed = false
            hasLoadedServerPage = true
        } catch {
            guard current == generation else { return }
            firstPageFailed = true
        }
    }

    func refresh() async {
        await loadFirstPage()
    }

    func loadNextPage() async {
        guard hasLoadedServerPage, let cursor = nextCursor,
              !isLoadingNextPage, !isLoadingFirstPage else { return }
        let current = generation
        isLoadingNextPage = true
        nextPageFailed = false
        defer { isLoadingNextPage = false }
        do {
            let page = try await service.fetchLinkArrivals(linkId: linkId, cursor: cursor, limit: Self.pageSize)
            guard current == generation else { return }
            let known = Set(arrivals.map(\.id))
            arrivals += Self.unique(page.arrivals).filter { !known.contains($0.id) }
            nextCursor = page.nextCursor
        } catch {
            guard current == generation else { return }
            nextPageFailed = true
        }
    }

    /// Appelé quand une ligne apparaît : près de la fin, la suite se demande.
    func loadNextPageIfNeeded(after entry: ShareLinkArrivalEntry) async {
        guard hasMore, !nextPageFailed,
              let index = arrivals.lastIndex(where: { $0.id == entry.id }),
              index >= arrivals.count - Self.prefetchDistance else { return }
        await loadNextPage()
    }

    /// « Réessayer » reprend là où ça a cassé : la première page si aucune
    /// n'est encore venue, sinon la même page suivante.
    func retry() async {
        if hasLoadedServerPage {
            await loadNextPage()
        } else {
            await loadFirstPage()
        }
    }

    private static func unique(_ entries: [ShareLinkArrivalEntry]) -> [ShareLinkArrivalEntry] {
        var seen = Set<String>()
        return entries.filter { seen.insert($0.id).inserted }
    }
}
