import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class UserProfileViewModelTests: XCTestCase {

    // MARK: - Properties

    private var mockAuthManager: MockAuthManager!
    private var mockBlockService: MockBlockService!

    // MARK: - Lifecycle

    override func setUp() {
        super.setUp()
        mockAuthManager = MockAuthManager()
        mockBlockService = MockBlockService()
    }

    override func tearDown() {
        mockAuthManager = nil
        mockBlockService = nil
        super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(
        userId: String? = "target-user-001",
        username: String = "targetuser"
    ) -> UserProfileViewModel {
        let profileUser = ProfileSheetUser(
            userId: userId,
            username: username,
            displayName: "Target User"
        )
        return UserProfileViewModel(
            user: profileUser,
            authManager: mockAuthManager,
            blockService: mockBlockService
        )
    }

    private func makeCurrentUser(
        id: String = "current-user-001",
        blockedUserIds: [String]? = nil
    ) -> MeeshyUser {
        MeeshyUser(
            id: id,
            username: "currentuser",
            displayName: "Current User",
            blockedUserIds: blockedUserIds
        )
    }

    private func makeTargetUser(id: String = "target-user-001") -> MeeshyUser {
        MeeshyUser(
            id: id,
            username: "targetuser",
            displayName: "Target User",
            bio: "Hello world"
        )
    }

    // MARK: - Init Tests

    func test_init_setsIsBlockedTrue_whenUserIsInBlockedList() {
        let currentUser = makeCurrentUser(blockedUserIds: ["target-user-001"])
        mockAuthManager.simulateLoggedIn(user: currentUser)

        let sut = makeSUT()

        XCTAssertTrue(sut.isBlocked)
    }

    func test_init_setsIsBlockedFalse_whenUserIsNotInBlockedList() {
        let currentUser = makeCurrentUser(blockedUserIds: [])
        mockAuthManager.simulateLoggedIn(user: currentUser)

        let sut = makeSUT()

        XCTAssertFalse(sut.isBlocked)
    }

    func test_init_setsIsBlockedFalse_whenBlockedUserIdsIsNil() {
        let currentUser = makeCurrentUser(blockedUserIds: nil)
        mockAuthManager.simulateLoggedIn(user: currentUser)

        let sut = makeSUT()

        XCTAssertFalse(sut.isBlocked)
    }

    func test_init_setsDefaultState() {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let sut = makeSUT()

        XCTAssertNil(sut.fullUser)
        XCTAssertTrue(sut.sharedConversations.isEmpty)
        XCTAssertFalse(sut.isLoading)
        XCTAssertFalse(sut.isBlockedByTarget)
        XCTAssertNil(sut.userStats)
        XCTAssertFalse(sut.isLoadingStats)
        XCTAssertNil(sut.statsError)
    }

    // MARK: - isCurrentUser Tests

    func test_isCurrentUser_returnsTrueWhenIdsMatch() {
        let currentUser = makeCurrentUser(id: "same-id")
        mockAuthManager.simulateLoggedIn(user: currentUser)

        let sut = makeSUT(userId: "same-id")

        XCTAssertTrue(sut.isCurrentUser)
    }

    func test_isCurrentUser_returnsFalseWhenIdsDiffer() {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser(id: "different-id"))

        let sut = makeSUT(userId: "target-user-001")

        XCTAssertFalse(sut.isCurrentUser)
    }

    // MARK: - loadFullProfile Tests

    func test_loadFullProfile_skipsWhenIsCurrentUser() async {
        let currentUser = makeCurrentUser(id: "same-id")
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = makeSUT(userId: "same-id")

        await sut.loadFullProfile()

        XCTAssertNil(sut.fullUser)
    }

    func test_loadFullProfile_skipsWhenUserIdIsNil() async {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let sut = makeSUT(userId: nil)

        await sut.loadFullProfile()

        XCTAssertNil(sut.fullUser)
    }

    // MARK: - loadUserStats Tests

    func test_loadUserStats_skipsWhenUserIdIsNil() async {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let sut = makeSUT(userId: nil)

        await sut.loadUserStats()

        XCTAssertNil(sut.userStats)
    }

    // MARK: - blockUser Tests
    //
    // Wave 1 Phase B — `blockUser` / `unblockUser` no longer call the
    // BlockService directly. They flip `isBlocked` optimistically and
    // enqueue a `.blockUser` / `.unblockUser` record on `OfflineQueue`
    // so the OutboxFlusher drives the HTTP call with the
    // `X-Client-Mutation-Id` header for gateway-side dedup. The
    // mockBlockService assertions of the previous tests are therefore
    // obsolete ; this version only asserts the optimistic state flip,
    // which is the user-visible contract.

    func test_blockUser_flipsIsBlockedOptimistically() async {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let sut = makeSUT()
        XCTAssertFalse(sut.isBlocked)

        await sut.blockUser()

        XCTAssertTrue(sut.isBlocked)
    }

    func test_blockUser_skipsWhenUserIdIsNil() async {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let sut = makeSUT(userId: nil)

        await sut.blockUser()

        // No user id → no mutation enqueued. The local state stays put.
        XCTAssertFalse(sut.isBlocked)
    }

    // MARK: - unblockUser Tests

    func test_unblockUser_flipsIsBlockedOptimistically() async {
        let currentUser = makeCurrentUser(blockedUserIds: ["target-user-001"])
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = makeSUT()
        XCTAssertTrue(sut.isBlocked)

        await sut.unblockUser()

        XCTAssertFalse(sut.isBlocked)
    }

    // MARK: - Outcome Observer Rollback (Phase 4 Task 4.9)
    //
    // The VM subscribes to `OfflineQueue.outcomeStream(for: cmid)` from
    // `blockUser` / `unblockUser`. When the OutboxFlusher exhausts the row
    // (5 failed retries) it calls `publishOutcome(.exhausted(cmid:))` ; the
    // VM rolls back the optimistic flip. Since the cmid is internal, we
    // assert the contract indirectly: the outcome-stream primitive must
    // yield exactly one terminal event then complete, which is the building
    // block the VM relies on.

    func test_offlineQueue_outcomeStream_exhaustedFires_rollbackContract() async {
        let cmid = "rollback-contract-001"
        let stream = await OfflineQueue.shared.outcomeStream(for: cmid)
        await OfflineQueue.shared.publishOutcome(.exhausted(cmid: cmid))

        var collected: [OutboxOutcome] = []
        for await event in stream {
            collected.append(event)
        }

        XCTAssertEqual(collected.count, 1)
        XCTAssertEqual(collected.first, .exhausted(cmid: cmid))
    }

    func test_offlineQueue_outcomeStream_appliedFires_isObserved() async {
        let cmid = "applied-contract-001"
        let stream = await OfflineQueue.shared.outcomeStream(for: cmid)
        await OfflineQueue.shared.publishOutcome(.applied(cmid: cmid))

        var collected: [OutboxOutcome] = []
        for await event in stream {
            collected.append(event)
        }

        XCTAssertEqual(collected.count, 1)
        XCTAssertEqual(collected.first, .applied(cmid: cmid))
    }

    // MARK: - findSharedConversations Tests

    func test_findSharedConversations_filtersDirectConversationsWithTargetUser() {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let sut = makeSUT()

        let directWithTarget = MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .direct,
            participantUserId: "target-user-001"
        )
        let directWithOther = MeeshyConversation(
            id: "conv-2", identifier: "conv-2", type: .direct,
            participantUserId: "other-user"
        )
        let groupConv = MeeshyConversation(
            id: "conv-3", identifier: "conv-3", type: .group,
            participantUserId: "target-user-001"
        )

        sut.findSharedConversations(from: [directWithTarget, directWithOther, groupConv])

        XCTAssertEqual(sut.sharedConversations.count, 1)
        XCTAssertEqual(sut.sharedConversations.first?.id, "conv-1")
    }

    func test_findSharedConversations_returnsEmpty_whenNoDirectConversationsWithTarget() {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let sut = makeSUT()

        let otherConv = MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .group
        )

        sut.findSharedConversations(from: [otherConv])

        XCTAssertTrue(sut.sharedConversations.isEmpty)
    }

    func test_findSharedConversations_skipsWhenUserIdIsNil() {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let sut = makeSUT(userId: nil)

        let conv = MeeshyConversation(
            id: "conv-1", identifier: "conv-1", type: .direct,
            participantUserId: nil
        )

        sut.findSharedConversations(from: [conv])

        XCTAssertTrue(sut.sharedConversations.isEmpty)
    }
}
