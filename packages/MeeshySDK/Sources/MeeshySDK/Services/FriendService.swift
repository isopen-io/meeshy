import Foundation

// MARK: - Direction

/// Le SENS d'un listing de demandes — le discriminant qui remplace trois URL.
///
/// `received` et `sent` ne rendent qu'un sens ; une relation acceptée dont on
/// est le RECEVEUR ne remonte donc pas par `sent`, et c'est `any` qui rend les
/// deux quel que soit celui des deux qui a initié.
public enum FriendRequestDirection: String, Sendable {
    case received
    case sent
    case any
}

// MARK: - Protocol

public protocol FriendServiceProviding: Sendable {
    func sendFriendRequest(receiverId: String, message: String?) async throws -> FriendRequest

    /// La lecture CANONIQUE des demandes, par CURSEUR (#4254).
    ///
    /// Elle remplace les trois lectures par décalage ci-dessous : la route à
    /// `offset` repayait un `count()` complet à chaque page pour un `total`
    /// qu'aucun appelant du dépôt ne lit, et son décalage SAUTAIT des lignes dès
    /// qu'une demande était créée ou acceptée pendant la pagination — sur une
    /// liste triée par date DÉCROISSANTE, toute insertion décale les pages
    /// suivantes d'un cran. La borne par horodatage est stable sous insertion et
    /// sert directement l'index de tri.
    ///
    /// `q` filtre côté SERVEUR sur le nom de l'autre partie : sans lui, les
    /// hôtes drainent la liste entière pour filtrer en mémoire.
    func friendRequests(
        direction: FriendRequestDirection,
        status: String?,
        q: String?,
        cursor: String?,
        limit: Int
    ) async throws -> PaginatedAPIResponse<[FriendRequest]>

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

public extension FriendServiceProviding {
    /// PONT pour les conformants qui ne savent lire que par décalage — les
    /// DOUBLES de test, et eux seuls (`MockFriendService`, `ThrowingFriendService`).
    ///
    /// Même patron que `APIClientProviding.requestWithHeaders` : ajouter une
    /// exigence à un protocole PUBLIC casse tous ses conformants, et les deux qui
    /// existent hors du SDK sont des doubles dont la valeur est justement de ne
    /// stuber que ce que leur suite exerce. Le pont les laisse répondre à la
    /// lecture par curseur avec les stubs qu'ils portent déjà.
    ///
    /// Il ne MENT pas sur ce qu'il sait faire : un conformant par décalage n'a
    /// aucune seconde page à donner sur un curseur qu'il ne comprend pas, donc
    /// un `cursor` non nul rend une page VIDE et `hasMore: false`. Une boucle
    /// d'appelant s'arrête ; elle ne redemande pas indéfiniment la première page,
    /// ce qu'un pont qui ignorerait le curseur produirait.
    ///
    /// `FriendService`, seul conformant de PRODUCTION, le remplace par l'appel
    /// canonique — et un témoin le prouve (`FriendServiceTests`).
    func friendRequests(
        direction: FriendRequestDirection,
        status: String?,
        q: String?,
        cursor: String?,
        limit: Int
    ) async throws -> PaginatedAPIResponse<[FriendRequest]> {
        if cursor != nil {
            return PaginatedAPIResponse(
                success: true,
                data: [],
                pagination: CursorPagination(nextCursor: nil, hasMore: false, limit: limit),
                error: nil
            )
        }

        let page: OffsetPaginatedAPIResponse<[FriendRequest]>
        switch direction {
        case .received: page = try await receivedRequests(offset: 0, limit: limit)
        case .sent: page = try await sentRequests(offset: 0, limit: limit)
        case .any: page = try await allFriendRequests(status: status, offset: 0, limit: limit)
        }

        return PaginatedAPIResponse(
            success: page.success,
            data: page.data,
            pagination: CursorPagination(nextCursor: nil, hasMore: false, limit: limit),
            error: page.error
        )
    }
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

    // MARK: - Listing par curseur

    /// `GET /directory/friend-requests` — l'unique lecture (#4162, #4254).
    ///
    /// Les trois adresses historiques (`/friend-requests/received`, `/sent`,
    /// `/users/friend-requests`) restent servies jusqu'à extinction des versions
    /// installées ; elles ne TRAVERSENT pas cet appel, et c'est délibéré : leur
    /// contrat porte un `offset` qu'aucun curseur ne sait traduire sans la borne
    /// de la page précédente. Un pont qui ignorerait `offset` redemanderait la
    /// première page indéfiniment — les quatre hôtes qui bouclent (annuaire,
    /// nouvelle conversation, sélecteur de transfert, source de mentions) y
    /// collecteraient des doublons jusqu'à leur plafond. Une panne PIRE que
    /// celle qu'on corrige, parce qu'elle ne se voit pas.
    ///
    /// La bascule appartient donc aux hôtes, un par un.
    public func friendRequests(
        direction: FriendRequestDirection = .received,
        status: String? = nil,
        q: String? = nil,
        cursor: String? = nil,
        limit: Int = 20
    ) async throws -> PaginatedAPIResponse<[FriendRequest]> {
        // `offsetPaginatedRequest` n'a pas de fente pour ces paramètres, et
        // concaténer `?…` sur l'endpoint les PERDRAIT : `requestWithHeaders`
        // parse l'endpoint en `URLComponents` puis REMPLACE `queryItems` au lieu
        // de fusionner. Tout passe donc par un seul tableau.
        var items = [
            URLQueryItem(name: "direction", value: direction.rawValue),
            URLQueryItem(name: "limit", value: "\(limit)")
        ]
        if let status, !status.isEmpty {
            items.append(URLQueryItem(name: "status", value: status))
        }
        if let q, !q.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            items.append(URLQueryItem(name: "q", value: q))
        }
        if let cursor, !cursor.isEmpty {
            items.append(URLQueryItem(name: "cursor", value: cursor))
        }

        return try await api.request(
            endpoint: "/directory/friend-requests",
            method: "GET",
            body: nil,
            queryItems: items
        )
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
