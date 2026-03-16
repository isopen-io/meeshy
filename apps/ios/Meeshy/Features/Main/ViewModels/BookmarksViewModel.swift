import Foundation
import MeeshySDK

@MainActor
class BookmarksViewModel: ObservableObject {
    @Published var posts: [FeedPost] = []
    @Published var isLoading = false
    @Published var hasMore = true

    private var nextCursor: String?

    private var preferredLanguages: [String] {
        AuthManager.shared.currentUser?.preferredContentLanguages ?? []
    }

    func loadBookmarks() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await PostService.shared.getBookmarks(cursor: nextCursor)
            let newPosts = response.data.map { $0.toFeedPost(preferredLanguages: preferredLanguages) }
            let existingIds = Set(posts.map(\.id))
            let unique = newPosts.filter { !existingIds.contains($0.id) }
            posts.append(contentsOf: unique)
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? false
        } catch {
            // Silent
        }
    }

    func removeBookmark(_ postId: String) async {
        posts.removeAll { $0.id == postId }
        try? await PostService.shared.removeBookmark(postId: postId)
    }

    func refresh() async {
        posts = []
        nextCursor = nil
        hasMore = true
        await loadBookmarks()
    }
}
