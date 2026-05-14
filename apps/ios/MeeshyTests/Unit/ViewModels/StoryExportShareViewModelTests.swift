import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

// MARK: - StoryExportShareViewModelTests
//
// Covers the author-only "Export to share" flow. The VM never touches the
// publish path — every test asserts the bake output exists locally and
// nothing else.

@MainActor
final class StoryExportShareViewModelTests: XCTestCase {

    // MARK: - Factories

    private func makeSUT(
        behavior: MockShareExporter.Behavior = .success
    ) -> (sut: StoryExportShareViewModel, exporter: MockShareExporter) {
        let exporter = MockShareExporter(behavior: behavior)
        let sut = StoryExportShareViewModel(exporter: exporter)
        return (sut, exporter)
    }

    /// Builds a story whose `effects` set an opening transition — this
    /// trips `needsVideoExport` (see `StorySlide+ExportTrigger`).
    private func makeAnimatedStory(translations: [StoryTranslation]? = nil) -> StoryItem {
        let effects = StoryEffects(opening: .fade,
                                   textObjects: [StoryTextObject(text: "Hello")])
        return StoryItem(id: "story-\(UUID().uuidString)",
                         content: "Hello",
                         storyEffects: effects,
                         translations: translations)
    }

    /// Builds a story whose `effects` are empty — text-only static, never
    /// needs export.
    private func makeStaticStory() -> StoryItem {
        StoryItem(id: "story-\(UUID().uuidString)",
                  content: "Hello",
                  storyEffects: StoryEffects())
    }

    // MARK: - prepare

    func test_prepare_seedsAvailableLanguagesFromTranslations() {
        let (sut, _) = makeSUT()
        let story = makeAnimatedStory(translations: [
            StoryTranslation(language: "fr", content: "Bonjour"),
            StoryTranslation(language: "en", content: "Hello"),
            StoryTranslation(language: "es", content: "Hola"),
        ])

        sut.prepare(story: story)

        XCTAssertEqual(sut.availableLanguages, ["fr", "en", "es"])
    }

    func test_prepare_emptyTranslations_leavesLanguagesEmpty() {
        let (sut, _) = makeSUT()
        sut.prepare(story: makeAnimatedStory())
        XCTAssertEqual(sut.availableLanguages, [])
        XCTAssertNil(sut.selectedLanguage)
    }

    // MARK: - startExport

    func test_startExport_animatedStory_callsExporterAndStoresURL() async {
        let (sut, exporter) = makeSUT(behavior: .success)
        let story = makeAnimatedStory(translations: [StoryTranslation(language: "fr", content: "Bonjour")])
        sut.prepare(story: story)
        sut.selectedLanguage = "fr"

        await sut.startExport(story: story)

        XCTAssertEqual(exporter.prepareCallCount, 1)
        XCTAssertEqual(exporter.lastLanguages, ["fr"])
        XCTAssertNotNil(sut.sharedURL)
        XCTAssertEqual(sut.phase, .ready)

        // Clean up: simulate share completion so the file isn't left behind.
        sut.finishSharing(success: true)
    }

    func test_startExport_staticStory_doesNotCallExporter_failsWithMessage() async {
        let (sut, exporter) = makeSUT(behavior: .success)
        let story = makeStaticStory()

        await sut.startExport(story: story)

        XCTAssertEqual(exporter.prepareCallCount, 0)
        XCTAssertNotNil(sut.errorMessage)
        if case .failed = sut.phase {
            // ok
        } else {
            XCTFail("Expected phase .failed for a static story")
        }
    }

    func test_startExport_failure_setsErrorMessage_andPhaseFailed() async {
        let (sut, _) = makeSUT(behavior: .failure)
        let story = makeAnimatedStory()

        await sut.startExport(story: story)

        XCTAssertNotNil(sut.errorMessage)
        if case .failed = sut.phase {
            // ok
        } else {
            XCTFail("Expected phase .failed when exporter returns nil")
        }
    }

    // MARK: - finishSharing

    func test_finishSharing_cleansUpTempFile() async {
        let (sut, exporter) = makeSUT(behavior: .success)
        let story = makeAnimatedStory()
        await sut.startExport(story: story)
        XCTAssertEqual(exporter.cleanupCallCount, 0)

        let bakedURL = sut.sharedURL
        sut.finishSharing(success: true)

        XCTAssertEqual(exporter.cleanupCallCount, 1)
        XCTAssertEqual(exporter.lastCleanupURL, bakedURL)
        XCTAssertNil(sut.sharedURL)
    }

    func test_finishSharing_cancelled_stillCleansUpTempFile() async {
        let (sut, exporter) = makeSUT(behavior: .success)
        let story = makeAnimatedStory()
        await sut.startExport(story: story)

        sut.finishSharing(success: false)

        XCTAssertEqual(exporter.cleanupCallCount, 1,
                       "Cancel must still clean up the temp MP4.")
        XCTAssertNil(sut.sharedURL)
    }

    // MARK: - cancel

    func test_cancel_priorToExport_isNoop_doesNotCallCleanup() {
        let (sut, exporter) = makeSUT()
        sut.cancel()
        XCTAssertEqual(exporter.cleanupCallCount, 0)
        XCTAssertEqual(sut.phase, .idle)
    }

    func test_cancel_afterReady_cleansUpAndResets() async {
        let (sut, exporter) = makeSUT(behavior: .success)
        await sut.startExport(story: makeAnimatedStory())
        XCTAssertEqual(sut.phase, .ready)

        sut.cancel()

        XCTAssertEqual(exporter.cleanupCallCount, 1)
        XCTAssertNil(sut.sharedURL)
        XCTAssertEqual(sut.phase, .idle)
    }
}

// MARK: - MockShareExporter

@MainActor
final class MockShareExporter: StoryVideoExportServiceProviding {

    enum Behavior {
        case success
        case failure
    }

    private(set) var prepareCallCount = 0
    private(set) var cleanupCallCount = 0
    private(set) var lastLanguages: [String] = []
    private(set) var lastCleanupURL: URL? = nil
    private(set) var lastBakedURL: URL? = nil
    let behavior: Behavior

    init(behavior: Behavior) { self.behavior = behavior }

    func prepareExport(
        slide: StorySlide,
        languages: [String],
        onProgress: ((Double) -> Void)?,
        onPhaseChange: ((StoryExportPhase) -> Void)?
    ) async -> URL? {
        prepareCallCount += 1
        lastLanguages = languages

        switch behavior {
        case .success:
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("mock-share-\(UUID().uuidString).mp4")
            try? Data().write(to: url)
            lastBakedURL = url
            return url
        case .failure:
            return nil
        }
    }

    func cleanupExport(at url: URL) {
        cleanupCallCount += 1
        lastCleanupURL = url
        try? FileManager.default.removeItem(at: url)
    }
}
