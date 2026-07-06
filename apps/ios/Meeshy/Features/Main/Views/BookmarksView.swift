import SwiftUI
import Combine
import MeeshySDK

struct BookmarksView: View {
    @StateObject private var viewModel = BookmarksViewModel()
    @EnvironmentObject private var theme: ThemeManager
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel
    /// Avatar d'auteur tappé → story de cet auteur (singleGroup, 1re non-vue).
    @State private var storyAuthorUserId: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            LazyVStack(spacing: 12) {
                if viewModel.posts.isEmpty && !viewModel.isLoading {
                    emptyState
                } else {
                    ForEach(viewModel.posts) { post in
                        FeedPostCard(
                            post: post,
                            onBookmark: { postId in
                                Task { await viewModel.removeBookmark(postId) }
                            },
                            onTapPost: { post in
                                router.push(.postDetail(post.id, post))
                            },
                            onReport: { postId in
                                Task {
                                    try? await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
                                    FeedbackToastManager.shared.showSuccess(String(localized: "bookmarks.report.success", defaultValue: "Signalement envoye", bundle: .main))
                                }
                            },
                            authorStoryRing: storyViewModel.storyRingState(forUserId: post.authorId),
                            onViewAuthorStory: { storyAuthorUserId = post.authorId }
                        )
                        .equatable()
                    }

                    if viewModel.isLoading {
                        ProgressView()
                            .padding()
                    }

                    if viewModel.hasMore && !viewModel.isLoading {
                        Color.clear
                            .frame(height: 1)
                            .onAppear {
                                Task { await viewModel.loadBookmarks() }
                            }
                    }
                }
            }
            .padding(.top, 8)
            .padding(.bottom, 20)
        }
        .background(theme.backgroundGradient.ignoresSafeArea())
        .navigationTitle(String(localized: "bookmarks.title", defaultValue: "Favoris", bundle: .main))
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await viewModel.refresh() }
        .task { await viewModel.loadBookmarks() }
        .fullScreenCover(isPresented: Binding(
            get: { storyAuthorUserId != nil },
            set: { if !$0 { storyAuthorUserId = nil } }
        )) {
            StoryViewerContainer(
                viewModel: storyViewModel,
                userId: storyAuthorUserId,
                isPresented: Binding(
                    get: { storyAuthorUserId != nil },
                    set: { if !$0 { storyAuthorUserId = nil } }
                ),
                singleGroup: true,
                startAtFirstUnviewed: true,
                presentationSource: "BookmarksView.authorAvatar"
            )
            // fullScreenCover n'hérite pas des EnvironmentObjects — trio
            // requis par StoryViewerView (SharePickerView interne).
            .environmentObject(router)
            .environmentObject(statusViewModel)
            .environmentObject(conversationListViewModel)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "bookmark")
                .font(MeeshyFont.relative(48))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
            Text(String(localized: "bookmarks.empty.title", defaultValue: "Aucun favori", bundle: .main))
                .font(.body.weight(.semibold))
                .foregroundColor(theme.textSecondary)
            Text(String(localized: "bookmarks.empty.subtitle", defaultValue: "Les posts que vous sauvegardez apparaitront ici", bundle: .main))
                .font(.subheadline)
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 80)
    }
}
