import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

@MainActor
final class CommunityListViewModel: ObservableObject, CommunityListModeling {
    nonisolated deinit {}

    @Published private(set) var communities: [MeeshyCommunity] = []
    @Published private(set) var isLoading = false
    @Published private(set) var hasMore = false
    @Published var searchText = "" {
        didSet { scheduleSearch() }
    }

    private var hasLoaded = false
    private var currentOffset = 0
    private let pageSize = MyCommunities.pageSize
    private var searchTask: Task<Void, Never>?
    private let service: CommunityServiceProviding
    private let store: @MainActor () async -> GRDBCacheStore<String, APICommunity>
    private let log = MeeshyLog.logger(.ui)
    private var liveUpdates: AnyCancellable?
    private var liveMembers: AnyCancellable?
    private let memberLane = OrderedEventLane()
    private let currentUserId: @MainActor () -> String

    /// `communityUpdates` : `community:updated` (#18439) réécrit la ligne
    /// d'une communauté renommée ou réglée ailleurs, sans relance réseau.
    /// `store` : « mes communautés » (#18935), la première page de l'écran.
    /// `memberChanges` : `community:member-*` (#18767) recopie l'effectif ; un
    /// geste qui fait entrer ou sortir le LECTEUR relit la liste.
    init(
        service: CommunityServiceProviding = CommunityService.shared,
        communityUpdates: AnyPublisher<CommunityUpdatedEvent, Never> = CommunityUpdateChannel.live,
        memberChanges: AnyPublisher<CommunityMemberChange, Never> = CommunityMemberChannel.live,
        currentUserId: @escaping @MainActor () -> String = MyCommunities.liveReaderId,
        store: @escaping @MainActor () async -> GRDBCacheStore<String, APICommunity> = MyCommunities.liveStore
    ) {
        self.service = service
        self.store = store
        self.currentUserId = currentUserId
        self.liveUpdates = communityUpdates
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.apply(event) }
        self.liveMembers = memberChanges
            .relay(through: memberLane) { [weak self] change in await self?.apply(change) }
    }

    func apply(_ change: CommunityMemberChange) async {
        if let index = communities.firstIndex(where: { $0.id == change.communityId }),
           let updated = communities[index].applying(change) {
            communities[index] = updated
        }
        // Entré sans ligne, ou sorti avec une : la liste du lecteur a changé.
        guard change.concerns(readerId: currentUserId()), (change.role == nil) == hasRow(change.communityId) else { return }
        await refresh()
    }

    private func hasRow(_ communityId: String) -> Bool {
        communities.contains { $0.id == communityId }
    }

    func apply(_ event: CommunityUpdatedEvent) {
        guard let index = communities.firstIndex(where: { $0.id == event.communityId }),
              let updated = communities[index].applying(event) else { return }
        communities[index] = updated
    }

    /// Cache-first (#18935) : la première page se peint depuis « mes
    /// communautés » puis se revalide en silence, sans indicateur ni écran
    /// vide hors ligne. Une recherche, elle, interroge le serveur.
    func loadIfNeeded() async {
        guard !hasLoaded else { return }
        guard searchText.count < 2 else { return await load() }
        let service = self.service
        let limit = pageSize
        let loader = CacheFirstLoader(store: await store(), key: MyCommunities.cacheKey)
        await loader.load(
            fetch: { try await service.list(search: nil, offset: 0, limit: limit).data },
            setLoadState: { [weak self] state in self?.isLoading = state == .loading },
            apply: { [weak self] page in self?.applyFirstPage(page) }
        )
    }

    private func applyFirstPage(_ page: [APICommunity]) {
        communities = page.map { $0.toCommunity() }
        currentOffset = communities.count
        hasMore = page.count >= pageSize
        hasLoaded = true
    }

    func refresh() async {
        currentOffset = 0
        hasLoaded = false
        await load()
    }

    func loadMore() async {
        guard hasMore, !isLoading else { return }
        await load(append: true)
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task {
            guard await cancellableSleep(for: .seconds(0.35)) else { return }
            currentOffset = 0
            await load()
        }
    }

    func load(append: Bool = false) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let searchQuery = searchText.count >= 2 ? searchText : nil
            let response = try await service.list(
                search: searchQuery,
                offset: append ? currentOffset : 0,
                limit: pageSize
            )
            let mapped = response.data.map { $0.toCommunity() }

            if append {
                let known = Set(communities.map(\.id))
                communities.append(contentsOf: mapped.filter { !known.contains($0.id) })
            } else {
                communities = mapped
                if searchQuery == nil { await persistFirstPage(response.data) }
            }

            currentOffset = communities.count
            hasMore = response.pagination?.hasMore ?? false
            hasLoaded = true
        } catch {
            if !Task.isCancelled {
                log.error("[CommunityListVM] Error loading: \(error.localizedDescription)")
            }
        }
    }

    /// Le tirer pour rafraîchir passe par le réseau ; sa première page reste
    /// celle de « mes communautés ».
    private func persistFirstPage(_ page: [APICommunity]) async {
        let cache = await store()
        await bestEffort("communityListViewModel.communities.save", category: .cache) {
            try await cache.save(page, for: MyCommunities.cacheKey)
        }
    }
}
