import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ContactsListViewModelTests: XCTestCase {

    override func setUp() async throws {
        try await super.setUp()
        FriendshipCache.shared.clear()
        await CacheCoordinator.shared.friends.invalidate(for: "friends_list")
    }

    override func tearDown() async throws {
        FriendshipCache.shared.clear()
        await CacheCoordinator.shared.friends.invalidate(for: "friends_list")
        try await super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(
        friendService: MockFriendService = MockFriendService(),
        currentUserId: String = "me"
    ) -> (sut: ContactsListViewModel, friendService: MockFriendService) {
        let sut = ContactsListViewModel(
            friendService: friendService,
            currentUserId: currentUserId,
            friendshipCache: .shared
        )
        return (sut, friendService)
    }

    // MARK: - Cache observation

    /// Removal-driven update: when another screen drops a friend from the
    /// cache (block, unfriend, profile sheet removal), the contacts list
    /// must reflect it without a manual refresh.
    ///
    /// We prime the cache *before* instantiating the SUT so the observer's
    /// `lastObservedFriendIds` starts with alice already present — that
    /// isolates the test to the removal path and prevents the addition
    /// path from triggering an async network refetch.
    func test_friendshipCacheRemoval_removesContactFromList() async {
        FriendshipCache.shared.didAcceptRequest(from: "alice")
        await yieldMainActor()

        let (sut, _) = makeSUT()
        let alice = FriendRequestFixture.make(senderId: "alice", receiverId: "me").sender!
        sut.friends = [alice]

        FriendshipCache.shared.didRemoveFriend("alice")
        await yieldMainActor()

        XCTAssertTrue(
            sut.friends.isEmpty,
            "Removing a friend from the cache must drop them from the contacts list"
        )
    }

    /// Acceptance from another screen triggers a network refetch — the
    /// new contact arrives with full FriendRequestUser details (name,
    /// avatar, presence) that the cache alone can't provide.
    func test_friendshipCacheAddition_triggersBackgroundRefetch() async {
        let (sut, friendService) = makeSUT()
        let newFriend = FriendRequestFixture.make(
            id: "req-new",
            senderId: "eve",
            receiverId: "me",
            status: "accepted"
        )
        friendService.receivedRequestsResult = .success(
            FriendRequestFixture.makePaginated(requests: [newFriend])
        )
        friendService.sentRequestsResult = .success(
            FriendRequestFixture.makePaginated(requests: [])
        )

        FriendshipCache.shared.didAcceptRequest(from: "eve")
        await yieldMainActor()
        // Give the dispatched refetch a moment to land.
        for _ in 0..<5 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertGreaterThanOrEqual(
            friendService.receivedRequestsCallCount,
            1,
            "Cache addition must trigger a SWR refetch to hydrate the user record"
        )
    }

    // MARK: - Fresh cache + lag detection

    /// Guarantee: even when the GRDB cache reports `.fresh`, if the in-memory
    /// FriendshipCache disagrees (because another screen flipped the state
    /// while this ViewModel was asleep), we must force a background fetch.
    /// Otherwise a freshly-accepted friend from Discover would never reach
    /// the Contacts list until the 5-minute staleTTL elapses.
    func test_loadFriends_freshCacheLaggingBehindFriendshipCache_triggersRevalidate() async {
        let knownFriend = FriendRequestFixture.make(senderId: "old", receiverId: "me").sender!
        try? await CacheCoordinator.shared.friends.save([knownFriend], for: FriendshipCache.PersistenceKeys.friendsList)

        // FriendshipCache has TWO friends (one of which the GRDB cache
        // doesn't know about yet) — that's the "lag" we want detected.
        FriendshipCache.shared.didAcceptRequest(from: "old")
        FriendshipCache.shared.didAcceptRequest(from: "new")
        await yieldMainActor()

        let (sut, friendService) = makeSUT()
        friendService.receivedRequestsResult = .success(
            FriendRequestFixture.makePaginated(requests: [])
        )
        friendService.sentRequestsResult = .success(
            FriendRequestFixture.makePaginated(requests: [])
        )

        await sut.loadFriends()
        // Yield enough times for the background revalidate Task to land.
        for _ in 0..<10 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertGreaterThanOrEqual(
            friendService.receivedRequestsCallCount,
            1,
            "A fresh cache that lags behind FriendshipCache must trigger a background revalidate"
        )
    }

    // MARK: - Helper

    private func yieldMainActor() async {
        for _ in 0..<5 { await Task.yield() }
    }
}
