import XCTest
@testable import Meeshy
@testable import MeeshySDK

// MARK: - StoryVideoExportServiceTests
//
// Covers the orchestration responsibilities of `StoryVideoExportService`
// in the author-only "Export to share" flow :
//   1. Drive    — every slide (static or animated) triggers the injected
//                  exporter, propagates progress / phase callbacks, and
//                  threads the chosen `languages` array to the bake. The
//                  compositor synthesises a transparent video track when
//                  no background video exists (see StoryExporter B1).
//   2. Fallback — exporter throws → service returns `nil` so the share UI
//                  surfaces a friendly error to the user.
//   3. Cleanup  — `cleanupExport(at:)` removes the temp MP4 deterministically.

@MainActor
final class StoryVideoExportServiceTests: XCTestCase {

    // MARK: - Factories

    private func makeSUT(
        exporterBehavior: MockStoryExporter.Behavior = .success
    ) -> (sut: StoryVideoExportService, exporter: MockStoryExporter) {
        let exporter = MockStoryExporter(behavior: exporterBehavior)
        let sut = StoryVideoExportService(exporter: exporter)
        return (sut, exporter)
    }

    private func makeStaticSlide() -> StorySlide {
        StorySlide(id: "static-\(UUID().uuidString)",
                   effects: StoryEffects())
    }

    private func makeVideoSlide() -> StorySlide {
        let media = StoryMediaObject(kind: .video, aspectRatio: 1.0)
        return StorySlide(id: "video-\(UUID().uuidString)",
                          effects: StoryEffects(mediaObjects: [media]))
    }

    // MARK: - 1. Drive

    func test_prepareExport_staticSlide_triggersExport_returnsURL() async {
        // Universal export — static slides bake via the same path as
        // animated ones. The synthetic transparent track in
        // StoryExporter (B1) provides a substrate so the compositor can
        // still render text/sticker/image overlays into an MP4.
        let (sut, exporter) = makeSUT()

        let result = await sut.prepareExport(
            slide: makeStaticSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertNotNil(result)
        XCTAssertEqual(exporter.exportCallCount, 1,
                       "Static slide must still invoke the exporter.")
        XCTAssertEqual(result?.pathExtension, "mp4")
        XCTAssertEqual(result, exporter.lastOutputURL)

        if let url = result {
            sut.cleanupExport(at: url)
        }
    }

    func test_prepareExport_staticSlide_emitsExportingPhase() async {
        // The phase callback fires for every export — the share UI relies
        // on `.exporting` to render its progress feedback regardless of
        // the slide's animated content.
        let (sut, _) = makeSUT()
        var phases: [StoryExportPhase] = []

        let url = await sut.prepareExport(
            slide: makeStaticSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: { phases.append($0) }
        )

        XCTAssertEqual(phases, [.exporting])

        if let url { sut.cleanupExport(at: url) }
    }

    func test_prepareExport_videoSlide_triggersExport_returnsURL() async {
        let (sut, exporter) = makeSUT(exporterBehavior: .success)

        let result = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertNotNil(result)
        XCTAssertEqual(exporter.exportCallCount, 1)
        XCTAssertEqual(result?.pathExtension, "mp4")
        XCTAssertEqual(result, exporter.lastOutputURL)

        if let url = result {
            sut.cleanupExport(at: url)
        }
    }

    func test_prepareExport_videoSlide_emitsExportingPhase() async {
        let (sut, _) = makeSUT(exporterBehavior: .success)
        var phases: [StoryExportPhase] = []

        let url = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: { phases.append($0) }
        )

        XCTAssertEqual(phases, [.exporting])

        if let url { sut.cleanupExport(at: url) }
    }

    func test_prepareExport_progress_propagatesToCallback() async {
        let stubFractions: [Double] = [0.1, 0.45, 0.9, 1.0]
        let (sut, _) = makeSUT(exporterBehavior: .successEmittingProgress(stubFractions))
        let collector = ProgressCollector()

        let url = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: [],
            onProgress: { collector.append($0) },
            onPhaseChange: nil
        )

        await Task.yield()
        await Task.yield()

        XCTAssertEqual(collector.collected, stubFractions)

        if let url { sut.cleanupExport(at: url) }
    }

    /// Threads the caller's preferred languages to the exporter so the
    /// baked MP4 reflects the author's chosen export language (Prisme
    /// Linguistique).
    func test_prepareExport_videoSlide_threadsLanguagesToExporter() async {
        let (sut, exporter) = makeSUT(exporterBehavior: .success)

        let url = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: ["fr", "en"],
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertEqual(exporter.lastLanguages, ["fr", "en"])

        if let url { sut.cleanupExport(at: url) }
    }

    // MARK: - 2. Fallback

    func test_prepareExport_exportFailure_returnsNil() async {
        let (sut, exporter) = makeSUT(
            exporterBehavior: .failure(StoryExporterError.exportFailed("simulated"))
        )

        let result = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertNil(result)
        XCTAssertEqual(exporter.exportCallCount, 1)
        if let attemptedURL = exporter.lastOutputURL {
            XCTAssertFalse(
                FileManager.default.fileExists(atPath: attemptedURL.path),
                "Failed export must not leave an orphan temp file on disk."
            )
        }
    }

    func test_prepareExport_exportFailure_stillEmitsExportingPhase() async {
        let (sut, _) = makeSUT(
            exporterBehavior: .failure(StoryExporterError.sessionCreationFailed)
        )
        var phases: [StoryExportPhase] = []

        _ = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: { phases.append($0) }
        )

        XCTAssertEqual(phases, [.exporting])
    }

    // MARK: - 3. Cleanup

    func test_cleanupExport_existingFile_removesIt() throws {
        let (sut, _) = makeSUT()
        let tmpURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-test-cleanup-\(UUID().uuidString).mp4")
        try Data([0x00, 0x01]).write(to: tmpURL)
        XCTAssertTrue(FileManager.default.fileExists(atPath: tmpURL.path))

        sut.cleanupExport(at: tmpURL)

        XCTAssertFalse(FileManager.default.fileExists(atPath: tmpURL.path))
    }

    func test_cleanupExport_missingFile_isNoop() {
        let (sut, _) = makeSUT()
        let nonexistent = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-test-missing-\(UUID().uuidString).mp4")
        XCTAssertFalse(FileManager.default.fileExists(atPath: nonexistent.path))

        sut.cleanupExport(at: nonexistent)
    }

    func test_prepareExport_successfulExport_leavesFileForCaller() async throws {
        let (sut, _) = makeSUT(exporterBehavior: .success)

        guard let url = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: nil
        ) else {
            XCTFail("Expected a non-nil URL for a successful export.")
            return
        }

        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))

        sut.cleanupExport(at: url)
    }
}

// MARK: - ProgressCollector

final class ProgressCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [Double] = []

    func append(_ value: Double) {
        lock.lock()
        storage.append(value)
        lock.unlock()
    }

    var collected: [Double] {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }
}

// MARK: - MockStoryExporter

final class MockStoryExporter: StoryExporting, @unchecked Sendable {

    enum Behavior: Sendable {
        case success
        case successEmittingProgress([Double])
        case failure(Error)
    }

    private let lock = NSLock()
    private var _exportCallCount = 0
    private var _lastOutputURL: URL?
    private var _lastLanguages: [String] = []
    let behavior: Behavior

    init(behavior: Behavior) {
        self.behavior = behavior
    }

    var exportCallCount: Int {
        lock.lock(); defer { lock.unlock() }
        return _exportCallCount
    }

    var lastOutputURL: URL? {
        lock.lock(); defer { lock.unlock() }
        return _lastOutputURL
    }

    var lastLanguages: [String] {
        lock.lock(); defer { lock.unlock() }
        return _lastLanguages
    }

    func export(
        slide: StorySlide,
        to outputURL: URL,
        languages: [String],
        progress: (@Sendable (Double) -> Void)?
    ) async throws {
        lock.withLock {
            _exportCallCount += 1
            _lastOutputURL = outputURL
            _lastLanguages = languages
        }

        switch behavior {
        case .success:
            try Data().write(to: outputURL)

        case .successEmittingProgress(let fractions):
            try Data().write(to: outputURL)
            for fraction in fractions {
                progress?(fraction)
            }

        case .failure(let error):
            throw error
        }
    }
}
