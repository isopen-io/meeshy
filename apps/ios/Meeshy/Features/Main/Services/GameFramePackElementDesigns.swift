import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - La vitrine peint aussi les cadres du jeu (#16268)

/// **Les éléments d'un pack, cadres du jeu compris.** Le SDK peint l'embarqué, les contrats
/// d'apparence servis et les stickers ; les cadres du jeu se lisent par leur contrat, que seule
/// l'app sait nommer (rang, rareté, famille de moment). Ce fournisseur les lui ajoute et laisse
/// le reste au SDK.
@MainActor
final class GameFramePackElementDesigns: PackElementDesignProviding {
    nonisolated deinit {}

    private let base: any PackElementDesignProviding
    private let shelf: FramePackShelfLoader

    init(base: (any PackElementDesignProviding)? = nil, shelf: FramePackShelfLoader = .shared) {
        self.base = base ?? ServedPackElementDesigns()
        self.shelf = shelf
    }

    func elements(domain: PackDomain, pack: String, language: String) -> PackElementsResolution {
        guard domain == .gloryFrame else { return base.elements(domain: domain, pack: pack, language: language) }
        guard case .frames(let tiles)? = shelf.contents[pack] else { return .downloadRequired }
        return .ready(tiles.map { PackElement(pack: pack, item: $0.id, name: $0.name, art: .gloryFrame($0)) })
    }

    func prepare(domain: PackDomain, pack: String) async {
        guard domain == .gloryFrame else { return await base.prepare(domain: domain, pack: pack) }
        await shelf.load(slug: pack)
    }

    func seed(stickerPacks: [StickerPack]) {
        base.seed(stickerPacks: stickerPacks)
    }
}
