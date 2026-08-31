import Foundation

// MARK: - Protocol

public protocol StatusServiceProviding: Sendable {
    func list(mode: StatusService.Mode, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]>
    /// `mentions` fait partie de la REQUIREMENT et non d'un défaut concret :
    /// un protocole muet jetterait la déclaration avant le mock, et un test
    /// vert prouverait l'inverse de ce qu'il croit.
    ///
    /// Il n'y a pas de `viaUsername` ici, et ce n'est pas un oubli : le
    /// gateway ne l'a jamais lu (`CreatePostSchema` ne le déclare pas, et un
    /// `z.object()` écarte silencieusement les clés inconnues). L'attribution
    /// d'une republication voyage par `repostOfId`, seul. Le « via @X » qu'un
    /// composer affiche est un fait LOCAL, jamais une écriture.
    func create(moodEmoji: String, content: String?, originalLanguage: String?, visibility: String, visibilityUserIds: [String]?, audioUrl: String?, repostOfId: String?, mentions: [PostMentionInput]?) async throws -> APIPost
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

    public func create(moodEmoji: String, content: String?, originalLanguage: String? = nil, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil, audioUrl: String? = nil, repostOfId: String? = nil, mentions: [PostMentionInput]? = nil) async throws -> APIPost {
        let body = CreatePostRequest(content: content ?? "", type: "STATUS", visibility: visibility, moodEmoji: moodEmoji, visibilityUserIds: visibilityUserIds, audioUrl: audioUrl, originalLanguage: originalLanguage, repostOfId: repostOfId, mentions: mentions)
        let response: APIResponse<APIPost> = try await api.post(PostsEndpoint.root, body: body)
        return response.data
    }

    public func delete(statusId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(PostsEndpoint.byPostId(postId: statusId))
    }

    public func react(statusId: String, emoji: String) async throws {
        let body = ["emoji": emoji]
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        let _: APIResponse<[String: String]> = try await api.request(PostsEndpoint.byPostIdLike(postId: statusId), method: "POST", body: bodyData)
    }
}
