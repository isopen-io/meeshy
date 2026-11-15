import Foundation
import Combine
import MeeshySDK

/// Qui sait combien de demandes attendent ma réponse. La source est UNE : les demandes reçues en attente que
/// `FriendshipCache` tient déjà (celles d'amitié comme celles de montée de cercle, qui sont des demandes reçues elles
/// aussi), pour qu'aucune ne se compte deux fois.
nonisolated protocol ProfilePendingRequestsCounting: Sendable {
    var pendingReceivedCount: Int { get }
    /// Sonne chaque fois que les demandes reçues ont pu changer (hydratation, acceptation, refus, notification).
    var pendingReceivedChanges: AnyPublisher<Void, Never> { get }
}

extension FriendshipCache: ProfilePendingRequestsCounting {
    nonisolated var pendingReceivedChanges: AnyPublisher<Void, Never> {
        $version.dropFirst().map { _ in () }.eraseToAnyPublisher()
    }
}

/// La rangée « Mes cercles » de ma fiche (#18590).
///
/// **Cache d'abord, sur le MÊME cache que « Mes cercles »** (store des liens, `CirclesViewModel.cacheKey`) : ouvrir ma
/// fiche après « Mes cercles » se peint sans réseau, et ce que la fiche revalide sert à son tour « Mes cercles ». Un cache
/// périmé se peint puis se revalide en silence ; un échec réseau ne retire jamais ce qui est déjà peint. Sans rien de
/// servi, la rangée garde ses cinq zéros : la fiche se peint, la rangée se complète.
@MainActor
final class ProfileCirclesViewModel: ObservableObject {

    @Published private(set) var summary: ProfileCirclesSummary = .empty
    @Published private(set) var loadState: LoadState = .idle
    /// Le cache ou le serveur a servi des liens (fût-ce aucun) : cinq zéros peuvent alors se dire « aucun lien ».
    @Published private(set) var hasServedLinks = false

    private let relations: RelationsProviding
    private let pendingRequests: ProfilePendingRequestsCounting
    private let networkMonitor: any NetworkMonitorProviding
    private let linksStore: @concurrent @Sendable () async -> GRDBCacheStore<String, RelationLink>
    private var links: [RelationLink] = []
    private var revalidationTask: Task<Void, Never>?
    private var pendingSubscription: AnyCancellable?

    /// Les singletons de production sont injectés par `init()` (`ProfileCirclesLive.swift`) : un ViewModel ne nomme pas
    /// `.shared`, et chaque dépendance se remplace par un double de test.
    init(
        relations: RelationsProviding,
        pendingRequests: ProfilePendingRequestsCounting,
        networkMonitor: any NetworkMonitorProviding,
        linksStore: @escaping @concurrent @Sendable () async -> GRDBCacheStore<String, RelationLink> = CirclesLinkStore.live
    ) {
        self.relations = relations
        self.pendingRequests = pendingRequests
        self.networkMonitor = networkMonitor
        self.linksStore = linksStore
        pendingSubscription = pendingRequests.pendingReceivedChanges
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.refreshSummary() }
    }

    nonisolated deinit {
        revalidationTask?.cancel()
    }

    func load() async {
        let relations = self.relations
        let loader = CacheFirstLoader(store: await linksStore(), key: CirclesViewModel.cacheKey, networkMonitor: networkMonitor)
        revalidationTask?.cancel()
        revalidationTask = await loader.load(
            fetch: { try await relations.links() },
            setLoadState: { [weak self] state in self?.loadState = state },
            apply: { [weak self] served in self?.apply(served) }
        )
        await revalidationTask?.value
        refreshSummary()
    }

    private func apply(_ served: [RelationLink]) {
        links = served
        if !hasServedLinks { hasServedLinks = true }
        refreshSummary()
    }

    /// Les demandes se relisent à chaque chargement ET à chaque changement que `FriendshipCache` annonce : il s'hydrate
    /// à son rythme, la rangée suit sans relire les liens.
    private func refreshSummary() {
        let next = ProfileCirclesSummary.make(links: links, pendingCount: pendingRequests.pendingReceivedCount)
        if next != summary { summary = next }
    }
}
