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

    init(service: ProfileAddressProviding = ProfileAddressService.shared,
         cache: ProfileAddressCaching = ProfileAddressLiveCache()) {
        self.service = service
        self.cache = cache
    }

    var totalClicks: Int { addresses.compactMap(\.clicks).reduce(0, +) }

    var canAdd: Bool { addresses.count < ProfileAddressRules.maxCount }

    func load() async {
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

    func refresh() async {
        do {
            show(try await service.list())
            await cache.save(addresses)
        } catch {
            if phase != .ready { phase = .failed }
        }
    }

    func setShown(_ isShown: Bool, for id: String) async {
        await apply(edit: { $0.map { $0.id == id ? $0.with(isShown: isShown) : $0 } }) {
            _ = try await self.service.update(id: id, ProfileAddressDraft(isShown: isShown))
        }
    }

    func setCircle(_ circle: RelationLevel, for id: String) async {
        await apply(edit: { $0.map { $0.id == id ? $0.with(circle: circle) : $0 } }) {
            _ = try await self.service.update(id: id, ProfileAddressDraft(circle: circle))
        }
    }

    func rename(_ title: String, for id: String) async {
        guard let normalized = ProfileAddressRules.normalizedTitle(title) else { return }
        await apply(edit: { $0.map { $0.id == id ? $0.with(title: normalized) : $0 } }) {
            _ = try await self.service.update(id: id, ProfileAddressDraft(title: normalized))
        }
    }

    func remove(id: String) async {
        await apply(edit: { $0.filter { $0.id != id } }) {
            try await self.service.remove(id: id)
        }
    }

    /// Déplace l'adresse du rang `from` au rang final `to` (K52) : l'ordre se montre tout de suite, puis l'ordre servi.
    func move(from: Int, to: Int) async {
        let reordered = MeeshyReorder.move(addresses, from: from, to: to)
        guard reordered.map(\.id) != addresses.map(\.id) else { return }
        let ids = reordered.map(\.id)
        await apply(edit: { _ in reordered }) {
            let served = try await self.service.reorder(ids: ids)
            await MainActor.run { self.show(served) }
        }
    }

    /// Ajoute une adresse : elle n'apparaît qu'une fois servie, avec son identifiant et son lien de suivi.
    @discardableResult
    func add(_ draft: ProfileAddressDraft) async -> Bool {
        do {
            let created = try await service.create(draft)
            show(addresses.filter { $0.id != created.id } + [created])
            await cache.save(addresses)
            return true
        } catch {
            refusal = ProfileLinksCopy.addressRefused
            return false
        }
    }

    private func show(_ list: [ProfileAddress]) {
        addresses = list
        phase = .ready
    }

    /// Le geste optimiste : appliquer, envoyer, défaire sur refus.
    private func apply(edit: ([ProfileAddress]) -> [ProfileAddress], send: @escaping () async throws -> Void) async {
        let before = addresses
        addresses = edit(before)
        do {
            try await send()
            await cache.save(addresses)
        } catch {
            addresses = before
            refusal = ProfileLinksCopy.addressRefused
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
