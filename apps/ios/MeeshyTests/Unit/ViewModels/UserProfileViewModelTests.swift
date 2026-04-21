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

    func test_blockUser_success_setsIsBlockedTrue() async {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let sut = makeSUT()
        XCTAssertFalse(sut.isBlocked)

        await sut.blockUser()

        XCTAssertTrue(sut.isBlocked)
        XCTAssertEqual(mockBlockService.blockUserCallCount, 1)
        XCTAssertEqual(mockBlockService.lastBlockUserId, "target-user-001")
    }

    func test_blockUser_failure_doesNotChangeIsBlocked() async {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        mockBlockService.blockUserResult = .failure(NSError(domain: "test", code: 500))
        let sut = makeSUT()

        await sut.blockUser()

        XCTAssertFalse(sut.isBlocked)
    }

    func test_blockUser_skipsWhenUserIdIsNil() async {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let sut = makeSUT(userId: nil)

        await sut.blockUser()

        XCTAssertEqual(mockBlockService.blockUserCallCount, 0)
    }

    // MARK: - unblockUser Tests

    func test_unblockUser_success_setsIsBlockedFalse() async {
        let currentUser = makeCurrentUser(blockedUserIds: ["target-user-001"])
        mockAuthManager.simulateLoggedIn(user: currentUser)
        let sut = makeSUT()
        XCTAssertTrue(sut.isBlocked)

        await sut.unblockUser()

        XCTAssertFalse(sut.isBlocked)
        XCTAssertEqual(mockBlockService.unblockUserCallCount, 1)
        XCTAssertEqual(mockBlockService.lastUnblockUserId, "target-user-001")
    }

    func test_unblockUser_failure_doesNotChangeIsBlocked() async {
        let currentUser = makeCurrentUser(blockedUserIds: ["target-user-001"])
        mockAuthManager.simulateLoggedIn(user: currentUser)
        mockBlockService.unblockUserResult = .failure(NSError(domain: "test", code: 500))
        let sut = makeSUT()
        XCTAssertTrue(sut.isBlocked)

        await sut.unblockUser()

        XCTAssertTrue(sut.isBlocked)
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
