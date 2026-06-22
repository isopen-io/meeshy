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

    // MARK: - SQLite Persistence

    /// Acceptance must propagate to the GRDB `friends_list` cache so the
    /// Contacts tab sees the new contact on its next cold load — even if
    /// the ContactsListViewModel was never alive during the accept.
    func test_accept_persistsNewFriendToGRDBCache() async {
        let (sut, _) = makeSUT()
        let request = FriendRequestFixture.make(
            id: "req-persist",
            senderId: "eve",
            receiverId: "me",
            senderUsername: "eve"
        )
        sut.receivedRequests = [request]

        await sut.accept(requestId: "req-persist")
        // Give the persist Task time to land in GRDB.
        for _ in 0..<10 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 50_000_000)

        let cached = await CacheCoordinator.shared.friends.load(for: FriendshipCache.PersistenceKeys.friendsList)
        let ids = (cached.value ?? []).map(\.id)
        XCTAssertTrue(
            ids.contains("eve"),
            "Accepted sender must be merged into the friends_list GRDB cache so it survives an app relaunch"
        )
    }

    /// Acceptance must also invalidate the persistent received-requests
    /// cache so the next `loadReceived()` from any consumer round-trips
    /// the gateway instead of serving the accepted request from a still-
    /// fresh GRDB entry.
    func test_accept_invalidatesReceivedRequestsCache() async {
        // Prime the received-requests cache so it's `.fresh` at start.
        let stale = FriendRequestFixture.make(id: "req-stale", senderId: "frank", receiverId: "me")
        try? await CacheCoordinator.shared.friendRequests.save(
            [stale],
            for: FriendshipCache.PersistenceKeys.receivedRequests
        )

        let (sut, _) = makeSUT()
        sut.receivedRequests = [stale]

        await sut.accept(requestId: "req-stale")
        for _ in 0..<5 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 30_000_000)

        let cached = await CacheCoordinator.shared.friendRequests.load(
            for: FriendshipCache.PersistenceKeys.receivedRequests
        )
        switch cached {
        case .expired, .empty:
            break  // expected — the cache was invalidated
        case .fresh, .stale:
            XCTFail("Received-requests cache must be invalidated after accept so next load round-trips the gateway")
        }
    }

    // MARK: - Load Received

    func test_loadReceived_success_populatesList() async {
        let (sut, mock) = makeSUT()
        let request = FriendRequestFixture.make(id: "r1", senderId: "s1", status: "pending")
        mock.receivedRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [request]))

        await sut.loadReceived()

        XCTAssertEqual(sut.receivedRequests.count, 1)
        XCTAssertEqual(sut.receivedRequests.first?.id, "r1")
        XCTAssertEqual(mock.receivedRequestsCallCount, 1)
        XCTAssertEqual(sut.loadState, .loaded)
    }

    func test_loadReceived_failure_setsError() async {
        let (sut, mock) = makeSUT()
        mock.receivedRequestsResult = .failure(NSError(domain: "test", code: 500))

        await sut.loadReceived()

        XCTAssertTrue(sut.receivedRequests.isEmpty)
        if case .error = sut.loadState {} else {
            XCTFail("Expected error state")
        }
    }

    // MARK: - Load Sent

    func test_loadSent_filtersPendingOnly() async {
        let (sut, mock) = makeSUT()
        let pending = FriendRequestFixture.make(id: "s1", status: "pending")
        let accepted = FriendRequestFixture.make(id: "s2", status: "accepted")
        mock.sentRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [pending, accepted]))

        await sut.loadSent()

        XCTAssertEqual(sut.sentRequests.count, 1)
        XCTAssertEqual(sut.sentRequests.first?.id, "s1")
    }

    // MARK: - Accept

    func test_accept_optimisticallyRemovesRow() async {
        let (sut, mock) = makeSUT()
        let request = FriendRequestFixture.make(id: "r1", senderId: "s1", status: "pending")
        mock.respondResult = .success(request)
        sut.receivedRequests = [request]

        await sut.accept(requestId: "r1")

        XCTAssertTrue(sut.receivedRequests.isEmpty)
        XCTAssertEqual(mock.respondCallCount, 1)
        XCTAssertEqual(mock.lastRespondAccepted, true)
    }

    func test_accept_failure_rollsBack() async {
        let (sut, mock) = makeSUT()
        let request = FriendRequestFixture.make(id: "r1", senderId: "s1", status: "pending")
        mock.respondResult = .failure(NSError(domain: "test", code: 500))
        sut.receivedRequests = [request]

        await sut.accept(requestId: "r1")

        XCTAssertEqual(sut.receivedRequests.count, 1)
        XCTAssertEqual(sut.receivedRequests.first?.id, "r1")
    }

    // MARK: - Reject

    func test_reject_optimisticallyRemovesRow() async {
        let (sut, mock) = makeSUT()
        let request = FriendRequestFixture.make(id: "r1", senderId: "s1", status: "pending")
        mock.respondResult = .success(request)
        sut.receivedRequests = [request]

        await sut.reject(requestId: "r1")

        XCTAssertTrue(sut.receivedRequests.isEmpty)
        XCTAssertEqual(mock.lastRespondAccepted, false)
    }

    // MARK: - Cancel

    func test_cancel_removesFromSentList() async {
        let (sut, mock) = makeSUT()
        let request = FriendRequestFixture.make(id: "s1", status: "pending")
        sut.sentRequests = [request]

        await sut.cancel(requestId: "s1")

        XCTAssertTrue(sut.sentRequests.isEmpty)
        XCTAssertEqual(mock.deleteCallCount, 1)
    }

    func test_cancel_failure_rollsBack() async {
        let (sut, mock) = makeSUT()
        let request = FriendRequestFixture.make(id: "s1", status: "pending")
        mock.deleteResult = .failure(NSError(domain: "test", code: 500))
        sut.sentRequests = [request]

        await sut.cancel(requestId: "s1")

        XCTAssertEqual(sut.sentRequests.count, 1)
    }

    // MARK: - Outcome Observer Rollback (Phase 4 Task 4.9)
    //
    // `accept` / `reject` subscribe to `OfflineQueue.outcomeStream(for: cmid)`
    // and roll back `receivedRequests` if the OutboxFlusher escalates the
    // row to `.exhausted`. The cmid is generated internally so we assert the
    // contract on the primitive: outcome-stream + publishOutcome must
    // round-trip the terminal event exactly once.

    func test_acceptReject_outcomeStream_exhaustedFires_rollbackContract() async {
        let cmid = "requests-rollback-001"
        let stream = await OfflineQueue.shared.outcomeStream(for: cmid)
        await OfflineQueue.shared.publishOutcome(.exhausted(cmid: cmid))

        var collected: [OutboxOutcome] = []
        for await event in stream {
            collected.append(event)
        }

        XCTAssertEqual(collected.count, 1)
        XCTAssertEqual(collected.first, .exhausted(cmid: cmid))
    }

    // MARK: - Pagination

    func test_loadMoreReceived_appendsResults() async {
        let (sut, mock) = makeSUT()
        let first = FriendRequestFixture.make(id: "r1", status: "pending")
        let second = FriendRequestFixture.make(id: "r2", status: "pending")
        mock.receivedRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [first], hasMore: true))

        await sut.loadReceived()
        XCTAssertEqual(sut.receivedRequests.count, 1)

        mock.receivedRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [second], hasMore: false))
        await sut.loadMoreReceived()

        XCTAssertEqual(sut.receivedRequests.count, 2)
        XCTAssertEqual(mock.lastReceivedOffset, 1)
    }

    // MARK: - Cache-First Behavior

    /// Fresh cache for the received list short-circuits the network call.
    /// "No spinner when cache has data" from the architecture bible.
    func test_loadReceived_withCachedFreshData_skipsNetworkAndAppliesCache() async {
        let cached = [FriendRequestFixture.make(id: "cached-1", status: "pending")]
        try? await CacheCoordinator.shared.friendRequests.save(cached, for: "requests:received")

        let (sut, mock) = makeSUT()
        mock.receivedRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [
            FriendRequestFixture.make(id: "fresh-1", status: "pending")
        ]))

        await sut.loadReceived()

        XCTAssertEqual(sut.receivedRequests.map(\.id), ["cached-1"])
        XCTAssertEqual(mock.receivedRequestsCallCount, 0, "Fresh cache must skip network")
        XCTAssertEqual(sut.loadState, .cachedFresh)
    }

    /// Cold start: empty cache triggers a network fetch and persists the
    /// result to cache for the next visit.
    func test_loadReceived_withEmptyCache_callsNetworkAndPersistsToCache() async {
        let request = FriendRequestFixture.make(id: "r1", status: "pending")

        let (sut, mock) = makeSUT()
        mock.receivedRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [request]))

        await sut.loadReceived()

        XCTAssertEqual(sut.receivedRequests.map(\.id), ["r1"])
        XCTAssertEqual(mock.receivedRequestsCallCount, 1)

        let cacheValue = await CacheCoordinator.shared.friendRequests.load(for: "requests:received").value
        XCTAssertEqual(cacheValue?.map(\.id), ["r1"])
    }

    /// `loadSent` follows the same cache-first pipeline; pending-only filter
    /// is applied at the network layer so the cache only ever stores pending
    /// items.
    func test_loadSent_withCachedFreshData_skipsNetworkAndAppliesCache() async {
        let cached = [FriendRequestFixture.make(id: "sent-cached", status: "pending")]
        try? await CacheCoordinator.shared.friendRequests.save(cached, for: "requests:sent")

        let (sut, mock) = makeSUT()
        mock.sentRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [
            FriendRequestFixture.make(id: "sent-fresh", status: "pending")
        ]))

        await sut.loadSent()

        XCTAssertEqual(sut.sentRequests.map(\.id), ["sent-cached"])
        XCTAssertEqual(mock.sentRequestsCallCount, 0)
    }
}
