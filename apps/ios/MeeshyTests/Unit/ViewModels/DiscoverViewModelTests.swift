import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class DiscoverViewModelTests: XCTestCase {

    // MARK: - Lifecycle

    override func setUp() async throws {
        try await super.setUp()
        // Suggestions list goes through `CacheCoordinator.shared.userSearch`.
        // Reset between tests so state from a previous run never bleeds in.
        await CacheCoordinator.shared.userSearch.invalidate(for: "discover:suggestions")
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.userSearch.invalidate(for: "discover:suggestions")
        try await super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(
        friendService: MockFriendService = MockFriendService(),
        userService: MockUserService = MockUserService(),
        contactSync: MockContactSyncService = MockContactSyncService()
    ) -> (sut: DiscoverViewModel, friendService: MockFriendService, userService: MockUserService) {
        let sut = DiscoverViewModel(friendService: friendService, userService: userService, contactSync: contactSync)
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

    // MARK: - importContacts

    private static let stubContactMatches: [ContactMatch] = {
        let json = """
        [
            {"user":{"id":"u9","username":"awa","firstName":"Awa","lastName":"Diallo","displayName":"Awa D.","avatar":null,"isOnline":true,"lastActiveAt":null},"matchedBy":"phone","contactDisplayName":"Awa du bureau"}
        ]
        """
        return JSONStub.decode(json)
    }()

    func test_importContacts_success_populatesMatches() async {
        let contactSync = MockContactSyncService()
        contactSync.findFriendsResult = .success(Self.stubContactMatches)
        let (sut, _, _) = makeSUT(contactSync: contactSync)

        await sut.importContacts()

        XCTAssertEqual(sut.contactMatches.map(\.id), ["u9"])
        XCTAssertTrue(sut.hasImportedContacts)
        XCTAssertFalse(sut.isImportingContacts)
        XCTAssertEqual(contactSync.findFriendsCallCount, 1)
    }

    func test_importContacts_accessDenied_leavesMatchesEmpty() async {
        let contactSync = MockContactSyncService()
        contactSync.findFriendsResult = .failure(ContactSyncError.accessDenied)
        let (sut, _, _) = makeSUT(contactSync: contactSync)

        await sut.importContacts()

        XCTAssertTrue(sut.contactMatches.isEmpty)
        XCTAssertFalse(sut.hasImportedContacts)
        XCTAssertFalse(sut.isImportingContacts)
    }

    func test_importContacts_networkError_leavesMatchesEmpty() async {
        let contactSync = MockContactSyncService()
        contactSync.findFriendsResult = .failure(NSError(domain: "test", code: 500))
        let (sut, _, _) = makeSUT(contactSync: contactSync)

        await sut.importContacts()

        XCTAssertTrue(sut.contactMatches.isEmpty)
        XCTAssertFalse(sut.hasImportedContacts)
    }

    // MARK: - smsMessage

    func test_smsMessage_containsDownloadLink() {
        let (sut, _, _) = makeSUT()
        XCTAssertTrue(sut.smsMessage.contains("meeshy.me/download"))
    }

    // MARK: - Cache-First Suggestions

    /// Empty-query suggestions: when the cache has fresh data, surface it
    /// immediately and skip the network call.
    func test_loadSuggestions_withCachedFreshData_skipsNetworkAndAppliesCache() async {
        let cached = [
            UserSearchResult(id: "cached-1", username: "alice", displayName: "Alice", avatar: nil, isOnline: true)
        ]
        try? await CacheCoordinator.shared.userSearch.save(cached, for: "discover:suggestions")

        let (sut, _, userService) = makeSUT()
        userService.searchUsersResult = .success([
            UserSearchResult(id: "fresh-1", username: "bob", displayName: "Bob", avatar: nil, isOnline: false)
        ])

        await sut.loadSuggestions()

        XCTAssertEqual(sut.searchResults.map(\.id), ["cached-1"])
        XCTAssertEqual(userService.searchUsersCallCount, 0, "Fresh cache must skip network")
        XCTAssertEqual(sut.loadState, .cachedFresh)
    }

    /// Cold start with empty cache: spinner shown, suggestions fetched,
    /// cache populated for the next visit.
    func test_loadSuggestions_withEmptyCache_callsNetworkAndPersistsToCache() async {
        let fresh = [
            UserSearchResult(id: "n1", username: "alice", displayName: "Alice", avatar: nil, isOnline: true)
        ]

        let (sut, _, userService) = makeSUT()
        userService.searchUsersResult = .success(fresh)

        await sut.loadSuggestions()

        XCTAssertEqual(sut.searchResults.map(\.id), ["n1"])
        XCTAssertEqual(userService.searchUsersCallCount, 1)

        let cacheValue = await CacheCoordinator.shared.userSearch.load(for: "discover:suggestions").value
        XCTAssertEqual(cacheValue?.map(\.id), ["n1"])
    }

    /// `performSearch` for non-empty queries deliberately bypasses the
    /// cache (the query space is unbounded). This test pins that contract:
    /// adding suggestions to the cache must not affect a typed search.
    func test_performSearch_doesNotUseSuggestionsCache() async {
        let cached = [UserSearchResult(id: "cached-1", username: "alice")]
        try? await CacheCoordinator.shared.userSearch.save(cached, for: "discover:suggestions")

        let (sut, _, userService) = makeSUT()
        userService.searchUsersResult = .success([
            UserSearchResult(id: "search-result", username: "bob", displayName: "Bob")
        ])
        sut.searchQuery = "bob"

        await sut.performSearch()

        XCTAssertEqual(sut.searchResults.map(\.id), ["search-result"])
        XCTAssertEqual(userService.searchUsersCallCount, 1)
    }
}
