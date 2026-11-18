import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

// MARK: - Mes communautés

/// « Mes communautés » — UNE source pour la bande Communautés de la liste, la
/// feuille de partage et l'écran des communautés : le cache
/// `communities["list"]` (#18935). Elle se peint depuis le cache et se revalide
/// en silence, et les GESTES l'écrivent — rejoindre et créer ajoutent, quitter
/// retire. Avant, la bande n'était relue que par le `.task` et le tirer pour
/// rafraîchir, tous deux cache-first : une communauté quittée restait cinq
/// minutes dans la bande (tirer ne changeait rien) et dans la feuille de partage.
@MainActor
final class MyCommunities: ObservableObject {
    static let shared = MyCommunities()
    nonisolated static let cacheKey = "list"
    /// La même première page pour la bande et pour l'écran des communautés :
    /// deux tailles sous une seule clé se serviraient l'une à l'autre une liste
    /// tronquée.
    nonisolated static let pageSize = 20
    /// Le magasin partagé, atteint par saut d'acteur à chaque appel.
    static let liveStore: @MainActor () async -> GRDBCacheStore<String, APICommunity> = {
        await CacheCoordinator.shared.communities
    }
    /// Le lecteur connecté, lu à chaque événement.
    static let liveReaderId: @MainActor () -> String = { AuthManager.shared.currentUser?.id ?? "" }

    nonisolated deinit {}

    @Published private(set) var communities: [MeeshyCommunity] = []

    private let service: CommunityServiceProviding
    private let store: @MainActor () async -> GRDBCacheStore<String, APICommunity>
    private var liveUpdates: AnyCancellable?
    private var liveMembers: AnyCancellable?
    private let memberLane = OrderedEventLane()
    private let currentUserId: @MainActor () -> String

    /// `communityUpdates` : `community:updated` (#18439) repeint la bande d'une
    /// communauté renommée ailleurs, comme l'écran des communautés.
    init(
        service: CommunityServiceProviding = CommunityService.shared,
        store: @escaping @MainActor () async -> GRDBCacheStore<String, APICommunity> = MyCommunities.liveStore,
        communityUpdates: AnyPublisher<CommunityUpdatedEvent, Never> = CommunityUpdateChannel.live,
        memberChanges: AnyPublisher<CommunityMemberChange, Never> = CommunityMemberChannel.live,
        currentUserId: @escaping @MainActor () -> String = MyCommunities.liveReaderId
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

    /// `community:member-*` (#18767) : l'effectif se recopie ; le lecteur
    /// sorti d'ailleurs (autre appareil, retrait) perd la communauté de la
    /// bande, du cache et donc du partage ; entré d'ailleurs, la bande se relit.
    func apply(_ change: CommunityMemberChange) async {
        if let index = communities.firstIndex(where: { $0.id == change.communityId }),
           let updated = communities[index].applying(change) {
            communities[index] = updated
        }
        guard change.concerns(readerId: currentUserId()) else { return }
        let held = communities.contains { $0.id == change.communityId }
        switch (change.role, held) {
        case (nil, true): await remove(communityId: change.communityId)
        case (.some, false): await refresh()
        default: return
        }
    }

    func apply(_ event: CommunityUpdatedEvent) {
        guard let index = communities.firstIndex(where: { $0.id == event.communityId }),
              let updated = communities[index].applying(event) else { return }
        communities[index] = updated
    }

    /// Cache-first : frais, rien d'autre ; périmé, revalidé en silence ; expiré,
    /// le disque puis le réseau ; vide, le réseau.
    func load() async {
        let cache = await store()
        switch await cache.load(for: Self.cacheKey) {
        case .fresh(let cached, _):
            publish(cached)
        case .stale(let cached, _):
            publish(cached)
            await revalidate()
        case .expired:
            if let onDisk = await cache.loadIgnoringExpiry(for: Self.cacheKey)?.items { publish(onDisk) }
            await revalidate()
        case .empty:
            await revalidate()
        }
    }

    /// Le tirer pour rafraîchir : toujours le réseau, même sur un cache frais.
    func refresh() async {
        await revalidate()
    }

    /// Rejoindre ou créer : la communauté entre en tête, sans doublon. Un cache
    /// vide n'est pas fabriqué d'une seule ligne : il se remplira au réseau.
    func add(_ community: APICommunity) async {
        await store().prependToExisting(community, for: Self.cacheKey)
        let added = community.toCommunity()
        communities = [added] + communities.filter { $0.id != added.id }
    }

    /// Quitter : la communauté sort de la bande, du cache, donc du partage.
    func remove(communityId: String) async {
        await store().update(for: Self.cacheKey) { $0.filter { $0.id != communityId } }
        communities.removeAll { $0.id == communityId }
    }

    private func revalidate() async {
        do {
            let response = try await service.list(search: nil, offset: 0, limit: Self.pageSize)
            publish(response.data)
            let cache = await store()
            await bestEffort("myCommunities.save", category: .cache) { try await cache.save(response.data, for: Self.cacheKey) }
        } catch {
            Logger.cache.warning("[MyCommunities] revalidation failed: \(error.localizedDescription)")
        }
    }

    private func publish(_ apiCommunities: [APICommunity]) {
        communities = apiCommunities.map { $0.toCommunity() }
    }
}

/// Ce que les gestes d'une communauté écrivent dans « mes communautés » — la
/// couture d'injection des ViewModels de la fiche et de la création ; `.live`
/// vise la source partagée.
struct MyCommunitiesWrites {
    var add: @MainActor (APICommunity) async -> Void
    var remove: @MainActor (String) async -> Void

    static var live: MyCommunitiesWrites {
        MyCommunitiesWrites(
            add: { await MyCommunities.shared.add($0) },
            remove: { await MyCommunities.shared.remove(communityId: $0) }
        )
    }
}
