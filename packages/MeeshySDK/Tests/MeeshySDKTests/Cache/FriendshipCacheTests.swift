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

    // MARK: - didRemoveFriend

    func test_didRemoveFriend_dropsUserFromFriendSet() {
        let sut = makeSUT()
        sut.didAcceptRequest(from: "friend-x")
        XCTAssertTrue(sut.isFriend("friend-x"))

        sut.didRemoveFriend("friend-x")

        XCTAssertFalse(sut.isFriend("friend-x"))
        XCTAssertEqual(sut.status(for: "friend-x"), .none)
    }

    // MARK: - version (reactive observation)

    /// Every mutation must bump `version` on the main actor. ViewModels rely
    /// on this — they subscribe to `$version` to re-render the rest of the
    /// app when the cache changes, instead of polling.
    @MainActor
    func test_version_incrementsOnEachMutation() async {
        let sut = makeSUT()
        await yieldMainActor()
        let initial = sut.version

        sut.didSendRequest(to: "v1", requestId: "r1")
        await yieldMainActor()
        XCTAssertGreaterThan(sut.version, initial, "didSendRequest must bump version")

        let afterSend = sut.version
        sut.didReceiveRequest(from: "v2", requestId: "r2")
        await yieldMainActor()
        XCTAssertGreaterThan(sut.version, afterSend, "didReceiveRequest must bump version")

        let afterReceive = sut.version
        sut.didAcceptRequest(from: "v2")
        await yieldMainActor()
        XCTAssertGreaterThan(sut.version, afterReceive, "didAcceptRequest must bump version")

        let afterAccept = sut.version
        sut.didCancelRequest(to: "v1")
        await yieldMainActor()
        XCTAssertGreaterThan(sut.version, afterAccept, "didCancelRequest must bump version")
    }

    /// `clear()` is also a mutation — observers (eg. logout flows that flush
    /// per-user UI state) must see the bump too.
    @MainActor
    func test_version_incrementsOnClear() async {
        let sut = makeSUT()
        sut.didAcceptRequest(from: "x")
        await yieldMainActor()
        let before = sut.version

        sut.clear()
        await yieldMainActor()

        XCTAssertGreaterThan(sut.version, before)
    }

    /// Bumps run through `Task { @MainActor }`, so we yield to let scheduled
    /// tasks land before asserting. One `Task.yield()` is enough — the bumps
    /// don't await further work.
    private func yieldMainActor() async {
        for _ in 0..<3 { await Task.yield() }
    }
}
