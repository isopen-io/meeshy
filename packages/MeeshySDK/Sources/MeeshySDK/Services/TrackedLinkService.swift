import Foundation

/// Qui a partagé un lien de suivi (#9171, jumeau de #9149) — servi par
/// `GET /tracking-links/:token/resolve` sous la clé `sharer`, pour que l'écran
/// d'un visiteur sans compte puisse dire « {nom} vous a partagé ce réel ».
/// `username` est toujours là ; `displayName` et `avatar` peuvent manquer.
public struct TrackedLinkSharer: Codable, Sendable, Equatable, Hashable {
    public let displayName: String?
    public let username: String
    public let avatar: String?

    public init(displayName: String? = nil, username: String, avatar: String? = nil) {
        self.displayName = displayName; self.username = username; self.avatar = avatar
    }

    enum CodingKeys: String, CodingKey {
        case displayName, username, avatar
    }

    /// Un pseudo vide ne nomme personne : la forme est refusée, et la
    /// résolution qui la porte n'a pas de partageur plutôt qu'un nom blanc.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let username = try container.decode(String.self, forKey: .username)
        guard !username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .username, in: container,
                                                   debugDescription: "empty sharer username")
        }
        self.username = username
        self.displayName = try container.decodeIfPresent(String.self, forKey: .displayName)
        self.avatar = try container.decodeIfPresent(String.self, forKey: .avatar)
    }
}

/// Resolved target of a `/l/<token>` tracked link, returned by the gateway
/// `GET /tracking-links/:token/resolve`. `kind` distinguishes a tracking link
/// (post / reel / story share) from a conversation invitation; `targetType` is
/// the typed surface (`POST`/`REEL`/`STORY`/`STATUS`/`CONVERSATION`/`PROFILE`/`EXTERNAL`).
public struct ResolvedTrackedLink: Codable, Sendable {
    public let kind: String?
    public let targetType: String?
    public let targetId: String?
    public let originalUrl: String?
    public let sharerId: String?
    public let isActive: Bool?
    public let expiresAt: String?
    /// Qui a partagé le lien (#9171). `nil` quand la passerelle ne le sert pas,
    /// le sert `null`, ou sous une forme illisible : nommer le partageur est un
    /// plus, jamais une raison de faire échouer la résolution du lien.
    public let sharer: TrackedLinkSharer?

    public init(kind: String? = nil, targetType: String? = nil, targetId: String? = nil,
                originalUrl: String? = nil, sharerId: String? = nil,
                isActive: Bool? = nil, expiresAt: String? = nil,
                sharer: TrackedLinkSharer? = nil) {
        self.kind = kind; self.targetType = targetType; self.targetId = targetId
        self.originalUrl = originalUrl; self.sharerId = sharerId
        self.isActive = isActive; self.expiresAt = expiresAt
        self.sharer = sharer
    }

    enum CodingKeys: String, CodingKey {
        case kind, targetType, targetId, originalUrl, sharerId, isActive, expiresAt, sharer
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.kind = try container.decodeIfPresent(String.self, forKey: .kind)
        self.targetType = try container.decodeIfPresent(String.self, forKey: .targetType)
        self.targetId = try container.decodeIfPresent(String.self, forKey: .targetId)
        self.originalUrl = try container.decodeIfPresent(String.self, forKey: .originalUrl)
        self.sharerId = try container.decodeIfPresent(String.self, forKey: .sharerId)
        self.isActive = try container.decodeIfPresent(Bool.self, forKey: .isActive)
        self.expiresAt = try container.decodeIfPresent(String.self, forKey: .expiresAt)
        self.sharer = try? container.decodeIfPresent(TrackedLinkSharer.self, forKey: .sharer)
    }
}

/// Low-level SDK seam for `/l/<token>` deep links: resolve a token to its typed
/// target, and record an in-app click (so opens from the app are counted just
/// like web opens). The ROUTING decision (which screen to open) stays app-side —
/// this is a pure networking atom (SDK purity).
public protocol TrackedLinkResolving: Sendable {
    func resolve(token: String) async throws -> ResolvedTrackedLink
    /// Best-effort, fire-and-forget — must NEVER throw into the navigation path.
    func recordClick(token: String) async
}

public final class TrackedLinkService: TrackedLinkResolving, @unchecked Sendable {
    public static let shared = TrackedLinkService()
    private let api: APIClientProviding

    public init(api: APIClientProviding = APIClient.shared) { self.api = api }

    public func resolve(token: String) async throws -> ResolvedTrackedLink {
        let response: APIResponse<ResolvedTrackedLink> = try await api.request(
            TrackingLinksEndpoint.byTokenResolve(token: token)
        )
        return response.data
    }

    public func recordClick(token: String) async {
        struct ClickBody: Encodable { let socialSource: String }
        struct ClickAck: Decodable {}
        let _: APIResponse<ClickAck>? = try? await api.post(
            TrackingLinksEndpoint.byTokenClick(token: token),
            body: ClickBody(socialSource: "ios-app")
        )
    }
}
