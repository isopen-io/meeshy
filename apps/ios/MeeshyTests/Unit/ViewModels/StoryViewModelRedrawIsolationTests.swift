import XCTest
import Combine
@testable import Meeshy
import MeeshySDK
import MeeshyUI

@MainActor
final class StoryViewModelRedrawIsolationTests: XCTestCase {

    private var sut: StoryViewModel!
    private var mockPostService: MockPostService!
    private var defaultsSuiteName: String!
    private var defaults: UserDefaults!
    private var draftStore: StoryDraftStore!
    private var draftStoreRoot: URL!

    override func setUp() async throws {
        try await super.setUp()
        NetworkMonitor.shared.simulateOnline()
        await StoryPublishQueue.shared.clearAll()

        defaultsSuiteName = "StoryViewModelRedrawIsolationTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: defaultsSuiteName)
        mockPostService = MockPostService()
        let mockAPI = MockAPIClientForApp()
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .failure(URLError(.timedOut))
        draftStoreRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryViewModelRedrawIsolationTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: draftStoreRoot, withIntermediateDirectories: true)
        draftStore = StoryDraftStore(
            dbPath: draftStoreRoot.appendingPathComponent("drafts.sqlite").path,
            mediaDirectory: draftStoreRoot.appendingPathComponent("media")
        )
        sut = StoryViewModel(
            storyService: MockStoryService(),
            postService: mockPostService,
            socialSocket: MockSocialSocket(),
            api: mockAPI,
            visibilityStore: StoryVisibilityPreferenceStore(defaults: defaults),
            draftStore: draftStore
        )
    }

    override func tearDown() async throws {
        mockPostService.createStoryHangs = false
        await StoryPublishFixtureCleanup.purge(sut, defaults: defaults)
        defaults.removePersistentDomain(forName: defaultsSuiteName)
        defaults = nil
        defaultsSuiteName = nil
        sut = nil
        mockPostService = nil
        draftStore = nil
        if let draftStoreRoot { try? FileManager.default.removeItem(at: draftStoreRoot) }
        draftStoreRoot = nil
        try await super.tearDown()
    }

    func test_uploadProgressReport_doesNotPublishViewModel() async throws {
        let id = try await failedUploadId()
        var emissions = 0
        let subscription = sut.objectWillChange.sink { emissions += 1 }

        sut.uploadProgress.report(0.7, for: id)

        let shown = sut.uploadProgress.fraction(for: id)
        XCTAssertEqual(emissions, 0)
        XCTAssertEqual(shown, 0.7)
        subscription.cancel()
    }

    func test_removingActiveUpload_forgetsItsProgress() async throws {
        let id = try await failedUploadId()
        sut.uploadProgress.report(0.7, for: id)

        sut.cancelUpload(id: id)

        let shown = sut.uploadProgress.fraction(for: id)
        XCTAssertEqual(shown, 0)
    }

    func test_retryUpload_resetsProgressToZero() async throws {
        mockPostService.createStoryResultsQueue = [
            .success(Self.makeStoryAPIPost(id: "slide-0")),
            .failure(URLError(.timedOut)),
        ]
        let id = try await failedUploadId(slides: [StorySlide(), StorySlide()])
        let before = sut.uploadProgress.fraction(for: id)
        XCTAssertGreaterThan(before, 0, "Précondition : l'échec survient après un début de progression")

        sut.retryUpload(id: id)

        let after = sut.uploadProgress.fraction(for: id)
        XCTAssertEqual(after, 0)
    }

    func test_partialFailure_progressLivesInStore() async throws {
        mockPostService.createStoryResultsQueue = [
            .success(Self.makeStoryAPIPost(id: "slide-0")),
            .failure(URLError(.timedOut)),
        ]

        let id = try await failedUploadId(slides: [StorySlide(), StorySlide()])

        let shown = sut.uploadProgress.fraction(for: id)
        XCTAssertGreaterThanOrEqual(shown, 0.5)
        XCTAssertLessThan(shown, 1)
    }

    func test_coverRenderBump_doesNotPublishViewModel_butBumpsSignal() {
        var emissions = 0
        let subscription = sut.objectWillChange.sink { emissions += 1 }
        let before = sut.coverRenders.generation

        sut.coverRenders.bump()

        let after = sut.coverRenders.generation
        XCTAssertEqual(emissions, 0)
        XCTAssertEqual(after, before + 1)
        subscription.cancel()
    }

    func test_storyGroupsMutation_refreshesProjection() {
        sut.storyGroups = [Self.group("u1", isViewed: false)]
        XCTAssertEqual(sut.storyRingState(forUserId: "u1"), .unread)
        XCTAssertEqual(sut.groupIndex(forUserId: "u1"), 0)

        sut.storyGroups[0] = Self.group("u2", isViewed: true)

        XCTAssertEqual(sut.storyRingState(forUserId: "u2"), .read)
        XCTAssertEqual(sut.groupIndex(forUserId: "u2"), 0)
        XCTAssertNil(sut.groupIndex(forUserId: "u1"))
        XCTAssertFalse(sut.hasStories(forUserId: "u1"))
        XCTAssertEqual(sut.storyGroupForUser(userId: "u2")?.id, "u2")
    }

    private func failedUploadId(slides: [StorySlide] = [StorySlide()]) async throws -> String {
        sut.publishStoryInBackground(
            slides: slides,
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )
        let deadline = Date().addingTimeInterval(8)
        while Date() < deadline {
            if let failed = sut.activeUploads.first(where: { $0.phase.isFailed }) { return failed.id }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("Aucune publication n'a atteint .failed")
        return ""
    }

    private static func group(_ userId: String, isViewed: Bool) -> StoryGroup {
        StoryGroup(
            id: userId,
            username: userId,
            avatarColor: "FF2E63",
            stories: [StoryItem(
                id: "\(userId)-story",
                content: "story",
                media: [],
                storyEffects: nil,
                createdAt: Date(),
                expiresAt: Date().addingTimeInterval(3_600),
                isViewed: isViewed,
                updatedAt: nil
            )]
        )
    }

    private static func makeStoryAPIPost(id: String) -> APIPost {
        JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "STORY",
            "content": "Story content",
            "createdAt": "2026-01-15T12:00:00.000Z",
            "expiresAt": "2026-01-16T09:00:00.000Z",
            "author": {"id": "author-1", "username": "alice"}
        }
        """)
    }
}
