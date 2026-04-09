import XCTest
@testable import MeeshySDK

final class FriendshipCacheTests: XCTestCase {

    private func makeSUT() -> FriendshipCache {
        let cache = FriendshipCache.shared
        cache.clear()
        return cache
    }

    // MARK: - Default State

    func test_status_unknownUser_returnsNone() {
        let sut = makeSUT()
        XCTAssertEqual(sut.status(for: "unknown-user"), .none)
    }

    func test_isFriend_unknownUser_returnsFalse() {
        let sut = makeSUT()
        XCTAssertFalse(sut.isFriend("unknown-user"))
    }

    func test_isHydrated_afterClear_returnsFalse() {
        let sut = makeSUT()
        XCTAssertFalse(sut.isHydrated)
    }

    func test_friendCount_afterClear_returnsZero() {
        let sut = makeSUT()
        XCTAssertEqual(sut.friendCount, 0)
    }

    func test_pendingReceivedCount_afterClear_returnsZero() {
        let sut = makeSUT()
        XCTAssertEqual(sut.pendingReceivedCount, 0)
    }

    // MARK: - didSendRequest

    func test_didSendRequest_setsStatusToPendingSent() {
        let sut = makeSUT()
        sut.didSendRequest(to: "user-1", requestId: "req-1")
        XCTAssertEqual(sut.status(for: "user-1"), .pendingSent(requestId: "req-1"))
    }

    func test_didSendRequest_doesNotMakeUserFriend() {
        let sut = makeSUT()
        sut.didSendRequest(to: "user-1", requestId: "req-1")
        XCTAssertFalse(sut.isFriend("user-1"))
    }

    // MARK: - didAcceptRequest

    func test_didAcceptRequest_setsStatusToFriend() {
        let sut = makeSUT()
        sut.didReceiveRequest(from: "user-2", requestId: "req-2")
        sut.didAcceptRequest(from: "user-2")
        XCTAssertEqual(sut.status(for: "user-2"), .friend)
    }

    func test_didAcceptRequest_makesIsFriendTrue() {
        let sut = makeSUT()
        sut.didReceiveRequest(from: "user-2", requestId: "req-2")
        sut.didAcceptRequest(from: "user-2")
        XCTAssertTrue(sut.isFriend("user-2"))
    }

    func test_didAcceptRequest_incrementsFriendCount() {
        let sut = makeSUT()
        sut.didAcceptRequest(from: "user-2")
        XCTAssertEqual(sut.friendCount, 1)
    }

    func test_didAcceptRequest_removesPendingReceived() {
        let sut = makeSUT()
        sut.didReceiveRequest(from: "user-2", requestId: "req-2")
        XCTAssertEqual(sut.pendingReceivedCount, 1)
        sut.didAcceptRequest(from: "user-2")
        XCTAssertEqual(sut.pendingReceivedCount, 0)
    }

    // MARK: - didRejectRequest

    func test_didRejectRequest_setsStatusToNone() {
        let sut = makeSUT()
        sut.didReceiveRequest(from: "user-3", requestId: "req-3")
        sut.didRejectRequest(from: "user-3")
        XCTAssertEqual(sut.status(for: "user-3"), .none)
    }

    func test_didRejectRequest_decrementsPendingReceivedCount() {
        let sut = makeSUT()
        sut.didReceiveRequest(from: "user-3", requestId: "req-3")
        sut.didRejectRequest(from: "user-3")
        XCTAssertEqual(sut.pendingReceivedCount, 0)
    }

    // MARK: - didReceiveRequest

    func test_didReceiveRequest_setsStatusToPendingReceived() {
        let sut = makeSUT()
        sut.didReceiveRequest(from: "user-4", requestId: "req-4")
        XCTAssertEqual(sut.status(for: "user-4"), .pendingReceived(requestId: "req-4"))
    }

    func test_didReceiveRequest_incrementsPendingReceivedCount() {
        let sut = makeSUT()
        sut.didReceiveRequest(from: "user-4", requestId: "req-4")
        XCTAssertEqual(sut.pendingReceivedCount, 1)
    }

    // MARK: - didCancelRequest

    func test_didCancelRequest_setsStatusToNone() {
        let sut = makeSUT()
        sut.didSendRequest(to: "user-5", requestId: "req-5")
        sut.didCancelRequest(to: "user-5")
        XCTAssertEqual(sut.status(for: "user-5"), .none)
    }

    // MARK: - Rollbacks

    func test_rollbackSendRequest_revertsToNone() {
        let sut = makeSUT()
        sut.didSendRequest(to: "user-6", requestId: "req-6")
        sut.rollbackSendRequest(to: "user-6")
        XCTAssertEqual(sut.status(for: "user-6"), .none)
    }

    func test_rollbackAccept_revertsToPendingReceived() {
        let sut = makeSUT()
        sut.didReceiveRequest(from: "user-7", requestId: "req-7")
        sut.didAcceptRequest(from: "user-7")
        XCTAssertEqual(sut.status(for: "user-7"), .friend)

        sut.rollbackAccept(senderId: "user-7", requestId: "req-7")
        XCTAssertEqual(sut.status(for: "user-7"), .pendingReceived(requestId: "req-7"))
        XCTAssertFalse(sut.isFriend("user-7"))
    }

    func test_rollbackReject_revertsToPendingReceived() {
        let sut = makeSUT()
        sut.didReceiveRequest(from: "user-8", requestId: "req-8")
        sut.didRejectRequest(from: "user-8")
        XCTAssertEqual(sut.status(for: "user-8"), .none)

        sut.rollbackReject(senderId: "user-8", requestId: "req-8")
        XCTAssertEqual(sut.status(for: "user-8"), .pendingReceived(requestId: "req-8"))
    }

    // MARK: - clear

    func test_clear_resetsEverything() {
        let sut = makeSUT()
        sut.didSendRequest(to: "a", requestId: "r1")
        sut.didReceiveRequest(from: "b", requestId: "r2")
        sut.didAcceptRequest(from: "c")

        sut.clear()

        XCTAssertEqual(sut.status(for: "a"), .none)
        XCTAssertEqual(sut.status(for: "b"), .none)
        XCTAssertEqual(sut.status(for: "c"), .none)
        XCTAssertFalse(sut.isHydrated)
        XCTAssertEqual(sut.friendCount, 0)
        XCTAssertEqual(sut.pendingReceivedCount, 0)
        XCTAssertTrue(sut.friendIds.isEmpty)
    }

    // MARK: - friendIds

    func test_friendIds_containsAcceptedUsers() {
        let sut = makeSUT()
        sut.didAcceptRequest(from: "friend-1")
        sut.didAcceptRequest(from: "friend-2")
        XCTAssertTrue(sut.friendIds.contains("friend-1"))
        XCTAssertTrue(sut.friendIds.contains("friend-2"))
        XCTAssertEqual(sut.friendIds.count, 2)
    }
}
