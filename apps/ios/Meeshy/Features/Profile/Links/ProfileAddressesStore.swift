import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Mes adresses (#18871), partagées par la face Liens et l'écran « Mes adresses » : une seule source, cache d'abord,
/// et chaque geste appliqué tout de suite puis confirmé — ou défait, avec un mot, si le serveur refuse.
@MainActor
final class ProfileAddressesStore: ObservableObject {
    nonisolated deinit {}

    static let shared = ProfileAddressesStore()

    enum Phase: Equatable {
        case loading
        case ready
        case failed
    }

    @Published private(set) var addresses: [ProfileAddress] = []
    @Published private(set) var phase: Phase = .loading
    /// Le dernier geste refusé : l'écran le dit, puis l'efface.
    @Published var refusal: String?

    private let service: ProfileAddressProviding
    private let cache: ProfileAddressCaching
    private let owner: () -> String?
    /// Le compte dont les adresses sont en mémoire : un autre compte ne voit jamais celles du précédent.
    private var loadedOwner: String?

    init(service: ProfileAddressProviding = ProfileAddressService.shared,
         cache: ProfileAddressCaching = ProfileAddressLiveCache(),
         owner: @escaping () -> String? = { AuthManager.shared.currentUser?.id }) {
        self.service = service
        self.cache = cache
        self.owner = owner
    }

    var totalClicks: Int { addresses.compactMap(\.clicks).reduce(0, +) }

    var canAdd: Bool { addresses.count < ProfileAddressRules.maxCount }

    func load() async {
        forgetAnotherAccount()
        switch await cache.load() {
        case .fresh(let cached, _):
            show(cached)
            return
        case .stale(let cached, _):
            show(cached)
        case .expired, .empty:
            break
        }
        await refresh()
    }

    /// Une réponse demandée sous un autre compte n'est ni montrée ni gardée : les adresses de A ne s'affichent jamais
    /// chez B, même servies après le changement de compte.
    func refresh() async {
        let requester = owner()
        do {
            let listed = try await service.list()
            guard owner() == requester else { return }
            show(listed)
            await cache.save(addresses)
        } catch {
            guard owner() == requester else { return }
            if phase != .ready { phase = .failed }
        }
    }

    func setShown(_ isShown: Bool, for id: String) async {
        await edit(id: id, change: { $0.with(isShown: isShown) }) {
            _ = try await self.service.update(id: id, ProfileAddressDraft(isShown: isShown))
        }
    }

    func setCircle(_ circle: RelationLevel, for id: String) async {
        await edit(id: id, change: { $0.with(circle: circle) }) {
            _ = try await self.service.update(id: id, ProfileAddressDraft(circle: circle))
        }
    }

    func rename(_ title: String, for id: String) async {
        guard let normalized = ProfileAddressRules.normalizedTitle(title) else { return }
        await edit(id: id, change: { $0.with(title: normalized) }) {
            _ = try await self.service.update(id: id, ProfileAddressDraft(title: normalized))
        }
    }

    func remove(id: String) async {
        guard let index = addresses.firstIndex(where: { $0.id == id }) else { return }
        let original = addresses[index]
        await apply(undo: .reinsert(original, at: index), edit: { $0.filter { $0.id != id } }) {
            try await self.service.remove(id: id)
        }
    }

    /// Déplace l'adresse du rang `from` au rang final `to` (K52) : l'ordre se montre tout de suite, puis l'ordre servi.
    func move(from: Int, to: Int) async {
        let before = addresses
        let reordered = MeeshyReorder.move(before, from: from, to: to)
        guard reordered.map(\.id) != before.map(\.id) else { return }
        let ids = reordered.map(\.id)
        let requester = owner()
        await apply(undo: .relist(before: before), edit: { _ in reordered }) {
            let served = try await self.service.reorder(ids: ids)
            await MainActor.run { if self.owner() == requester { self.show(served) } }
        }
    }

    /// Ajoute une adresse : elle n'apparaît qu'une fois servie, avec son identifiant et son lien de suivi.
    @discardableResult
    func add(_ draft: ProfileAddressDraft) async -> Bool {
        let requester = owner()
        do {
            let created = try await service.create(draft)
            guard owner() == requester else { return false }
            show(addresses.filter { $0.id != created.id } + [created])
            await cache.save(addresses)
            return true
        } catch {
            guard owner() == requester else { return false }
            refusal = ProfileLinksCopy.addressRefused
            return false
        }
    }

    private func forgetAnotherAccount() {
        let current = owner()
        guard current != loadedOwner else { return }
        loadedOwner = current
        addresses = []
        phase = .loading
        refusal = nil
    }

    private func show(_ list: [ProfileAddress]) {
        addresses = list
        phase = .ready
    }

    /// Ce qu'un refus défait : CE geste seulement, appliqué à la liste courante — jamais la liste d'avant entière, qui
    /// effacerait un geste voisin que le serveur a accepté entre-temps.
    private enum Undo {
        case restore(ProfileAddress)
        case reinsert(ProfileAddress, at: Int)
        case relist(before: [ProfileAddress])
    }

    private func edit(id: String, change: (ProfileAddress) -> ProfileAddress,
                      send: @escaping () async throws -> Void) async {
        guard let original = addresses.first(where: { $0.id == id }) else { return }
        let changed = change(original)
        await apply(undo: .restore(original), edit: { $0.map { $0.id == id ? changed : $0 } }, send: send)
    }

    /// Le geste optimiste : appliquer, envoyer, défaire CE geste sur refus.
    private func apply(undo: Undo, edit: ([ProfileAddress]) -> [ProfileAddress],
                       send: @escaping () async throws -> Void) async {
        let requester = owner()
        addresses = edit(addresses)
        do {
            try await send()
            guard owner() == requester else { return }
            await cache.save(addresses)
        } catch {
            guard owner() == requester else { return }
            await self.undo(undo)
            refusal = ProfileLinksCopy.addressRefused
        }
    }

    private func undo(_ undo: Undo) async {
        switch undo {
        case .restore(let original):
            addresses = addresses.map { $0.id == original.id ? original : $0 }
        case .reinsert(let original, let index):
            guard !addresses.contains(where: { $0.id == original.id }) else { return }
            let position = min(index, addresses.count)
            addresses = Array(addresses.prefix(position)) + [original] + Array(addresses.dropFirst(position))
        case .relist(let before):
            guard let listed = try? await service.list() else {
                addresses = before
                return
            }
            show(listed)
        }
    }
}

/// Le cache de mes adresses : le store chiffré du `CacheCoordinator`. Injecté pour les témoins.
protocol ProfileAddressCaching: Sendable {
    func load() async -> CacheResult<[ProfileAddress]>
    func save(_ addresses: [ProfileAddress]) async
}

struct ProfileAddressLiveCache: ProfileAddressCaching {
    static let key = "mine"

    func load() async -> CacheResult<[ProfileAddress]> {
        await CacheCoordinator.shared.profileAddresses.load(for: Self.key)
    }

    func save(_ addresses: [ProfileAddress]) async {
        await bestEffort("profileAddresses.save", category: .cache) {
            try await CacheCoordinator.shared.profileAddresses.save(addresses, for: Self.key)
        }
    }
}

extension ProfileAddress {
    func with(isShown: Bool? = nil, circle: RelationLevel? = nil, title: String? = nil) -> ProfileAddress {
        ProfileAddress(id: id, title: title ?? self.title, url: url, glyph: glyph, circle: circle ?? self.circle,
                       position: position, isShown: isShown ?? self.isShown, clicks: clicks, trackedPath: trackedPath)
    }
}
