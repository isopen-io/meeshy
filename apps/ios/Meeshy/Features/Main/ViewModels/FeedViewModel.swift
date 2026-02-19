import Foundation
import SwiftUI
import Combine
import MeeshySDK

@MainActor
class FeedViewModel: ObservableObject {
    @Published var posts: [FeedPost] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var hasMore = true
    @Published var error: String?

    /// Number of new posts received via Socket.IO while the user is scrolled down.
    /// Reset to 0 when the user taps the "New posts" banner or pulls to refresh.
    @Published var newPostsCount: Int = 0

    private var nextCursor: String?
    private let api = APIClient.shared
    private let limit = 20
    private var cancellables = Set<AnyCancellable>()
    private let socialSocket = SocialSocketManager.shared

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
            // Silently fail on load more -- user can scroll again
        }

        isLoadingMore = false
    }

    // MARK: - Pull to Refresh

    func refresh() async {
        nextCursor = nil
        hasMore = true
        newPostsCount = 0
        await loadFeed()
    }

    // MARK: - New Posts Banner

    /// Call this when the user taps the "New posts" banner to scroll to top
    /// and reset the counter.
    func acknowledgeNewPosts() {
        newPostsCount = 0
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

    func createPost(content: String, type: String = "POST", visibility: String = "PUBLIC") async {
        let body: [String: String] = ["content": content, "type": type, "visibility": visibility]
        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let response: APIResponse<APIPost> = try await api.request(
                endpoint: "/posts",
                method: "POST",
                body: bodyData
            )
            if response.success {
                let feedPost = response.data.toFeedPost()
                posts.insert(feedPost, at: 0)
            }
        } catch {
            // Silent failure
        }
    }

    func sendComment(postId: String, content: String, parentId: String? = nil) async {
        var body: [String: String] = ["content": content]
        if let parentId { body["parentId"] = parentId }

        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let _: APIResponse<[String: AnyCodable]> = try await api.request(
                endpoint: "/posts/\(postId)/comments",
                method: "POST",
                body: bodyData
            )
            // Update local comment count
            if let index = posts.firstIndex(where: { $0.id == postId }) {
                posts[index].commentCount += 1
            }
        } catch {
            // Silent failure
        }
    }

    func likeComment(postId: String, commentId: String, emoji: String = "heart") async {
        let body: [String: String] = ["emoji": emoji]
        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let _: APIResponse<[String: AnyCodable]> = try await api.request(
                endpoint: "/posts/\(postId)/comments/\(commentId)/like",
                method: "POST",
                body: bodyData
            )
        } catch {
            // Silent failure
        }
    }

    func repostPost(_ postId: String, content: String? = nil, isQuote: Bool = false) async {
        var body: [String: Any] = ["isQuote": isQuote]
        if let content { body["content"] = content }

        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let _: APIResponse<[String: AnyCodable]> = try await api.request(
                endpoint: "/posts/\(postId)/repost",
                method: "POST",
                body: bodyData
            )
        } catch {
            // Silent failure
        }
    }

    func sharePost(_ postId: String, platform: String? = nil) async {
        var body: [String: String] = [:]
        if let platform { body["platform"] = platform }

        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            let _: APIResponse<[String: AnyCodable]> = try await api.request(
                endpoint: "/posts/\(postId)/share",
                method: "POST",
                body: bodyData
            )
        } catch {
            // Silent failure
        }
    }

    // MARK: - Socket.IO Real-Time Updates

    func subscribeToSocketEvents() {
        socialSocket.connect()

        // --- post:created ---
        socialSocket.postCreated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                let feedPost = apiPost.toFeedPost()
                if !self.posts.contains(where: { $0.id == feedPost.id }) {
                    self.posts.insert(feedPost, at: 0)
                    self.newPostsCount += 1
                }
            }
            .store(in: &cancellables)

        // --- post:updated ---
        socialSocket.postUpdated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] apiPost in
                guard let self else { return }
                let updatedFeedPost = apiPost.toFeedPost()
                if let index = self.posts.firstIndex(where: { $0.id == updatedFeedPost.id }) {
                    // Preserve local-only state (isLiked) across the update
                    var merged = updatedFeedPost
                    merged.isLiked = self.posts[index].isLiked
                    self.posts[index] = merged
                }
            }
            .store(in: &cancellables)

        // --- post:deleted ---
        socialSocket.postDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] postId in
                self?.posts.removeAll { $0.id == postId }
            }
            .store(in: &cancellables)

        // --- post:liked ---
        socialSocket.postLiked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].likes = data.likeCount
            }
            .store(in: &cancellables)

        // --- post:unliked ---
        socialSocket.postUnliked
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].likes = data.likeCount
            }
            .store(in: &cancellables)

        // --- post:reposted ---
        socialSocket.postReposted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self else { return }
                let repostFeedPost = data.repost.toFeedPost()
                if !self.posts.contains(where: { $0.id == repostFeedPost.id }) {
                    self.posts.insert(repostFeedPost, at: 0)
                    self.newPostsCount += 1
                }
            }
            .store(in: &cancellables)

        // --- comment:added ---
        socialSocket.commentAdded
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].commentCount = data.commentCount
            }
            .store(in: &cancellables)

        // --- comment:deleted ---
        socialSocket.commentDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self, let index = self.posts.firstIndex(where: { $0.id == data.postId }) else { return }
                self.posts[index].commentCount = data.commentCount
            }
            .store(in: &cancellables)
    }

    func unsubscribeFromSocketEvents() {
        cancellables.removeAll()
        socialSocket.unsubscribeFeed()
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
