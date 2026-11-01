import XCTest
@testable import MeeshySDK

/// `targetLevel` d'une demande de cran (#13938, #13933) : absent = Ami, le sens
/// historique — le corps d'une demande simple ne change donc pas d'un octet.
final class FriendServiceTargetLevelTests: XCTestCase {

    private func makeSUT() -> (service: FriendService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (FriendService(api: api), api)
    }

    private func stubRequest(_ api: MockAPIClient, targetLevel: String?) throws {
        let json = """
        {"id":"fr-1","senderId":"me","receiverId":"u2","status":"pending","createdAt":"2026-11-01T10:00:00Z"
        \(targetLevel.map { #","targetLevel":"\#($0)""# } ?? "")}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let request = try decoder.decode(FriendRequest.self, from: Data(json.utf8))
        api.stub("/directory/friend-requests", result: APIResponse<FriendRequest>(success: true, data: request, error: nil))
    }

    func test_sendWithATargetLevel_putsItOnTheWire() async throws {
        let (service, api) = makeSUT()
        try stubRequest(api, targetLevel: "CLOSE")

        let sent = try await service.sendFriendRequest(receiverId: "u2", message: nil, targetLevel: .close)

        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["receiverId"] as? String, "u2")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["targetLevel"] as? String, "CLOSE")
        XCTAssertEqual(sent.requestedLevel, .close)
    }

    func test_sendWithoutATargetLevel_keepsTheHistoricalBody() async throws {
        let (service, api) = makeSUT()
        try stubRequest(api, targetLevel: nil)

        let sent = try await service.sendFriendRequest(receiverId: "u2", message: "salut")

        XCTAssertNil(api.lastRequest?.bodyJSON?["targetLevel"])
        XCTAssertEqual(api.lastRequest?.bodyJSON?["message"] as? String, "salut")
        XCTAssertEqual(sent.requestedLevel, .friend)
    }

    func test_anUnreadableTargetLevelIsNotACrane() throws {
        let json = #"{"id":"fr-1","senderId":"a","receiverId":"b","status":"pending","createdAt":"2026-11-01T10:00:00Z","targetLevel":"ATOM"}"#
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let request = try decoder.decode(FriendRequest.self, from: Data(json.utf8))
        XCTAssertNil(request.requestedLevel)
    }

    func test_theOutboxPayloadCarriesTheLevel_andAnOldRowStillDecodes() throws {
        let payload = SendFriendRequestPayload(clientMutationId: "c", targetUserId: "u2", targetLevel: "BLOOD")
        let decoded = try JSONDecoder().decode(SendFriendRequestPayload.self, from: JSONEncoder().encode(payload))
        XCTAssertEqual(decoded.targetLevel, "BLOOD")

        let old = try JSONDecoder().decode(
            SendFriendRequestPayload.self, from: Data(#"{"clientMutationId":"c","targetUserId":"u2"}"#.utf8))
        XCTAssertNil(old.targetLevel)
    }
}
