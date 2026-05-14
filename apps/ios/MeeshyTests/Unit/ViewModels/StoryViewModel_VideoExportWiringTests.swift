import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

// MARK: - StoryViewModel_VideoExportWiringTests
//
// Spec : docs/superpowers/specs/2026-05-12-story-publish-exporter-wiring-design.md §3.1 + §3.5
//
// Covers Sprint 8 Phase 4 — publish→exporter wiring at the `StoryViewModel`
// level. The tests inject a `MockStoryVideoExportService` via the new
// initializer parameter and assert :
//   1. Static slides (`needsVideoExport == false`) bypass the exporter
//      entirely (legacy asset path).
//   2. Animated/video slides (`needsVideoExport == true`) drive
//      `prepareExport` with the right slide id.
//   3. The `.exporting` phase is surfaced on `activeUpload.phase` for the
//      banner copy swap.
//   4. Export failure (returns nil) falls back to the legacy asset path
//      and the story still publishes (graceful degradation, spec §3.7 / D-7).
//   5. Export progress callbacks update `activeUpload.progress`.
//
// These tests purposely avoid live TUS by stubbing only the exporter ;
// the actual upload itself goes through the real `TusUploadManager` and
// fails fast against the unavailable test backend. That's fine for our
// purposes : every assertion in this file is on state mutated BEFORE the
// upload network call (exporter call count, slide id, phase emission,
// progress propagation, fallback createStory dispatch on .returnsNil).
// Cleanup wiring is covered by `StoryVideoExportServiceTests`, not here.

@MainActor
final class StoryViewModel_VideoExportWiringTests: XCTestCase {

    private var mockStoryService: MockStoryService!
    private var mockPostService: MockPostService!
    private var mockSocket: MockSocialSocket!
    private var mockAPI: MockAPIClientForApp!
    private var mockExporter: MockStoryVideoExportService!
    private var cancellables: Set<AnyCancellable>!

    override func setUp() {
        super.setUp()
        mockStoryService = MockStoryService()
        mockPostService = MockPostService()
        mockSocket = MockSocialSocket()
        mockAPI = MockAPIClientForApp()
        mockExporter = MockStoryVideoExportService()
        cancellables = []
    }

    override func tearDown() {
        cancellables = nil
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

    /// A slide whose effects yield `needsVideoExport == true` without
    /// pulling in any video/audio media (a single `opening` transition is
    /// enough — see `StorySlide+ExportTrigger.swift`). Keeps the test
    /// hermetic : no real media files to materialise.
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

    /// Polls `activeUpload` becoming `nil` (success path) or moving to a
    /// `.failed` phase up to `timeout`. Necessary because
    /// `publishStoryInBackground` kicks off a detached `Task` and the
    /// terminal state is reached asynchronously. We deliberately avoid
    /// `XCTWaiter` against a Combine publisher here because the
    /// `@Published` setter races with the test thread on the
    /// `MainActor` ; a polled await is simpler and more reliable in
    /// XCTest.
    private func waitForUploadFinish(_ sut: StoryViewModel, timeout: TimeInterval = 5) async {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if sut.activeUpload == nil { return }
            if case .failed = sut.activeUpload?.phase { return }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }
    }

    // MARK: - Tests

    func test_publishStory_staticSlide_skipsVideoExport_followsLegacyPath() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(id: "static-result"))
        let sut = makeSUT()

        sut.publishStoryInBackground(
            slides: [Self.makeStaticSlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        await waitForUploadFinish(sut)

        XCTAssertEqual(
            mockExporter.prepareExportCallCount, 0,
            "Static slides must not touch the exporter — no needsVideoExport, no bake."
        )
        XCTAssertEqual(
            mockPostService.createStoryCallCount, 1,
            "Legacy asset path must still call createStory for static slides."
        )
    }

    func test_publishStory_videoSlide_triggersExport_uploadsMP4() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(id: "animated-result"))
        mockExporter.prepareExportBehavior = .success(url: Self.makeTempMP4(named: "wiring-success"))
        let sut = makeSUT()

        sut.publishStoryInBackground(
            slides: [Self.makeAnimatedSlide()],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        await waitForUploadFinish(sut)

        XCTAssertEqual(
            mockExporter.prepareExportCallCount, 1,
            "Animated slide should drive exactly one prepareExport invocation."
        )
        XCTAssertEqual(
            mockExporter.lastPreparedSlideId, "animated-1",
            "The slide id passed to prepareExport must match the input slide."
        )
        // We can't easily intercept the real TusUploadManager from here.
        // The wiring guarantees we ENTERED the bake-and-upload branch with
        // the exported URL ; cleanup itself is exercised by
        // `StoryVideoExportServiceTests` and runs only after a real upload
        // completes server-side (which the test environment cannot do).
        XCTAssertNotNil(
            mockExporter.lastPreparedSlideId,
            "Animated slide must have surfaced through the exporter route."
        )
    }

    func test_publishStory_videoSlide_emitsExportingPhase_inUploadState() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(id: "phase-test"))
        let phaseExpectation = expectation(description: "Saw .exporting phase")
        // Block inside the exporter long enough for the test to observe
        // the `.exporting` phase landing in `activeUpload`. The block
        // releases as soon as the assertion fulfils its expectation.
        mockExporter.prepareExportBehavior = .blockUntilSignal(
            url: Self.makeTempMP4(named: "phase-test"),
            phaseExpectation: phaseExpectation
        )
        let sut = makeSUT()

        sut.publishStoryInBackground(
            slides: [Self.makeAnimatedSlide(id: "phase-slide")],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        // Poll the phase from the main actor — the activeUpload mutation
        // happens via the onPhase callback inside runStoryUpload.
        let phasePoll = Task { @MainActor in
            for _ in 0..<200 {
                if case .exporting = sut.activeUpload?.phase {
                    phaseExpectation.fulfill()
                    return
                }
                try? await Task.sleep(nanoseconds: 20_000_000)
            }
        }
        await fulfillment(of: [phaseExpectation], timeout: 5)
        phasePoll.cancel()
        mockExporter.releaseBlockedExport()

        await waitForUploadFinish(sut)
        XCTAssertEqual(mockExporter.prepareExportCallCount, 1)
    }

    func test_publishStory_exportFailure_fallsBackToLegacy_publishesAnyway() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(id: "fallback-result"))
        // `prepareExport` swallows the underlying error and returns nil —
        // this is the contract documented on `StoryVideoExportServiceProviding`.
        // The mock simulates that public-facing nil rather than throwing,
        // which is what the real service exposes to callers.
        mockExporter.prepareExportBehavior = .returnsNil
        let sut = makeSUT()

        sut.publishStoryInBackground(
            slides: [Self.makeAnimatedSlide(id: "fallback-slide")],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        await waitForUploadFinish(sut)

        XCTAssertEqual(
            mockExporter.prepareExportCallCount, 1,
            "Animated slide should still attempt the export — fallback is a runtime decision."
        )
        XCTAssertEqual(
            mockPostService.createStoryCallCount, 1,
            "Story must still publish via the legacy asset path on export failure."
        )
        XCTAssertEqual(
            mockExporter.cleanupTempExportCallCount, 0,
            "Failed export already cleaned its own temp file — caller must not re-clean."
        )
    }

    func test_publishStory_videoSlide_progressUpdates_activeUpload() async {
        mockAPI.authToken = "token"
        mockPostService.createStoryResult = .success(Self.makeStoryAPIPost(id: "progress-result"))
        let progressURL = Self.makeTempMP4(named: "progress-test")
        mockExporter.prepareExportBehavior = .successWithProgress(
            url: progressURL,
            fractions: [0.25, 0.5, 0.75, 1.0]
        )
        let sut = makeSUT()

        // Capture progress mutations on activeUpload via the @Published
        // stream. We need to do this BEFORE kicking off the publish so
        // the sink is wired in time to catch early emissions.
        var observedProgress: [Double] = []
        sut.$activeUpload
            .compactMap { $0?.progress }
            .sink { observedProgress.append($0) }
            .store(in: &cancellables)

        sut.publishStoryInBackground(
            slides: [Self.makeAnimatedSlide(id: "progress-slide")],
            slideImages: [:],
            loadedImages: [:],
            loadedVideoURLs: [:]
        )

        await waitForUploadFinish(sut)

        XCTAssertEqual(mockExporter.prepareExportCallCount, 1)
        // At minimum we should see the activeUpload start at 0 + at least
        // one non-zero progress mutation. Stronger assertions on exact
        // values would be brittle because the upload phase also pushes
        // progress and the mock progress emissions land on `MainActor`
        // via `Task` hops.
        XCTAssertTrue(observedProgress.contains(0))
        XCTAssertTrue(
            observedProgress.contains(where: { $0 > 0 }),
            "Export progress callbacks must mutate activeUpload.progress beyond 0."
        )
    }

    // MARK: - Temp file helper

    /// Creates a real (empty) file in `NSTemporaryDirectory()` so the
    /// `TusUploadManager.uploadFile` call inside `runStoryUpload` finds
    /// a readable URL. We don't actually exercise the network here — the
    /// test environment's `MeeshyConfig.shared.serverOrigin` resolves to
    /// localhost which the TUS manager will fail-fast against; that's
    /// fine because the failure path still propagates through and we
    /// only assert on exporter call counts.
    private static func makeTempMP4(named prefix: String) -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(prefix)-\(UUID().uuidString).mp4")
        FileManager.default.createFile(atPath: url.path, contents: Data(), attributes: nil)
        return url
    }
}

// MARK: - MockStoryVideoExportService

/// Test double for `StoryVideoExportServiceProviding`. Records call counts
/// and lets each test pick a behavior for `prepareExport`. `@MainActor`
/// matches the protocol annotation so we can mutate counters without an
/// actor hop.
@MainActor
final class MockStoryVideoExportService: StoryVideoExportServiceProviding {

    enum Behavior {
        /// Returns `url` immediately. Default for happy-path tests.
        case success(url: URL)
        /// Emits each progress fraction in order via `onProgress` then
        /// returns `url`. Lets us exercise progress wiring end-to-end.
        case successWithProgress(url: URL, fractions: [Double])
        /// Awaits an external signal before returning `url`. Used to
        /// observe phase transitions on `activeUpload` while the export
        /// is still "in flight".
        case blockUntilSignal(url: URL, phaseExpectation: XCTestExpectation)
        /// Returns `nil` (matches the real service's graceful-failure
        /// contract — caller falls back to legacy path).
        case returnsNil
    }

    var prepareExportBehavior: Behavior = .returnsNil

    private(set) var prepareExportCallCount = 0
    private(set) var lastPreparedSlideId: String?
    private(set) var cleanupTempExportCallCount = 0
    private(set) var lastCleanedURL: URL?

    /// Continuation released by `releaseBlockedExport()` for the
    /// `.blockUntilSignal` behavior. Kept as a single optional since at
    /// most one blocked export is in flight at a time across the suite.
    private var blockedContinuation: CheckedContinuation<Void, Never>?

    func prepareExport(
        slide: StorySlide,
        onProgress: ((Double) -> Void)?,
        onPhaseChange: ((StoryUploadPhase) -> Void)?
    ) async -> URL? {
        prepareExportCallCount += 1
        lastPreparedSlideId = slide.id

        switch prepareExportBehavior {
        case .success(let url):
            onPhaseChange?(.exporting)
            return url

        case .successWithProgress(let url, let fractions):
            onPhaseChange?(.exporting)
            for fraction in fractions {
                onProgress?(fraction)
            }
            return url

        case .blockUntilSignal(let url, _):
            onPhaseChange?(.exporting)
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                self.blockedContinuation = continuation
            }
            return url

        case .returnsNil:
            // Match the real service : when an export "fails", the
            // public surface returns nil without calling onPhaseChange,
            // because the underlying export was skipped/aborted before
            // we could publish a phase. Caller falls back to legacy.
            return nil
        }
    }

    func cleanupTempExport(at url: URL) {
        cleanupTempExportCallCount += 1
        lastCleanedURL = url
    }

    /// Signals the `.blockUntilSignal` continuation so the in-flight
    /// `prepareExport` returns. No-op if no export is currently blocked
    /// (idempotent — tests can call this unconditionally on teardown).
    func releaseBlockedExport() {
        blockedContinuation?.resume()
        blockedContinuation = nil
    }
}
