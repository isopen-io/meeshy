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
        // `sendRequest` flips this singleton — reset so a prior test's
        // `.pendingSent` entry never bleeds into the next (mirrors
        // RequestsViewModelTests' setUp/tearDown for the same cache).
        FriendshipCache.shared.clear()
    }

    override func tearDown() async throws {
        await CacheCoordinator.shared.userSearch.invalidate(for: "discover:suggestions")
        FriendshipCache.shared.clear()
        try await super.tearDown()
    }

    // MARK: - Factory

    private func makeSUT(
        friendService: MockFriendService = MockFriendService(),
        userService: MockUserService = MockUserService(),
        contactSync: MockContactSyncService = MockContactSyncService(),
        directoryService: MockContactDirectoryService = MockContactDirectoryService()
    ) -> (sut: DiscoverViewModel, friendService: MockFriendService, userService: MockUserService) {
        let sut = DiscoverViewModel(
            friendService: friendService,
            userService: userService,
            contactSync: contactSync,
            directoryService: directoryService
        )
        return (sut, friendService, userService)
    }

    /// Distinct factory (mirrors `RequestsViewModelTests.makeSUTWithQueue`) for
    /// the `sendRequest` outbox tests, so the 13 pre-existing call sites above
    /// keep destructuring a 3-tuple unchanged.
    private func makeSUTWithQueue(
        friendService: MockFriendService = MockFriendService(),
        offlineQueue: MockOfflineQueue = MockOfflineQueue()
    ) -> (sut: DiscoverViewModel, friendService: MockFriendService, offlineQueue: MockOfflineQueue) {
        let sut = DiscoverViewModel(friendService: friendService, offlineQueue: offlineQueue)
        return (sut, friendService, offlineQueue)
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

    // MARK: - sendRequest (Wave 4 — routed through the `.sendFriendRequest`
    // outbox instead of a direct `FriendService` REST call; see
    // `DiscoverViewModel.sendRequest` for the rationale. `FriendService` is no
    // longer touched by this path at all — `MockFriendService` stays at its
    // default in these tests to prove that.)

    func test_sendRequest_success_enqueuesSendFriendRequestViaOutbox() async {
        let (sut, friendService, offlineQueue) = makeSUTWithQueue()

        await sut.sendRequest(to: "u1")

        XCTAssertEqual(offlineQueue.enqueueCalls.count, 1)
        XCTAssertEqual(offlineQueue.enqueueCalls.first?.kind, .sendFriendRequest)
        let payload = offlineQueue.lastPayload as? SendFriendRequestPayload
        XCTAssertEqual(payload?.targetUserId, "u1")
        XCTAssertEqual(friendService.sendRequestCallCount, 0, "sendRequest must no longer call FriendService directly")
    }

    /// Core fix: the cache must flip to `.pendingSent` synchronously, before
    /// the enqueue is even awaited — the old code only flipped it inside the
    /// (awaited) success branch, so the success haptic fired with no
    /// accompanying optimistic state change at all.
    func test_sendRequest_flipsFriendshipCacheToPendingSentOptimistically() async {
        let (sut, _, _) = makeSUTWithQueue()

        await sut.sendRequest(to: "u1")

        guard case .pendingSent = FriendshipCache.shared.status(for: "u1") else {
            return XCTFail("Expected .pendingSent immediately after sendRequest")
        }
    }

    func test_sendRequest_enqueueFailure_rollsBackFriendshipCache() async {
        let queue = MockOfflineQueue()
        queue.enqueueResult = .failure(NSError(domain: "test", code: 500))
        let (sut, _, _) = makeSUTWithQueue(offlineQueue: queue)

        await sut.sendRequest(to: "u1")

        XCTAssertEqual(FriendshipCache.shared.status(for: "u1"), .none)
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

    private static func stubDirectoryContact(
        id: String = "c9",
        userId: String = "u9",
        displayName: String? = "Awa du bureau"
    ) -> DirectoryContact {
        DirectoryContact(
            id: id,
            contactKey: "key-\(id)",
            displayName: displayName,
            phoneNumbers: ["+221771234567"],
            emails: [],
            usernames: [],
            isOnMeeshy: true,
            matchedBy: "phone",
            matchedUser: MatchedContactUser(
                id: userId, username: "awa", firstName: "Awa", lastName: "Diallo", displayName: "Awa D."
            )
        )
    }

    func test_importContacts_success_populatesMatchesFromTheSavedDirectory() async {
        let contactSync = MockContactSyncService()
        let directory = MockContactDirectoryService()
        directory.listResult = .success([Self.stubDirectoryContact()])
        let (sut, _, _) = makeSUT(contactSync: contactSync, directoryService: directory)

        await sut.importContacts()

        XCTAssertEqual(sut.contactMatches.map(\.id), ["u9"])
        XCTAssertEqual(sut.contactMatches.first?.contactDisplayName, "Awa du bureau")
        XCTAssertTrue(sut.hasImportedContacts)
        XCTAssertFalse(sut.isImportingContacts)
    }

    func test_importContacts_persistsTheAddressBookAsAFullSync() async {
        let contactSync = MockContactSyncService()
        let (sut, _, _) = makeSUT(contactSync: contactSync)

        await sut.importContacts()

        // « Retrouver mes contacts » CONSERVE désormais le répertoire : c'est
        // ce qui alimente l'onglet Répertoire sans re-scanner l'appareil.
        XCTAssertEqual(contactSync.syncDirectoryCallCount, 1)
        XCTAssertEqual(contactSync.lastSyncDirectoryMode, .replace)
    }

    func test_importContacts_asksTheDirectoryForMeeshyContactsOnly() async {
        let directory = MockContactDirectoryService()
        let (sut, _, _) = makeSUT(directoryService: directory)

        await sut.importContacts()

        XCTAssertEqual(directory.lastListFilter, .meeshy)
    }

    func test_importContacts_accessDenied_leavesMatchesEmpty() async {
        let contactSync = MockContactSyncService()
        contactSync.syncDirectoryResult = .failure(ContactSyncError.accessDenied)
        let (sut, _, _) = makeSUT(contactSync: contactSync)

        await sut.importContacts()

        XCTAssertTrue(sut.contactMatches.isEmpty)
        XCTAssertFalse(sut.hasImportedContacts)
        XCTAssertFalse(sut.isImportingContacts)
    }

    func test_importContacts_networkError_leavesMatchesEmpty() async {
        let contactSync = MockContactSyncService()
        contactSync.syncDirectoryResult = .failure(NSError(domain: "test", code: 500))
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

        let cacheValue = await CacheCoordinator.shared.userSearch.load(for: "discover:suggestions").snapshot()
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
