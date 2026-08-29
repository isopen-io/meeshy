import Foundation

// MARK: - Protocol

public protocol FriendServiceProviding: Sendable {
    func sendFriendRequest(receiverId: String, message: String?) async throws -> FriendRequest
    func receivedRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]>
    func sentRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]>
    /// Les DEUX sens et tous les statuts (ou un seul via `status`).
    /// `/friend-requests/received` filtre `pending` en dur côté serveur : une
    /// relation acceptée dont l'utilisateur est le RECEVEUR n'y apparaît jamais.
    func allFriendRequests(status: String?, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]>
    func respond(requestId: String, accepted: Bool) async throws -> FriendRequest
    func deleteRequest(requestId: String) async throws
    func sendEmailInvitation(email: String) async throws
}

public final class FriendService: FriendServiceProviding, @unchecked Sendable {
    public static let shared = FriendService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    // MARK: - Send Friend Request

    /// `POST /directory/friend-requests` — l'unique chemin d'envoi (#4162).
    ///
    /// Deux familles complètes coexistaient côté serveur, et le trafic allait à
    /// la plus FAIBLE : celle que ce site appelait n'avait ni garde
    /// d'auto-envoi, ni contrôle de désactivation, ni contrôle de blocage.
    /// L'adresse canonique porte l'union des gardes des deux, plus le blocage,
    /// qui n'existait dans aucune.
    public func sendFriendRequest(receiverId: String, message: String? = nil) async throws -> FriendRequest {
        let body = SendFriendRequest(receiverId: receiverId, message: message)
        let response: APIResponse<FriendRequest> = try await api.post(
            endpoint: "/directory/friend-requests",
            body: body
        )
        return response.data
    }

    // MARK: - Received Friend Requests

    public func receivedRequests(offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        try await api.offsetPaginatedRequest(
            endpoint: "/friend-requests/received",
            offset: offset,
            limit: limit
        )
    }

    // MARK: - Sent Friend Requests

    public func sentRequests(offset: Int = 0, limit: Int = 20) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        try await api.offsetPaginatedRequest(
            endpoint: "/friend-requests/sent",
            offset: offset,
            limit: limit
        )
    }

    // MARK: - All Friend Requests (both directions)

    /// `offsetPaginatedRequest` only forwards `limit`/`offset` as query items —
    /// it has no slot for `status`. Concatenating `?status=…` onto the endpoint
    /// string would silently lose it anyway: `APIClient.requestWithHeaders`
    /// parses the endpoint into `URLComponents` then does
    /// `components.queryItems = queryItems`, which REPLACES whatever query the
    /// endpoint string carried instead of merging with it. So this call goes
    /// through the generic `request(endpoint:queryItems:)` with a single query
    /// item array carrying `status`, `limit`, and `offset` together.
    public func allFriendRequests(status: String? = "accepted", offset: Int = 0, limit: Int = 100) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        var queryItems = [
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "offset", value: "\(offset)")
        ]
        if let status, !status.isEmpty {
            queryItems.append(URLQueryItem(name: "status", value: status))
        }
        return try await api.request(
            endpoint: "/users/friend-requests",
            method: "GET",
            body: nil,
            queryItems: queryItems
        )
    }

    // MARK: - Respond to Friend Request

    /// `PATCH /directory/friend-requests/{id}` — un geste, un verbe (#4162).
    ///
    /// Quatre gestes vivaient sur deux verbes et trois routes : accepter,
    /// refuser, annuler, écarter. Le corps porte désormais une ACTION.
    ///
    /// La réponse d'une acceptation porte enfin `conversation` : le serveur la
    /// greffait déjà sur l'objet rendu, mais son schéma ne la déclarant pas,
    /// elle était supprimée à la sérialisation — l'appelant devait la chercher
    /// par une seconde requête.
    public func respond(requestId: String, accepted: Bool) async throws -> FriendRequest {
        let body = FriendRequestAction(action: accepted ? "accept" : "reject")
        let response: APIResponse<FriendRequest> = try await api.request(
            endpoint: "/directory/friend-requests/\(requestId)",
            method: "PATCH",
            body: try JSONEncoder().encode(body)
        )
        return response.data
    }

    // MARK: - Delete Friend Request

    /// Écarter une demande — `action=dismiss`, jamais un `DELETE` à part.
    ///
    /// `cancel` est le geste de l'ÉMETTEUR, `dismiss` celui de l'une ou l'autre
    /// partie. L'ancienne route `DELETE` acceptait les deux sans distinguer :
    /// c'est donc `dismiss` qui la traduit fidèlement.
    ///
    /// La réponse est `{ id, deleted, message }` et non un dictionnaire de
    /// booléens : un type trop STRICT ici transforme un succès serveur en échec
    /// client, ce que le dépôt a déjà payé sur le déblocage.
    public func deleteRequest(requestId: String) async throws {
        let body = FriendRequestAction(action: "dismiss")
        let _: APIResponse<FriendRequestActionResult> = try await api.request(
            endpoint: "/directory/friend-requests/\(requestId)",
            method: "PATCH",
            body: try JSONEncoder().encode(body)
        )
    }

    // MARK: - Email Invitation

    public func sendEmailInvitation(email: String) async throws {
        let body = EmailInvitationRequest(email: email)
        let _: APIResponse<EmailInvitationResponse> = try await api.post(
            endpoint: "/invitations/email",
            body: body
        )
    }
}
