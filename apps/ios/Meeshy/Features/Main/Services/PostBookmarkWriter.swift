import Foundation
import MeeshySDK

/// Ce que l'onglet FAVORIS doit refléter d'un « Enregistrer », AVANT que le
/// réseau ne réponde : `BookmarksViewModel` sert son cache tel quel tant qu'il
/// est frais, si bien qu'un favori posé ailleurs n'y apparaîtrait qu'à
/// l'expiration.
@MainActor
protocol FavoritesCacheMirroring {
    /// Place `post` en tête des favoris en cache et rend le contenu précédent,
    /// à restaurer si l'envoi échoue.
    func insert(_ post: FeedPost) async -> [FeedPost]
    func remove(postId: String) async
    func restore(_ previous: [FeedPost]) async
}

/// Le cache « bookmarks » partagé avec l'onglet Favoris.
struct FeedFavoritesCache: FavoritesCacheMirroring {
    func insert(_ post: FeedPost) async -> [FeedPost] {
        await FeedPostEngagementRequests.prepopulateBookmarkCache(
            postId: post.id, postSnapshot: post, wasBookmarked: false
        ) ?? []
    }

    func remove(postId: String) async {
        await FeedPostEngagementRequests.pruneBookmarkFromCache(postId: postId)
    }

    func restore(_ previous: [FeedPost]) async {
        await FeedPostEngagementRequests.restoreBookmarkCache(previous)
    }
}

/// **« Enregistrer » a UN écrivain** (#15994) — le fil, le détail, le profil,
/// les réels et les résultats d'un hashtag.
///
/// Chaque surface garde ce qu'elle seule possède : son état optimiste et son
/// retour arrière. Ce type porte le reste, qui ne diffère pas d'une surface à
/// l'autre : l'envoi par `PostServiceProviding`, le reflet dans le cache des
/// favoris, et le retour à l'utilisateur. Avant lui, cinq surfaces écrivaient
/// chacune leur favori, avec trois décodages de la même réponse — dont deux
/// la lisaient comme une erreur — et un seul toast commun.
@MainActor
struct PostBookmarkWriter {
    private let service: PostServiceProviding
    private let favorites: FavoritesCacheMirroring
    private let toasts: FeedbackToastSurfacing

    init(
        service: PostServiceProviding = PostService.shared,
        favorites: FavoritesCacheMirroring = FeedFavoritesCache(),
        toasts: FeedbackToastSurfacing = FeedbackToastManager.shared
    ) {
        self.service = service
        self.favorites = favorites
        self.toasts = toasts
    }

    /// Enregistre (`bookmarked`) ou retire le favori `postId`.
    /// - Parameter post: la carte telle qu'elle doit paraître dans les favoris ;
    ///   sans elle, le cache des favoris n'est pas touché.
    /// - Returns: `false` quand l'envoi a échoué — l'appelant défait sa bascule.
    func write(bookmarked: Bool, postId: String, post: FeedPost?) async -> Bool {
        let previous: [FeedPost]? = if bookmarked, let post { await favorites.insert(post) } else { nil }
        do {
            if bookmarked {
                try await service.bookmark(postId: postId)
            } else {
                try await service.removeBookmark(postId: postId)
            }
        } catch {
            if let previous { await favorites.restore(previous) }
            toasts.showError(String(localized: "post.bookmark.error", defaultValue: "Erreur lors de l'enregistrement", bundle: .main))
            return false
        }
        if !bookmarked { await favorites.remove(postId: postId) }
        toasts.showSuccess(bookmarked
            ? String(localized: "post.bookmark.added", defaultValue: "Ajouté aux favoris", bundle: .main)
            : String(localized: "post.bookmark.removed", defaultValue: "Retiré des favoris", bundle: .main))
        return true
    }
}
