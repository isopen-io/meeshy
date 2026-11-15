import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'onglet « Publications » du détail d'une communauté** (#16878).
///
/// Il se pose DANS le défilement du détail (`CommunityDetailScreen`) : pas de
/// `ScrollView` propre, une `LazyVStack` dont la dernière carte demande la
/// page suivante. La carte est celle du fil, avec ses gestes ; un post s'ouvre
/// sur son détail, un réel dans le lecteur immersif. Chaque état a son dessin :
/// chargement (cache vide seulement), vide, échec, hors-ligne.
struct CommunityPostsTab: View {
    @StateObject private var viewModel: CommunityPostsViewModel
    var onCreatePost: (() -> Void)?

    @Environment(\.routerCommands) private var router
    /// Publication citée depuis son bouton Repost (#15911).
    @State private var quotedPost: FeedPost?
    @Environment(\.meeshyQuoteComposerHost) private var quoteHost
    /// Lien présenté par « Partager » du menu ⋯ (#15994).
    @State private var shareableLink: ShareableLink?

    init(communityId: String, onCreatePost: (() -> Void)? = nil) {
        _viewModel = StateObject(wrappedValue: CommunityPostsViewModel(
            communityId: communityId,
            service: PostService.shared,
            cacheProvider: { await CacheCoordinator.shared.feed },
            onError: { FeedbackToastManager.shared.showError($0) }
        ))
        self.onCreatePost = onCreatePost
    }

    var body: some View {
        content
            .padding(.top, MeeshySpacing.sm)
            .task { await viewModel.load() }
            .onDisappear { Task { await viewModel.flushImpressions() } }
            .modifier(QuoteComposerCover(quoted: $quotedPost, host: quoteHost))
            .sheet(item: $shareableLink) { link in
                ShareSheet(activityItems: link.activityItems)
                    .presentationDetents([.medium, .large])
            }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.posts.isEmpty {
            emptyContent
        } else {
            postList
        }
    }

    @ViewBuilder
    private var emptyContent: some View {
        switch viewModel.phase {
        case .idle, .loading:
            ProgressView()
                .tint(MeeshyColors.brandPrimary)
                .frame(maxWidth: .infinity, minHeight: 160)
                .accessibilityLabel(String(localized: "community.posts.loading", defaultValue: "Chargement des publications", bundle: .main))
        case .loaded:
            EmptyStateView(
                icon: "photo.on.rectangle.angled",
                title: String(localized: "community.posts.empty.title", defaultValue: "Aucune publication", bundle: .main),
                actionLabel: onCreatePost == nil
                    ? nil
                    : String(localized: "community.posts.empty.action", defaultValue: "Créer une publication", bundle: .main),
                onAction: onCreatePost
            )
            .frame(minHeight: 200)
        case .failed:
            EmptyStateView(
                icon: "exclamationmark.triangle",
                title: String(localized: "community.posts.failed.title", defaultValue: "Publications indisponibles", bundle: .main),
                actionLabel: String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main),
                onAction: { Task { await viewModel.refresh() } }
            )
            .frame(minHeight: 200)
        case .offline:
            EmptyStateView(
                icon: "wifi.slash",
                title: String(localized: "community.posts.offline.title", defaultValue: "Hors ligne", bundle: .main),
                actionLabel: String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main),
                onAction: { Task { await viewModel.refresh() } }
            )
            .frame(minHeight: 200)
        }
    }

    private var postList: some View {
        LazyVStack(spacing: MeeshySpacing.md) {
            ForEach(viewModel.posts) { post in
                FeedPostCard(
                    post: post,
                    isBookmarked: post.isBookmarkedByMe,
                    isBookmarkInFlight: viewModel.isBookmarkInFlight(post.id),
                    displayRepostCount: post.repostCount,
                    isReposted: post.isRepostedByMe,
                    onLike: { id in Task { await viewModel.toggleLike(id) } },
                    onRepost: { id in Task { await viewModel.toggleRepost(id) } },
                    onQuote: quoteHost == nil ? nil : { _ in quotedPost = post },
                    onShare: { id in Task { shareableLink = await viewModel.shareLink(for: id) } },
                    onBookmark: { id in Task { await viewModel.toggleBookmark(id) } },
                    onTapPost: { tapped in open(tapped) }
                )
                .equatable()
                .onAppear {
                    if post.id == viewModel.posts.last?.id {
                        Task { await viewModel.loadMore() }
                    }
                }
                .countsListedImpression(of: post.id, isVideo: post.isReel, in: viewModel.impressions) {
                    viewModel.position(of: post.id)
                }
            }

            if viewModel.isLoadingMore {
                ProgressView()
                    .padding()
            }
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.bottom, MeeshySpacing.xl)
    }

    /// Un réel s'ouvre dans le lecteur immersif, amorcé avec les SEULS réels de
    /// la communauté ; un post, sur son détail.
    private func open(_ post: FeedPost) {
        HapticFeedback.medium()
        if post.isReel {
            ReelsPresenter.shared.present(
                posts: FeedPost.reels(from: viewModel.posts),
                startId: post.id,
                from: .community
            )
        } else {
            router.openPostDetail(post, from: .community)
        }
    }
}
