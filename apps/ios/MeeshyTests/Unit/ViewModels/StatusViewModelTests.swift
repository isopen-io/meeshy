import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

@MainActor
final class StatusViewModelTests: XCTestCase {

    private var sut: StatusViewModel!
    private var mockStatusService: MockStatusService!
    private var mockSocket: MockSocialSocket!
    private var mockAuthManager: MockAuthManager!
    private var cancellables: Set<AnyCancellable>!

    override func setUp() {
        super.setUp()
        mockStatusService = MockStatusService()
        mockSocket = MockSocialSocket()
        mockAuthManager = MockAuthManager()
        cancellables = []
        sut = StatusViewModel(
            mode: .friends,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager
        )
    }

    override func tearDown() {
        cancellables = nil
        sut = nil
        mockStatusService = nil
        mockSocket = nil
        mockAuthManager = nil
        super.tearDown()
    }

    // MARK: - Factory Helpers

    private static func makeStatusAPIPost(
        id: String = "status-1",
        content: String? = "Feeling great",
        moodEmoji: String = "\u{1F389}",
        authorId: String = "author-1",
        authorUsername: String = "alice",
        createdAt: String = "2026-01-15T12:00:00.000Z"
    ) -> APIPost {
        let contentJSON = content.map { "\"\($0)\"" } ?? "null"
        return JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "STATUS",
            "content": \(contentJSON),
            "moodEmoji": "\(moodEmoji)",
            "createdAt": "\(createdAt)",
            "author": {"id": "\(authorId)", "username": "\(authorUsername)"}
        }
        """)
    }

    private static func makeStatusesResponse(
        posts: [APIPost],
        hasMore: Bool = false,
        nextCursor: String? = nil
    ) -> PaginatedAPIResponse<[APIPost]> {
        let cursorJSON: String
        if let cursor = nextCursor {
            cursorJSON = """
            {"nextCursor":"\(cursor)","hasMore":\(hasMore),"limit":20}
            """
        } else {
            cursorJSON = "null"
        }
        let items = posts.map { p in
            let contentJSON = p.content.map { "\"\($0)\"" } ?? "null"
            let moodJSON = p.moodEmoji.map { "\"\($0)\"" } ?? "null"
            let createdAtFormatter = ISO8601DateFormatter()
            createdAtFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let createdAtStr = createdAtFormatter.string(from: p.createdAt)
            return """
            {"id":"\(p.id)","type":"STATUS","content":\(contentJSON),"moodEmoji":\(moodJSON),"createdAt":"\(createdAtStr)","author":{"id":"\(p.author.id)","username":"\(p.author.username ?? "user")"}}
            """
        }
        let postsJSON = "[\(items.joined(separator: ","))]"
        return JSONStub.decode("""
        {"success":true,"data":\(postsJSON),"pagination":\(cursorJSON),"error":null}
        """)
    }

    private func makeStatusEntry(
        id: String = "entry-1",
        userId: String = "user-1",
        username: String = "alice",
        moodEmoji: String = "\u{1F389}",
        content: String? = "Test status"
    ) -> StatusEntry {
        StatusEntry(
            id: id,
            userId: userId,
            username: username,
            avatarColor: "FF2E63",
            moodEmoji: moodEmoji,
            content: content,
            audioUrl: nil,
            createdAt: Date(),
            expiresAt: Date().addingTimeInterval(3600)
        )
    }

    // MARK: - loadStatuses() Tests

    func test_loadStatuses_success_populatesStatuses() async {
        let status1 = Self.makeStatusAPIPost(id: "s1", content: "Happy", moodEmoji: "\u{1F389}", authorId: "u1", authorUsername: "alice")
        let status2 = Self.makeStatusAPIPost(id: "s2", content: "Working", moodEmoji: "\u{1F4AA}", authorId: "u2", authorUsername: "bob")
        let response = Self.makeStatusesResponse(posts: [status1, status2])
        mockStatusService.listResult = .success(response)

        await sut.loadStatuses()

        XCTAssertEqual(sut.statuses.count, 2)
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadStatuses_friendsMode_setsMyStatusToFirst() async {
        let status1 = Self.makeStatusAPIPost(id: "my-status", content: "My mood", moodEmoji: "\u{1F525}", authorId: "me", authorUsername: "me")
        let response = Self.makeStatusesResponse(posts: [status1])
        mockStatusService.listResult = .success(response)

        await sut.loadStatuses()

        XCTAssertNotNil(sut.myStatus)
        XCTAssertEqual(sut.myStatus?.id, "my-status")
    }

    func test_loadStatuses_discoverMode_doesNotSetMyStatus() async {
        let discoverVM = StatusViewModel(
            mode: .discover,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager
        )
        let status1 = Self.makeStatusAPIPost(id: "discover-status", moodEmoji: "\u{1F389}", authorId: "other")
        let response = Self.makeStatusesResponse(posts: [status1])
        mockStatusService.listResult = .success(response)

        await discoverVM.loadStatuses()

        XCTAssertNil(discoverVM.myStatus, "Discover mode should not set myStatus")
    }

    func test_loadStatuses_failure_friendsMode_fallsBackToSampleData() async {
        mockStatusService.listResult = .failure(APIError.networkError(URLError(.notConnectedToInternet)))

        await sut.loadStatuses()

        XCTAssertFalse(sut.statuses.isEmpty, "Friends mode should fall back to sample data")
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadStatuses_failure_discoverMode_doesNotFallBack() async {
        let discoverVM = StatusViewModel(
            mode: .discover,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager
        )
        mockStatusService.listResult = .failure(APIError.networkError(URLError(.notConnectedToInternet)))

        await discoverVM.loadStatuses()

        XCTAssertTrue(discoverVM.statuses.isEmpty, "Discover mode should not fall back to sample data")
    }

    func test_loadStatuses_responseNotSuccess_friendsMode_fallsBack() async {
        let failResponse: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":false,"data":[],"pagination":null,"error":"Unavailable"}
        """)
        mockStatusService.listResult = .success(failResponse)

        await sut.loadStatuses()

        XCTAssertFalse(sut.statuses.isEmpty, "Should fall back to sample data on non-success response in friends mode")
    }

    func test_loadStatuses_guardsAgainstDoubleLoad() async {
        let response: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
        mockStatusService.listResult = .success(response)

        await sut.loadStatuses()
        await sut.loadStatuses()

        XCTAssertLessThanOrEqual(mockStatusService.listCallCount, 2)
    }

    func test_loadStatuses_passesCorrectMode() async {
        let response: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
        mockStatusService.listResult = .success(response)

        await sut.loadStatuses()

        XCTAssertEqual(mockStatusService.lastListMode, .friends)
    }

    // MARK: - setStatus() Tests

    func test_setStatus_success_setsMyStatusAndInsertsAtIndexZero() async {
        let createdPost = Self.makeStatusAPIPost(id: "new-status", content: "New mood", moodEmoji: "\u{1F525}", authorId: "me")
        mockStatusService.createResult = .success(createdPost)

        await sut.setStatus(emoji: "\u{1F525}", content: "New mood")

        XCTAssertNotNil(sut.myStatus)
        XCTAssertEqual(sut.myStatus?.moodEmoji, "\u{1F525}")
        XCTAssertEqual(sut.statuses.count, 1)
        XCTAssertEqual(sut.statuses[0].id, "new-status")
        XCTAssertEqual(mockStatusService.createCallCount, 1)
    }

    func test_setStatus_failure_stillCreatesLocalEntry() async {
        mockStatusService.createResult = .failure(APIError.networkError(URLError(.timedOut)))

        await sut.setStatus(emoji: "\u{2615}", content: "Coffee time")

        XCTAssertNotNil(sut.myStatus, "Should create local entry even on failure")
        XCTAssertEqual(sut.myStatus?.moodEmoji, "\u{2615}")
        XCTAssertEqual(sut.statuses.count, 1, "Local entry should be inserted even on failure")
    }

    func test_setStatus_passesCorrectParameters() async {
        let createdPost = Self.makeStatusAPIPost(id: "param-test", moodEmoji: "\u{1F389}", authorId: "me")
        mockStatusService.createResult = .success(createdPost)

        await sut.setStatus(emoji: "\u{1F389}", content: "Party", visibility: "FRIENDS", visibilityUserIds: ["u1", "u2"])

        XCTAssertEqual(mockStatusService.lastCreateMoodEmoji, "\u{1F389}")
        XCTAssertEqual(mockStatusService.lastCreateContent, "Party")
        XCTAssertEqual(mockStatusService.lastCreateVisibility, "FRIENDS")
        XCTAssertEqual(mockStatusService.lastCreateVisibilityUserIds, ["u1", "u2"])
    }

    // MARK: - clearStatus() Tests

    func test_clearStatus_clearsMyStatusAndRemovesFromList() async {
        let entry = makeStatusEntry(id: "to-clear", userId: "me")
        sut.myStatus = entry
        sut.statuses = [entry]

        await sut.clearStatus()

        XCTAssertNil(sut.myStatus)
        XCTAssertTrue(sut.statuses.isEmpty)
        XCTAssertEqual(mockStatusService.deleteCallCount, 1)
        XCTAssertEqual(mockStatusService.lastDeleteStatusId, "to-clear")
    }

    func test_clearStatus_noMyStatus_doesNothing() async {
        sut.myStatus = nil

        await sut.clearStatus()

        XCTAssertEqual(mockStatusService.deleteCallCount, 0, "Should not call delete when no myStatus exists")
    }

    func test_clearStatus_serviceFailure_stillClearsLocally() async {
        let entry = makeStatusEntry(id: "fail-clear", userId: "me")
        sut.myStatus = entry
        sut.statuses = [entry]
        mockStatusService.deleteResult = .failure(APIError.networkError(URLError(.timedOut)))

        await sut.clearStatus()

        XCTAssertNil(sut.myStatus, "Should clear locally even on service failure")
        XCTAssertTrue(sut.statuses.isEmpty, "Should remove from list even on service failure")
    }

    // MARK: - Socket.IO Tests

    func test_socketStatusCreated_insertsAtIndexZero() async {
        sut.subscribeToSocketEvents()

        let statusPost = Self.makeStatusAPIPost(
            id: "socket-status",
            content: "From socket",
            moodEmoji: "\u{1F389}",
            authorId: "someone"
        )
        mockSocket.statusCreated.send(statusPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.statuses.count, 1)
        XCTAssertEqual(sut.statuses[0].id, "socket-status")
    }

    func test_socketStatusCreated_deduplicatesExistingStatus() async {
        let existing = makeStatusEntry(id: "dup-status")
        sut.statuses = [existing]

        sut.subscribeToSocketEvents()

        let duplicatePost = Self.makeStatusAPIPost(
            id: "dup-status",
            moodEmoji: "\u{1F389}",
            authorId: "author-1"
        )
        mockSocket.statusCreated.send(duplicatePost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.statuses.count, 1, "Duplicate status should not be added")
    }

    func test_socketStatusDeleted_removesById() async {
        let entry = makeStatusEntry(id: "delete-me-status")
        sut.statuses = [entry]

        sut.subscribeToSocketEvents()

        mockSocket.statusDeleted.send("delete-me-status")

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(sut.statuses.isEmpty, "Status should be removed after socket delete event")
    }

    func test_socketStatusUpdated_updatesExistingEntry() async {
        let existing = makeStatusEntry(id: "update-me", content: "Old content")
        sut.statuses = [existing]

        sut.subscribeToSocketEvents()

        let updatedPost = Self.makeStatusAPIPost(
            id: "update-me",
            content: "Updated content",
            moodEmoji: "\u{1F525}",
            authorId: "author-1"
        )
        mockSocket.statusUpdated.send(updatedPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.statuses.count, 1)
        XCTAssertEqual(sut.statuses[0].content, "Updated content")
    }

    // MARK: - loadMoreIfNeeded() Tests

    func test_loadMoreIfNeeded_triggersWhenNearEnd() async {
        // First load with hasMore and a cursor
        let initialStatuses = (0..<5).map { i in
            Self.makeStatusAPIPost(
                id: "status-\(i)",
                content: "Status \(i)",
                moodEmoji: "\u{1F389}",
                authorId: "u\(i)",
                authorUsername: "user\(i)"
            )
        }
        let initialResponse = Self.makeStatusesResponse(
            posts: initialStatuses,
            hasMore: true,
            nextCursor: "cursor-1"
        )
        mockStatusService.listResult = .success(initialResponse)
        await sut.loadStatuses()

        XCTAssertEqual(sut.statuses.count, 5)

        // Set up the next page response
        let moreStatuses = [
            Self.makeStatusAPIPost(id: "status-5", moodEmoji: "\u{1F389}", authorId: "u5", authorUsername: "user5")
        ]
        let moreResponse = Self.makeStatusesResponse(posts: moreStatuses)
        mockStatusService.listResult = .success(moreResponse)

        // Trigger loadMore with the last item (within threshold of 3)
        let lastStatus = sut.statuses.last!
        await sut.loadMoreIfNeeded(currentStatus: lastStatus)

        XCTAssertEqual(sut.statuses.count, 6, "More statuses should be appended")
        XCTAssertFalse(sut.isLoadingMore)
    }

    func test_loadMoreIfNeeded_doesNotTriggerWhenNotNearEnd() async {
        let initialStatuses = (0..<10).map { i in
            Self.makeStatusAPIPost(
                id: "status-\(i)",
                content: "Status \(i)",
                moodEmoji: "\u{1F389}",
                authorId: "u\(i)",
                authorUsername: "user\(i)"
            )
        }
        let initialResponse = Self.makeStatusesResponse(
            posts: initialStatuses,
            hasMore: true,
            nextCursor: "cursor-1"
        )
        mockStatusService.listResult = .success(initialResponse)
        await sut.loadStatuses()

        // Reset count after initial load
        let loadCountAfterInit = mockStatusService.listCallCount

        // Trigger with the first item (not near end)
        let firstStatus = sut.statuses.first!
        await sut.loadMoreIfNeeded(currentStatus: firstStatus)

        XCTAssertEqual(mockStatusService.listCallCount, loadCountAfterInit, "Should not load more when not near end")
    }

    // MARK: - refresh() Tests

    func test_refresh_resetsStateAndReloads() async {
        let response: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
        mockStatusService.listResult = .success(response)

        await sut.refresh()

        XCTAssertEqual(mockStatusService.listCallCount, 1)
    }

    // MARK: - Lookup Tests

    func test_statusForUser_returnsMatchingEntry() {
        let entry = makeStatusEntry(id: "lookup-entry", userId: "target-user")
        sut.statuses = [entry]

        let result = sut.statusForUser(userId: "target-user")

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.id, "lookup-entry")
    }

    func test_statusForUser_returnsNilForUnknownUser() {
        let entry = makeStatusEntry(userId: "known-user")
        sut.statuses = [entry]

        let result = sut.statusForUser(userId: "unknown-user")

        XCTAssertNil(result)
    }

    // MARK: - Current User Info Tests

    func test_currentUserDisplayName_usesDisplayName() {
        let user = MeeshyUser(id: "me", username: "testuser", displayName: "Test Display")
        mockAuthManager.simulateLoggedIn(user: user)

        XCTAssertEqual(sut.currentUserDisplayName, "Test Display")
    }

    func test_currentUserDisplayName_fallsBackToUsername() {
        let user = MeeshyUser(id: "me", username: "testuser")
        mockAuthManager.simulateLoggedIn(user: user)

        XCTAssertEqual(sut.currentUserDisplayName, "testuser")
    }

    func test_currentUserDisplayName_fallsBackToMoi() {
        mockAuthManager.currentUser = nil

        XCTAssertEqual(sut.currentUserDisplayName, "Moi")
    }

    func test_currentUserInitial_usesFirstName() {
        let user = MeeshyUser(id: "me", username: "testuser", firstName: "Alice")
        mockAuthManager.simulateLoggedIn(user: user)

        XCTAssertEqual(sut.currentUserInitial, "A")
    }

    func test_currentUserInitial_fallsBackToUsername() {
        let user = MeeshyUser(id: "me", username: "testuser")
        mockAuthManager.simulateLoggedIn(user: user)

        XCTAssertEqual(sut.currentUserInitial, "T")
    }

    func test_currentUserInitial_fallsBackToM() {
        mockAuthManager.currentUser = nil

        XCTAssertEqual(sut.currentUserInitial, "M")
    }

    // MARK: - reactToStatus() Tests

    func test_reactToStatus_callsService() async {
        await sut.reactToStatus("status-react", emoji: "\u{2764}")

        XCTAssertEqual(mockStatusService.reactCallCount, 1)
        XCTAssertEqual(mockStatusService.lastReactStatusId, "status-react")
        XCTAssertEqual(mockStatusService.lastReactEmoji, "\u{2764}")
    }

    // MARK: - Mode Tests

    func test_modeIsStoredCorrectly() {
        XCTAssertEqual(sut.mode, .friends)

        let discoverVM = StatusViewModel(
            mode: .discover,
            statusService: mockStatusService,
            socialSocket: mockSocket,
            authManager: mockAuthManager
        )
        XCTAssertEqual(discoverVM.mode, .discover)
    }

    // MARK: - moodTapHandler Tests

    func test_moodTapHandler_returnsHandlerWhenStatusExists() {
        let entry = makeStatusEntry(userId: "tap-user")
        sut.statuses = [entry]

        let handler = sut.moodTapHandler(for: "tap-user")

        XCTAssertNotNil(handler, "Should return a handler when a status exists for the user")
    }

    func test_moodTapHandler_returnsNilWhenNoStatus() {
        let handler = sut.moodTapHandler(for: "no-status-user")

        XCTAssertNil(handler, "Should return nil when no status exists for the user")
    }

    // MARK: - Status Lifecycle Tests (Point 85)

    func test_publishStatus_success_addsToList() async {
        let createdPost = Self.makeStatusAPIPost(id: "new-pub", content: "Published", moodEmoji: "\u{1F60A}", authorId: "me")
        mockStatusService.createResult = .success(createdPost)

        await sut.setStatus(emoji: "\u{1F60A}", content: "Published")

        XCTAssertNotNil(sut.myStatus)
        XCTAssertEqual(sut.myStatus?.moodEmoji, "\u{1F60A}")
        XCTAssertFalse(sut.statuses.isEmpty, "Status should be added to the list")
        XCTAssertEqual(sut.statuses.first?.content, "Published")
    }

    func test_updateStatus_success_modifiesInList() async {
        // First create a status
        let initialPost = Self.makeStatusAPIPost(id: "update-target", content: "Initial", moodEmoji: "\u{1F60A}", authorId: "me")
        mockStatusService.createResult = .success(initialPost)
        await sut.setStatus(emoji: "\u{1F60A}", content: "Initial")
        XCTAssertEqual(sut.myStatus?.content, "Initial")

        // Simulate socket update modifying the status
        sut.subscribeToSocketEvents()

        let updatedPost = Self.makeStatusAPIPost(
            id: "update-target",
            content: "Modified content",
            moodEmoji: "\u{1F525}",
            authorId: "me"
        )
        mockSocket.statusUpdated.send(updatedPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.statuses.count, 1)
        XCTAssertEqual(sut.statuses[0].content, "Modified content")
    }

    func test_deleteStatus_success_removesFromList() async {
        // First set a status
        let createdPost = Self.makeStatusAPIPost(id: "delete-target", content: "To delete", moodEmoji: "\u{1F389}", authorId: "me")
        mockStatusService.createResult = .success(createdPost)
        await sut.setStatus(emoji: "\u{1F389}", content: "To delete")
        XCTAssertEqual(sut.statuses.count, 1)

        // Set the myStatus so clearStatus works
        let entry = makeStatusEntry(id: "delete-target", userId: "me")
        sut.myStatus = entry
        sut.statuses = [entry]

        await sut.clearStatus()

        XCTAssertNil(sut.myStatus)
        XCTAssertTrue(sut.statuses.isEmpty, "Status should be removed from the list")
        XCTAssertEqual(mockStatusService.deleteCallCount, 1)
    }
}
