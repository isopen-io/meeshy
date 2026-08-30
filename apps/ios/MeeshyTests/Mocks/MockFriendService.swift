import Foundation
import MeeshySDK

final class MockFriendService: FriendServiceProviding, @unchecked Sendable {
    init() {}

    // MARK: - Stubbing

    var sendRequestResult: Result<FriendRequest, Error> = .failure(NSError(domain: "test", code: 0))
    var receivedRequestsResult: Result<OffsetPaginatedAPIResponse<[FriendRequest]>, Error> = .success(
        OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    )
    var sentRequestsResult: Result<OffsetPaginatedAPIResponse<[FriendRequest]>, Error> = .success(
        OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    )
    var allFriendRequestsResult: Result<OffsetPaginatedAPIResponse<[FriendRequest]>, Error> = .success(
        OffsetPaginatedAPIResponse(success: true, data: [], pagination: nil, error: nil)
    )
    /// Séquence consommée un élément par appel (dépilée par `removeFirst()`), pour
    /// exercer la boucle de pagination du ViewModel (plusieurs pages). Vide par
    /// défaut : tant qu'elle est vide, `allFriendRequests` retombe sur le résultat
    /// FIXE `allFriendRequestsResult` — aucun test existant à un seul appel n'est cassé.
    var allFriendRequestsResults: [Result<OffsetPaginatedAPIResponse<[FriendRequest]>, Error>] = []
    var respondResult: Result<FriendRequest, Error> = .failure(NSError(domain: "test", code: 0))
    var deleteResult: Result<Void, Error> = .success(())
    var sendEmailInvitationResult: Result<Void, Error> = .success(())

    // MARK: - Call Tracking

    var sendRequestCallCount = 0
    var lastSendRequestReceiverId: String?

    var receivedRequestsCallCount = 0
    var lastReceivedOffset: Int?
    var lastReceivedLimit: Int?

    var sentRequestsCallCount = 0
    var lastSentOffset: Int?
    var lastSentLimit: Int?

    var allFriendRequestsCallCount = 0
    var lastAllFriendRequestsStatus: String?
    var lastAllFriendRequestsOffset: Int?
    var lastAllFriendRequestsLimit: Int?
    /// Un offset par appel, dans l'ordre — permet de vérifier la séquence
    /// exacte parcourue par une boucle de pagination (ex: [0, 100]).
    var allFriendRequestsOffsets: [Int] = []

    var respondCallCount = 0
    var lastRespondRequestId: String?
    var lastRespondAccepted: Bool?

    var deleteCallCount = 0
    var lastDeleteRequestId: String?

    var sendEmailInvitationCallCount = 0
    var lastInvitationEmail: String?

    // MARK: - Protocol Conformance

    func sendFriendRequest(receiverId: String, message: String?) async throws -> FriendRequest {
        sendRequestCallCount += 1
        lastSendRequestReceiverId = receiverId
        return try sendRequestResult.get()
    }

    func receivedRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        receivedRequestsCallCount += 1
        lastReceivedOffset = offset
        lastReceivedLimit = limit
        return try receivedRequestsResult.get()
    }

    func sentRequests(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        sentRequestsCallCount += 1
        lastSentOffset = offset
        lastSentLimit = limit
        return try sentRequestsResult.get()
    }

    func allFriendRequests(status: String?, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        allFriendRequestsCallCount += 1
        lastAllFriendRequestsStatus = status
        lastAllFriendRequestsOffset = offset
        lastAllFriendRequestsLimit = limit
        allFriendRequestsOffsets.append(offset)
        if !allFriendRequestsResults.isEmpty {
            return try allFriendRequestsResults.removeFirst().get()
        }
        return try allFriendRequestsResult.get()
    }

    // MARK: - Lecture par CURSEUR — servie pour de vrai (#4342)

    /// **Le pont du SDK rendait ce double AVEUGLE au-delà de la première page.**
    ///
    /// `FriendServiceProviding.friendRequests(direction:status:q:cursor:limit:)`
    /// a une implémentation par défaut : elle sert la première page depuis
    /// `allFriendRequests`, puis rend une page VIDE dès qu'un curseur est
    /// présent. C'est le bon repli pour un conformant HORS dépôt — mais pour un
    /// double du dépôt, c'est un piège : les trois suites qui prouvaient que la
    /// pagination DÉPASSE la première page ont cessé de le prouver **sans
    /// rougir**, puisque « une page, puis fin » est un scénario parfaitement
    /// valide. Trois écrans tronquaient leur liste à 100 relations et aucun test
    /// ne pouvait le dire.
    ///
    /// Ce double sert donc le curseur lui-même, et il l'encode comme le fait le
    /// gateway : **une POSITION**. Le décoder en décalage garde aux suites leur
    /// assertion la plus parlante — « le second appel demande ce qui vient APRÈS
    /// la première page » — au lieu d'un opaque qui ne dirait rien de faux mais
    /// rien d'utile non plus.
    static func cursor(forOffset offset: Int) -> String { "offset:\(offset)" }

    static func offset(fromCursor cursor: String?) -> Int {
        guard let cursor, cursor.hasPrefix("offset:"), let valeur = Int(cursor.dropFirst(7))
        else { return 0 }
        return valeur
    }

    /// Les curseurs REÇUS, dans l'ordre. `nil` en tête = la première page.
    var friendRequestsCursors: [String?] = []

    func friendRequests(
        direction: FriendRequestDirection,
        status: String?,
        q: String?,
        cursor: String?,
        limit: Int
    ) async throws -> PaginatedAPIResponse<[FriendRequest]> {
        friendRequestsCursors.append(cursor)
        let depart = Self.offset(fromCursor: cursor)
        let page = try await allFriendRequests(status: status, offset: depart, limit: limit)
        // `hasMore` absent ⇒ une page PLEINE veut dire « il en reste », une page
        // partielle veut dire la fin. C'est la règle que l'appelant applique ;
        // la répéter ici ferait DEUX règles à faire diverger, mais le double
        // doit bien produire un `nextCursor`, et il n'en produit un que sur la
        // même lecture — d'où la projection, jamais une seconde décision.
        let more = page.pagination?.hasMore ?? (page.data.count == limit)
        return PaginatedAPIResponse(
            success: page.success,
            data: page.data,
            pagination: CursorPagination(
                nextCursor: more ? Self.cursor(forOffset: depart + page.data.count) : nil,
                hasMore: more,
                limit: limit
            ),
            error: page.error
        )
    }

    func respond(requestId: String, accepted: Bool) async throws -> FriendRequest {
        respondCallCount += 1
        lastRespondRequestId = requestId
        lastRespondAccepted = accepted
        return try respondResult.get()
    }

    func deleteRequest(requestId: String) async throws {
        deleteCallCount += 1
        lastDeleteRequestId = requestId
        try deleteResult.get()
    }

    func sendEmailInvitation(email: String) async throws {
        sendEmailInvitationCallCount += 1
        lastInvitationEmail = email
        try sendEmailInvitationResult.get()
    }

    // MARK: - Reset

    func reset() {
        sendRequestCallCount = 0
        lastSendRequestReceiverId = nil
        receivedRequestsCallCount = 0
        lastReceivedOffset = nil
        lastReceivedLimit = nil
        sentRequestsCallCount = 0
        lastSentOffset = nil
        lastSentLimit = nil
        allFriendRequestsCallCount = 0
        lastAllFriendRequestsStatus = nil
        lastAllFriendRequestsOffset = nil
        lastAllFriendRequestsLimit = nil
        allFriendRequestsOffsets = []
        allFriendRequestsResults = []
        friendRequestsCursors = []
        respondCallCount = 0
        lastRespondRequestId = nil
        lastRespondAccepted = nil
        deleteCallCount = 0
        lastDeleteRequestId = nil
        sendEmailInvitationCallCount = 0
        lastInvitationEmail = nil
    }
}
