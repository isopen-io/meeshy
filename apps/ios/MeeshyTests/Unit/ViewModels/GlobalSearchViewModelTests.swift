import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

@MainActor
final class GlobalSearchViewModelTests: XCTestCase {

    private let defaultsKey = "globalSearch.recentSearches"

    // MARK: - Lifecycle

    override func setUp() async throws {
        try await super.setUp()
        // Recent searches persist via UserDefaults — clear so a previous run
        // doesn't bleed into `test_init_*` and `test_addToRecentSearches_*`.
        UserDefaults.standard.removeObject(forKey: defaultsKey)
        // performSearch hydrates local hits from the process-wide SearchIndex.shared
        // FTS index; clear it so rows indexed by another test can't inflate the
        // conversation/user result counts here.
        await SearchIndex.shared.clearAll()
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: defaultsKey)
        super.tearDown()
    }

    // MARK: - Factory

    private func makeEmptyPool() throws -> DatabaseQueue {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        return pool
    }

    private func makeSUT(
        searchService: MessageSearchService? = nil,
        messageSocket: MockMessageSocket? = nil,
        socialSocket: MockSocialSocket? = nil,
        socialEvents: MockSocialEventsV2Reporter? = nil
    ) throws -> (
        sut: GlobalSearchViewModel,
        mockAPI: MockAPIClientForApp,
        mockUserService: MockUserService,
        mockAuthManager: MockAuthManager
    ) {
        let mockAPI = MockAPIClientForApp()
        let mockUserService = MockUserService()
        let mockAuthManager = MockAuthManager()
        let service = try searchService ?? MessageSearchService(reader: makeEmptyPool())
        let sut = GlobalSearchViewModel(
            api: mockAPI,
            userService: mockUserService,
            authManager: mockAuthManager,
            searchService: service,
            messageSocket: messageSocket ?? MockMessageSocket(),
            socialSocket: socialSocket ?? MockSocialSocket(),
            socialEvents: socialEvents ?? MockSocialEventsV2Reporter()
        )
        return (sut, mockAPI, mockUserService, mockAuthManager)
    }

    // MARK: - #10505 : l'identifiant de recherche est celui que la passerelle a servi

    private func discoveries(_ reporter: MockSocialEventsV2Reporter, _ action: SocialDiscovery.Action) -> [SocialDiscovery] {
        reporter.payloads { payload -> SocialDiscovery? in
            guard case .discovery(let discovery) = payload, discovery.action == action else { return nil }
            return discovery
        }
    }

    func test_performSearch_serverServesSearchId_submittedEventCarriesIt() async throws {
        let reporter = MockSocialEventsV2Reporter()
        let (sut, _, mockUserService, _) = try makeSUT(socialEvents: reporter)
        mockUserService.searchUsersResult = .success([UserSearchResult(id: "u7", username: "aminata")])
        mockUserService.servedSearchId = "a1b2c3sealed"

        await sut.performSearch(query: "aminata")

        let submitted = discoveries(reporter, .searchSubmitted)
        XCTAssertEqual(submitted.map(\.searchId), ["a1b2c3sealed"])
        XCTAssertEqual(submitted.first?.resultCount, 1)
        XCTAssertEqual(sut.searchId, "a1b2c3sealed")
    }

    func test_performSearch_serverServesNoSearchId_submittedEventHasNone() async throws {
        let reporter = MockSocialEventsV2Reporter()
        let (sut, _, mockUserService, _) = try makeSUT(socialEvents: reporter)
        mockUserService.searchUsersResult = .success([UserSearchResult(id: "u7", username: "aminata")])

        await sut.performSearch(query: "aminata")

        let submitted = discoveries(reporter, .searchSubmitted)
        XCTAssertEqual(submitted.count, 1)
        XCTAssertNil(submitted.first?.searchId, "sans identifiant servi, le client n'en fabrique pas")
        XCTAssertNil(sut.searchId)
    }

    func test_noteUserResultTapped_afterAServedSearch_carriesTheServedSearchId() async throws {
        let reporter = MockSocialEventsV2Reporter()
        let (sut, _, mockUserService, _) = try makeSUT(socialEvents: reporter)
        mockUserService.searchUsersResult = .success([UserSearchResult(id: "u7", username: "aminata")])
        mockUserService.servedSearchId = "a1b2c3sealed"
        await sut.performSearch(query: "aminata")

        sut.noteUserResultTapped("u7", position: 0)

        XCTAssertEqual(discoveries(reporter, .searchResultClick).map(\.searchId), ["a1b2c3sealed"])
    }

    func test_noteUserResultTapped_remoteSearchFailed_carriesNoSearchId() async throws {
        let reporter = MockSocialEventsV2Reporter()
        let (sut, _, mockUserService, _) = try makeSUT(socialEvents: reporter)
        mockUserService.searchUsersResult = .success([UserSearchResult(id: "u7", username: "aminata")])
        mockUserService.servedSearchId = "a1b2c3sealed"
        await sut.performSearch(query: "aminata")
        mockUserService.searchUsersResult = .failure(URLError(.notConnectedToInternet))
        await sut.performSearch(query: "aminata d")

        sut.noteUserResultTapped("u7", position: 0)

        XCTAssertEqual(discoveries(reporter, .searchResultClick).map(\.searchId), [nil], "l'identifiant d'une recherche précédente ne se recopie pas sur la suivante")
    }

    /// Drains the main dispatch queue deterministically: enqueues a continuation
    /// AFTER any `.receive(on: DispatchQueue.main)` sink block already queued by
    /// a preceding publisher `.send(...)`, so when it resumes those sinks have
    /// run. Avoids `Task.sleep` flakiness for socket-driven cache invalidation.
    private func drainMainQueue() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            DispatchQueue.main.async { cont.resume() }
        }
    }

    private static func makeConversationUpdatedEvent(conversationId: String) -> ConversationUpdatedEvent {
        let json = """
        {"conversationId":"\(conversationId)","title":"Renamed","updatedAt":"2026-06-02T00:00:00.000Z"}
        """
        let decoder = JSONDecoder()
        return try! decoder.decode(ConversationUpdatedEvent.self, from: Data(json.utf8))
    }

    private func makeCurrentUser() -> MeeshyUser {
        MeeshyUser(id: "user-001", username: "testuser", displayName: "Test User")
    }

    // MARK: - Init Tests

    func test_init_loadsRecentSearchesFromUserDefaults() throws {
        UserDefaults.standard.set(["swift", "ios"], forKey: defaultsKey)

        let (sut, _, _, _) = try makeSUT()

        XCTAssertEqual(sut.recentSearches, ["swift", "ios"])
    }

    func test_init_setsEmptyRecentSearchesWhenNoDefaultsExist() throws {
        let (sut, _, _, _) = try makeSUT()

        XCTAssertTrue(sut.recentSearches.isEmpty)
    }

    func test_init_defaultStateIsCorrect() throws {
        let (sut, _, _, _) = try makeSUT()

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
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        stubEmptySearchResults(on: mockAPI, userService: mockUserService)

        await sut.performSearch(query: "hello")

        XCTAssertFalse(sut.isSearching)
        XCTAssertTrue(sut.hasSearched)
    }

    func test_performSearch_withValidQuery_populatesUserResults() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        stubEmptyConversationSearch(on: mockAPI)
        mockUserService.searchUsersResult = .success([
            UserSearchResult.stub(id: "u1", username: "alice", displayName: "Alice", isOnline: true),
            UserSearchResult.stub(id: "u2", username: "bob", displayName: "Bob", isOnline: false),
        ])

        await sut.performSearch(query: "test")

        XCTAssertEqual(sut.userResults.count, 2)
        XCTAssertEqual(sut.userResults[0].username, "alice")
        XCTAssertEqual(sut.userResults[1].username, "bob")
        XCTAssertTrue(sut.userResults[0].isOnline)
        XCTAssertFalse(sut.userResults[1].isOnline)
    }

    func test_performSearch_setsResultsQueryToSearchedQuery() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        stubEmptyConversationSearch(on: mockAPI)
        mockUserService.searchUsersResult = .success([
            UserSearchResult.stub(id: "u1", username: "alice", displayName: "Alice", isOnline: true)
        ])

        await sut.performSearch(query: "alice")

        // Result highlighting binds to the query that produced the results, not
        // the live `searchText`, so it stays stable (and correct) while typing.
        XCTAssertEqual(sut.resultsQuery, "alice")
    }

    func test_performSearch_whenAPIFails_returnsEmptyResults() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        mockAPI.errorToThrow = NSError(domain: "test", code: 500)
        mockUserService.searchUsersResult = .failure(NSError(domain: "test", code: 500))

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

        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT(searchService: searchService)
        // API configured to throw on every call (simulates offline / network failure)
        mockAPI.errorToThrow = URLError(.notConnectedToInternet)
        mockUserService.searchUsersResult = .failure(URLError(.notConnectedToInternet))
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())

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

    // MARK: - vm-search-localname-01 — nom local résolu depuis le cache

    func test_searchMessages_localResult_hydratesConversationNameFromCache() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        try await pool.write { db in
            try SearchTestMessageRecordFactory.make(
                localId: "local-name-1",
                conversationId: "conv-hydrate",
                content: "hello naming world"
            ).insert(db)
        }
        try? await CacheCoordinator.shared.conversations.save(
            [MeeshyConversation(id: "conv-hydrate", identifier: "conv-hydrate", type: .group, title: "Alice & Bob")],
            for: "list"
        )
        let searchService = MessageSearchService(reader: pool)
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT(searchService: searchService)
        mockAPI.errorToThrow = URLError(.notConnectedToInternet)
        mockUserService.searchUsersResult = .failure(URLError(.notConnectedToInternet))
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())

        await sut.performSearch(query: "naming")

        XCTAssertEqual(
            sut.messageResults.first?.conversationName, "Alice & Bob",
            "offline, le titre du résultat doit venir du cache conversations — pas l'ObjectId brut"
        )
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

        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT(searchService: searchService)
        // Network returns the same message id (server-side hit)
        let networkConvResponse: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[]}
        """)
        mockAPI.stub("/conversations/search", result: networkConvResponse)
        mockUserService.searchUsersResult = .success([])
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())

        // Act
        await sut.performSearch(query: "matching")

        // Assert: no duplicates — the shared-id message appears exactly once
        let ids = sut.messageResults.map(\.id)
        XCTAssertEqual(ids.count, Set(ids).count, "mergeUnique must deduplicate by message id")
    }

    // MARK: - #9619 — un message qui disparaît ne sort pas par la recherche

    /// La loi de sortie (#9572) : un contenu qui disparaît ne quitte pas sa
    /// conversation. Un résultat de recherche le montrait en clair, hors de
    /// toute couche sécurisée, et le laissait capturer — et le seul fait qu'il
    /// RÉPONDE à la requête dit déjà un mot de son texte. Il n'y paraît donc
    /// pas, ni par l'index local (FTS5), ni par le volet réseau.
    func test_searchMessages_localResults_leaveOutMessagesThatDisappear() async throws {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        var viewOnce = SearchTestMessageRecordFactory.make(
            localId: "local-view-once", conversationId: "conv-exit", content: "rendezvous secret unique"
        )
        viewOnce.effectFlags = MessageEffectFlags.viewOnce.rawValue
        var timedFlame = SearchTestMessageRecordFactory.make(
            localId: "local-timed-flame", conversationId: "conv-exit", content: "rendezvous secret flamme"
        )
        timedFlame.effectFlags = MessageEffectFlags.ephemeral.rawValue
        timedFlame.ephemeralDuration = 30
        var afterRead = SearchTestMessageRecordFactory.make(
            localId: "local-after-read", conversationId: "conv-exit", content: "rendezvous secret lecture"
        )
        afterRead.effectFlags = MessageEffectFlags.ephemeral.rawValue | MessageEffectFlags.ephemeralAfterRead.rawValue
        let ordinary = SearchTestMessageRecordFactory.make(
            localId: "local-ordinary", conversationId: "conv-exit", content: "rendezvous public"
        )
        let records = [viewOnce, timedFlame, afterRead, ordinary]
        try await pool.write { db in
            for record in records { try record.insert(db) }
        }
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT(
            searchService: MessageSearchService(reader: pool)
        )
        mockAPI.errorToThrow = URLError(.notConnectedToInternet)
        mockUserService.searchUsersResult = .failure(URLError(.notConnectedToInternet))
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())

        await sut.performSearch(query: "rendezvous")

        XCTAssertEqual(
            sut.messageResults.map(\.id), ["local-ordinary"],
            "une vue unique, une flamme à durée et une flamme après lecture ne sortent pas par la recherche locale"
        )
    }

    func test_searchMessages_remoteResults_leaveOutMessagesThatDisappear() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        mockUserService.searchUsersResult = .success([])
        let conversations: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[{"id":"conv-exit","type":"group","title":"Exit","createdAt":"2026-01-01T00:00:00Z"}]}
        """)
        mockAPI.stub("/conversations/search", result: conversations)
        let messages: MessagesAPIResponse = JSONStub.decode("""
        {"success":true,"data":[
            {"id":"msg-ordinary","conversationId":"conv-exit","senderId":"user-002","content":"rendezvous public","createdAt":"2026-01-01T00:04:00.000Z"},
            {"id":"msg-view-once","conversationId":"conv-exit","senderId":"user-002","content":"rendezvous secret unique","isViewOnce":true,"createdAt":"2026-01-01T00:03:00.000Z"},
            {"id":"msg-timed-flame","conversationId":"conv-exit","senderId":"user-002","content":"rendezvous secret flamme","effectFlags":1,"ephemeralDuration":30,"createdAt":"2026-01-01T00:02:00.000Z"},
            {"id":"msg-after-read","conversationId":"conv-exit","senderId":"user-002","content":"rendezvous secret lecture","effectFlags":9,"createdAt":"2026-01-01T00:01:00.000Z"},
            {"id":"msg-view-once-piece","conversationId":"conv-exit","senderId":"user-002","content":"rendezvous secret piece","attachments":[{"id":"att-1","fileName":"a.jpg","originalName":"a.jpg","mimeType":"image/jpeg","fileSize":1,"fileUrl":"https://x/a.jpg","isViewOnce":true,"createdAt":"2026-01-01T00:00:00.000Z"}],"createdAt":"2026-01-01T00:00:00.000Z"}
        ],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
        mockAPI.stub("/conversations/conv-exit/messages/search", result: messages)

        await sut.performSearch(query: "rendezvous")

        XCTAssertEqual(
            sut.messageResults.map(\.id), ["msg-ordinary"],
            "le volet réseau applique la même loi : rien de ce qui disparaît, pièce jointe protégée comprise"
        )
    }

    // MARK: - Tab Counts Tests

    func test_tabCounts_reflectResultArraySizes() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        stubEmptyConversationSearch(on: mockAPI)
        mockUserService.searchUsersResult = .success([
            UserSearchResult.stub(id: "u1", username: "alice"),
            UserSearchResult.stub(id: "u2", username: "bob"),
            UserSearchResult.stub(id: "u3", username: "carol"),
        ])

        await sut.performSearch(query: "test")

        XCTAssertEqual(sut.userCount, 3)
        XCTAssertEqual(sut.messageCount, 0)
        XCTAssertEqual(sut.conversationCount, 0)
        XCTAssertEqual(sut.totalResultCount, 3)
    }

    // MARK: - Recent Searches Tests

    func test_addToRecentSearches_addsNewEntry() throws {
        let (sut, _, _, _) = try makeSUT()

        sut.addToRecentSearches("swift")

        XCTAssertEqual(sut.recentSearches, ["swift"])
    }

    func test_addToRecentSearches_deduplicatesCaseInsensitive() throws {
        let (sut, _, _, _) = try makeSUT()

        sut.addToRecentSearches("Swift")
        sut.addToRecentSearches("swift")

        XCTAssertEqual(sut.recentSearches.count, 1)
        XCTAssertEqual(sut.recentSearches.first, "swift")
    }

    func test_addToRecentSearches_movesExistingToTop() throws {
        let (sut, _, _, _) = try makeSUT()

        sut.addToRecentSearches("first")
        sut.addToRecentSearches("second")
        sut.addToRecentSearches("first")

        XCTAssertEqual(sut.recentSearches, ["first", "second"])
    }

    func test_addToRecentSearches_limitsToTenEntries() throws {
        let (sut, _, _, _) = try makeSUT()

        for i in 0..<12 {
            sut.addToRecentSearches("search_\(i)")
        }

        XCTAssertEqual(sut.recentSearches.count, 10)
        XCTAssertEqual(sut.recentSearches.first, "search_11")
    }

    func test_addToRecentSearches_ignoresEmptyOrWhitespace() throws {
        let (sut, _, _, _) = try makeSUT()

        sut.addToRecentSearches("")
        sut.addToRecentSearches("   ")

        XCTAssertTrue(sut.recentSearches.isEmpty)
    }

    func test_addToRecentSearches_persistsToUserDefaults() throws {
        let (sut, _, _, _) = try makeSUT()

        sut.addToRecentSearches("persisted")

        let stored = UserDefaults.standard.stringArray(forKey: defaultsKey)
        XCTAssertEqual(stored, ["persisted"])
    }

    func test_removeRecentSearch_removesSpecificEntry() throws {
        let (sut, _, _, _) = try makeSUT()
        sut.addToRecentSearches("keep")
        sut.addToRecentSearches("remove")

        sut.removeRecentSearch("remove")

        XCTAssertEqual(sut.recentSearches, ["keep"])
    }

    func test_removeRecentSearch_persistsRemoval() throws {
        let (sut, _, _, _) = try makeSUT()
        sut.addToRecentSearches("toRemove")

        sut.removeRecentSearch("toRemove")

        let stored = UserDefaults.standard.stringArray(forKey: defaultsKey)
        XCTAssertEqual(stored, [])
    }

    func test_clearRecentSearches_removesAllEntries() throws {
        let (sut, _, _, _) = try makeSUT()
        sut.addToRecentSearches("one")
        sut.addToRecentSearches("two")

        sut.clearRecentSearches()

        XCTAssertTrue(sut.recentSearches.isEmpty)
    }

    func test_clearRecentSearches_persistsClear() throws {
        let (sut, _, _, _) = try makeSUT()
        sut.addToRecentSearches("one")

        sut.clearRecentSearches()

        let stored = UserDefaults.standard.stringArray(forKey: defaultsKey)
        XCTAssertEqual(stored, [])
    }

    // MARK: - Message Query Cache (in-memory LRU)

    /// Re-issuing the SAME query within the staleTTL window must short-circuit
    /// the message-search network leg of `performSearch`. `performSearch`
    /// hits `/conversations/search` TWICE per call (once for conversations,
    /// once via `fetchRemoteMessageResults` to discover candidate conversations
    /// for the message search). Only the message-search half is cached, so we
    /// expect the second call to consume one fewer round-trip than the first.
    func test_searchMessages_repeatQueryUsesInMemoryCache() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let convResponse: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[]}
        """)
        mockAPI.stub("/conversations/search", result: convResponse)
        mockUserService.searchUsersResult = .success([])

        await sut.performSearch(query: "swift")
        let firstCallCount = mockAPI.requestEndpoints.filter { $0 == "/conversations/search" }.count
        XCTAssertGreaterThanOrEqual(firstCallCount, 1)

        await sut.performSearch(query: "swift")
        let secondCallCount = mockAPI.requestEndpoints.filter { $0 == "/conversations/search" }.count
        let delta = secondCallCount - firstCallCount

        XCTAssertLessThan(
            delta, firstCallCount,
            "Second identical query must save at least one round-trip via the in-memory message-search cache (first=\(firstCallCount), delta=\(delta))"
        )
    }

    /// A different query must NOT hit the cache — the second call's delta
    /// equals the first call's count (no savings from the cache).
    func test_searchMessages_differentQuerySkipsCache() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let convResponse: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[]}
        """)
        mockAPI.stub("/conversations/search", result: convResponse)
        mockUserService.searchUsersResult = .success([])

        await sut.performSearch(query: "swift")
        let firstCallCount = mockAPI.requestEndpoints.filter { $0 == "/conversations/search" }.count

        await sut.performSearch(query: "kotlin")
        let secondCallCount = mockAPI.requestEndpoints.filter { $0 == "/conversations/search" }.count

        XCTAssertEqual(
            secondCallCount - firstCallCount, firstCallCount,
            "Different query must replay the same number of calls — cache is keyed by query"
        )
    }

    // MARK: - Message Query Cache invalidation (D2 — Round-5)

    /// A `conversation:updated` (rename/avatar) can leave a cached search result
    /// showing the stale title. The in-memory message-query cache must be cleared
    /// so the next identical query re-fetches (full network replay, no savings).
    func test_conversationUpdated_invalidatesMessageQueryCache() async throws {
        let messageSocket = MockMessageSocket()
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT(messageSocket: messageSocket)
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let convResponse: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[]}
        """)
        mockAPI.stub("/conversations/search", result: convResponse)
        mockUserService.searchUsersResult = .success([])

        await sut.performSearch(query: "swift")
        let firstCallCount = mockAPI.requestEndpoints.filter { $0 == "/conversations/search" }.count
        XCTAssertGreaterThanOrEqual(firstCallCount, 1)

        messageSocket.conversationUpdated.send(Self.makeConversationUpdatedEvent(conversationId: "c1"))
        await drainMainQueue()

        await sut.performSearch(query: "swift")
        let secondCallCount = mockAPI.requestEndpoints.filter { $0 == "/conversations/search" }.count

        XCTAssertEqual(
            secondCallCount - firstCallCount, firstCallCount,
            "After conversation:updated the message-query cache must be cleared, so the same query replays the full network leg (no cache savings)"
        )
    }

    /// A `conversation:deleted`/`closed` must invalidate the cache too — a cached
    /// result for that conversation would otherwise linger as a dead row.
    func test_conversationDeleted_invalidatesMessageQueryCache() async throws {
        let socialSocket = MockSocialSocket()
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT(socialSocket: socialSocket)
        mockAuthManager.simulateLoggedIn(user: makeCurrentUser())
        let convResponse: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[]}
        """)
        mockAPI.stub("/conversations/search", result: convResponse)
        mockUserService.searchUsersResult = .success([])

        await sut.performSearch(query: "swift")
        let firstCallCount = mockAPI.requestEndpoints.filter { $0 == "/conversations/search" }.count
        XCTAssertGreaterThanOrEqual(firstCallCount, 1)

        socialSocket.conversationDeleted.send("c1")
        await drainMainQueue()

        await sut.performSearch(query: "swift")
        let secondCallCount = mockAPI.requestEndpoints.filter { $0 == "/conversations/search" }.count

        XCTAssertEqual(
            secondCallCount - firstCallCount, firstCallCount,
            "After conversation:deleted the message-query cache must be cleared, so the same query replays the full network leg (no cache savings)"
        )
    }

    // MARK: - Helpers

    // MARK: - Prisme Linguistique de la ligne de resultat

    /// `GET /conversations/search` sert `lastMessageTranslations` /
    /// `lastMessageOriginalLanguage` au meme titre que `GET /conversations`.
    /// La ligne de resultat de recherche EST une ligne de conversation : elle
    /// doit rendre le meme texte que `ThemedConversationRow`, qui resout via
    /// `resolvedLastMessagePreview`. Avant ce correctif elle rendait
    /// `lastMessagePreview` brut — donc la langue de l'expediteur.
    private func stubConversationSearch(
        on mockAPI: MockAPIClientForApp,
        translations: String,
        originalLanguage: String
    ) {
        let response: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[{
          "id":"conv-prisme-1","type":"group","title":"Prisme","createdAt":"2026-01-01T00:00:00Z",
          "lastMessage":{"id":"msg-1","content":"Hello everyone","createdAt":"2026-01-01T00:00:00Z"},
          "lastMessageTranslations":\(translations),
          "lastMessageOriginalLanguage":"\(originalLanguage)"
        }]}
        """)
        mockAPI.stub("/conversations/search", result: response)
    }

    func test_searchConversations_appliesPrismeToRemoteResultPreview() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(
            user: MeeshyUser(id: "user-001", username: "testuser", systemLanguage: "fr")
        )
        mockUserService.searchUsersResult = .success([])
        stubConversationSearch(
            on: mockAPI,
            translations: #"{"fr":"Bonjour tout le monde"}"#,
            originalLanguage: "en"
        )

        await sut.performSearch(query: "prisme")

        XCTAssertEqual(
            sut.conversationResults.first?.lastMessagePreview, "Bonjour tout le monde",
            "la ligne de resultat doit rendre la langue primaire du lecteur, pas l'original"
        )
    }

    func test_searchConversations_keepsOriginalPreviewWhenNoPreferredTranslation() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(
            user: MeeshyUser(id: "user-001", username: "testuser", systemLanguage: "fr")
        )
        mockUserService.searchUsersResult = .success([])
        // `es` existe mais n'appartient pas au prisme du lecteur : regle #1 du
        // Prisme — ne JAMAIS retomber sur une traduction quelconque.
        stubConversationSearch(
            on: mockAPI,
            translations: #"{"es":"Hola a todos"}"#,
            originalLanguage: "en"
        )

        await sut.performSearch(query: "prisme")

        XCTAssertEqual(
            sut.conversationResults.first?.lastMessagePreview, "Hello everyone",
            "aucune traduction du prisme servie => l'original, jamais une langue tierce"
        )
    }

    func test_searchConversations_originalLanguageCompetesAtItsOwnRank() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        // Prisme ["fr", "en"] : la langue d'origine (en) occupe le RANG 2. Elle
        // ne doit jamais court-circuiter la langue primaire (regle #3, cycle 62).
        mockAuthManager.simulateLoggedIn(
            user: MeeshyUser(
                id: "user-001", username: "testuser",
                systemLanguage: "fr", regionalLanguage: "en"
            )
        )
        mockUserService.searchUsersResult = .success([])
        stubConversationSearch(
            on: mockAPI,
            translations: #"{"fr":"Bonjour tout le monde"}"#,
            originalLanguage: "en"
        )

        await sut.performSearch(query: "prisme")

        XCTAssertEqual(
            sut.conversationResults.first?.lastMessagePreview, "Bonjour tout le monde",
            "la langue d'origine au rang 2 ne retrograde pas la langue primaire"
        )
    }

    /// #9622 — la ligne de résultat de conversation est un aperçu publié HORS
    /// du fil : le texte d'une flamme à durée, que le serveur sert, n'y paraît
    /// pas ; seul son libellé de protection.
    func test_searchConversations_timedFlameLastMessage_showsItsProtectionLabel_neverItsText() async throws {
        let (sut, mockAPI, mockUserService, mockAuthManager) = try makeSUT()
        mockAuthManager.simulateLoggedIn(
            user: MeeshyUser(id: "user-001", username: "testuser", systemLanguage: "fr")
        )
        mockUserService.searchUsersResult = .success([])
        let response: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[{
          "id":"conv-flame-1","type":"group","title":"Flamme","createdAt":"2026-01-01T00:00:00Z",
          "lastMessage":{"id":"msg-1","content":"Rendez-vous secret","effectFlags":1,"ephemeralDuration":30,"createdAt":"2026-01-01T00:00:00Z"}
        }]}
        """)
        mockAPI.stub("/conversations/search", result: response)

        await sut.performSearch(query: "flamme")

        XCTAssertEqual(
            sut.conversationResults.first?.lastMessagePreview,
            OutsidePreview.protectionLabel(for: .timedFlame),
            "le texte d'une flamme à durée ne sort pas par un résultat de recherche"
        )
    }

    private func stubEmptyConversationSearch(on mockAPI: MockAPIClientForApp) {
        let emptyResponse: APIResponse<[APIConversation]> = JSONStub.decode("""
        {"success":true,"data":[]}
        """)
        mockAPI.stub("/conversations/search", result: emptyResponse)
    }

    private func stubEmptySearchResults(
        on mockAPI: MockAPIClientForApp,
        userService: MockUserService
    ) {
        stubEmptyConversationSearch(on: mockAPI)
        userService.searchUsersResult = .success([])
    }
}

// MARK: - UserSearchResult Test Helper

extension UserSearchResult {
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
