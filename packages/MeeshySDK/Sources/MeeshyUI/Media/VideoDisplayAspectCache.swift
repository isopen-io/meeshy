import Foundation
import MeeshySDK

/// In-memory cache des aspect ratios d'affichage (post-rotation `preferredTransform`)
/// par URL d'attachment vidéo. Évite de re-résoudre l'`AVAsset` à chaque apparition
/// de bulle.
///
/// Vie : session (vidé au cold start). Borné à `capacity` entrées, les plus anciennes partent d'abord : une
/// session longue (iPad laissé ouvert, fil de réels) ne garde plus chaque vidéo jamais vue.
///
/// Utilisé par `_InlineRenderer.bubbleAspectRatio` pour servir une valeur juste
/// dès la 2e apparition d'une vidéo donnée dans la session.
public actor VideoDisplayAspectCache {
    public static let shared = VideoDisplayAspectCache()

    static let capacity = 2_000
    private var cache = BoundedFIFOMap<String, CGFloat>(capacity: VideoDisplayAspectCache.capacity)

    public init() {}

    public func ratio(for url: String) -> CGFloat? {
        cache[url]
    }

    public func store(_ ratio: CGFloat, for url: String) {
        cache[url] = ratio
    }
}
