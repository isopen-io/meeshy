import Foundation

/// Résolution PUBLIQUE d'un lien de partage — la seule capacité dont
/// `ShareLinkEntryResolver` (app-side) a besoin pour décider qui entre.
///
/// Couture étroite volontairement : le résolveur ne doit pas pouvoir rejoindre,
/// créer ou supprimer un lien, et un double de test n'a pas à simuler les neuf
/// autres méthodes du service pour répondre à une question de lecture.
public protocol ShareLinkInfoProviding: Sendable {
    func getLinkInfo(identifier: String) async throws -> ShareLinkInfo
}

public final class ShareLinkService: ShareLinkInfoProviding, @unchecked Sendable {
    public static let shared = ShareLinkService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    // MARK: - User's Own Links (authenticated)

    /// Liste les liens de partage créés par l'utilisateur connecté
    public func listMyLinks(offset: Int = 0, limit: Int = 50) async throws -> [MyShareLink] {
        let response: APIResponse<[MyShareLink]> = try await api.request(
            endpoint: "/links?offset=\(offset)&limit=\(limit)"
        )
        return response.data
    }

    /// Stats globales pour les liens de l'utilisateur
    public func fetchMyStats() async throws -> MyShareLinkStats {
        let response: APIResponse<MyShareLinkStats> = try await api.request(
            LinksEndpoint.stats
        )
        return response.data
    }

    // MARK: - Get Link Info (public, no auth required)

    public func getLinkInfo(identifier: String) async throws -> ShareLinkInfo {
        let response: APIResponse<ShareLinkInfo> = try await api.request(
            AnonymousEndpoint.linkByIdentifier(identifier: identifier)
        )
        return response.data
    }

    // MARK: - Join Anonymously

    public func joinAnonymously(linkId: String, request: AnonymousJoinRequest) async throws -> AnonymousJoinResponse {
        let response: APIResponse<AnonymousJoinResponse> = try await api.post(
            AnonymousEndpoint.joinByLinkId(linkId: linkId),
            body: request
        )
        return response.data
    }

    // MARK: - Join as Authenticated User

    /// Join (or re-resolve) a conversation via a share link as an
    /// authenticated user. Returns the canonical conversationId — the
    /// gateway is idempotent: an existing member gets the same response
    /// as a fresh join, so callers don't have to pre-check membership.
    public func joinAuthenticated(linkId: String) async throws -> JoinAuthenticatedResponse {
        struct EmptyBody: Encodable {}
        let response: APIResponse<JoinAuthenticatedResponse> = try await api.post(
            ConversationsEndpoint.joinByLinkId(linkId: linkId),
            body: EmptyBody()
        )
        return response.data
    }

    // MARK: - Leave Anonymous Session

    public func leaveAnonymousSession(sessionToken: String) async throws {
        struct LeaveRequest: Encodable { let sessionToken: String }
        let _: APIResponse<[String: String]> = try await api.post(
            AnonymousEndpoint.leave,
            body: LeaveRequest(sessionToken: sessionToken)
        )
    }

    // MARK: - Create Share Link (authenticated)

    public func createShareLink(request: CreateShareLinkRequest) async throws -> CreatedShareLink {
        let response: APIResponse<CreateShareLinkResponse> = try await api.post(
            LinksEndpoint.root,
            body: request
        )
        let raw = response.data
        return CreatedShareLink(
            id: raw.shareLink.id,
            linkId: raw.linkId,
            identifier: nil,
            conversationId: raw.conversationId,
            name: raw.shareLink.name,
            isActive: raw.shareLink.isActive
        )
    }

    // MARK: - Toggle Link Active/Inactive (authenticated)

    public func toggleLink(linkId: String, isActive: Bool) async throws {
        struct ToggleBody: Encodable { let isActive: Bool }
        let _: APIResponse<MyShareLink> = try await api.patch(
            endpoint: "/links/\(linkId)",
            body: ToggleBody(isActive: isActive)
        )
    }

    // MARK: - Delete Link (authenticated)

    public func deleteLink(linkId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(
            endpoint: "/links/\(linkId)"
        )
    }
}
