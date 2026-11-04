import SwiftUI
import MeeshySDK
import MeeshyUI

/// Résultats de recherche par hashtag — posts et reels mélangés par récence.
///
/// Design : docs/superpowers/specs/2026-08-03-post-hashtags-and-rich-content-design.md §4
struct HashtagResultsView: View {
    @StateObject private var viewModel: HashtagResultsViewModel
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemePalette { ThemePalette(colorScheme: colorScheme) }
    /// Publication citée depuis son bouton Repost (#15911).
    @State private var quotedPost: FeedPost?
    @Environment(\.meeshyQuoteComposerHost) private var quoteHost
    /// Lien présenté par « Partager » du menu ⋯ (#15994).
    @State private var shareableLink: ShareableLink?

    init(tag: String) {
        _viewModel = StateObject(wrappedValue: HashtagResultsViewModel(tag: tag))
    }

    var body: some View {
        ScrollView {
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
                        onBookmark: { id in Task { await viewModel.toggleBookmark(id) } }
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
                if viewModel.isLoading {
                    ProgressView()
                        .padding()
                }
                if viewModel.posts.isEmpty && !viewModel.isLoading {
                    Text(String(localized: "hashtag.results.empty", defaultValue: "Aucun post avec #\(viewModel.tag)", bundle: .main))
                        .foregroundColor(theme.textSecondary)
                        .padding(.top, 60)
                }
            }
            .padding(.horizontal, MeeshySpacing.md)
        }
        .navigationTitle("#\(viewModel.tag)")
        .task { await viewModel.load() }
        .onAppear { SocialEventsV2Reporter.shared.emit(DiscoveryTelemetry.visit(.hashtagVisit, target: .hashtag(viewModel.tag), surface: SocialSurface(.hashtag))) }
        .tracksOutboundLinks(surface: SocialSurface(.hashtag))
        .onDisappear { Task { await viewModel.flushImpressions() } }
        .modifier(QuoteComposerCover(quoted: $quotedPost, host: quoteHost))
        .sheet(item: $shareableLink) { link in
            ShareSheet(activityItems: link.activityItems)
                .presentationDetents([.medium, .large])
        }
    }
}
