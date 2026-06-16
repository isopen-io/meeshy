import Foundation

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

    public init(kind: String? = nil, targetType: String? = nil, targetId: String? = nil,
                originalUrl: String? = nil, sharerId: String? = nil,
                isActive: Bool? = nil, expiresAt: String? = nil) {
        self.kind = kind; self.targetType = targetType; self.targetId = targetId
        self.originalUrl = originalUrl; self.sharerId = sharerId
        self.isActive = isActive; self.expiresAt = expiresAt
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
    private let api: APIClient

    public init(api: APIClient = .shared) { self.api = api }

    public func resolve(token: String) async throws -> ResolvedTrackedLink {
        let response: APIResponse<ResolvedTrackedLink> = try await api.request(
            endpoint: "/tracking-links/\(token)/resolve"
        )
        return response.data
    }

    public func recordClick(token: String) async {
        struct ClickBody: Encodable { let socialSource: String }
        struct ClickAck: Decodable {}
        let _: APIResponse<ClickAck>? = try? await api.post(
            endpoint: "/tracking-links/\(token)/click",
            body: ClickBody(socialSource: "ios-app")
        )
    }
}
