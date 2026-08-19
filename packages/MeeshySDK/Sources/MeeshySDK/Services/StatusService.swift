import Foundation

// MARK: - Protocol

public protocol StatusServiceProviding: Sendable {
    func list(mode: StatusService.Mode, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    /// `mentions` fait partie de la REQUIREMENT et non d'un défaut concret :
    /// un protocole muet jetterait la déclaration avant le mock, et un test
    /// vert prouverait l'inverse de ce qu'il croit.
    func create(moodEmoji: String, content: String?, originalLanguage: String?, visibility: String, visibilityUserIds: [String]?, viaUsername: String?, audioUrl: String?, repostOfId: String?, mentions: [PostMentionInput]?) async throws -> APIPost
    func delete(statusId: String) async throws
    func react(statusId: String, emoji: String) async throws
}

public final class StatusService: StatusServiceProviding, @unchecked Sendable {
    public static let shared = StatusService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public enum Mode: String, Sendable {
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

    public func create(moodEmoji: String, content: String?, originalLanguage: String? = nil, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil, viaUsername: String? = nil, audioUrl: String? = nil, repostOfId: String? = nil, mentions: [PostMentionInput]? = nil) async throws -> APIPost {
        let body = CreatePostRequest(content: content ?? "", type: "STATUS", visibility: visibility, moodEmoji: moodEmoji, visibilityUserIds: visibilityUserIds, audioUrl: audioUrl, originalLanguage: originalLanguage, viaUsername: viaUsername, repostOfId: repostOfId, mentions: mentions)
        let response: APIResponse<APIPost> = try await api.post(endpoint: "/posts", body: body)
        return response.data
    }

    public func delete(statusId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/posts/\(statusId)")
    }

    public func react(statusId: String, emoji: String) async throws {
        let body = ["emoji": emoji]
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/posts/\(statusId)/like", method: "POST", body: bodyData)
    }
}
