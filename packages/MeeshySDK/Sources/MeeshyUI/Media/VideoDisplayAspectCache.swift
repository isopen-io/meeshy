import Foundation

/// In-memory cache des aspect ratios d'affichage (post-rotation `preferredTransform`)
/// par URL d'attachment vidéo. Évite de re-résoudre l'`AVAsset` à chaque apparition
/// de bulle.
///
/// Vie : session (vidé au cold start). Empreinte : ~24 bytes/entrée, négligeable
/// même pour 10k vidéos vues. Pas de borne — si on observe une fuite mémoire on
/// ajoutera LRU.
///
/// Utilisé par `_InlineRenderer.bubbleAspectRatio` pour servir une valeur juste
/// dès la 2e apparition d'une vidéo donnée dans la session.
public actor VideoDisplayAspectCache {
    public static let shared = VideoDisplayAspectCache()

    private var cache: [String: CGFloat] = [:]

    public init() {}

    public func ratio(for url: String) -> CGFloat? {
        cache[url]
    }

    public func store(_ ratio: CGFloat, for url: String) {
        cache[url] = ratio
    }
}
