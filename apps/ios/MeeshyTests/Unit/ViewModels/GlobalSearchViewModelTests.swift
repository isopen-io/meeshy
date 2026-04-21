import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class GlobalSearchViewModelTests: XCTestCase {

    // MARK: - Properties

    private var mockAPI: MockAPIClientForApp!
    private var mockUserService: MockUserService!
    private var mockAuthManager: MockAuthManager!
    private let defaultsKey = "globalSearch.recentSearches"

    // MARK: - Lifecycle

    override func setUp() {
        super.setUp()
        mockAPI = MockAPIClientForApp()
        mockUserService = MockUserService()
        mockAuthManager = MockAuthManager()
        UserDefaults.standard.removeObject(forKey: defaultsKey)
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: defaultsKey)
        mockAPI = nil
        mockUserService = nil
        mockAuthManager = nil
        super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT() -> GlobalSearchViewModel {
        GlobalSearchViewModel(
            api: mockAPI,
            userService: mockUserService,
            authManager: mockAuthManager
        )
    }

    private func makeCurrentUser() -> MeeshyUser {
        MeeshyUser(id: "user-001", username: "testuser", displayName: "Test User")
    }

    // MARK: - Init Tests

    func test_init_loadsRecentSearchesFromUserDefaults() {
        UserDefaults.standard.set(["swift", "ios"], forKey: defaultsKey)

        let sut = makeSUT()

        XCTAssertEqual(sut.recentSearches, ["swift", "ios"])
    }

    func test_init_setsEmptyRecentSearchesWhenNoDefaultsExist() {
        let sut = makeSUT()

        XCTAssertTrue(sut.recentSearches.isEmpty)
    }

    func test_init_defaultStateIsCorrect() {
        let sut = makeSUT()

        XCTAssertEqual(sut.searchText, "")
        XCTAssertEqual(sut.selectedTab, .messages)
        XCTAssertTrue(sut.messageResults.isEmpty)
        XCTAssertTrue(sut.conversationResults.isEmpty)
        XCTAssertTrue(sut.userResults.isEmpty)
        XCTAssertFalse(sut.isSearching)
        XCTAssertFalse(sut.hasSearched)
    }

    // MARK: - performSearch Tests

    func test_performSearch_withValidQuery_setsIsSearchingAndHasSearched() async {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        stubEmptySearchResults()
        let sut = makeSUT()

        await sut.performSearch(query: "hello")

        XCTAssertFalse(sut.isSearching)
        XCTAssertTrue(sut.hasSearched)
    }

    func test_performSearch_withValidQuery_populatesUserResults() async {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        stubEmptyConversationSearch()
        mockUserService.searchUsersResult = .success([
            UserSearchResult.stub(id: "u1", username: "alice", displayName: "Alice", isOnline: true),
            UserSearchResult.stub(id: "u2", username: "bob", displayName: "Bob", isOnline: false),
        ])
        let sut = makeSUT()

        await sut.performSearch(query: "test")

        XCTAssertEqual(sut.userResults.count, 2)
        XCTAssertEqual(sut.userResults[0].username, "alice")
        XCTAssertEqual(sut.userResults[1].username, "bob")
        XCTAssertTrue(sut.userResults[0].isOnline)
        XCTAssertFalse(sut.userResults[1].isOnline)
    }

    func test_performSearch_whenAPIFails_returnsEmptyResults() async {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        mockAPI.errorToThrow = NSError(domain: "test", code: 500)
        mockUserService.searchUsersResult = .failure(NSError(domain: "test", code: 500))
        let sut = makeSUT()

        await sut.performSearch(query: "fail")

        XCTAssertTrue(sut.messageResults.isEmpty)
        XCTAssertTrue(sut.conversationResults.isEmpty)
        XCTAssertTrue(sut.userResults.isEmpty)
        XCTAssertTrue(sut.hasSearched)
    }

    // MARK: - Tab Counts Tests

    func test_tabCounts_reflectResultArraySizes() async {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        stubEmptyConversationSearch()
        mockUserService.searchUsersResult = .success([
            UserSearchResult.stub(id: "u1", username: "alice"),
            UserSearchResult.stub(id: "u2", username: "bob"),
            UserSearchResult.stub(id: "u3", username: "carol"),
        ])
        let sut = makeSUT()

        await sut.performSearch(query: "test")

        XCTAssertEqual(sut.userCount, 3)
        XCTAssertEqual(sut.messageCount, 0)
        XCTAssertEqual(sut.conversationCount, 0)
        XCTAssertEqual(sut.totalResultCount, 3)
    }

    // MARK: - Recent Searches Tests

    func test_addToRecentSearches_addsNewEntry() {
        let sut = makeSUT()

        sut.addToRecentSearches("swift")

        XCTAssertEqual(sut.recentSearches, ["swift"])
    }

    func test_addToRecentSearches_deduplicatesCaseInsensitive() {
        let sut = makeSUT()

        sut.addToRecentSearches("Swift")
        sut.addToRecentSearches("swift")

        XCTAssertEqual(sut.recentSearches.count, 1)
        XCTAssertEqual(sut.recentSearches.first, "swift")
    }

    func test_addToRecentSearches_movesExistingToTop() {
        let sut = makeSUT()

        sut.addToRecentSearches("first")
        sut.addToRecentSearches("second")
        sut.addToRecentSearches("first")

        XCTAssertEqual(sut.recentSearches, ["first", "second"])
    }

    func test_addToRecentSearches_limitsToTenEntries() {
        let sut = makeSUT()

        for i in 0..<12 {
            sut.addToRecentSearches("search_\(i)")
        }

        XCTAssertEqual(sut.recentSearches.count, 10)
        XCTAssertEqual(sut.recentSearches.first, "search_11")
    }

    func test_addToRecentSearches_ignoresEmptyOrWhitespace() {
        let sut = makeSUT()

        sut.addToRecentSearches("")
        sut.addToRecentSearches("   ")

        XCTAssertTrue(sut.recentSearches.isEmpty)
    }

    func test_addToRecentSearches_persistsToUserDefaults() {
        let sut = makeSUT()

        sut.addToRecentSearches("persisted")

        let stored = UserDefaults.standard.stringArray(forKey: defaultsKey)
        XCTAssertEqual(stored, ["persisted"])
    }

    func test_removeRecentSearch_removesSpecificEntry() {
        let sut = makeSUT()
        sut.addToRecentSearches("keep")
        sut.addToRecentSearches("remove")

        sut.removeRecentSearch("remove")

        XCTAssertEqual(sut.recentSearches, ["keep"])
    }

    func test_removeRecentSearch_persistsRemoval() {
        let sut = makeSUT()
        sut.addToRecentSearches("toRemove")

        sut.removeRecentSearch("toRemove")

        let stored = UserDefaults.standard.stringArray(forKey: defaultsKey)
        XCTAssertEqual(stored, [])
    }

    func test_clearRecentSearches_removesAllEntries() {
        let sut = makeSUT()
        sut.addToRecentSearches("one")
        sut.addToRecentSearches("two")

        sut.clearRecentSearches()

        XCTAssertTrue(sut.recentSearches.isEmpty)
    }

    func test_clearRecentSearches_persistsClear() {
        let sut = makeSUT()
        sut.addToRecentSearches("one")

        sut.clearRecentSearches()

        let stored = UserDefaults.standard.stringArray(forKey: defaultsKey)
        XCTAssertEqual(stored, [])
    }

    // MARK: - Helpers

    private func stubEmptyConversationSearch() {
        let emptyResponse: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[]}
        """)
        mockAPI.stub("/conversations/search", result: emptyResponse)
    }

    private func stubEmptySearchResults() {
        stubEmptyConversationSearch()
        mockUserService.searchUsersResult = .success([])
    }
}

// MARK: - UserSearchResult Test Helper

private extension UserSearchResult {
    static func stub(
        id: String = "user-stub",
        username: String = "stubuser",
        displayName: String? = "Stub",
        avatar: String? = nil,
        isOnline: Bool? = false
    ) -> UserSearchResult {
        let displayNameJSON = displayName.map { "\"\($0)\"" } ?? "null"
        let isOnlineJSON = isOnline.map { $0 ? "true" : "false" } ?? "null"
        return JSONStub.decode("""
        {"id":"\(id)","username":"\(username)","displayName":\(displayNameJSON),"avatar":null,"isOnline":\(isOnlineJSON)}
        """)
    }
}
