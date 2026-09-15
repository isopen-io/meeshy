import Foundation
import MeeshySDK

/// **Les commentaires dont la pellicule d'un post montre les médias** (#6710) —
/// cache d'abord, réseau ensuite.
///
/// Le plein écran d'un post s'ouvre depuis trois hôtes qui ne tiennent pas les
/// mêmes commentaires : la carte du fil n'en embarque que trois, le détail et la
/// feuille en chargent une page. Plutôt que de demander à chacun de les relayer
/// — ce qui ferait de la pellicule un inventaire à tenir à jour chez trois
/// appelants —, la galerie lit la MÊME source qu'eux : le cache des commentaires
/// (`post-<id>`, `replies-<id>`), que le détail et la feuille écrivent déjà.
///
/// **Aucune écriture ici.** Le détail peut avoir chargé plusieurs pages ; une
/// première page relue du réseau et reposée en cache les écraserait.
enum PostGalleryCommentSource {

    /// La page EN CACHE, réponses en cache comprises, dans l'ordre où l'écran
    /// les affiche. `nil` quand le cache est vide ou expiré.
    ///
    /// `isFresh` : le cache est frais — le réseau n'a rien à ajouter, et on ne
    /// le sollicite pas (même contrat LOCAL-FIRST que `FeedCommentsSheet`).
    static func cached(postId: String) async -> (comments: [FeedComment], isFresh: Bool)? {
        switch await CacheCoordinator.shared.comments.load(for: "post-\(postId)") {
        case .fresh(let topLevel, _):
            return (await withCachedReplies(topLevel), true)
        case .stale(let topLevel, _):
            return (await withCachedReplies(topLevel), false)
        case .expired, .empty:
            return nil
        }
    }

    /// La première page du RÉSEAU, ou `nil` en cas d'échec : la pellicule garde
    /// alors ce qu'elle a, embarqué ou en cache — un média qui manque vaut mieux
    /// qu'une pellicule qui se vide.
    ///
    /// Le mapping est celui de `StoryViewerView.storyComment(from:)`, le seul
    /// site NOMMÉ du dépôt qui transporte les médias d'un commentaire ; en écrire
    /// un de plus ferait un sixième exemplaire à tenir d'accord.
    static func fetched(postId: String, preferredLanguages: [String]) async -> [FeedComment]? {
        guard let response = try? await PostService.shared.getComments(postId: postId, cursor: nil, limit: 20)
        else { return nil }
        return response.data.map { StoryViewerView.storyComment(from: $0, preferredLanguages: preferredLanguages) }
    }

    /// Les réponses ne se chargent pas ici : seules celles que le cache porte
    /// déjà rejoignent le fil, sous leur racine.
    private static func withCachedReplies(_ topLevel: [FeedComment]) async -> [FeedComment] {
        var replies: [String: [FeedComment]] = [:]
        for parent in topLevel where parent.replies > 0 {
            switch await CacheCoordinator.shared.comments.load(for: "replies-\(parent.id)") {
            case .fresh(let fil, _), .stale(let fil, _):
                replies[parent.id] = fil
            case .expired, .empty:
                continue
            }
        }
        return CommentMediaGallery.flatten(topLevel: topLevel, replies: replies)
    }
}
