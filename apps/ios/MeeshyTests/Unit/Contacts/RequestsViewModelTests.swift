import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class RequestsViewModelTests: XCTestCase {

    // MARK: - Lifecycle

    override func setUp() async throws {
        try await super.setUp()
        // RequestsViewModel hits `CacheCoordinator.shared.friendRequests`.
        // Reset the keys so a previous run's cached data doesn't short-circuit
        // the mock fetch path the assertions exercise.
        await CacheCoordinator.shared.friendRequests.invalidate(for: "requests:received")
        await CacheCoordinator.shared.friendRequests.invalidate(for: "requests:sent")
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.friendRequests.invalidate(for: "requests:received")
        await CacheCoordinator.shared.friendRequests.invalidate(for: "requests:sent")
        try await super.tearDown()
    }

    private func makeSUT() -> (sut: RequestsViewModel, mock: MockFriendService) {
        let mock = MockFriendService()
        let sut = RequestsViewModel(friendService: mock)
        return (sut, mock)
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
        await CacheCoordinator.shared.friendRequests.save(cached, for: "requests:received")

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
        await CacheCoordinator.shared.friendRequests.save(cached, for: "requests:sent")

        let (sut, mock) = makeSUT()
        mock.sentRequestsResult = .success(FriendRequestFixture.makePaginated(requests: [
            FriendRequestFixture.make(id: "sent-fresh", status: "pending")
        ]))

        await sut.loadSent()

        XCTAssertEqual(sut.sentRequests.map(\.id), ["sent-cached"])
        XCTAssertEqual(mock.sentRequestsCallCount, 0)
    }
}
