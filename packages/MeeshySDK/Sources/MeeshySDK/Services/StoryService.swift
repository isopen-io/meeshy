import Foundation

public final class StoryService {
    public static let shared = StoryService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public func list(cursor: String? = nil, limit: Int = 50) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/feed/stories", cursor: cursor, limit: limit)
    }

    public func markViewed(storyId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(storyId)/view", method: "POST")
    }

    public func react(storyId: String, emoji: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(storyId)/like", method: "POST")
    }

    public func comment(storyId: String, content: String) async throws -> APIPostComment {
        let body = CreateCommentRequest(content: content)
        let response: APIResponse<APIPostComment> = try await api.post(endpoint: "/posts/\(storyId)/comments", body: body)
        return response.data
    }

    public func repost(storyId: String) async throws {
        let body = RepostRequest()
        let _: APIResponse<[String: String]> = try await api.post(endpoint: "/posts/\(storyId)/repost", body: body)
    }
}
