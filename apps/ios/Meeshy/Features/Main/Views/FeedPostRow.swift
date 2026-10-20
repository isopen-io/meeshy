import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les actions qu'une carte du fil délègue à son hôte : l'hôte possède l'état
/// optimiste et les présentations, la carte ne fait que les déclencher.
struct FeedPostRowActions {
    let onHeart: (FeedPost) -> Void
    let onRepost: (String) -> Void
    let onBookmark: (String) -> Void
    let onShare: (String) -> Void
    let onQuote: (String) -> Void
    let onEdit: (FeedPost) -> Void
    let onOpenReelComments: (FeedPost) -> Void
    let onAuthorMoodTap: (String, CGPoint) -> Void
    let moodLookup: (String) -> (emoji: String?, tapHandler: ((CGPoint) -> Void)?)
    let onViewAuthorStory: (String) -> Void
}

nonisolated struct FeedPostRowRenderInputs: Equatable {
    let postId: String
    let likes: Int
    let isLiked: Bool
    let content: String
    let mentions: [PostReference]?
    let translatedContent: String?
    let translatableSignature: FeedPostCard.TranslatableSignature
    let repostCount: Int
    let bookmarkCount: Int
    let shareCount: Int
    let commentCount: Int
    let authorRing: ServedProfileDecorItem?
    let trackedLinkMap: [String: String]
    let engagement: FeedPostEngagementSnapshot
    let authorStoryRing: StoryRingState
    let authorMoodEmoji: String?

    init(
        post: FeedPost,
        engagement: FeedPostEngagementSnapshot,
        authorStoryRing: StoryRingState,
        authorMoodEmoji: String?
    ) {
        postId = post.id
        likes = post.likes
        isLiked = post.isLiked
        content = post.content
        mentions = post.mentions
        translatedContent = post.translatedContent
        translatableSignature = FeedPostCard.translatableSignature(of: post)
        repostCount = post.repostCount
        bookmarkCount = post.bookmarkCount
        shareCount = post.shareCount
        commentCount = post.commentCount
        authorRing = post.authorRing
        trackedLinkMap = post.trackedLinkMap
        self.engagement = engagement
        self.authorStoryRing = authorStoryRing
        self.authorMoodEmoji = authorMoodEmoji
    }
}

/// Une ligne du fil : la carte Réel plein-cadre ou la carte standard.
struct FeedPostRow: View {
    let post: FeedPost
    let viewModel: FeedViewModel
    let reelAutoplay: ReelFeedAutoplayCoordinator
    let engagement: FeedPostEngagementSnapshot
    let authorStoryRing: StoryRingState
    let authorMoodEmoji: String?
    let actions: FeedPostRowActions

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @Environment(\.horizontalSizeClass) private var sizeClass
    @EnvironmentObject private var router: Router

    var body: some View {
        // On iPad/Mac (regular width) the feed lives in a narrow column where a
        // full-bleed reel card looks crude, so reels render as the standard
        // compact card there (author header + bounded media + action bar) for
        // parity with the iPhone feed. iPhone keeps the immersive full-frame card.
        if post.isReel && sizeClass != .regular {
            reelFeedCardView
        } else {
            standardFeedPostCardView
        }
    }

    /// Carte Réel plein-cadre. Réutilise EXACTEMENT les handlers optimistes de
    /// `standardFeedPostCardView` (toggle cœur/repartage/signet/partage) + le
    /// même bloc d'ouverture viewer (`ReelsPresenter.present`). Le tap média
    /// fait d'abord le handoff (clear + pause du moteur feed) avant de présenter.
    private var reelFeedCardView: some View {
        // `ReelFeedCardContainer` observe le coordinator et calcule `isActive` en
        // interne : le body de FeedView ne dépend donc pas d'`activeReelId` (I1).
        let isOwnPost = post.authorId == AuthManager.shared.currentUser?.id
        return ReelFeedCardContainer(
            coordinator: reelAutoplay,
            post: post,
            isDark: isDark,
            isLiked: engagement.isLiked,
            displayLikeCount: engagement.displayLikeCount,
            isBookmarked: engagement.isBookmarked,
            displayBookmarkCount: engagement.displayBookmarkCount,
            isReposted: engagement.isReposted,
            displayRepostCount: engagement.displayRepostCount,
            displayShareCount: engagement.displayShareCount,
            onTapMedia: {
                // Handoff : le viewer prend la session via son propre usage de
                // SharedAVPlayerManager ; on stoppe d'abord la lecture muette du
                // feed pour éviter un conflit de moteur.
                reelAutoplay.clear()
                SharedAVPlayerManager.shared.pause()
                HapticFeedback.medium()
                withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                    ReelsPresenter.shared.present(posts: viewModel.posts, startId: post.id, from: .feed)
                }
            },
            onTapGlyph: {
                // Le logo Réel ouvre la page détail du poste (thread complet),
                // distinct du tap média qui présente le viewer immersif.
                router.openPostDetail(post, from: .feed)
            },
            onLike: { _ in actions.onHeart(post) },
            onComment: { _ in
                // Le bouton commentaire d'un réel ouvre la feuille de commentaires
                // DIRECTEMENT (parité avec les cartes post du feed) — l'utilisateur
                // commente sans basculer dans le viewer plein écran. La lecture
                // muette du feed continue derrière la feuille (translucide).
                HapticFeedback.medium()
                actions.onOpenReelComments(post)
            },
            onRepost: { postId in actions.onRepost(postId) },
            onBookmark: { postId in actions.onBookmark(postId) },
            onShare: { postId in actions.onShare(postId) },
            onTapAuthor: { authorId in
                NotificationCenter.default.post(
                    name: Notification.Name("openProfileSheet"),
                    object: ["userId": authorId, "username": post.authorUsername ?? post.author]
                )
            },
            onEdit: isOwnPost ? { post in
                actions.onEdit(post)
            } : nil,
            onDelete: isOwnPost ? { postId in
                Task { await viewModel.deletePost(postId) }
            } : nil,
            onReport: !isOwnPost ? { postId in
                Task { await viewModel.reportPost(postId) }
            } : nil,
            onPin: isOwnPost ? { postId in
                Task { await viewModel.pinPost(postId) }
            } : nil
        )
        // Marge latérale volontairement plus serrée que les posts standards
        // (`FeedPostCard` = 16) → la carte Réel est un peu plus large, tout en
        // gardant une séparation nette des bords et des boutons flottants.
        .padding(.horizontal, MeeshySpacing.md)
        // Pas de `.equatable()` ici : le conteneur observe le coordinator (non
        // Equatable). Le court-circuit Equatable vit à l'intérieur, sur `ReelFeedCard`.
    }

    private var standardFeedPostCardView: some View {
        let isOwnPost = post.authorId == AuthManager.shared.currentUser?.id
        return FeedPostCard(
            post: post,
            onSeeNearby: { place in
                HapticFeedback.light()
                router.push(.nearbyDiscovery(initialCoordinate: RouteCoordinate(
                    latitude: place.latitude, longitude: place.longitude
                )))
            },
            isLiked: engagement.isLiked,
            displayLikeCount: engagement.displayLikeCount,
            isHeartInFlight: engagement.isHeartInFlight,
            isBookmarked: engagement.isBookmarked,
            isBookmarkInFlight: engagement.isBookmarkInFlight,
            displayRepostCount: engagement.displayRepostCount,
            displayBookmarkCount: engagement.displayBookmarkCount,
            displayShareCount: engagement.displayShareCount,
            isReposted: engagement.isReposted,
            isRepostInFlight: engagement.isRepostInFlight,
            isShareInFlight: engagement.isShareInFlight,
            onLike: { _ in
                actions.onHeart(post)
            },
            onRepost: { postId in
                actions.onRepost(postId)
            },
            onQuote: { postId in
                actions.onQuote(postId)
            },
            onShare: { postId in
                actions.onShare(postId)
            },
            onBookmark: { postId in
                actions.onBookmark(postId)
            },
            onSelectLanguage: { postId, language in
                viewModel.setTranslationOverride(postId: postId, language: language)
            },
            onTapPost: { post in
                if post.isReel {
                    // Reels open straight into the immersive full-screen pager,
                    // seeded with the feed's reels, never the detail page.
                    HapticFeedback.medium()
                    withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                        ReelsPresenter.shared.present(
                            posts: viewModel.posts,
                            startId: post.id, from: .feed
                        )
                    }
                } else {
                    router.openPostDetail(post, from: .feed)
                }
            },
            onTapRepost: { repostId in
                router.openPostDetail(id: repostId, from: .feed)
            },
            onDelete: isOwnPost ? { postId in
                Task { await viewModel.deletePost(postId) }
            } : nil,
            onReport: !isOwnPost ? { postId in
                Task { await viewModel.reportPost(postId) }
            } : nil,
            onPin: isOwnPost ? { postId in
                Task { await viewModel.pinPost(postId) }
            } : nil,
            onEdit: isOwnPost ? { post in
                actions.onEdit(post)
            } : nil,
            authorMoodEmoji: authorMoodEmoji,
            onAuthorMoodTap: authorMoodEmoji == nil ? nil : { actions.onAuthorMoodTap(post.authorId, $0) },
            moodLookup: actions.moodLookup,
            authorStoryRing: authorStoryRing,
            onViewAuthorStory: { actions.onViewAuthorStory(post.authorId) },
            // RF2: a POST that reposts a REEL renders inside FeedPostCard (not the
            // immersive reel card) — hand it the shared autoplay coordinator so the
            // embedded reel plays muted/inline, elected against the native reels.
            reelAutoplay: reelAutoplay
        )
        .equatable()
    }
}

extension FeedPostRow: Equatable {
    nonisolated static func == (lhs: FeedPostRow, rhs: FeedPostRow) -> Bool {
        FeedPostRowRenderInputs(
            post: lhs.post,
            engagement: lhs.engagement,
            authorStoryRing: lhs.authorStoryRing,
            authorMoodEmoji: lhs.authorMoodEmoji
        ) == FeedPostRowRenderInputs(
            post: rhs.post,
            engagement: rhs.engagement,
            authorStoryRing: rhs.authorStoryRing,
            authorMoodEmoji: rhs.authorMoodEmoji
        )
    }
}
