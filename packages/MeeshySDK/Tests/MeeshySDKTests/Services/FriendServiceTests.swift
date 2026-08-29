import XCTest
@testable import MeeshySDK

final class FriendServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: FriendService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = FriendService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeFriendRequest(id: String = "fr-1", status: String = "pending") -> FriendRequest {
        let json: [String: Any] = [
            "id": id,
            "senderId": "user-1",
            "receiverId": "user-2",
            "status": status,
            "createdAt": "2026-01-01T00:00:00Z"
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(FriendRequest.self, from: data)
    }

    // MARK: - sendFriendRequest

    func test_sendFriendRequest_success_callsPostEndpoint() async throws {
        let fr = makeFriendRequest()
        let response = APIResponse<FriendRequest>(success: true, data: fr, error: nil)
        mock.stub("/directory/friend-requests", result: response)

        let result = try await service.sendFriendRequest(receiverId: "user-2", message: "Hi!")

        XCTAssertEqual(mock.requestCount, 1)
        // L'unique chemin d'envoi (#4162) : celui que ce site appelait était le
        // plus faible des deux qui coexistaient — ni auto-envoi, ni
        // désactivation, ni blocage.
        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/friend-requests")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(result.id, "fr-1")
        XCTAssertEqual(result.status, "pending")
    }

    func test_sendFriendRequest_withoutMessage_succeeds() async throws {
        let fr = makeFriendRequest()
        let response = APIResponse<FriendRequest>(success: true, data: fr, error: nil)
        mock.stub("/directory/friend-requests", result: response)

        let result = try await service.sendFriendRequest(receiverId: "user-2")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(result.senderId, "user-1")
    }

    // MARK: - receivedRequests

    func test_receivedRequests_success_callsCorrectEndpoint() async throws {
        let fr = makeFriendRequest()
        let pagination = OffsetPagination(total: 1, hasMore: false, limit: 20, offset: 0)
        let response = OffsetPaginatedAPIResponse<[FriendRequest]>(
            success: true, data: [fr], pagination: pagination, error: nil
        )
        mock.stub("/friend-requests/received", result: response)

        let result = try await service.receivedRequests()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/friend-requests/received")
        XCTAssertEqual(result.data.count, 1)
    }

    // MARK: - sentRequests

    func test_sentRequests_success_callsCorrectEndpoint() async throws {
        let fr = makeFriendRequest()
        let pagination = OffsetPagination(total: 1, hasMore: false, limit: 20, offset: 0)
        let response = OffsetPaginatedAPIResponse<[FriendRequest]>(
            success: true, data: [fr], pagination: pagination, error: nil
        )
        mock.stub("/friend-requests/sent", result: response)

        let result = try await service.sentRequests()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/friend-requests/sent")
        XCTAssertEqual(result.data.count, 1)
    }

    // MARK: - allFriendRequests

    func test_allFriendRequests_callsUsersEndpoint_withStatusFilter() async throws {
        let pagination = OffsetPagination(total: 0, hasMore: false, limit: 100, offset: 0)
        let response = OffsetPaginatedAPIResponse<[FriendRequest]>(
            success: true, data: [], pagination: pagination, error: nil
        )
        mock.stub("/users/friend-requests", result: response)

        _ = try await service.allFriendRequests(status: "accepted", offset: 0, limit: 100)

        XCTAssertEqual(
            mock.lastRequest?.endpoint, "/users/friend-requests",
            "les deux sens ne sont rendus que par /users/friend-requests — /friend-requests/received filtre pending en dur"
        )
        XCTAssertTrue(
            mock.lastRequest?.queryItems?.contains(URLQueryItem(name: "status", value: "accepted")) ?? false,
            "le statut doit voyager en query item, jamais concatene dans l'endpoint (perdu par components.queryItems = ... dans APIClient)"
        )
    }

    // MARK: - respond

    func test_respond_accepted_callsPatchEndpoint() async throws {
        let fr = makeFriendRequest(id: "fr-5", status: "accepted")
        let response = APIResponse<FriendRequest>(success: true, data: fr, error: nil)
        mock.stub("/directory/friend-requests/fr-5", result: response)

        let result = try await service.respond(requestId: "fr-5", accepted: true)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/friend-requests/fr-5")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
        XCTAssertEqual(result.status, "accepted")
    }

    func test_respond_rejected_callsPatchEndpoint() async throws {
        let fr = makeFriendRequest(id: "fr-6", status: "rejected")
        let response = APIResponse<FriendRequest>(success: true, data: fr, error: nil)
        mock.stub("/directory/friend-requests/fr-6", result: response)

        let result = try await service.respond(requestId: "fr-6", accepted: false)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/friend-requests/fr-6")
        XCTAssertEqual(result.status, "rejected")
    }

    // MARK: - deleteRequest

    func test_deleteRequest_dismissesThroughTheSingleVerb() async throws {
        // Un geste, un verbe (#4162) : le `DELETE` séparé disparaît au profit
        // de `PATCH … {action: "dismiss"}`. La réponse porte `{id, deleted,
        // message}` — décodée comme telle, et non en dictionnaire de booléens :
        // un type trop STRICT transforme un succès serveur en échec client.
        let response = APIResponse<FriendRequestActionResult>(
            success: true,
            data: FriendRequestActionResult(id: "fr-9", deleted: true, message: "Demande d'ami supprimee"),
            error: nil
        )
        mock.stub("/directory/friend-requests/fr-9", result: response)

        try await service.deleteRequest(requestId: "fr-9")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/friend-requests/fr-9")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
    }

    // MARK: - sendEmailInvitation

    func test_sendEmailInvitation_success_callsPostEndpoint() async throws {
        let invResponse: [String: Any] = ["email": "test@example.com"]
        let invData = try! JSONSerialization.data(withJSONObject: invResponse)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let inv = try! decoder.decode(EmailInvitationResponse.self, from: invData)
        let response = APIResponse<EmailInvitationResponse>(success: true, data: inv, error: nil)
        mock.stub("/invitations/email", result: response)

        try await service.sendEmailInvitation(email: "test@example.com")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/invitations/email")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - Error handling

    func test_sendFriendRequest_networkError_throws() async {
        mock.errorToThrow = MeeshyError.network(.timeout)

        do {
            _ = try await service.sendFriendRequest(receiverId: "x")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.timeout) = error { } else {
                XCTFail("Expected network timeout, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }

    func test_deleteRequest_authError_throws() async {
        mock.errorToThrow = MeeshyError.auth(.sessionExpired)

        do {
            try await service.deleteRequest(requestId: "fr-1")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.sessionExpired) = error { } else {
                XCTFail("Expected auth sessionExpired, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }
}
