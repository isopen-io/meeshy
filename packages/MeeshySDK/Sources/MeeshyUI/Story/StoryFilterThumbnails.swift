import UIKit
import MeeshySDK

/// **Les vignettes des effets visuels : le fond COURANT, filtre appliqué**
/// (#8792 — « les effets visuels doivent avoir une miniature visible »).
///
/// Rendues HORS du fil principal (un recadrage carré puis huit passes Core
/// Image), une fois par SOURCE : la clé suit l'instance d'image, donc changer
/// le fond d'une même slide rend de nouvelles vignettes au lieu de resservir
/// celles de l'ancien. Le cache est borné — quelques sources récentes, jamais
/// l'historique d'une session.
///
/// La recette est celle du canvas (`StoryFilterProcessor.apply`) : une vignette
/// montre exactement ce que la scène rendra.
public nonisolated enum StoryFilterThumbnails {

    public static let originalKey = "original"
    /// Côté de la vignette, en points — la tuile de la grille.
    public static let side: CGFloat = 64
    private static let renderScale: CGFloat = 3

    private final class Tiles: @unchecked Sendable {
        let images: [String: UIImage]
        init(_ images: [String: UIImage]) { self.images = images }
    }

    nonisolated(unsafe) private static let cache: NSCache<NSString, Tiles> = {
        let cache = NSCache<NSString, Tiles>()
        cache.countLimit = 6
        return cache
    }()

    /// La clé d'une source : le porteur (slide ou objet) ET l'instance d'image.
    public static func sourceKey(slideId: String, image: UIImage) -> String {
        "\(slideId)-\(ObjectIdentifier(image).hashValue)"
    }

    /// L'original et une vignette par `StoryFilter`, indexés par `originalKey`
    /// et `StoryFilter.rawValue`.
    public static func tiles(for image: UIImage, sourceKey: String) async -> [String: UIImage] {
        let key = sourceKey as NSString
        if let hit = cache.object(forKey: key) { return hit.images }
        let rendered = await Task.detached(priority: .userInitiated) {
            render(image, sourceKey: sourceKey)
        }.value
        cache.setObject(Tiles(rendered), forKey: key)
        return rendered
    }

    private static func render(_ image: UIImage, sourceKey: String) -> [String: UIImage] {
        let base = squareCrop(image)
        let filtered = StoryFilter.allCases.map { filter in
            (filter.rawValue, StoryFilterProcessor.apply(filter, to: base, imageId: "thumb-\(sourceKey)"))
        }
        return Dictionary(uniqueKeysWithValues: [(originalKey, base)] + filtered)
    }

    /// Un carré ROGNÉ au centre (aspect fill) — une vignette écrasée mentirait
    /// sur l'image autant qu'un mauvais filtre.
    private static func squareCrop(_ image: UIImage) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = renderScale
        let size = image.size
        let scale = max(side / max(size.width, 1), side / max(size.height, 1))
        let drawn = CGSize(width: size.width * scale, height: size.height * scale)
        let origin = CGPoint(x: (side - drawn.width) / 2, y: (side - drawn.height) / 2)
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { _ in
            image.draw(in: CGRect(origin: origin, size: drawn))
        }
    }
}
