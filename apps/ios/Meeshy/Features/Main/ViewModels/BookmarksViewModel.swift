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

        if nextCursor == nil {
            let cached = await CacheCoordinator.shared.feed.load(for: "bookmarks")
            switch cached {
            case .fresh(let data, _):
                posts = data
                return
            case .stale(let data, _):
                posts = data
                Task { [weak self] in await self?.fetchBookmarksFromNetwork() }
                return
            case .expired, .empty:
                break
            }
        }

        isLoading = true
        defer { isLoading = false }
        await fetchBookmarksFromNetwork()
    }

    private func fetchBookmarksFromNetwork() async {
        do {
            let response = try await PostService.shared.getBookmarks(cursor: nextCursor)
            let newPosts = response.data.map { $0.toFeedPost(preferredLanguages: preferredLanguages) }
            let existingIds = Set(posts.map(\.id))
            let unique = newPosts.filter { !existingIds.contains($0.id) }
            posts.append(contentsOf: unique)
            nextCursor = response.pagination?.nextCursor
            hasMore = response.pagination?.hasMore ?? false

            if nextCursor == nil || posts.count == unique.count {
                await CacheCoordinator.shared.feed.save(posts, for: "bookmarks")
            }
        } catch {
            ToastManager.shared.showError("Erreur lors du chargement des favoris")
        }
    }

    func removeBookmark(_ postId: String) async {
        let snapshot = posts
        posts.removeAll { $0.id == postId }
        do {
            try await PostService.shared.removeBookmark(postId: postId)
            await CacheCoordinator.shared.feed.save(posts, for: "bookmarks")
        } catch {
            posts = snapshot
            ToastManager.shared.showError("Erreur lors de la suppression du favori")
        }
    }

    func refresh() async {
        posts = []
        nextCursor = nil
        hasMore = true
        await CacheCoordinator.shared.feed.invalidate(for: "bookmarks")
        await loadBookmarks()
    }
}
