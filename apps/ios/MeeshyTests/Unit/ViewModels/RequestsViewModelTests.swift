import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class RequestsViewModelTests: XCTestCase {

    // MARK: - Lifecycle

    /// FriendshipCache is the singleton our SUT mutates — reset between
    /// tests so an accepted friend from case N+1 doesn't see a residual
    /// "friend" status from case N. Same applies to the cache-coordinator
    /// store the SUT reads on load.
    override func setUp() async throws {
        try await super.setUp()
        FriendshipCache.shared.clear()
        await CacheCoordinator.shared.friendRequests.invalidate(for: "requests:received")
        await CacheCoordinator.shared.friendRequests.invalidate(for: "requests:sent")
    }

    override func tearDown() async throws {
        FriendshipCache.shared.clear()
        await CacheCoordinator.shared.friendRequests.invalidate(for: "requests:received")
        await CacheCoordinator.shared.friendRequests.invalidate(for: "requests:sent")
        try await super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(
        friendService: MockFriendService = MockFriendService()
    ) -> (sut: RequestsViewModel, friendService: MockFriendService) {
        let sut = RequestsViewModel(friendService: friendService)
        return (sut, friendService)
    }

    // MARK: - accept

    /// Core bug fix: accepting a request from the Requests tab must flip
    /// FriendshipCache so the Discover screen and Contacts list see the
    /// new contact without a manual refetch.
    func test_accept_flipsFriendshipCacheToFriendImmediately() async {
        let (sut, _) = makeSUT()
        let request = FriendRequestFixture.make(
            id: "req-1",
            senderId: "alice",
            receiverId: "me"
        )
        sut.receivedRequests = [request]

        await sut.accept(requestId: "req-1")

        XCTAssertTrue(
            FriendshipCache.shared.isFriend("alice"),
            "Accepting must update FriendshipCache so Discover/Contacts can react"
        )
        XCTAssertTrue(
            sut.receivedRequests.isEmpty,
            "The accepted request must disappear from the received list"
        )
    }

    func test_accept_unknownRequestId_doesNotMutateCache() async {
        let (sut, _) = makeSUT()
        sut.receivedRequests = []

        await sut.accept(requestId: "ghost")

        XCTAssertEqual(FriendshipCache.shared.friendCount, 0)
    }

    // MARK: - reject

    func test_reject_flipsCacheRemovingPendingReceived() async {
        let (sut, _) = makeSUT()
        let request = FriendRequestFixture.make(
            id: "req-2",
            senderId: "bob",
            receiverId: "me"
        )
        FriendshipCache.shared.didReceiveRequest(from: "bob", requestId: "req-2")
        sut.receivedRequests = [request]

        await sut.reject(requestId: "req-2")

        XCTAssertEqual(
            FriendshipCache.shared.status(for: "bob"),
            .none,
            "Rejecting must drop the pendingReceived entry from the cache"
        )
    }

    // MARK: - cancel

    /// Cancelling a sent request goes through FriendService directly (not
    /// the offline queue) — the cache must reflect that too so Discover
    /// flips from "Pending" back to "Add".
    func test_cancel_success_flipsCacheToNone() async {
        let (sut, friendService) = makeSUT()
        let request = FriendRequestFixture.make(
            id: "req-3",
            senderId: "me",
            receiverId: "carol"
        )
        FriendshipCache.shared.didSendRequest(to: "carol", requestId: "req-3")
        sut.sentRequests = [request]
        friendService.deleteResult = .success(())

        await sut.cancel(requestId: "req-3")

        XCTAssertEqual(FriendshipCache.shared.status(for: "carol"), .none)
        XCTAssertTrue(sut.sentRequests.isEmpty)
        XCTAssertEqual(friendService.deleteCallCount, 1)
    }

    /// If the network cancel fails the optimistic mutation must roll back
    /// in both the local list and the friendship cache — otherwise the UI
    /// would lie ("not pending") while the server still has a pending
    /// request.
    func test_cancel_failure_rollsBackCacheAndList() async {
        let (sut, friendService) = makeSUT()
        let request = FriendRequestFixture.make(
            id: "req-4",
            senderId: "me",
            receiverId: "dave"
        )
        FriendshipCache.shared.didSendRequest(to: "dave", requestId: "req-4")
        sut.sentRequests = [request]
        friendService.deleteResult = .failure(NSError(domain: "test", code: 1))

        await sut.cancel(requestId: "req-4")

        XCTAssertEqual(
            FriendshipCache.shared.status(for: "dave"),
            .pendingSent(requestId: "req-4"),
            "Cache must rollback to pendingSent on network failure"
        )
        XCTAssertEqual(sut.sentRequests.count, 1, "Sent list must rollback too")
    }
}
