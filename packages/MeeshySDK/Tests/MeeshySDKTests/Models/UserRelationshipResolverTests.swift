import XCTest
@testable import MeeshySDK

@MainActor
final class UserRelationshipResolverTests: XCTestCase {

    // Resolver depends on FriendshipCache.shared + BlockService — reset both
    // between tests so prior friendships/blocks don't leak across cases.
    override func setUp() async throws {
        try await super.setUp()
        FriendshipCache.shared.clear()
        await yieldMainActor()
    }

    private func makeSUT(
        currentUserId: String? = "me",
        blockService: BlockServiceProviding = MockBlockService()
    ) -> UserRelationshipResolver {
        UserRelationshipResolver(
            friendshipCache: .shared,
            blockService: blockService,
            currentUserIdProvider: { currentUserId }
        )
    }

    // MARK: - .current

    func test_resolve_currentUserId_returnsCurrent() {
        let sut = makeSUT(currentUserId: "me")
        XCTAssertEqual(sut.resolve(userId: "me"), .current)
    }

    // MARK: - .blocked

    /// Block status takes precedence over friendship — a blocked user must
    /// never render as a contact, even if the friendship cache still has
    /// them as a friend (e.g. block happened but hydration not refreshed).
    func test_resolve_blockedUser_returnsBlocked_evenIfAlsoFriend() {
        let blocker = MockBlockService()
        blocker.blockedUserIds = ["other"]
        FriendshipCache.shared.didAcceptRequest(from: "other")

        let sut = makeSUT(blockService: blocker)

        XCTAssertEqual(sut.resolve(userId: "other"), .blocked)
    }

    // MARK: - .connected

    func test_resolve_acceptedFriend_returnsConnected() {
        FriendshipCache.shared.didAcceptRequest(from: "friend-1")
        let sut = makeSUT()
        XCTAssertEqual(sut.resolve(userId: "friend-1"), .connected)
    }

    // MARK: - .pendingSent

    func test_resolve_sentRequest_returnsPendingSent() {
        FriendshipCache.shared.didSendRequest(to: "other", requestId: "req-42")
        let sut = makeSUT()
        XCTAssertEqual(sut.resolve(userId: "other"), .pendingSent(requestId: "req-42"))
    }

    // MARK: - .pendingReceived

    func test_resolve_receivedRequest_returnsPendingReceived() {
        FriendshipCache.shared.didReceiveRequest(from: "other", requestId: "req-99")
        let sut = makeSUT()
        XCTAssertEqual(sut.resolve(userId: "other"), .pendingReceived(requestId: "req-99"))
    }

    // MARK: - .none

    func test_resolve_unknownUser_returnsNone() {
        let sut = makeSUT()
        XCTAssertEqual(sut.resolve(userId: "stranger"), .none)
    }

    func test_resolve_emptyUserId_returnsNone() {
        let sut = makeSUT()
        XCTAssertEqual(sut.resolve(userId: ""), .none)
    }

    // MARK: - Helper

    private func yieldMainActor() async {
        for _ in 0..<3 { await Task.yield() }
    }
}

// MARK: - Test Mock

/// In-package mock — the iOS app has its own `MockBlockService` under
/// `apps/ios/MeeshyTests/Mocks` but the SDK test target can't import the
/// app target, so we inline a minimal one here.
private final class MockBlockService: BlockServiceProviding, @unchecked Sendable {
    var blockedUserIds: Set<String> = []
    func blockUser(userId: String) async throws { blockedUserIds.insert(userId) }
    func unblockUser(userId: String) async throws { blockedUserIds.remove(userId) }
    func listBlockedUsers() async throws -> [BlockedUser] { [] }
    func isBlocked(userId: String) -> Bool { blockedUserIds.contains(userId) }
    func refreshCache() async {}
}
