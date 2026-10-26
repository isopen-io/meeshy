import Foundation
import MeeshySDK

/// Règles PURES de la feuille de commentaires (`CommentsSheetView`) : elles ne
/// lisent que leurs entrées. La feuille garde, sous les mêmes noms, des
/// façades statiques qui y délèguent — appelants et témoins inchangés.
enum CommentSheetRules {

    /// Asks the translation of a comment in the reader's request language —
    /// the one send site for the sheet and the post detail (#13133).
    static func requestTranslation(postId: String, commentId: String) {
        let lang = FeedComment.translationRequestLanguage(
            readerLanguages: ReaderPrism.resolve(for: AuthManager.shared.currentUser))
        Task {
            try? await PostService.shared.requestCommentTranslation(
                postId: postId, commentId: commentId, targetLanguage: lang)
        }
    }

    /// Variante pour les commentaires domaine déjà mappés (`FeedComment`). C'est
    /// celle réellement branchée dans la sheet : elle sème `likedIds` à partir de
    /// `post.comments` (et des réponses chargées) qui portent désormais
    /// `currentUserReactions` (cf. `toFeedPost` / `loadReplies`). Sans ce seeding,
    /// tout commentaire déjà liké s'affichait cœur vide à l'ouverture.
    static func computeLikedIds(from comments: [FeedComment]) -> Set<String> {
        StoryViewerView.computeLikedIds(fromCachedComments: comments)
    }

    /// Layers a freshly-fetched comment page over the current in-memory list
    /// WITHOUT discarding local-only rows the fetch's server snapshot
    /// couldn't have known about — an unconfirmed optimistic `tmp_` send, or
    /// a comment reconciled from the `comment:added` socket echo that landed
    /// while the GET was in flight. A plain `liveComments = fetched`
    /// overwrite would silently drop those. `fetched` (server-ordered,
    /// newest first) is the base; any `current` row whose id isn't present
    /// in `fetched` is kept in front — it's newer than the snapshot, matching
    /// where the composer/socket handler insert it (`at: 0`).
    static func mergeFetchedComments(current: [FeedComment], fetched: [FeedComment]) -> [FeedComment] {
        let fetchedIds = Set(fetched.map(\.id))
        let localOnly = current.filter { !fetchedIds.contains($0.id) }
        return localOnly + fetched
    }

    /// Ne JAMAIS persister une ligne optimiste non confirmée (id `cmid_`/`tmp_`) :
    /// une fois la ligne réconciliée en mémoire par l'écho socket, le fantôme
    /// resterait en cache pour toujours — `mergeFetchedComments` le garde en
    /// tête à chaque relecture puisque le serveur ne le renverra jamais.
    static func persistableComments(_ comments: [FeedComment]) -> [FeedComment] {
        comments.filter { !$0.id.hasPrefix("cmid_") && !$0.id.hasPrefix("tmp_") }
    }

    /// Une réécriture de cache commentaires : la clé et son contenu déjà filtré.
    struct CacheWrite {
        let key: String
        let comments: [FeedComment]
    }

    /// Clés à réécrire après une mutation de commentaire DÉJÀ appliquée en
    /// mémoire. PURE : `CommentsSheetView` est une `View` à `@State`, donc non
    /// instrumentable — la décision « quelles clés porter, et lesquelles TAIRE »
    /// vit ici pour être testable.
    ///
    /// Deux gardes, reprises telles quelles de `submitCommentEdit` :
    /// - `post-<postId>` n'est écrit QUE si l'appelant fournit `liveComments`.
    ///   Un sink peut tirer AVANT que `.task { loadFullCommentsIfNeeded() }`
    ///   n'ait chargé la page complète : persister le repli `post.comments`
    ///   (les 3 commentaires que le feed embarque) écraserait la page de 20
    ///   déjà écrite sous la même clé par `PostDetailViewModel` / `FeedViewModel`.
    /// - `replies-<parentId>` n'est écrit que pour un fil MONTÉ dans
    ///   `repliesMap`. La clé orpheline `replies-<commentId>` d'un top-level
    ///   supprimé n'est jamais écrite : plus rien ne la relira, son parent
    ///   n'existe plus.
    static func cacheWrites(
        postId: String,
        liveComments: [FeedComment]?,
        repliesMap: [String: [FeedComment]],
        touchedThreadIds: [String]
    ) -> [CacheWrite] {
        let threads = touchedThreadIds.compactMap { parentId -> CacheWrite? in
            guard let replies = repliesMap[parentId] else { return nil }
            return CacheWrite(key: "replies-\(parentId)", comments: persistableComments(replies))
        }
        guard let current = liveComments else { return threads }
        return threads + [CacheWrite(key: "post-\(postId)", comments: persistableComments(current))]
    }

    /// Retire la ligne optimiste `tempId` (et décrémente le compteur de réponses
    /// de son parent / le total de la feuille) — partagé par le refus
    /// synchrone de la file et l'observateur `.exhausted`, qui restaurent le
    /// même instantané d'avant l'envoi.
    static func rollbackOptimistic(
        tempId: String,
        parentId: String?,
        embeddedComments: [FeedComment],
        liveComments: inout [FeedComment]?,
        repliesMap: inout [String: [FeedComment]],
        liveCommentCount: inout Int?
    ) {
        let current = liveComments ?? embeddedComments
        let withdrawal = FeedCommentThread(roots: current, replies: repliesMap)
            .withdrawingOptimistic(tempId, parentId: parentId)
        repliesMap = withdrawal.thread.replies
        if parentId == nil || current.contains(where: { $0.id == parentId && $0.replies > 0 }) {
            liveComments = withdrawal.thread.roots
        }
        liveCommentCount = max((liveCommentCount ?? embeddedComments.count) - 1, 0)
    }
}
