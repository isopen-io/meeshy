import Foundation

// MARK: - Feed Media Type
/// `location` a été retiré (2026-07-30) : ni le gateway (PostMedia est
/// fichier-only), ni l'app (fabrique sans appelant) n'ont jamais produit un
/// média de ce type — la position d'un post voyage par `FeedPost.location`
/// (`SharedPlace`), pas par un média.
public enum FeedMediaType: String, Sendable, Codable {
    case image, video, audio, document
}
