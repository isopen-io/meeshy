import Foundation

// MARK: - Protocol

public protocol StoryServiceProviding: Sendable {
    func list(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    func markViewed(storyId: String) async throws
    func delete(storyId: String) async throws
    func react(storyId: String, emoji: String) async throws
    func comment(storyId: String, content: String) async throws -> APIPostComment
    func repost(storyId: String) async throws
}

public final class StoryService: StoryServiceProviding, @unchecked Sendable {
    public static let shared = StoryService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func list(cursor: String? = nil, limit: Int = 50) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: "/posts/feed/stories", cursor: cursor, limit: limit)
    }

    public func markViewed(storyId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(storyId)/view", method: "POST")
    }

    public func delete(storyId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(storyId)")
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
