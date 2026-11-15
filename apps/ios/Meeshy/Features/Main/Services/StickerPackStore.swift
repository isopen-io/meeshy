import Foundation
import MeeshySDK

// MARK: - Les packs de stickers, côté app (#9190) — la façade sticker de `PackStore` (#10150)

/// Le magasin des stickers EST le magasin générique, au domaine `sticker` :
/// cache par compte, revalidation à chaque apparition, bascule optimiste.
typealias StickerPackStore = PackStore<StickerPack>
typealias StickerPackShelfState = PackShelfState<StickerPack>
typealias StickerPackSnapshot = PackSnapshot<StickerPack>
typealias StickerPackCaching = PackCaching

extension PackStore where Pack == StickerPack {
    static var shared: PackStore<StickerPack> { PackStores.stickers }
}

/// Le magasin des cadres de gloire.
typealias FramePackStore = PackStore<FramePack>

extension PackStore where Pack == FramePack {
    static var shared: PackStore<FramePack> { PackStores.frames }
}
