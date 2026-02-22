import Foundation

public final class PostService {
    public static let shared = PostService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public func getFeed(cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/feed", cursor: cursor, limit: limit)
    }

    public func create(content: String, type: String = "POST", visibility: String = "PUBLIC", moodEmoji: String? = nil) async throws -> APIPost {
        let body = CreatePostRequest(content: content, type: type, visibility: visibility, moodEmoji: moodEmoji)
        let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts", body: body)
        return response.data
    }

    public func delete(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)")
    }

    public func like(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(postId)/like", method: "POST")
    }

    public func unlike(postId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(postId)/like")
    }

    public func bookmark(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(postId)/bookmark", method: "POST")
    }

    public func addComment(postId: String, content: String) async throws -> APIPostComment {
        let body = CreateCommentRequest(content: content)
        let response: APIResponse<APIPostComment> = try await api.post(endpoint: "/posts/\(postId)/comments", body: body)
        return response.data
    }

    public func likeComment(postId: String, commentId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(
            endpoint: "/posts/\(postId)/comments/\(commentId)/like", method: "POST"
        )
    }

    public func repost(postId: String, quote: String? = nil) async throws {
        let body = RepostRequest(content: quote, isQuote: quote != nil ? true : nil)
        let _: APIResponse<[String: String]> = try await api.post(endpoint: "/posts/\(postId)/repost", body: body)
    }

    public func share(postId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(postId)/share", method: "POST")
    }
}
