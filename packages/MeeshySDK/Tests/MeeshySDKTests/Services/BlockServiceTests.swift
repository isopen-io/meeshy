import Combine
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

    func testBlockUserPutsToTheSetEndpoint() async throws {
        let blockResponse = BlockActionResponse(message: "User blocked")
        let response = APIResponse<BlockActionResponse>(success: true, data: blockResponse, error: nil)
        mock.stub("/directory/blocks/target123", result: response)

        try await service.blockUser(userId: "target123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/blocks/target123")
        // `PUT`, jamais `POST` : bloquer est une APPARTENANCE à un ensemble, et
        // le second appel doit rendre le même état — l'ancienne route répondait
        // 409 (#4164).
        XCTAssertEqual(mock.lastRequest?.method, "PUT")
    }

    func testBlockUserUpdatesLocalCache() async throws {
        let blockResponse = BlockActionResponse(message: "User blocked")
        let response = APIResponse<BlockActionResponse>(success: true, data: blockResponse, error: nil)
        mock.stub("/directory/blocks/target123", result: response)

        XCTAssertFalse(service.isBlocked(userId: "target123"))

        try await service.blockUser(userId: "target123")

        let svc = service!
        let isBlocked = await MainActor.run { svc.isBlocked(userId: "target123") }
        XCTAssertTrue(isBlocked)
    }

    // MARK: - unblockUser

    func testUnblockUserCallsDeleteOnBlockEndpoint() async throws {
        // `BlockActionResponse`, comme son jumeau — le gateway rend
        // `{ "message": … }` sur les deux verbes. Un type trop STRICT ici a
        // déjà transformé un succès serveur en « impossible de débloquer ».
        let response = APIResponse<BlockActionResponse>(success: true, data: BlockActionResponse(message: "User unblocked"), error: nil)
        mock.stub("/directory/blocks/target123", result: response)

        try await service.unblockUser(userId: "target123")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/blocks/target123")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    func testUnblockUserRemovesFromLocalCache() async throws {
        let blockResponse = BlockActionResponse(message: "blocked")
        let blockAPIResponse = APIResponse<BlockActionResponse>(success: true, data: blockResponse, error: nil)
        mock.stub("/directory/blocks/target123", result: blockAPIResponse)
        try await service.blockUser(userId: "target123")

        let deleteResponse = APIResponse<BlockActionResponse>(success: true, data: BlockActionResponse(message: "User unblocked"), error: nil)
        mock.stub("/directory/blocks/target123", result: deleteResponse)

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
        mock.stub("/directory/blocks", result: response)

        let result = try await service.listBlockedUsers()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/blocks")
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
        mock.stub("/directory/blocks", result: response)

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
        mock.stub("/directory/blocks", result: response)

        await service.refreshCache()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/directory/blocks")

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

    // MARK: - setBlockedOptimistic (R6-4 — outbox-routed block/unblock)

    /// R6-4 — le chemin outbox (`OfflineQueue.enqueue(.blockUser)`) ne peut PAS
    /// appeler `blockUser(userId:)` (celui-ci fait le POST réseau, doublon du
    /// dispatcher). Il lui faut une mutation PUREMENT LOCALE de la blocklist
    /// canonique pour que les swipe labels (`isBlocked`) reflètent l'état
    /// optimiste — et sa réciproque pour le rollback sur `.exhausted`.
    @MainActor
    func test_setBlockedOptimistic_flipsBlockedUserIds_withoutNetwork() async {
        XCTAssertFalse(service.isBlocked(userId: "u-opt"))

        service.setBlockedOptimistic(userId: "u-opt", blocked: true)
        XCTAssertTrue(service.isBlocked(userId: "u-opt"),
            "optimistic block must flip blockedUserIds locally")
        XCTAssertEqual(mock.requestCount, 0,
            "the optimistic setter must NOT hit the network (the dispatcher owns the POST)")

        service.setBlockedOptimistic(userId: "u-opt", blocked: false)
        XCTAssertFalse(service.isBlocked(userId: "u-opt"),
            "optimistic unblock (rollback) must remove the id")
    }

    // MARK: - reset (P1 — session quiesce on logout)

    /// Prouve que `reset()` purge la blocklist en mémoire pour qu'un user B
    /// qui se connecte sur le même device ne voie pas la blocklist du user A
    /// avant le prochain refresh réseau. Câblé depuis `AuthManager.logout()`.
    func testResetClearsBlockedUserIds() async throws {
        let blocked = BlockedUser(id: "u1", username: "blocked1", displayName: nil, avatar: nil, blockedAt: nil)
        let response = APIResponse<[BlockedUser]>(success: true, data: [blocked], error: nil)
        mock.stub("/directory/blocks", result: response)
        await service.refreshCache()

        let svc = service!
        let preReset = await MainActor.run { svc.isBlocked(userId: "u1") }
        XCTAssertTrue(preReset, "precondition: u1 should be blocked before reset")

        await service.reset()

        let postReset = await MainActor.run { svc.isBlocked(userId: "u1") }
        XCTAssertFalse(postReset, "blockedUserIds should be empty after reset()")
    }

    // MARK: - ObservableObject contract

    func test_blockUser_sendsObjectWillChangeOnMainBeforeTheIdIsVisible() async throws {
        mock.stub("/directory/blocks/t1", result: APIResponse<BlockActionResponse>(success: true, data: BlockActionResponse(message: nil), error: nil))
        let svc = service!
        let observed = Locked<[(onMain: Bool, visible: Bool)]>(uncheckedState: [])
        let cancellable = svc.objectWillChange.sink {
            let onMain = Thread.isMainThread
            let visible = svc.isBlocked(userId: "t1")
            observed.mutateUnchecked { $0.append((onMain, visible)) }
        }

        try await svc.blockUser(userId: "t1")

        let signals = observed.read { $0.map { [$0.onMain, $0.visible] } }
        XCTAssertEqual(signals, [[true, false]])
        XCTAssertTrue(svc.isBlocked(userId: "t1"))
        cancellable.cancel()
    }

    @MainActor
    func test_setBlockedOptimistic_andReset_eachSendOneWillChange() async {
        let svc = service!
        var signals = 0
        let cancellable = svc.objectWillChange.sink { signals += 1 }

        svc.setBlockedOptimistic(userId: "a", blocked: true)
        svc.setBlockedOptimistic(userId: "a", blocked: false)
        await svc.reset()

        XCTAssertEqual(signals, 3)
        XCTAssertEqual(svc.blockedUserIds, [])
        cancellable.cancel()
    }

    @MainActor
    func test_listBlockedUsers_replacesTheSetWithOneWillChange() async throws {
        let svc = service!
        svc.setBlockedOptimistic(userId: "a", blocked: true)
        let users = [BlockedUser(id: "b", username: "b"), BlockedUser(id: "c", username: "c")]
        mock.stub("/directory/blocks", result: APIResponse<[BlockedUser]>(success: true, data: users, error: nil))
        var signals = 0
        let cancellable = svc.objectWillChange.sink { signals += 1 }

        _ = try await svc.listBlockedUsers()

        XCTAssertEqual(svc.blockedUserIds, ["b", "c"])
        XCTAssertEqual(signals, 1)
        cancellable.cancel()
    }

    func test_isBlocked_concurrentReadsWhileMainActorMutates_isConsistent() async {
        let svc = service!
        await withTaskGroup(of: Void.self) { group in
            for index in 0..<100 {
                group.addTask { _ = svc.isBlocked(userId: "u\(index)"); _ = svc.blockedUserIds }
                group.addTask { @MainActor in svc.setBlockedOptimistic(userId: "u\(index)", blocked: true) }
            }
        }
        XCTAssertEqual(svc.blockedUserIds.count, 100)
    }
}
