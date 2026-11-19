import XCTest
@testable import MeeshySDK

final class CommunityServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: CommunityService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = CommunityService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeCommunity(id: String = "comm1", name: String = "Test Community") -> APICommunity {
        APICommunity(
            id: id, identifier: "test-community", name: name,
            description: "A test community", avatar: nil, banner: nil,
            isPrivate: false, createdBy: "user1",
            createdAt: Date(), updatedAt: nil,
            creator: nil, members: nil, _count: nil,
            memberCount: nil, conversationCount: nil
        )
    }

    private func makeMember(id: String = "mem1", communityId: String = "comm1") -> APICommunityMember {
        APICommunityMember(
            id: id, communityId: communityId, userId: "user1",
            role: "member", joinedAt: Date(), user: nil
        )
    }

    // MARK: - list

    func test_list_callsCorrectEndpoint() async throws {
        let response = OffsetPaginatedAPIResponse<[APICommunity]>(
            success: true, data: [makeCommunity()], pagination: nil, error: nil
        )
        mock.stub("/communities", result: response)

        let result = try await service.list()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.data.count, 1)
    }

    func test_list_propagatesError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.list()
            XCTFail("Expected error")
        } catch {
            // expected
        }
    }

    // MARK: - get

    func test_get_callsCorrectEndpoint() async throws {
        let community = makeCommunity(id: "comm42", name: "Specific")
        let response = APIResponse<APICommunity>(success: true, data: community, error: nil)
        mock.stub("/communities/comm42", result: response)

        let result = try await service.get(communityId: "comm42")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities/comm42")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.name, "Specific")
    }

    func test_get_propagatesError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 404, message: "Not found")

        do {
            _ = try await service.get(communityId: "missing")
            XCTFail("Expected error")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 404)
            } else {
                XCTFail("Expected server error")
            }
        } catch {
            XCTFail("Expected MeeshyError")
        }
    }

    // MARK: - create

    func test_create_callsCorrectEndpoint() async throws {
        let community = makeCommunity(id: "new1", name: "New Community")
        let response = APIResponse<APICommunity>(success: true, data: community, error: nil)
        mock.stub("/communities", result: response)

        let result = try await service.create(name: "New Community")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(result.name, "New Community")
    }

    // MARK: - update

    func test_update_callsCorrectEndpoint() async throws {
        let community = makeCommunity(id: "comm1", name: "Updated")
        let response = APIResponse<APICommunity>(success: true, data: community, error: nil)
        mock.stub("/communities/comm1", result: response)

        let result = try await service.update(communityId: "comm1", name: "Updated")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities/comm1")
        XCTAssertEqual(mock.lastRequest?.method, "PUT")
        XCTAssertEqual(result.name, "Updated")
    }

    // MARK: - delete

    func test_delete_callsCorrectEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["success": true], error: nil)
        mock.stub("/communities/comm1", result: response)

        try await service.delete(communityId: "comm1")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities/comm1")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    func test_delete_propagatesError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 403, message: "Forbidden")

        do {
            try await service.delete(communityId: "comm1")
            XCTFail("Expected error")
        } catch {
            // expected
        }
    }

    // MARK: - getMembers

    func test_getMembers_callsCorrectEndpoint() async throws {
        let response = OffsetPaginatedAPIResponse<[APICommunityMember]>(
            success: true, data: [makeMember()], pagination: nil, error: nil
        )
        mock.stub("/communities/comm1/members", result: response)

        let result = try await service.getMembers(communityId: "comm1")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities/comm1/members")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.data.count, 1)
    }

    // MARK: - addMember

    func test_addMember_callsCorrectEndpoint() async throws {
        let member = makeMember(id: "mem2")
        let response = APIResponse<APICommunityMember>(success: true, data: member, error: nil)
        mock.stub("/communities/comm1/members", result: response)

        let result = try await service.addMember(communityId: "comm1", userId: "user2")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities/comm1/members")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(result.id, "mem2")
    }

    // MARK: - removeMember

    func test_removeMember_callsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: DiscardedResponseBody(), error: nil)
        mock.stub("/communities/comm1/members/user2", result: response)

        try await service.removeMember(communityId: "comm1", userId: "user2")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities/comm1/members/user2")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    // MARK: - join

    func test_join_callsCorrectEndpoint() async throws {
        mock.stubWire("/communities/comm1/join", json: """
        {"success":true,"data":{"id":"mem1","communityId":"comm1","userId":"user1","role":"member"}}
        """)

        let result = try await service.join(communityId: "comm1")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities/comm1/join")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        guard case .joined(let member) = result else { return XCTFail("attendu : membre écrit, reçu \(result)") }
        XCTAssertEqual(member.id, "mem1")
        XCTAssertTrue(result.isJoined)
    }

    func test_join_announcesThatItReadsAPendingRequest() async throws {
        mock.stubWire("/communities/comm1/join", json: """
        {"success":true,"data":{"status":"pending","requestId":"req-9"}}
        """)

        _ = try await service.join(communityId: "comm1")

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["acceptsPending"] as? Bool, true)
    }

    func test_join_communityThatValidatesEachEntry_decodesThePendingRequest() async throws {
        mock.stubWire("/communities/comm1/join", json: """
        {"success":true,"data":{"status":"pending","requestId":"req-9"}}
        """)

        let result = try await service.join(communityId: "comm1")

        guard case .pending(let requestId) = result else { return XCTFail("attendu : demande en attente, reçu \(result)") }
        XCTAssertEqual(requestId, "req-9")
        XCTAssertFalse(result.isJoined)
    }

    func test_joinRefusal_cooldownCode_isReadFromTheForbiddenBody() {
        let body = Data(#"{"success":false,"error":"Your last request to join was declined recently","code":"COMMUNITY_JOIN_COOLDOWN"}"#.utf8)

        XCTAssertEqual(CommunityJoinRefusal.classify(MeeshyError.forbidden(reason: nil, body: body)), .cooldown)
    }

    func test_joinRefusal_otherForbidden_isNotACooldown() {
        let body = Data(#"{"success":false,"error":"Cannot join a private community without an invite"}"#.utf8)

        XCTAssertNil(CommunityJoinRefusal.classify(MeeshyError.forbidden(reason: nil, body: body)))
        XCTAssertNil(CommunityJoinRefusal.classify(MeeshyError.server(statusCode: 500, message: "boom")))
    }

    func test_get_decodesTheReadersPendingRequest() async throws {
        mock.stubWire("/communities/comm1", json: """
        {"success":true,"data":{"id":"comm1","identifier":"mshy_comm1","name":"Alpha","isPrivate":false,
         "createdBy":"u","createdAt":"2026-09-01T10:00:00.000Z","requiresJoinApproval":true,"currentUserJoinRequest":"pending"}}
        """)

        let community = try await service.get(communityId: "comm1")

        XCTAssertEqual(community.requiresJoinApproval, true)
        XCTAssertEqual(community.currentUserJoinRequest, "pending")
    }

    // MARK: - leave

    func test_leave_callsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: DiscardedResponseBody(), error: nil)
        mock.stub("/communities/comm1/leave", result: response)

        try await service.leave(communityId: "comm1")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities/comm1/leave")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    // MARK: - checkIdentifier

    func test_checkIdentifier_callsCorrectEndpoint() async throws {
        let availability = IdentifierAvailability(available: true, identifier: "my-community")
        let response = APIResponse<IdentifierAvailability>(success: true, data: availability, error: nil)
        mock.stub("/communities/check-identifier/my-community", result: response)

        let result = try await service.checkIdentifier("my-community")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/communities/check-identifier/my-community")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertTrue(result.available)
        XCTAssertEqual(result.identifier, "my-community")
    }

    func test_checkIdentifier_returnsUnavailable() async throws {
        let availability = IdentifierAvailability(available: false, identifier: "taken")
        let response = APIResponse<IdentifierAvailability>(success: true, data: availability, error: nil)
        mock.stub("/communities/check-identifier/taken", result: response)

        let result = try await service.checkIdentifier("taken")

        XCTAssertFalse(result.available)
    }

    func test_checkIdentifier_propagatesError() async {
        mock.errorToThrow = MeeshyError.network(.timeout)

        do {
            _ = try await service.checkIdentifier("test")
            XCTFail("Expected error")
        } catch {
            // expected
        }
    }
}
