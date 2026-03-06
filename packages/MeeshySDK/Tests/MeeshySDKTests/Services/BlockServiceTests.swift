import XCTest
@testable import MeeshySDK

final class BlockServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: BlockService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = BlockService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - blockUser

    func testBlockUserPostsToBlockEndpoint() async throws {
        let blockResponse = BlockActionResponse(message: "User blocked")
        let response = APIResponse<BlockActionResponse>(success: true, data: blockResponse, error: nil)
        mock.stub("/users/target123/block", result: response)

        try await service.blockUser(userId: "target123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/target123/block")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func testBlockUserUpdatesLocalCache() async throws {
        let blockResponse = BlockActionResponse(message: "User blocked")
        let response = APIResponse<BlockActionResponse>(success: true, data: blockResponse, error: nil)
        mock.stub("/users/target123/block", result: response)

        XCTAssertFalse(service.isBlocked(userId: "target123"))

        try await service.blockUser(userId: "target123")

        let svc = service!
        let isBlocked = await MainActor.run { svc.isBlocked(userId: "target123") }
        XCTAssertTrue(isBlocked)
    }

    // MARK: - unblockUser

    func testUnblockUserCallsDeleteOnBlockEndpoint() async throws {
        let response = APIResponse<[String: Bool]>(success: true, data: ["success": true], error: nil)
        mock.stub("/users/target123/block", result: response)

        try await service.unblockUser(userId: "target123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/target123/block")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    func testUnblockUserRemovesFromLocalCache() async throws {
        let blockResponse = BlockActionResponse(message: "blocked")
        let blockAPIResponse = APIResponse<BlockActionResponse>(success: true, data: blockResponse, error: nil)
        mock.stub("/users/target123/block", result: blockAPIResponse)
        try await service.blockUser(userId: "target123")

        let deleteResponse = APIResponse<[String: Bool]>(success: true, data: ["success": true], error: nil)
        mock.stub("/users/target123/block", result: deleteResponse)

        try await service.unblockUser(userId: "target123")

        let svc = service!
        let isBlocked = await MainActor.run { svc.isBlocked(userId: "target123") }
        XCTAssertFalse(isBlocked)
    }

    // MARK: - listBlockedUsers

    func testListBlockedUsersReturnsArrayAndUpdatesCache() async throws {
        let blocked1 = BlockedUser(id: "u1", username: "blocked1", displayName: "Blocked One", avatar: nil, blockedAt: nil)
        let blocked2 = BlockedUser(id: "u2", username: "blocked2", displayName: nil, avatar: nil, blockedAt: nil)
        let response = APIResponse<[BlockedUser]>(success: true, data: [blocked1, blocked2], error: nil)
        mock.stub("/users/me/blocked-users", result: response)

        let result = try await service.listBlockedUsers()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/blocked-users")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result[0].username, "blocked1")
        XCTAssertEqual(result[0].name, "Blocked One")
        XCTAssertEqual(result[1].name, "blocked2")

        let svc = service!
        let u1Blocked = await MainActor.run { svc.isBlocked(userId: "u1") }
        let u2Blocked = await MainActor.run { svc.isBlocked(userId: "u2") }
        let u3Blocked = await MainActor.run { svc.isBlocked(userId: "u3") }
        XCTAssertTrue(u1Blocked)
        XCTAssertTrue(u2Blocked)
        XCTAssertFalse(u3Blocked)
    }

    func testListBlockedUsersWithEmptyList() async throws {
        let response = APIResponse<[BlockedUser]>(success: true, data: [], error: nil)
        mock.stub("/users/me/blocked-users", result: response)

        let result = try await service.listBlockedUsers()

        XCTAssertTrue(result.isEmpty)
    }

    // MARK: - isBlocked

    func testIsBlockedReturnsFalseByDefault() {
        XCTAssertFalse(service.isBlocked(userId: "unknown"))
    }

    // MARK: - refreshCache

    func testRefreshCacheCallsListBlockedUsers() async throws {
        let blocked = BlockedUser(id: "u1", username: "cached", displayName: nil, avatar: nil, blockedAt: nil)
        let response = APIResponse<[BlockedUser]>(success: true, data: [blocked], error: nil)
        mock.stub("/users/me/blocked-users", result: response)

        await service.refreshCache()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/users/me/blocked-users")

        let svc = service!
        let isBlocked = await MainActor.run { svc.isBlocked(userId: "u1") }
        XCTAssertTrue(isBlocked)
    }

    func testRefreshCacheDoesNotThrowOnError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        await service.refreshCache()

        XCTAssertEqual(mock.requestCount, 1)
    }

    // MARK: - Error handling

    func testBlockUserPropagatesError() async {
        mock.errorToThrow = MeeshyError.auth(.sessionExpired)

        do {
            try await service.blockUser(userId: "target")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.sessionExpired) = error {
                // expected
            } else {
                XCTFail("Expected auth sessionExpired, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func testUnblockUserPropagatesError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 404, message: "Not found")

        do {
            try await service.unblockUser(userId: "target")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 404)
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }
}
