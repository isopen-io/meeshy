import SwiftUI
import MeeshySDK

// MARK: - La Boutique des packs de stickers (#9190)

/// **La Boutique des stickers** — la projection sticker de `PackShopView`
/// (#10150) : chaque pack devient une rangée, illustrée par son film Mee s'il
/// est intégré, par son image servie sinon.
///
/// Proposer un pack depuis iOS est hors périmètre : le web le fait, avec son
/// éditeur de zones.
public struct StickerPackShopView: View {

    let packs: [StickerPack]?
    let pending: Set<String>
    let showsFailure: Bool
    let onToggle: (StickerPack) -> Void

    public init(packs: [StickerPack]?, pending: Set<String>, showsFailure: Bool,
                onToggle: @escaping (StickerPack) -> Void) {
        self.packs = packs
        self.pending = pending
        self.showsFailure = showsFailure
        self.onToggle = onToggle
    }

    public var body: some View {
        PackShopView(rows: packs?.map(Self.row), pending: pending, showsFailure: showsFailure) { slug in
            if let pack = packs?.first(where: { $0.slug == slug }) { onToggle(pack) }
        }
    }

    /// Un pack de stickers en rangée de Boutique.
    public static func row(_ pack: StickerPack) -> PackRow {
        let cover: PackCover = MeeStickerCatalog.cast(forPackSlug: pack.slug) != nil
            ? .mee(slug: pack.slug)
            : .remote(pack.coverUrl ?? pack.items.first?.fileUrl)
        return PackRow(slug: pack.slug, name: pack.name, author: pack.author, description: pack.description,
                       installed: pack.installed, removable: pack.removable, cover: cover)
    }
}
