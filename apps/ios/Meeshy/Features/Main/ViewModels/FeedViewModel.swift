import Foundation
import SwiftUI

@MainActor
class FeedViewModel: ObservableObject {
    @Published var posts: [FeedPost] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var hasMore = true
    @Published var error: String?

    private var nextCursor: String?
    private let api = APIClient.shared
    private let limit = 20

    // MARK: - Initial Load

    func loadFeed() async {
        guard !isLoading else { return }
        isLoading = true
        error = nil

        do {
            let response: PaginatedAPIResponse<[APIPost]> = try await api.paginatedRequest(
                endpoint: "/posts/feed",
                limit: limit
            )

            if response.success {
                posts = response.data.map { $0.toFeedPost() }
                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
            } else {
                error = response.error ?? "Failed to load feed"
                fallbackToSampleData()
            }
        } catch let apiError as APIError {
            error = apiError.localizedDescription
            fallbackToSampleData()
        } catch {
            self.error = error.localizedDescription
            fallbackToSampleData()
        }

        isLoading = false
    }

    // MARK: - Load More (Infinite Scroll)

    func loadMoreIfNeeded(currentPost: FeedPost) async {
        // Trigger when we're 5 posts from the end
        guard let index = posts.firstIndex(where: { $0.id == currentPost.id }) else { return }
        let threshold = posts.count - 5

        guard index >= threshold,
              hasMore,
              !isLoadingMore,
              nextCursor != nil else { return }

        isLoadingMore = true

        do {
            let response: PaginatedAPIResponse<[APIPost]> = try await api.paginatedRequest(
                endpoint: "/posts/feed",
                cursor: nextCursor,
                limit: limit
            )

            if response.success {
                let newPosts = response.data.map { $0.toFeedPost() }
                // Deduplicate
                let existingIds = Set(posts.map(\.id))
                let uniqueNew = newPosts.filter { !existingIds.contains($0.id) }
                posts.append(contentsOf: uniqueNew)

                nextCursor = response.pagination?.nextCursor
                hasMore = response.pagination?.hasMore ?? false
            }
        } catch {
            // Silently fail on load more — user can scroll again
        }

        isLoadingMore = false
    }

    // MARK: - Pull to Refresh

    func refresh() async {
        nextCursor = nil
        hasMore = true
        await loadFeed()
    }

    // MARK: - Interactions

    func likePost(_ postId: String) async {
        guard let index = posts.firstIndex(where: { $0.id == postId }) else { return }

        // Optimistic update
        posts[index].isLiked.toggle()
        posts[index].likes += posts[index].isLiked ? 1 : -1

        do {
            if posts[index].isLiked {
                let _: APIResponse<[String: AnyCodable]> = try await api.request(
                    endpoint: "/posts/\(postId)/like",
                    method: "POST"
                )
            } else {
                let _ = try await api.delete(endpoint: "/posts/\(postId)/like")
            }
        } catch {
            // Revert on failure
            posts[index].isLiked.toggle()
            posts[index].likes += posts[index].isLiked ? 1 : -1
        }
    }

    func bookmarkPost(_ postId: String) async {
        do {
            let _: APIResponse<[String: Bool]> = try await api.request(
                endpoint: "/posts/\(postId)/bookmark",
                method: "POST"
            )
        } catch {
            // Silently fail
        }
    }

    // MARK: - Fallback

    private func fallbackToSampleData() {
        if posts.isEmpty {
            posts = FeedSampleData.posts
        }
    }
}

// MARK: - AnyCodable helper for flexible decoding

struct AnyCodable: Codable {
    let value: Any

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let b = try? container.decode(Bool.self) { value = b }
        else if let i = try? container.decode(Int.self) { value = i }
        else if let d = try? container.decode(Double.self) { value = d }
        else if let s = try? container.decode(String.self) { value = s }
        else { value = "" }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let b = value as? Bool { try container.encode(b) }
        else if let i = value as? Int { try container.encode(i) }
        else if let d = value as? Double { try container.encode(d) }
        else if let s = value as? String { try container.encode(s) }
    }
}
