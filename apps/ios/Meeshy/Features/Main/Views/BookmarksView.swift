import SwiftUI
import Combine
import MeeshySDK

struct BookmarksView: View {
    @StateObject private var viewModel = BookmarksViewModel()
    @EnvironmentObject private var theme: ThemeManager
    @EnvironmentObject private var router: Router

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
                                    ToastManager.shared.showSuccess(String(localized: "bookmarks.report.success", defaultValue: "Signalement envoye", bundle: .main))
                                }
                            }
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
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "bookmark")
                .font(.system(size: 48))
                .foregroundColor(theme.textMuted)
            Text(String(localized: "bookmarks.empty.title", defaultValue: "Aucun favori", bundle: .main))
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(theme.textSecondary)
            Text(String(localized: "bookmarks.empty.subtitle", defaultValue: "Les posts que vous sauvegardez apparaitront ici", bundle: .main))
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 80)
    }
}
