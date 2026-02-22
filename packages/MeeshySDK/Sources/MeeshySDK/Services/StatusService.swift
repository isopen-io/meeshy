import Foundation

public final class StatusService {
    public static let shared = StatusService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    public enum Mode: String {
        case friends
        case discover

        public var endpoint: String {
            switch self {
            case .friends: return "/posts/feed/statuses"
            case .discover: return "/posts/feed/statuses/discover"
            }
        }
    }

    public func list(mode: Mode = .friends, cursor: String? = nil, limit: Int = 20) async throws -> PaginatedAPIResponse<[APIPost]> {
        try await api.paginatedRequest(endpoint: mode.endpoint, cursor: cursor, limit: limit)
    }

    public func create(moodEmoji: String, content: String?, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil) async throws -> APIPost {
        let body = CreatePostRequest(content: content ?? "", type: "STATUS", visibility: visibility, moodEmoji: moodEmoji, visibilityUserIds: visibilityUserIds)
        let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts", body: body)
        return response.data
    }

    public func delete(statusId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(statusId)")
    }

    public func react(statusId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(statusId)/like", method: "POST")
    }
}
