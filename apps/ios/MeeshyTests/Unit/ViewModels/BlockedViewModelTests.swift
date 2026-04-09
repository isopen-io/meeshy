import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class BlockedViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        blockService: MockBlockService = MockBlockService()
    ) -> (sut: BlockedViewModel, blockService: MockBlockService) {
        let sut = BlockedViewModel(blockService: blockService)
        return (sut, blockService)
    }

    private static func makeBlockedUser(id: String, username: String = "user") -> BlockedUser {
        JSONStub.decode("""
        {"id":"\(id)","username":"\(username)","displayName":null,"avatar":null,"blockedAt":"2026-01-01T00:00:00.000Z"}
        """)
    }

    // MARK: - loadBlocked

    func test_loadBlocked_success_populatesList() async {
        let (sut, mock) = makeSUT()
        let users = [Self.makeBlockedUser(id: "b1", username: "alice"), Self.makeBlockedUser(id: "b2", username: "bob")]
        mock.listBlockedUsersResult = .success(users)

        await sut.loadBlocked()

        XCTAssertEqual(sut.blockedUsers.count, 2)
        XCTAssertEqual(sut.blockedUsers[0].id, "b1")
        XCTAssertEqual(sut.blockedUsers[1].id, "b2")
        XCTAssertEqual(sut.loadState, .loaded)
        XCTAssertEqual(mock.listBlockedUsersCallCount, 1)
    }

    func test_loadBlocked_empty_setsLoadedWithEmptyList() async {
        let (sut, mock) = makeSUT()
        mock.listBlockedUsersResult = .success([])

        await sut.loadBlocked()

        XCTAssertTrue(sut.blockedUsers.isEmpty)
        XCTAssertEqual(sut.loadState, .loaded)
    }

    func test_loadBlocked_error_setsErrorState() async {
        let (sut, mock) = makeSUT()
        mock.listBlockedUsersResult = .failure(NSError(domain: "test", code: 500))

        await sut.loadBlocked()

        XCTAssertTrue(sut.blockedUsers.isEmpty)
        XCTAssertEqual(sut.loadState, .error("Erreur lors du chargement"))
    }

    // MARK: - unblock

    func test_unblock_success_removesFromList() async {
        let (sut, mock) = makeSUT()
        let users = [Self.makeBlockedUser(id: "b1"), Self.makeBlockedUser(id: "b2")]
        mock.listBlockedUsersResult = .success(users)
        await sut.loadBlocked()

        mock.unblockUserResult = .success(())
        await sut.unblock(userId: "b1")

        XCTAssertEqual(sut.blockedUsers.count, 1)
        XCTAssertEqual(sut.blockedUsers[0].id, "b2")
        XCTAssertEqual(mock.unblockUserCallCount, 1)
        XCTAssertEqual(mock.lastUnblockUserId, "b1")
    }

    func test_unblock_error_rollsBack() async {
        let (sut, mock) = makeSUT()
        let users = [Self.makeBlockedUser(id: "b1"), Self.makeBlockedUser(id: "b2")]
        mock.listBlockedUsersResult = .success(users)
        await sut.loadBlocked()

        mock.unblockUserResult = .failure(NSError(domain: "test", code: 500))
        await sut.unblock(userId: "b1")

        XCTAssertEqual(sut.blockedUsers.count, 2)
        XCTAssertEqual(sut.blockedUsers[0].id, "b1")
    }

    // MARK: - initial state

    func test_initialState_isIdle() {
        let (sut, _) = makeSUT()
        XCTAssertTrue(sut.blockedUsers.isEmpty)
        XCTAssertEqual(sut.loadState, .idle)
    }

    // MARK: - loadState transitions

    func test_loadState_transitionsToLoadingThenLoaded() async {
        let (sut, mock) = makeSUT()
        mock.listBlockedUsersResult = .success([])

        XCTAssertEqual(sut.loadState, .idle)
        await sut.loadBlocked()
        XCTAssertEqual(sut.loadState, .loaded)
    }
}
