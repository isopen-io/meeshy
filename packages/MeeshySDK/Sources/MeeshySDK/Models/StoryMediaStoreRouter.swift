import Foundation

// MARK: - Story media store routing (R7)

/// Rule engine PUR : type effectif d'un média pour le routage vers les stores
/// disque (`images` / `video` / `audio`). L'extension d'URL, quand elle est
/// reconnue, est la vérité du CONTENU et corrige un `FeedMedia.type` absent
/// ou contradictoire — bug confirmé « mp4 déclaré image → rangé dans le store
/// images (300 Mo) → cache-miss au replay vidéo ». URL sans extension
/// exploitable (CDN signé) → type déclaré, sinon défaut historique `.image`.
public enum StoryMediaStoreRouter {
    private static let videoExtensions: Set<String> = ["mp4", "mov", "m4v", "webm", "avi"]
    private static let audioExtensions: Set<String> = ["m4a", "mp3", "aac", "wav", "ogg", "opus", "caf"]
    private static let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"]

    public static func effectiveKind(declaredType: FeedMediaType?, urlString: String) -> FeedMediaType {
        let ext = URL(string: urlString)?.pathExtension.lowercased() ?? ""
        if videoExtensions.contains(ext) { return .video }
        if audioExtensions.contains(ext) { return .audio }
        if imageExtensions.contains(ext) { return .image }
        return declaredType ?? .image
    }
}
