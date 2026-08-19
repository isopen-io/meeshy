import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class ForwardPickerViewModelTests: XCTestCase {

    private var friendService: MockFriendService!
    private var directoryService: MockContactDirectoryService!

    override func setUp() {
        super.setUp()
        friendService = MockFriendService()
        directoryService = MockContactDirectoryService()
    }

    override func tearDown() {
        friendService = nil
        directoryService = nil
        super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(currentUserId: String = "me") -> (sut: ForwardPickerViewModel, service: MockConversationService) {
        let service = MockConversationService()
        let authManager = MockAuthManager()
        authManager.currentUser = MeeshyUser(id: currentUserId, username: "moi")
        let sut = ForwardPickerViewModel(
            conversationService: service,
            friendService: friendService,
            contactDirectoryService: directoryService,
            authManager: authManager
        )
        return (sut, service)
    }

    private func makeConv(_ id: String, participantUserId: String? = nil) -> Conversation {
        Conversation(
            id: id,
            identifier: id,
            type: .direct,
            title: "Conv \(id)",
            participantUserId: participantUserId
        )
    }

    private func makeAPIConv(_ id: String, participantUserId: String) -> APIConversation {
        let participant = APIParticipant(
            id: "p-\(participantUserId)",
            conversationId: id,
            type: .user,
            userId: participantUserId,
            displayName: "User \(participantUserId)",
            role: "MEMBER"
        )
        return APIConversation(
            id: id,
            type: "direct",
            participants: [participant],
            createdAt: Date()
        )
    }

    private func makeAccepted(otherId: String, currentUserId: String = "me") -> FriendRequest {
        FriendRequestFixture.make(
            id: "fr-\(otherId)",
            senderId: currentUserId,
            receiverId: otherId,
            status: "accepted",
            receiverUsername: "user\(otherId)"
        )
    }

    private func makeDirectoryContact(userId: String) -> DirectoryContact {
        DirectoryContact(
            id: "dc-\(userId)",
            contactKey: "key-\(userId)",
            displayName: "Contact \(userId)",
            isOnMeeshy: true,
            matchedUser: MatchedContactUser(id: userId, username: "user\(userId)", displayName: "Contact \(userId)")
        )
    }

    private func pageOf(_ requests: [FriendRequest]) -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        OffsetPaginatedAPIResponse(success: true, data: requests, pagination: nil, error: nil)
    }

    private func pageOf(_ contacts: [DirectoryContact]) -> [DirectoryContact] {
        contacts
    }

    // MARK: - Pagination

    func test_loadMore_passesPreviousCursor_andAppends() async {
        let (sut, service) = makeSUT()
        service.listPageResult = .success(ConversationPage(items: [makeConv("c1")], rawItems: [], nextCursor: "cur1", hasMore: true))
        await sut.loadInitial()
        service.listPageResult = .success(ConversationPage(items: [makeConv("c2")], rawItems: [], nextCursor: "cur2", hasMore: false))

        await sut.loadMore()

        XCTAssertEqual(service.lastListPageCursor, "cur1")
        XCTAssertEqual(sut.targets.map(\.id), ["conv:c1", "conv:c2"])
        XCTAssertFalse(sut.hasMore)
    }

    func test_loadMore_whenHasMoreFalse_doesNotFetch() async {
        let (sut, service) = makeSUT()
        service.listPageResult = .success(ConversationPage(items: [makeConv("c1")], rawItems: [], nextCursor: nil, hasMore: false))
        await sut.loadInitial()
        let before = service.listPageCallCount

        await sut.loadMore()

        XCTAssertEqual(service.listPageCallCount, before)
    }

    func test_loadInitial_passesRealCurrentUserId() async {
        let (sut, service) = makeSUT(currentUserId: "me")
        service.listPageResult = .success(ConversationPage(items: [], rawItems: [], nextCursor: nil, hasMore: false))
        await sut.loadInitial()
        XCTAssertEqual(service.lastListPageCurrentUserId, "me",
                       "un id vide annule participantUserId, donc la déduplication par personne")
    }

    // MARK: - Search

    func test_search_mergesConversationsThenContacts_andDropsStaleResponses() async {
        let (sut, service) = makeSUT()
        service.searchResult = .success([makeAPIConv("c9", participantUserId: "u1")])
        friendService.allFriendRequestsResult = .success(pageOf([makeAccepted(otherId: "u1")]))
        directoryService.listResult = .success(pageOf([makeDirectoryContact(userId: "u2")]))

        await sut.search("ali")

        XCTAssertEqual(sut.targets.map(\.id), ["conv:c9", "user:u2"],
                       "u1 est absorbé par sa conversation directe ; u2 reste")
    }

    func test_search_belowTwoCharacters_doesNotHitTheNetwork() async {
        let (sut, service) = makeSUT()
        await sut.search("a")
        XCTAssertEqual(service.searchCallCount, 0)
    }
}
