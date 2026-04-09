import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class DiscoverViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        friendService: MockFriendService = MockFriendService(),
        userService: MockUserService = MockUserService()
    ) -> (sut: DiscoverViewModel, friendService: MockFriendService, userService: MockUserService) {
        let sut = DiscoverViewModel(friendService: friendService, userService: userService)
        return (sut, friendService, userService)
    }

    private static let stubSearchResults: [UserSearchResult] = {
        let json = """
        [
            {"id":"u1","username":"alice","displayName":"Alice","avatar":null,"isOnline":true},
            {"id":"u2","username":"bob","displayName":"Bob","avatar":null,"isOnline":false}
        ]
        """
        return JSONStub.decode(json)
    }()

    // MARK: - performSearch

    func test_performSearch_withResults_populatesSearchResults() async {
        let (sut, _, userService) = makeSUT()
        userService.searchUsersResult = .success(Self.stubSearchResults)
        sut.searchQuery = "ali"

        await sut.performSearch()

        XCTAssertEqual(sut.searchResults.count, 2)
        XCTAssertEqual(userService.searchUsersCallCount, 1)
        XCTAssertFalse(sut.isSearching)
    }

    func test_performSearch_emptyResults_clearsSearchResults() async {
        let (sut, _, userService) = makeSUT()
        userService.searchUsersResult = .success([])
        sut.searchQuery = "nonexistent"

        await sut.performSearch()

        XCTAssertTrue(sut.searchResults.isEmpty)
    }

    func test_performSearch_queryTooShort_clearsResults() async {
        let (sut, _, userService) = makeSUT()
        sut.searchQuery = "a"

        await sut.performSearch()

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertEqual(userService.searchUsersCallCount, 0)
    }

    func test_performSearch_error_clearsResults() async {
        let (sut, _, userService) = makeSUT()
        userService.searchUsersResult = .failure(NSError(domain: "test", code: 500))
        sut.searchQuery = "alice"

        await sut.performSearch()

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertFalse(sut.isSearching)
    }

    func test_performSearch_trimsWhitespace() async {
        let (sut, _, userService) = makeSUT()
        userService.searchUsersResult = .success(Self.stubSearchResults)
        sut.searchQuery = "  alice  "

        await sut.performSearch()

        XCTAssertEqual(userService.searchUsersCallCount, 1)
        XCTAssertEqual(userService.lastSearchUsersQuery, "alice")
    }

    // MARK: - sendRequest

    func test_sendRequest_success_callsFriendService() async {
        let (sut, friendService, _) = makeSUT()
        let stubRequest: FriendRequest = JSONStub.decode("""
        {"id":"req-1","senderId":"me","receiverId":"u1","status":"pending","createdAt":"2026-01-01T00:00:00.000Z"}
        """)
        friendService.sendRequestResult = .success(stubRequest)

        await sut.sendRequest(to: "u1")

        XCTAssertEqual(friendService.sendRequestCallCount, 1)
        XCTAssertEqual(friendService.lastSendRequestReceiverId, "u1")
    }

    func test_sendRequest_error_doesNotCrash() async {
        let (sut, friendService, _) = makeSUT()
        friendService.sendRequestResult = .failure(NSError(domain: "test", code: 500))

        await sut.sendRequest(to: "u1")

        XCTAssertEqual(friendService.sendRequestCallCount, 1)
    }

    // MARK: - sendEmailInvitation

    func test_sendEmailInvitation_success_clearsEmailText() async {
        let (sut, friendService, _) = makeSUT()
        friendService.sendEmailInvitationResult = .success(())
        sut.emailText = "friend@example.com"

        await sut.sendEmailInvitation()

        XCTAssertEqual(sut.emailText, "")
        XCTAssertEqual(friendService.sendEmailInvitationCallCount, 1)
        XCTAssertEqual(friendService.lastInvitationEmail, "friend@example.com")
        XCTAssertFalse(sut.isSendingInvite)
    }

    func test_sendEmailInvitation_emptyEmail_doesNotSend() async {
        let (sut, friendService, _) = makeSUT()
        sut.emailText = "   "

        await sut.sendEmailInvitation()

        XCTAssertEqual(friendService.sendEmailInvitationCallCount, 0)
    }

    // MARK: - smsMessage

    func test_smsMessage_containsDownloadLink() {
        let (sut, _, _) = makeSUT()
        XCTAssertTrue(sut.smsMessage.contains("meeshy.me/download"))
    }
}
