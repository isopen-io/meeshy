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

/// La gestion des liens par leur PROPRIÉTAIRE — la fiche détails + édition
/// (#7797) n'a besoin que de ces cinq capacités.
public protocol ShareLinkManaging: Sendable {
    func listMyLinks(offset: Int, limit: Int) async throws -> [MyShareLink]
    func fetchLinkStats(linkId: String) async throws -> ShareLinkArrivalStats
    func updateLink(linkId: String, settings: ShareLinkSettings) async throws
    func toggleLink(linkId: String, isActive: Bool) async throws
    func deleteLink(linkId: String) async throws
}

public final class ShareLinkService: ShareLinkInfoProviding, ShareLinkManaging, @unchecked Sendable {
    public static let shared = ShareLinkService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    // MARK: - User's Own Links (authenticated)

    /// Liste les liens de partage créés par l'utilisateur connecté, avec leur
    /// conversation et leur configuration (`expand=conversation,policy`) : la
    /// fiche d'un lien s'affiche depuis cette liste sans second appel.
    public func listMyLinks(offset: Int = 0, limit: Int = 50) async throws -> [MyShareLink] {
        let response: APIResponse<[MyShareLink]> = try await api.request(
            LinksEndpoint.root,
            queryItems: [URLQueryItem(name: "offset", value: String(offset)),
                         URLQueryItem(name: "limit", value: String(limit)),
                         URLQueryItem(name: "expand", value: "conversation,policy")]
        )
        return response.data
    }

    /// Visites, arrivées, langues et pays des arrivants d'UN lien.
    public func fetchLinkStats(linkId: String) async throws -> ShareLinkArrivalStats {
        let response: APIResponse<ShareLinkArrivalStats> = try await api.request(
            LinksEndpoint.byLinkIdStats(linkId: linkId)
        )
        return response.data
    }

    /// Enregistre la configuration ENTIÈRE du lien (`PATCH /links/:linkId`).
    public func updateLink(linkId: String, settings: ShareLinkSettings) async throws {
        let _: APIResponse<EmptySuccess> = try await api.patch(
            LinksEndpoint.byLinkId(linkId: linkId),
            body: UpdateShareLinkRequest(settings: settings)
        )
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

    /// `DELETE /guest-sessions/me` — successeur de l'alias déprécié
    /// `POST /anonymous/leave` (#4167 critère 4, #5425). Le jeton voyage en
    /// en-tête `X-Session-Token`, jamais dans le corps : la route l'identifie
    /// ainsi, pas via le `sessionToken` du compte actif.
    public func leaveAnonymousSession(sessionToken: String) async throws {
        let _: APIResponse<[String: String]> = try await api.requestWithHeaders(
            GuestSessionsEndpoint.me,
            method: "DELETE",
            body: nil,
            queryItems: nil,
            headers: ["X-Session-Token": sessionToken]
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
            LinksEndpoint.byLinkId(linkId: linkId),
            body: ToggleBody(isActive: isActive)
        )
    }

    // MARK: - Delete Link (authenticated)

    public func deleteLink(linkId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(
            LinksEndpoint.byLinkId(linkId: linkId)
        )
    }
}
