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
///
/// La source vit le temps du processus, mais sa bande est celle du compte
/// CONNECTÉ : un changement de compte l'efface aussitôt, puis relit celle du
/// compte entrant. Sans cela, `@Published` rejouait la bande du compte A à la
/// liste recréée pour le compte B — et hors ligne, rien ne la remplaçait.
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
    /// Le compte connecté, à chaque CHANGEMENT — bascule, déconnexion,
    /// connexion. La valeur que `@Published` rejoue à l'abonnement n'en est pas un.
    static var liveAccountChanges: AnyPublisher<String?, Never> {
        AuthManager.shared.$currentUser.map { $0?.id }.removeDuplicates().dropFirst().eraseToAnyPublisher()
    }
    /// Le cache devient celui du compte entrant (#8674) avant d'être relu : lu
    /// plus tôt, il servirait encore celui du compte sortant.
    static let liveAccountSettled: @MainActor () async -> Void = {
        await CacheAccountBinder.shared.settled()
    }

    nonisolated deinit {}

    @Published private(set) var communities: [MeeshyCommunity] = []

    private let service: CommunityServiceProviding
    private let store: @MainActor () async -> GRDBCacheStore<String, APICommunity>
    private let accountSettled: @MainActor () async -> Void
    private var liveUpdates: AnyCancellable?
    private var accountWatch: AnyCancellable?
    /// Compté à chaque changement de compte : une lecture lancée sous un compte
    /// ne publie ni ne grave rien sous le suivant.
    private var accountEpoch = 0
    /// La relecture du compte entrant, retenue pour que les témoins l'attendent.
    private(set) var accountReload: Task<Void, Never>?

    /// `communityUpdates` : `community:updated` (#18439) repeint la bande d'une
    /// communauté renommée ailleurs, comme l'écran des communautés.
    /// `accountChanges` : le compte connecté, à chaque changement (#18935).
    init(
        service: CommunityServiceProviding = CommunityService.shared,
        store: @escaping @MainActor () async -> GRDBCacheStore<String, APICommunity> = MyCommunities.liveStore,
        communityUpdates: AnyPublisher<CommunityUpdatedEvent, Never> = CommunityUpdateChannel.live,
        accountChanges: AnyPublisher<String?, Never> = MyCommunities.liveAccountChanges,
        accountSettled: @escaping @MainActor () async -> Void = MyCommunities.liveAccountSettled
    ) {
        self.service = service
        self.store = store
        self.accountSettled = accountSettled
        self.liveUpdates = communityUpdates
            .receive(on: DispatchQueue.main)
            .sink { [weak self] event in self?.apply(event) }
        self.accountWatch = accountChanges
            .sink { [weak self] accountId in self?.follow(accountId: accountId) }
    }

    func apply(_ event: CommunityUpdatedEvent) {
        guard let index = communities.firstIndex(where: { $0.id == event.communityId }),
              let updated = communities[index].applying(event) else { return }
        communities[index] = updated
    }

    /// Un autre compte est connecté, ou aucun : la bande du précédent s'efface
    /// dans le même tour, avant que la liste recréée ne s'y abonne ; celle du
    /// compte entrant se relit ensuite, cache-first.
    func follow(accountId: String?) {
        accountEpoch += 1
        communities = []
        accountReload?.cancel()
        guard accountId != nil else {
            accountReload = nil
            return
        }
        let epoch = accountEpoch
        accountReload = Task { [weak self] in await self?.reload(under: epoch) }
    }

    private func reload(under epoch: Int) async {
        await accountSettled()
        guard epoch == accountEpoch else { return }
        await load()
    }

    /// Cache-first : frais, rien d'autre ; périmé, revalidé en silence ; expiré,
    /// le disque puis le réseau ; vide, le réseau.
    func load() async {
        let epoch = accountEpoch
        let cache = await store()
        switch await cache.load(for: Self.cacheKey) {
        case .fresh(let cached, _):
            publish(cached, under: epoch)
        case .stale(let cached, _):
            publish(cached, under: epoch)
            await revalidate(under: epoch)
        case .expired:
            if let onDisk = await cache.loadIgnoringExpiry(for: Self.cacheKey)?.items { publish(onDisk, under: epoch) }
            await revalidate(under: epoch)
        case .empty:
            await revalidate(under: epoch)
        }
    }

    /// Le tirer pour rafraîchir : toujours le réseau, même sur un cache frais.
    func refresh() async {
        await revalidate(under: accountEpoch)
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

    /// La réponse d'un compte quitté pendant l'aller-retour n'est ni publiée ni
    /// gravée : le cache est déjà celui du compte suivant.
    private func revalidate(under epoch: Int) async {
        do {
            let response = try await service.list(search: nil, offset: 0, limit: Self.pageSize)
            guard epoch == accountEpoch else { return }
            publish(response.data, under: epoch)
            let cache = await store()
            guard epoch == accountEpoch else { return }
            await bestEffort("myCommunities.save", category: .cache) { try await cache.save(response.data, for: Self.cacheKey) }
        } catch {
            Logger.cache.warning("[MyCommunities] revalidation failed: \(error.localizedDescription)")
        }
    }

    private func publish(_ apiCommunities: [APICommunity], under epoch: Int) {
        guard epoch == accountEpoch else { return }
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
