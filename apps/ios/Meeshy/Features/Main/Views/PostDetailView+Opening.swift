import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'ouverture et la fermeture du détail d'un post.** Extrait du `body` de
/// `PostDetailView.swift` (#10956), mot pour mot.
extension PostDetailView {

    /// Le post affiché est encore dans la file d'envoi (#14879, #14929) : son
    /// id est un cmid que le serveur ne connaît pas. Aucun engagement ne part —
    /// ni cœur, ni réaction, ni republication, ni favori — et la barre qui les
    /// offre est absente ; l'horloge à la place de l'heure dit pourquoi.
    var isPendingPublication: Bool { PendingPublicationMarker.isPending(postId: postId) }

    /// Première apparition : chargement, état d'engagement semé depuis le
    /// post servi, salle du post, ouverture comptée, brouillon repris.
    func openDetail() async {
        // Wire persistence layer on first appearance
        if viewModel.feedPersistence == nil {
            viewModel.setupPersistence(persistence: DependencyContainer.shared.feedPersistence)
        }

        if viewModel.post == nil {
            await viewModel.loadPost(postId)
        }
        // Seed liked state from initial/cached post (post.isLiked is derived from
        // APIPost.currentUserReactions / isLikedByMe by the SDK).
        if let post = displayPost, post.isLiked {
            postLikedIds.insert(postId)
        }
        // Seed bookmark + repost state. Primary source: the server-
        // enriched fields on the loaded post (PostFeedService provides
        // isBookmarkedByMe + isRepostedByMe on the feed and detail
        // payloads). Defensive fallback: the local "bookmarks" cache.
        if !isBookmarkInFlight {
            if let p = displayPost, p.isBookmarkedByMe {
                isPostBookmarked = true
            } else {
                let cached = await CacheCoordinator.shared.feed.load(for: "bookmarks")
                let bookmarks: [FeedPost]
                switch cached {
                case .fresh(let v, _), .stale(let v, _): bookmarks = v
                case .expired, .empty: bookmarks = []
                }
                if bookmarks.contains(where: { $0.id == postId }) {
                    isPostBookmarked = true
                }
            }
        }
        if !isRepostInFlight, let p = displayPost, p.isRepostedByMe {
            isPostReposted = true
        }
        guard !PendingPublicationMarker.isPending(postId: postId) else { return }
        await viewModel.loadComments(postId)
        viewModel.subscribeToSocket(postId)
        // Join the post room for real-time reaction events (single focused post).
        SocialSocketManager.shared.joinPostRoom(postId: postId)
        // Anti-spam banner: declare this post as "currently visible" so
        // NotificationToastManager can drop in-app banners about it (the user
        // already sees the content live). `onPostOpened` fait DAVANTAGE que
        // l'ancienne affectation nue de `activePostId` : il marque aussi les
        // notifications de ce post comme lues (cache local + serveur), le
        // contenu étant consommé.
        NotificationToastManager.shared.onPostOpened(postId)
        // Une ouverture du détail = une impression ET une vue (#10483),
        // une seule fois par instance : le `.task` se relance au retour
        // d'un écran poussé sans que ce soit une nouvelle ouverture.
        await viewModel.registerDetailOpen(postId)
        // Reprend le brouillon de commentaire laissé sur ce post (cache-first).
        if composerText.isEmpty, let draft = CommentDraftStore.shared.load(postId: postId) {
            composerText = draft
        }
    }

    func closeDetail() {
        SocialSocketManager.shared.leavePostRoom(postId: postId)
        NotificationToastManager.shared.onPostClosed(postId)
    }
}
