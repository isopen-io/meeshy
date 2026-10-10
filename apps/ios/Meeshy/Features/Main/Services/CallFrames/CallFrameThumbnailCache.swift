import CoreGraphics
import Foundation

/// Les vignettes des cadres du carrousel (#8743, spec § 3) : rendues pour la seule
/// fenêtre visible, gardées dans un cache BORNÉ, clé = cadre × nombre × taille.
protocol CallFrameThumbnailCacheProviding: AnyObject, Sendable {
    nonisolated func image(frameId: String, people: Int, size: CGSize) -> CGImage?
    nonisolated func store(_ image: CGImage, frameId: String, people: Int, size: CGSize)
    nonisolated func removeAll()
}

nonisolated final class CallFrameThumbnail: @unchecked Sendable {
    let image: CGImage

    init(image: CGImage) {
        self.image = image
    }

    var cost: Int { image.bytesPerRow * image.height }
}

/// `NSCache` est sûr d'un fil à l'autre et se vide seul sous la pression mémoire ;
/// les deux plafonds bornent ce que le Montage retient, quel que soit le catalogue.
nonisolated final class CallFrameThumbnailCache: CallFrameThumbnailCacheProviding, @unchecked Sendable {
    static let defaultCountLimit = 48
    static let defaultCostLimit = 8 * 1024 * 1024

    private let cache = NSCache<NSString, CallFrameThumbnail>()

    init(countLimit: Int = CallFrameThumbnailCache.defaultCountLimit, costLimit: Int = CallFrameThumbnailCache.defaultCostLimit) {
        cache.countLimit = countLimit
        cache.totalCostLimit = costLimit
    }

    static func key(frameId: String, people: Int, size: CGSize) -> String {
        "\(frameId)|\(people)|\(Int(size.width.rounded()))x\(Int(size.height.rounded()))"
    }

    func image(frameId: String, people: Int, size: CGSize) -> CGImage? {
        cache.object(forKey: Self.key(frameId: frameId, people: people, size: size) as NSString)?.image
    }

    func store(_ image: CGImage, frameId: String, people: Int, size: CGSize) {
        let entry = CallFrameThumbnail(image: image)
        cache.setObject(entry, forKey: Self.key(frameId: frameId, people: people, size: size) as NSString, cost: entry.cost)
    }

    func removeAll() {
        cache.removeAllObjects()
    }
}
