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

    // MARK: - Helper

    private func yieldMainActor() async {
        for _ in 0..<5 { await Task.yield() }
    }
}
