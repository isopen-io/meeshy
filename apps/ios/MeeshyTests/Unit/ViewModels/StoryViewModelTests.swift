import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

@MainActor
final class StoryViewModelTests: XCTestCase {

    private var sut: StoryViewModel!
    private var mockStoryService: MockStoryService!
    private var mockPostService: MockPostService!
    private var mockSocket: MockSocialSocket!
    private var mockAPI: MockAPIClientForApp!
    private var cancellables: Set<AnyCancellable>!

    override func setUp() {
        super.setUp()
        mockStoryService = MockStoryService()
        mockPostService = MockPostService()
        mockSocket = MockSocialSocket()
        mockAPI = MockAPIClientForApp()
        cancellables = []
        sut = StoryViewModel(
            storyService: mockStoryService,
            postService: mockPostService,
            socialSocket: mockSocket,
            api: mockAPI
        )
    }

    override func tearDown() {
        cancellables = nil
        sut = nil
        mockStoryService = nil
        mockPostService = nil
        mockSocket = nil
        mockAPI = nil
        super.tearDown()
    }

    // MARK: - Factory Helpers

    private static func makeStoryAPIPost(
        id: String = "story-1",
        content: String? = "Story content",
        authorId: String = "author-1",
        authorUsername: String = "alice",
        createdAt: String = "2026-01-15T12:00:00.000Z",
        expiresAt: String? = "2026-01-16T09:00:00.000Z"
    ) -> APIPost {
        let expiresAtJSON = expiresAt.map { "\"\($0)\"" } ?? "null"
        let contentJSON = content.map { "\"\($0)\"" } ?? "null"
        return JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "STORY",
            "content": \(contentJSON),
            "createdAt": "\(createdAt)",
            "expiresAt": \(expiresAtJSON),
            "author": {"id": "\(authorId)", "username": "\(authorUsername)"}
        }
        """)
    }

    private static func makeStoriesResponse(
        posts: [APIPost]
    ) -> PaginatedAPIResponse<[APIPost]> {
        let items = posts.map { p in
            let contentJSON = p.content.map { "\"\($0)\"" } ?? "null"
            let expiresAtJSON: String
            if let e = p.expiresAt {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                expiresAtJSON = "\"\(formatter.string(from: e))\""
            } else {
                expiresAtJSON = "null"
            }
            let createdAtFormatter = ISO8601DateFormatter()
            createdAtFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let createdAtStr = createdAtFormatter.string(from: p.createdAt)
            return """
            {"id":"\(p.id)","type":"STORY","content":\(contentJSON),"createdAt":"\(createdAtStr)","expiresAt":\(expiresAtJSON),"author":{"id":"\(p.author.id)","username":"\(p.author.username ?? "user")"}}
            """
        }
        let postsJSON = "[\(items.joined(separator: ","))]"
        return JSONStub.decode("""
        {"success":true,"data":\(postsJSON),"pagination":null,"error":null}
        """)
    }

    private func makeStoryGroup(
        userId: String = "user-1",
        username: String = "alice",
        stories: [StoryItem] = []
    ) -> StoryGroup {
        StoryGroup(
            id: userId,
            username: username,
            avatarColor: "FF2E63",
            stories: stories.isEmpty ? [makeStoryItem()] : stories
        )
    }

    private func makeStoryItem(
        id: String = "item-1",
        content: String? = "Test story",
        isViewed: Bool = false
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: content,
            media: [],
            storyEffects: nil,
            createdAt: Date(),
            expiresAt: Date().addingTimeInterval(72000),
            isViewed: isViewed
        )
    }

    // MARK: - loadStories() Tests

    func test_loadStories_success_populatesStoryGroups() async {
        let storyPost1 = Self.makeStoryAPIPost(id: "s1", content: "First story", authorId: "u1", authorUsername: "alice")
        let storyPost2 = Self.makeStoryAPIPost(id: "s2", content: "Second story", authorId: "u2", authorUsername: "bob")
        let response = Self.makeStoriesResponse(posts: [storyPost1, storyPost2])
        mockStoryService.listResult = .success(response)

        await sut.loadStories()

        XCTAssertEqual(sut.storyGroups.count, 2)
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadStories_groupsStoriesBySameAuthor() async {
        let storyPost1 = Self.makeStoryAPIPost(id: "s1", content: "First", authorId: "u1", authorUsername: "alice")
        let storyPost2 = Self.makeStoryAPIPost(id: "s2", content: "Second", authorId: "u1", authorUsername: "alice")
        let response = Self.makeStoriesResponse(posts: [storyPost1, storyPost2])
        mockStoryService.listResult = .success(response)

        await sut.loadStories()

        XCTAssertEqual(sut.storyGroups.count, 1, "Same author stories should be grouped")
        XCTAssertEqual(sut.storyGroups[0].stories.count, 2)
    }

    func test_loadStories_failure_showsEmptyState() async {
        mockStoryService.listResult = .failure(APIError.networkError(URLError(.notConnectedToInternet)))

        await sut.loadStories()

        XCTAssertTrue(sut.storyGroups.isEmpty, "Should show empty state on failure")
        XCTAssertFalse(sut.isLoading)
    }

    func test_loadStories_responseNotSuccess_showsEmptyState() async {
        let failResponse: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":false,"data":[],"pagination":null,"error":"Stories unavailable"}
        """)
        mockStoryService.listResult = .success(failResponse)

        await sut.loadStories()

        XCTAssertTrue(sut.storyGroups.isEmpty, "Should show empty state on non-success response")
    }

    func test_loadStories_guardsAgainstDoubleLoad() async {
        let response: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
        mockStoryService.listResult = .success(response)

        await sut.loadStories()
        await sut.loadStories()

        XCTAssertLessThanOrEqual(mockStoryService.listCallCount, 2)
    }

    // MARK: - markViewed() Tests

    func test_markViewed_updatesLocalStateToViewed() async {
        let item = makeStoryItem(id: "view-me", isViewed: false)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "view-me")

        XCTAssertTrue(sut.storyGroups[0].stories[0].isViewed)
    }

    func test_markViewed_callsServiceMarkViewed() async {
        let item = makeStoryItem(id: "view-service-test", isViewed: false)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "view-service-test")

        // Give the fire-and-forget Task time to execute
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(mockStoryService.markViewedCallCount, 1)
        XCTAssertEqual(mockStoryService.lastMarkViewedStoryId, "view-service-test")
    }

    func test_markViewed_nonExistentStoryId_doesNothing() {
        let item = makeStoryItem(id: "existing", isViewed: false)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "non-existent")

        XCTAssertFalse(sut.storyGroups[0].stories[0].isViewed, "Should not modify unrelated stories")
    }

    // MARK: - deleteStory() Tests

    func test_deleteStory_removesStoryFromGroup() async {
        let item1 = makeStoryItem(id: "keep-me")
        let item2 = makeStoryItem(id: "delete-me")
        let group = makeStoryGroup(userId: "u1", stories: [item1, item2])
        sut.storyGroups = [group]

        let result = await sut.deleteStory(storyId: "delete-me")

        XCTAssertTrue(result)
        XCTAssertEqual(sut.storyGroups[0].stories.count, 1)
        XCTAssertEqual(sut.storyGroups[0].stories[0].id, "keep-me")
    }

    func test_deleteStory_removesEmptyGroupAfterLastStoryDeleted() async {
        let item = makeStoryItem(id: "only-story")
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        let result = await sut.deleteStory(storyId: "only-story")

        XCTAssertTrue(result)
        XCTAssertTrue(sut.storyGroups.isEmpty, "Empty group should be removed")
    }

    func test_deleteStory_serviceFailure_returnsFalse() async {
        let item = makeStoryItem(id: "fail-delete")
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]
        mockStoryService.deleteResult = .failure(APIError.networkError(URLError(.timedOut)))

        let result = await sut.deleteStory(storyId: "fail-delete")

        XCTAssertFalse(result)
        XCTAssertEqual(sut.storyGroups[0].stories.count, 1, "Story should remain on failure")
    }

    func test_deleteStory_callsServiceDelete() async {
        let item = makeStoryItem(id: "tracked-delete")
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        _ = await sut.deleteStory(storyId: "tracked-delete")

        XCTAssertEqual(mockStoryService.deleteCallCount, 1)
        XCTAssertEqual(mockStoryService.lastDeleteStoryId, "tracked-delete")
    }

    // MARK: - Socket.IO Tests

    func test_socketStoryCreated_addsToExistingGroup() async {
        let existingItem = makeStoryItem(id: "existing-story")
        let existingGroup = makeStoryGroup(userId: "author-1", username: "alice", stories: [existingItem])
        sut.storyGroups = [existingGroup]

        sut.subscribeToSocketEvents()

        let newStoryPost = Self.makeStoryAPIPost(
            id: "socket-story-new",
            content: "New story from socket",
            authorId: "author-1",
            authorUsername: "alice"
        )
        mockSocket.storyCreated.send(newStoryPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.count, 1, "Should still have one group for same author")
        XCTAssertEqual(sut.storyGroups[0].stories.count, 2, "New story should be appended to existing group")
    }

    func test_socketStoryCreated_createsNewGroupForNewAuthor() async {
        let existingItem = makeStoryItem(id: "existing-story")
        let existingGroup = makeStoryGroup(userId: "author-1", username: "alice", stories: [existingItem])
        sut.storyGroups = [existingGroup]

        sut.subscribeToSocketEvents()

        let newStoryPost = Self.makeStoryAPIPost(
            id: "new-author-story",
            content: "From new author",
            authorId: "author-2",
            authorUsername: "bob"
        )
        mockSocket.storyCreated.send(newStoryPost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.count, 2, "New author should create a new group")
        XCTAssertEqual(sut.storyGroups[0].id, "author-2", "New group should be inserted at index 0")
    }

    func test_socketStoryCreated_deduplicatesExistingStory() async {
        let existingItem = makeStoryItem(id: "dup-story")
        let existingGroup = makeStoryGroup(userId: "author-1", username: "alice", stories: [existingItem])
        sut.storyGroups = [existingGroup]

        sut.subscribeToSocketEvents()

        let duplicatePost = Self.makeStoryAPIPost(
            id: "dup-story",
            authorId: "author-1",
            authorUsername: "alice"
        )
        mockSocket.storyCreated.send(duplicatePost)

        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups[0].stories.count, 1, "Duplicate story should not be added")
    }

    // MARK: - Lookup Method Tests

    func test_storyGroupForUser_returnsMatchingGroup() {
        let group = makeStoryGroup(userId: "lookup-user")
        sut.storyGroups = [group]

        let result = sut.storyGroupForUser(userId: "lookup-user")

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.id, "lookup-user")
    }

    func test_storyGroupForUser_returnsNilForUnknownUser() {
        let group = makeStoryGroup(userId: "known-user")
        sut.storyGroups = [group]

        let result = sut.storyGroupForUser(userId: "unknown-user")

        XCTAssertNil(result)
    }

    func test_hasStories_returnsTrueWhenGroupExists() {
        let group = makeStoryGroup(userId: "has-stories-user")
        sut.storyGroups = [group]

        XCTAssertTrue(sut.hasStories(forUserId: "has-stories-user"))
    }

    func test_hasStories_returnsFalseWhenNoGroup() {
        XCTAssertFalse(sut.hasStories(forUserId: "no-group-user"))
    }

    func test_hasUnviewedStories_returnsTrueWhenUnviewedExist() {
        let item = makeStoryItem(id: "unviewed", isViewed: false)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        XCTAssertTrue(sut.hasUnviewedStories(forUserId: "u1"))
    }

    func test_hasUnviewedStories_returnsFalseWhenAllViewed() {
        let item = makeStoryItem(id: "viewed", isViewed: true)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        XCTAssertFalse(sut.hasUnviewedStories(forUserId: "u1"))
    }

    func test_groupIndex_returnsCorrectIndex() {
        let group1 = makeStoryGroup(userId: "first")
        let group2 = makeStoryGroup(userId: "second")
        sut.storyGroups = [group1, group2]

        XCTAssertEqual(sut.groupIndex(forUserId: "second"), 1)
    }

    func test_groupIndex_returnsNilForUnknownUser() {
        let group = makeStoryGroup(userId: "known")
        sut.storyGroups = [group]

        XCTAssertNil(sut.groupIndex(forUserId: "unknown"))
    }

    // MARK: - Background Publishing

    func test_publishStoryInBackground_setsActiveUpload() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        XCTAssertNotNil(sut.activeUpload)
        XCTAssertEqual(sut.activeUpload?.progress, 0)
    }

    func test_publishStoryInBackground_closesComposer() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())
        sut.showStoryComposer = true

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        XCTAssertFalse(sut.showStoryComposer)
    }

    func test_publishStoryInBackground_blocksSecondPublish() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        let firstId = sut.activeUpload?.id

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        XCTAssertEqual(sut.activeUpload?.id, firstId)
    }

    func test_cancelUpload_clearsActiveUpload() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost())

        sut.publishStoryInBackground(
            slides: [StorySlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        XCTAssertNotNil(sut.activeUpload)
        sut.cancelUpload()
        XCTAssertNil(sut.activeUpload)
    }
}
