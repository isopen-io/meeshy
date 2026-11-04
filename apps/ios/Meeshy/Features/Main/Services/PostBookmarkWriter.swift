import Foundation
import MeeshySDK

/// Ce que l'onglet FAVORIS doit refléter d'un « Enregistrer », AVANT que le
/// réseau ne réponde : `BookmarksViewModel` sert son cache tel quel tant qu'il
/// est frais, si bien qu'un favori posé ailleurs n'y apparaîtrait qu'à
/// l'expiration.
///
/// Les deux gestes sont CIBLÉS : un retour arrière retire ou remet CE post, il
/// ne restaure jamais une photo du cache prise avant l'envoi — hors ligne,
/// l'envoi peut attendre des heures, et d'autres favoris s'y seront posés.
@MainActor
protocol FavoritesCacheMirroring {
    func insert(_ post: FeedPost) async
    func remove(postId: String) async
}

/// Le cache « bookmarks » partagé avec l'onglet Favoris.
struct FeedFavoritesCache: FavoritesCacheMirroring {
    func insert(_ post: FeedPost) async {
        _ = await FeedPostEngagementRequests.prepopulateBookmarkCache(
            postId: post.id, postSnapshot: post, wasBookmarked: false
        )
    }

    func remove(postId: String) async {
        await FeedPostEngagementRequests.pruneBookmarkFromCache(postId: postId)
    }
}

/// **« Enregistrer » a UN écrivain** (#15994) — le fil, le détail, le profil,
/// les réels et les résultats d'un hashtag.
///
/// Chaque surface garde ce qu'elle seule possède : son état optimiste et son
/// retour arrière, qu'elle remet à `onRejected`. Ce type porte le reste, qui
/// ne diffère pas d'une surface à l'autre : l'envoi, le reflet dans le cache
/// des favoris, et le retour à l'utilisateur.
///
/// **L'envoi passe par la file durable, comme le like** (#15997). Hors ligne,
/// « Enregistrer » échouait, défaisait la bascule et affichait une erreur. La
/// ligne `.toggleBookmarkPost` porte l'état VOULU sous un
/// `X-Client-Mutation-Id`, ancrée sur la carte (la dernière intention gagne),
/// et part dès que le réseau revient. Le geste ne se défait que si la file
/// refuse la ligne, ou si le serveur la refuse pour de bon (`.exhausted`) —
/// jamais parce que le réseau manque.
@MainActor
struct PostBookmarkWriter {
    private let queue: OfflineQueueing
    private let favorites: FavoritesCacheMirroring
    private let toasts: FeedbackToastSurfacing

    init(
        queue: OfflineQueueing = OfflineQueue.shared,
        favorites: FavoritesCacheMirroring = FeedFavoritesCache(),
        toasts: FeedbackToastSurfacing = FeedbackToastManager.shared
    ) {
        self.queue = queue
        self.favorites = favorites
        self.toasts = toasts
    }

    /// Enregistre (`bookmarked`) ou retire le favori `postId`.
    /// - Parameters:
    ///   - post: la carte à ranger dans les favoris, qui y paraît enregistrée ;
    ///     sans elle, aucun post n'est ajouté au cache des favoris.
    ///   - onRejected: le retour arrière de la surface, appelé au plus une
    ///     fois — tout de suite si la file refuse la ligne, plus tard si le
    ///     serveur la refuse.
    func write(bookmarked: Bool, postId: String, post: FeedPost?, onRejected: @escaping @MainActor () -> Void) async {
        await mirror(bookmarked: bookmarked, postId: postId, post: post)
        let cmid = ClientMutationId.generate()
        do {
            try await queue.enqueue(
                .toggleBookmarkPost,
                payload: ToggleBookmarkPostPayload(clientMutationId: cmid, postId: postId, bookmarked: bookmarked),
                conversationId: postId
            )
        } catch {
            await undo(bookmarked: bookmarked, postId: postId, post: post, message: Self.failure, onRejected: onRejected)
            return
        }
        toasts.showSuccess(bookmarked
            ? String(localized: "post.bookmark.added", defaultValue: "Ajouté aux favoris", bundle: .main)
            : String(localized: "post.bookmark.removed", defaultValue: "Retiré des favoris", bundle: .main))
        observeRefusal(cmid: cmid, bookmarked: bookmarked, postId: postId, post: post, onRejected: onRejected)
    }

    private static var failure: String {
        String(localized: "post.bookmark.error", defaultValue: "Erreur lors de l'enregistrement", bundle: .main)
    }

    private func mirror(bookmarked: Bool, postId: String, post: FeedPost?) async {
        if bookmarked {
            if let post { await favorites.insert(PostBookmarkMutation.setting(post, bookmarked: true)) }
        } else {
            await favorites.remove(postId: postId)
        }
    }

    private func undo(bookmarked: Bool, postId: String, post: FeedPost?, message: String, onRejected: @MainActor () -> Void) async {
        await mirror(bookmarked: !bookmarked, postId: postId, post: post)
        toasts.showError(message)
        onRejected()
    }

    /// Le flux d'issue d'une ligne en file peut ne jamais émettre (hors ligne,
    /// ligne remplacée par une intention plus récente) : la tâche ne retient
    /// que des valeurs, jamais une surface.
    private func observeRefusal(cmid: String, bookmarked: Bool, postId: String, post: FeedPost?, onRejected: @escaping @MainActor () -> Void) {
        let queue = queue
        let writer = self
        Task { @MainActor in
            let outcomes = await queue.outcomeStream(for: cmid)
            for await outcome in outcomes {
                guard case .exhausted = outcome else { continue }
                let message = DailyGestureLimitNotice.exhaustedText(clientMutationId: cmid) ?? Self.failure
                await writer.undo(bookmarked: bookmarked, postId: postId, post: post, message: message, onRejected: onRejected)
            }
        }
    }
}
