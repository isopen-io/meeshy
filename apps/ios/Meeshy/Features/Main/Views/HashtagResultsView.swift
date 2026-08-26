import SwiftUI
import MeeshySDK
import MeeshyUI

/// Résultats de recherche par hashtag — posts et reels mélangés par récence.
///
/// Design : docs/superpowers/specs/2026-08-03-post-hashtags-and-rich-content-design.md §4
struct HashtagResultsView: View {
    @StateObject private var viewModel: HashtagResultsViewModel
    /// `@StateObject` sur le singleton, PAS `@EnvironmentObject` — ni `RootView`
    /// ni `iPadRootView` n'injectent `ThemeManager` (même piège que `BookmarksView`).
    @StateObject private var theme = ThemeManager.shared

    init(tag: String) {
        _viewModel = StateObject(wrappedValue: HashtagResultsViewModel(tag: tag))
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.posts) { post in
                    FeedPostCard(post: post)
                        .equatable()
                        .onAppear {
                            if post.id == viewModel.posts.last?.id {
                                Task { await viewModel.loadMore() }
                            }
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
            .padding(.horizontal, 12)
        }
        .navigationTitle("#\(viewModel.tag)")
        .task { await viewModel.load() }
    }
}
