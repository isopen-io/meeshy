import XCTest
import GRDB
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

    private func makeEmptyPool() throws -> DatabaseQueue {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        return pool
    }

    private func makeSUT(searchService: MessageSearchService? = nil) throws -> GlobalSearchViewModel {
        let service = try searchService ?? MessageSearchService(reader: makeEmptyPool())
        return GlobalSearchViewModel(
            api: mockAPI,
            userService: mockUserService,
            authManager: mockAuthManager,
            searchService: service
        )
    }

    private func makeCurrentUser() -> MeeshyUser {
        MeeshyUser(id: "user-001", username: "testuser", displayName: "Test User")
    }

    // MARK: - Init Tests

    func test_init_loadsRecentSearchesFromUserDefaults() throws {
        UserDefaults.standard.set(["swift", "ios"], forKey: defaultsKey)

        let sut = try makeSUT()

        XCTAssertEqual(sut.recentSearches, ["swift", "ios"])
    }

    func test_init_setsEmptyRecentSearchesWhenNoDefaultsExist() throws {
        let sut = try makeSUT()

        XCTAssertTrue(sut.recentSearches.isEmpty)
    }

    func test_init_defaultStateIsCorrect() throws {
        let sut = try makeSUT()

        XCTAssertEqual(sut.searchText, "")
        XCTAssertEqual(sut.selectedTab, .messages)
        XCTAssertTrue(sut.messageResults.isEmpty)
        XCTAssertTrue(sut.conversationResults.isEmpty)
        XCTAssertTrue(sut.userResults.isEmpty)
        XCTAssertFalse(sut.isSearching)
        XCTAssertFalse(sut.hasSearched)
    }

    // MARK: - performSearch Tests

    func test_performSearch_withValidQuery_setsIsSearchingAndHasSearched() async throws {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        stubEmptySearchResults()
        let sut = try makeSUT()

        await sut.performSearch(query: "hello")

        XCTAssertFalse(sut.isSearching)
        XCTAssertTrue(sut.hasSearched)
    }

    func test_performSearch_withValidQuery_populatesUserResults() async throws {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        stubEmptyConversationSearch()
        mockUserService.searchUsersResult = .success([
            UserSearchResult.stub(id: "u1", username: "alice", displayName: "Alice", isOnline: true),
            UserSearchResult.stub(id: "u2", username: "bob", displayName: "Bob", isOnline: false),
        ])
        let sut = try makeSUT()

        await sut.performSearch(query: "test")

        XCTAssertEqual(sut.userResults.count, 2)
        XCTAssertEqual(sut.userResults[0].username, "alice")
        XCTAssertEqual(sut.userResults[1].username, "bob")
        XCTAssertTrue(sut.userResults[0].isOnline)
        XCTAssertFalse(sut.userResults[1].isOnline)
    }

    func test_performSearch_whenAPIFails_returnsEmptyResults() async throws {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        mockAPI.errorToThrow = NSError(domain: "test", code: 500)
        mockUserService.searchUsersResult = .failure(NSError(domain: "test", code: 500))
        let sut = try makeSUT()

        await sut.performSearch(query: "fail")

        XCTAssertTrue(sut.messageResults.isEmpty)
        XCTAssertTrue(sut.conversationResults.isEmpty)
        XCTAssertTrue(sut.userResults.isEmpty)
        XCTAssertTrue(sut.hasSearched)
    }

    // MARK: - FTS5 Local Search Tests

    func test_searchMessages_returnsLocalFTS5Results_whenNetworkFails() async throws {
        // Arrange: in-memory DB with one matching message
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        try await pool.write { db in
            try SearchTestMessageRecordFactory.make(
                localId: "local-fts-1",
                conversationId: "conv-fts",
                content: "hello fts world"
            ).insert(db)
        }
        let searchService = MessageSearchService(reader: pool)

        // API configured to throw on every call (simulates offline / network failure)
        mockAPI.errorToThrow = URLError(.notConnectedToInternet)
        mockUserService.searchUsersResult = .failure(URLError(.notConnectedToInternet))
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())

        let sut = try makeSUT(searchService: searchService)

        // Act
        await sut.performSearch(query: "hello")

        // Assert: local FTS5 result is present despite network failure
        XCTAssertGreaterThan(
            sut.messageResults.count, 0,
            "FTS5 local results must appear even when the network fails"
        )
        XCTAssertEqual(sut.messageResults.first?.id, "local-fts-1")
        XCTAssertEqual(sut.messageResults.first?.conversationId, "conv-fts")
        XCTAssertEqual(sut.messageResults.first?.content, "hello fts world")
    }

    func test_searchMessages_mergesLocalAndRemoteResults_deduplicatesById() async throws {
        // Arrange: in-memory DB with one message already matching
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        try await pool.write { db in
            try SearchTestMessageRecordFactory.make(
                localId: "shared-id",
                conversationId: "conv-1",
                content: "matching content"
            ).insert(db)
        }
        let searchService = MessageSearchService(reader: pool)

        // Network returns the same message id (server-side hit)
        let networkConvResponse: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[]}
        """)
        mockAPI.stub("/conversations/search", result: networkConvResponse)
        mockUserService.searchUsersResult = .success([])
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())

        let sut = try makeSUT(searchService: searchService)

        // Act
        await sut.performSearch(query: "matching")

        // Assert: no duplicates — the shared-id message appears exactly once
        let ids = sut.messageResults.map(\.id)
        XCTAssertEqual(ids.count, Set(ids).count, "mergeUnique must deduplicate by message id")
    }

    // MARK: - Tab Counts Tests

    func test_tabCounts_reflectResultArraySizes() async throws {
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        stubEmptyConversationSearch()
        mockUserService.searchUsersResult = .success([
            UserSearchResult.stub(id: "u1", username: "alice"),
            UserSearchResult.stub(id: "u2", username: "bob"),
            UserSearchResult.stub(id: "u3", username: "carol"),
        ])
        let sut = try makeSUT()

        await sut.performSearch(query: "test")

        XCTAssertEqual(sut.userCount, 3)
        XCTAssertEqual(sut.messageCount, 0)
        XCTAssertEqual(sut.conversationCount, 0)
        XCTAssertEqual(sut.totalResultCount, 3)
    }

    // MARK: - Recent Searches Tests

    func test_addToRecentSearches_addsNewEntry() throws {
        let sut = try makeSUT()

        sut.addToRecentSearches("swift")

        XCTAssertEqual(sut.recentSearches, ["swift"])
    }

    func test_addToRecentSearches_deduplicatesCaseInsensitive() throws {
        let sut = try makeSUT()

        sut.addToRecentSearches("Swift")
        sut.addToRecentSearches("swift")

        XCTAssertEqual(sut.recentSearches.count, 1)
        XCTAssertEqual(sut.recentSearches.first, "swift")
    }

    func test_addToRecentSearches_movesExistingToTop() throws {
        let sut = try makeSUT()

        sut.addToRecentSearches("first")
        sut.addToRecentSearches("second")
        sut.addToRecentSearches("first")

        XCTAssertEqual(sut.recentSearches, ["first", "second"])
    }

    func test_addToRecentSearches_limitsToTenEntries() throws {
        let sut = try makeSUT()

        for i in 0..<12 {
            sut.addToRecentSearches("search_\(i)")
        }

        XCTAssertEqual(sut.recentSearches.count, 10)
        XCTAssertEqual(sut.recentSearches.first, "search_11")
    }

    func test_addToRecentSearches_ignoresEmptyOrWhitespace() throws {
        let sut = try makeSUT()

        sut.addToRecentSearches("")
        sut.addToRecentSearches("   ")

        XCTAssertTrue(sut.recentSearches.isEmpty)
    }

    func test_addToRecentSearches_persistsToUserDefaults() throws {
        let sut = try makeSUT()

        sut.addToRecentSearches("persisted")

        let stored = UserDefaults.standard.stringArray(forKey: defaultsKey)
        XCTAssertEqual(stored, ["persisted"])
    }

    func test_removeRecentSearch_removesSpecificEntry() throws {
        let sut = try makeSUT()
        sut.addToRecentSearches("keep")
        sut.addToRecentSearches("remove")

        sut.removeRecentSearch("remove")

        XCTAssertEqual(sut.recentSearches, ["keep"])
    }

    func test_removeRecentSearch_persistsRemoval() throws {
        let sut = try makeSUT()
        sut.addToRecentSearches("toRemove")

        sut.removeRecentSearch("toRemove")

        let stored = UserDefaults.standard.stringArray(forKey: defaultsKey)
        XCTAssertEqual(stored, [])
    }

    func test_clearRecentSearches_removesAllEntries() throws {
        let sut = try makeSUT()
        sut.addToRecentSearches("one")
        sut.addToRecentSearches("two")

        sut.clearRecentSearches()

        XCTAssertTrue(sut.recentSearches.isEmpty)
    }

    func test_clearRecentSearches_persistsClear() throws {
        let sut = try makeSUT()
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

// MARK: - MessageRecord Test Factory (local to this test file)

private enum SearchTestMessageRecordFactory {
    static func make(
        localId: String = "temp_\(UUID().uuidString)",
        conversationId: String = "conv_default",
        senderId: String = "user_me",
        content: String? = "Test message",
        state: MessageState = .sending,
        createdAt: Date = Date(),
        changeVersion: Int64 = 0
    ) -> MessageRecord {
        MessageRecord(
            localId: localId,
            serverId: nil,
            conversationId: conversationId,
            senderId: senderId,
            content: content,
            originalLanguage: "fr",
            messageType: "text",
            messageSource: "user",
            contentType: "text",
            state: state,
            retryCount: 0,
            lastError: nil,
            isEncrypted: false,
            encryptionMode: nil,
            encryptedPayload: nil,
            replyToId: nil,
            storyReplyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            replyToJson: nil,
            forwardedFromJson: nil,
            expiresAt: nil,
            effectFlags: 0,
            maxViewOnceCount: nil,
            viewOnceCount: 0,
            isEdited: false,
            editedAt: nil,
            deletedAt: nil,
            pinnedAt: nil,
            pinnedBy: nil,
            senderName: nil,
            senderUsername: nil,
            senderColor: nil,
            senderAvatarURL: nil,
            deliveredCount: 0,
            readCount: 0,
            deliveredToAllAt: nil,
            readByAllAt: nil,
            createdAt: createdAt,
            sentAt: nil,
            deliveredAt: nil,
            readAt: nil,
            updatedAt: createdAt,
            attachmentsJson: nil,
            reactionsJson: nil,
            reactionCount: 0,
            currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil,
            cachedBubbleHeight: nil,
            cachedLastLineWidth: nil,
            cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0,
            layoutMaxWidth: nil,
            changeVersion: changeVersion
        )
    }
}
