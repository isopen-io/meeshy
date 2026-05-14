import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

// MARK: - StoryViewModel_ExecuteQueuedPublish_FastPathTests
//
// Sprint 8 Phase 5+ — publish→exporter wiring (spec §3.4).
//
// Covers the cold-start TUS resume fast path : when a queue item carries a
// `videoExportURL` pointing at an MP4 still on disk, `executeQueuedPublish`
// MUST bypass `StoryVideoExportService.prepareExport` and feed the existing
// file straight into the upload pipeline. This shaves ~4s per story off
// relaunch resumes that already completed the bake before the app was
// suspended.
//
// The tests inject `MockStoryVideoExportService` via the `videoExporter:`
// initializer parameter and assert on its call counts. The TUS uploader
// itself is left untouched ; it fails fast against the unavailable test
// backend and we never assert on its observable side effects. Every
// assertion here is on state mutated BEFORE the network call : exporter
// invocation count, slide id passed, cleanup wiring.
//
// Four scenarios cover the branch tree :
//   1. Valid videoExportURL + slide.needsVideoExport → fast path
//      (`prepareExport` MUST NOT be called).
//   2. videoExportURL set but file purged (`hasValidVideoExport == false`)
//      → slow path fallback (`prepareExport` MUST be called).
//   3. videoExportURL == nil → legacy path (no exporter call for a static
//      slide ; exporter called for an animated one as usual).
//   4. Fast path success → `cleanupTempExport` is invoked on the pre-baked
//      URL after the slide publish completes. Failure path leaves the file
//      alone so the queue can retry on next reconnect.

@MainActor
final class StoryViewModel_ExecuteQueuedPublish_FastPathTests: XCTestCase {

    // MARK: - Properties

    private var mockStoryService: MockStoryService!
    private var mockPostService: MockPostService!
    private var mockSocket: MockSocialSocket!
    private var mockAPI: MockAPIClientForApp!
    private var mockExporter: MockStoryVideoExportService!
    private var tempDir: URL!

    // MARK: - Lifecycle

    override func setUp() {
        super.setUp()
        mockStoryService = MockStoryService()
        mockPostService = MockPostService()
        mockSocket = MockSocialSocket()
        mockAPI = MockAPIClientForApp()
        mockExporter = MockStoryVideoExportService()

        // Per-test temp dir so the pre-baked MP4 file lifecycle stays
        // hermetic. Cleaned up in tearDown regardless of test outcome.
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("FastPathTests-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    }

    override func tearDown() {
        if let tempDir, FileManager.default.fileExists(atPath: tempDir.path) {
            try? FileManager.default.removeItem(at: tempDir)
        }
        tempDir = nil
        mockStoryService = nil
        mockPostService = nil
        mockSocket = nil
        mockAPI = nil
        mockExporter = nil
        super.tearDown()
    }

    // MARK: - Factory Helpers

    private func makeSUT() -> StoryViewModel {
        StoryViewModel(
            storyService: mockStoryService,
            postService: mockPostService,
            socialSocket: mockSocket,
            api: mockAPI,
            videoExporter: mockExporter
        )
    }

    /// A slide whose effects yield `needsVideoExport == true` (single
    /// `.opening` transition). Matches the helper used by the existing
    /// `StoryViewModel_VideoExportWiringTests` suite for consistency.
    private static func makeAnimatedSlide(id: String = "animated-1") -> StorySlide {
        var effects = StoryEffects()
        effects.opening = .fade
        return StorySlide(
            id: id,
            content: "Animated slide",
            effects: effects,
            duration: 5,
            order: 0
        )
    }

    private static func makeStaticSlide(id: String = "static-1") -> StorySlide {
        StorySlide(
            id: id,
            content: "Static slide",
            effects: StoryEffects(),
            duration: 5,
            order: 0
        )
    }

    private static func makeStoryAPIPost(id: String = "story-1") -> APIPost {
        JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "STORY",
            "content": "Animated slide",
            "createdAt": "2026-05-12T08:00:00.000Z",
            "expiresAt": "2026-05-13T08:00:00.000Z",
            "author": {"id": "author-1", "username": "alice"}
        }
        """)
    }

    /// Creates a real (zero-byte) MP4 inside `tempDir` so the
    /// `hasValidVideoExport` disk check flips to true. Returns the URL ; the
    /// caller can `try FileManager.default.removeItem(at:)` to simulate the
    /// OS reaping the file during the suspension.
    private func makeFakeMP4(named prefix: String) -> URL {
        let url = tempDir.appendingPathComponent("\(prefix)-\(UUID().uuidString).mp4")
        FileManager.default.createFile(atPath: url.path, contents: Data("fake mp4".utf8), attributes: nil)
        return url
    }

    private static func encodeSlides(_ slides: [StorySlide]) throws -> Data {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(slides)
    }

    // MARK: - Tests

    /// Scenario 1 : `videoExportURL` set AND file still on disk → fast path.
    /// The exporter MUST NOT be called for the animated slide because the
    /// MP4 sitting in tmp already encodes the slide composition.
    func test_executeQueuedPublish_validVideoExport_skipsExport_usesFastPath() async throws {
        mockAPI.authToken = "test-token"
        let slide = Self.makeAnimatedSlide(id: "fast-path-slide")
        let payload = try Self.encodeSlides([slide])
        let bakedURL = makeFakeMP4(named: "fast-path")
        let item = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: payload,
            repostOfId: nil,
            mediaReferences: [],
            videoExportURL: bakedURL
        )
        XCTAssertTrue(
            item.hasValidVideoExport,
            "Precondition: baked MP4 must be detected on disk"
        )
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(id: "fast-result"))

        let sut = makeSUT()
        let result = try await sut.executeQueuedPublish(item: item)

        XCTAssertEqual(result, "fast-result")
        XCTAssertEqual(
            mockExporter.prepareExportCallCount, 0,
            "Fast path MUST skip the exporter — the baked MP4 already encodes the slide composition."
        )
        XCTAssertEqual(
            mockPostService.createStoryCallCount, 1,
            "Story must still publish via the upload+createStory path."
        )
    }

    /// Scenario 2 : `videoExportURL` set but the underlying file has been
    /// purged from tmp (OS reaper or user-initiated cleanup). The fast path
    /// MUST detect the missing file, log the fallback, and re-export from
    /// `slidesPayload` via the regular `prepareExport` call. This matches
    /// the spec §3.4 design intent : stale URLs must not mislead the resume
    /// path into uploading nothing.
    func test_executeQueuedPublish_invalidVideoExport_fallsBackToReExport() async throws {
        mockAPI.authToken = "test-token"
        let slide = Self.makeAnimatedSlide(id: "fallback-slide")
        let payload = try Self.encodeSlides([slide])
        let bakedURL = makeFakeMP4(named: "fallback")
        // Simulate OS purging the file during app suspension.
        try FileManager.default.removeItem(at: bakedURL)

        let item = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: payload,
            repostOfId: nil,
            mediaReferences: [],
            videoExportURL: bakedURL
        )
        XCTAssertFalse(
            item.hasValidVideoExport,
            "Precondition: purged MP4 must fail the disk check"
        )
        // Returning a fresh URL from the mock keeps the slow path producing
        // a TUS upload — the assertion below is on exporter call count, not
        // on what the URL ultimately points to.
        mockExporter.prepareExportBehavior = .success(url: makeFakeMP4(named: "reexport"))
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(id: "fallback-result"))

        let sut = makeSUT()
        _ = try await sut.executeQueuedPublish(item: item)

        XCTAssertEqual(
            mockExporter.prepareExportCallCount, 1,
            "Stale URL MUST trigger the slow path : re-export from slidesPayload."
        )
        XCTAssertEqual(
            mockExporter.lastPreparedSlideId, "fallback-slide",
            "The re-exported slide id must match the decoded slidesPayload entry."
        )
    }

    /// Scenario 3 : `videoExportURL == nil` (the queue item was enqueued
    /// from the offline composer branch before any bake started). The
    /// regular runStoryUpload pipeline takes over — exporter is invoked
    /// for animated slides, skipped for static ones.
    func test_executeQueuedPublish_nilVideoExport_followsRegularPath() async throws {
        mockAPI.authToken = "test-token"

        // 3a — Static slide with nil URL : exporter MUST stay untouched.
        let staticSlide = Self.makeStaticSlide(id: "regular-static")
        let staticPayload = try Self.encodeSlides([staticSlide])
        let staticItem = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: staticPayload,
            repostOfId: nil,
            mediaReferences: [],
            videoExportURL: nil
        )
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(id: "static-result"))

        var sut = makeSUT()
        _ = try await sut.executeQueuedPublish(item: staticItem)
        XCTAssertEqual(
            mockExporter.prepareExportCallCount, 0,
            "Static slide with nil videoExportURL must take the legacy asset path."
        )

        // 3b — Animated slide with nil URL : exporter MUST be invoked
        // exactly once via the regular `needsVideoExport == true` branch.
        mockExporter = MockStoryVideoExportService()
        mockPostService = MockPostService()
        let animatedSlide = Self.makeAnimatedSlide(id: "regular-animated")
        let animatedPayload = try Self.encodeSlides([animatedSlide])
        let animatedItem = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: animatedPayload,
            repostOfId: nil,
            mediaReferences: [],
            videoExportURL: nil
        )
        mockExporter.prepareExportBehavior = .success(url: makeFakeMP4(named: "regular-animated"))
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(id: "animated-result"))

        sut = makeSUT()
        _ = try await sut.executeQueuedPublish(item: animatedItem)
        XCTAssertEqual(
            mockExporter.prepareExportCallCount, 1,
            "Animated slide with nil videoExportURL must still drive the exporter once."
        )
        XCTAssertEqual(mockExporter.lastPreparedSlideId, "regular-animated")
    }

    /// Scenario 4 : after a successful TUS upload + createStory in the fast
    /// path, `cleanupTempExport` MUST be invoked on the pre-baked URL so
    /// the file doesn't leak in tmp until the OS reaper kicks in. The
    /// cleanup wiring lives in the existing post-upload branch of
    /// `runStoryUpload` and is reused verbatim — this test pins its
    /// behaviour against the fast path so a future refactor cannot break
    /// the resume cleanup contract by accident.
    func test_fastPath_cleanupTempExport_calledAfterTUSSuccess() async throws {
        mockAPI.authToken = "test-token"
        let slide = Self.makeAnimatedSlide(id: "cleanup-slide")
        let payload = try Self.encodeSlides([slide])
        let bakedURL = makeFakeMP4(named: "cleanup")
        let item = StoryPublishQueueItem(
            visibility: "PUBLIC",
            slidesPayload: payload,
            repostOfId: nil,
            mediaReferences: [],
            videoExportURL: bakedURL
        )
        XCTAssertTrue(item.hasValidVideoExport)
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(id: "cleanup-result"))

        let sut = makeSUT()
        _ = try await sut.executeQueuedPublish(item: item)

        XCTAssertEqual(
            mockExporter.prepareExportCallCount, 0,
            "Sanity check : fast path skipped the exporter."
        )
        XCTAssertEqual(
            mockExporter.cleanupTempExportCallCount, 1,
            "Pre-baked MP4 must be cleaned up after a successful slide publish — otherwise tmp accumulates orphan exports across resumes."
        )
        XCTAssertEqual(
            mockExporter.lastCleanedURL, bakedURL,
            "Cleanup must target the SAME URL handed in via videoExportURL."
        )
    }
}
