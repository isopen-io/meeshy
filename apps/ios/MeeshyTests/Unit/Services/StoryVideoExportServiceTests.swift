import XCTest
@testable import Meeshy
@testable import MeeshySDK

// MARK: - StoryVideoExportServiceTests
//
// Spec : docs/superpowers/specs/2026-05-12-story-publish-exporter-wiring-design.md §3.1, §3.3, §3.4
//
// Covers the four orchestration responsibilities of `StoryVideoExportService` :
//   1. Routing — `needsVideoExport == false` slides skip export entirely.
//   2. Drive  — `needsVideoExport == true` slides trigger the injected exporter
//                and propagate progress / phase callbacks.
//   3. Fallback — exporter throws → service returns `nil` (legacy asset path).
//   4. Cleanup — `cleanupTempExport(at:)` removes the temp MP4 deterministically.

@MainActor
final class StoryVideoExportServiceTests: XCTestCase {

    // MARK: - Factories

    /// Builds the SUT with a mock exporter so tests can stub success /
    /// failure / progress emission without spinning up AVFoundation.
    private func makeSUT(
        exporterBehavior: MockStoryExporter.Behavior = .success
    ) -> (sut: StoryVideoExportService, exporter: MockStoryExporter) {
        let exporter = MockStoryExporter(behavior: exporterBehavior)
        let sut = StoryVideoExportService(exporter: exporter)
        return (sut, exporter)
    }

    /// A slide that does NOT need export (text/sticker/image only). Matches
    /// the P1 trigger matrix — `needsVideoExport` returns `false`.
    private func makeStaticSlide() -> StorySlide {
        StorySlide(id: "static-\(UUID().uuidString)",
                   effects: StoryEffects())
    }

    /// A slide that DOES need export — uses a foreground `.video` media
    /// object which trips the first branch of `needsVideoExport`.
    private func makeVideoSlide() -> StorySlide {
        let media = StoryMediaObject(kind: .video, aspectRatio: 1.0)
        return StorySlide(id: "video-\(UUID().uuidString)",
                          effects: StoryEffects(mediaObjects: [media]))
    }

    // MARK: - 1. Routing

    /// Static slides must never touch the exporter. Returns nil immediately
    /// so the publish flow stays on the legacy asset path with zero cost.
    func test_prepareExport_staticSlide_skipsExport_returnsNil() async {
        let (sut, exporter) = makeSUT()

        let result = await sut.prepareExport(
            slide: makeStaticSlide(),
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertNil(result)
        XCTAssertEqual(exporter.exportCallCount, 0,
                       "Static slide must NOT invoke the exporter.")
    }

    /// Static slides must not emit any phase change either — there's
    /// nothing happening, the caller shouldn't see ".exporting" flash
    /// on the UI.
    func test_prepareExport_staticSlide_doesNotEmitPhase() async {
        let (sut, _) = makeSUT()
        var phases: [StoryUploadPhase] = []

        _ = await sut.prepareExport(
            slide: makeStaticSlide(),
            onProgress: nil,
            onPhaseChange: { phases.append($0) }
        )

        XCTAssertEqual(phases, [],
                       "Static slide must not surface a phase to the caller.")
    }

    // MARK: - 2. Drive

    /// Happy path : video slide triggers exporter, returns the temp URL
    /// the exporter was asked to write to (so the caller can hand it to
    /// the TUS uploader downstream).
    func test_prepareExport_videoSlide_triggersExport_returnsURL() async {
        let (sut, exporter) = makeSUT(exporterBehavior: .success)

        let result = await sut.prepareExport(
            slide: makeVideoSlide(),
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertNotNil(result, "Successful export must return the temp URL.")
        XCTAssertEqual(exporter.exportCallCount, 1)
        XCTAssertEqual(result?.pathExtension, "mp4",
                       "Temp file must be an MP4 so TUS uploads with the right mime.")
        XCTAssertEqual(result, exporter.lastOutputURL,
                       "Returned URL must match the URL passed into the exporter.")

        // Tidy up so we don't pollute the simulator's tmpdir across runs.
        if let url = result {
            sut.cleanupTempExport(at: url)
        }
    }

    /// Phase `.exporting` must be emitted exactly once before the export
    /// runs so the StoryTrayView can switch its progress label.
    func test_prepareExport_videoSlide_emitsExportingPhase() async {
        let (sut, _) = makeSUT(exporterBehavior: .success)
        var phases: [StoryUploadPhase] = []

        let url = await sut.prepareExport(
            slide: makeVideoSlide(),
            onProgress: nil,
            onPhaseChange: { phases.append($0) }
        )

        XCTAssertEqual(phases, [.exporting],
                       "Service must emit .exporting exactly once for a video slide.")

        if let url { sut.cleanupTempExport(at: url) }
    }

    /// Progress callback must receive fractions verbatim from the
    /// underlying exporter. We don't smooth or throttle — the exporter
    /// already does (spec §3.6). The service trampolines through a
    /// `Task { @MainActor in ... }` so we wait for the hop to drain
    /// before asserting.
    func test_prepareExport_progress_propagatesToCallback() async {
        let stubFractions: [Double] = [0.1, 0.45, 0.9, 1.0]
        let (sut, _) = makeSUT(exporterBehavior: .successEmittingProgress(stubFractions))
        let collector = ProgressCollector()

        let url = await sut.prepareExport(
            slide: makeVideoSlide(),
            onProgress: { collector.append($0) },
            onPhaseChange: nil
        )

        // The service routes progress through `Task { @MainActor in ... }`,
        // which means after `prepareExport` returns we may still have
        // pending tasks in the main actor's queue. Yield once so they
        // drain before we read `collected`.
        await Task.yield()
        await Task.yield()

        XCTAssertEqual(collector.collected, stubFractions,
                       "Service must forward every fraction the exporter emits.")

        if let url { sut.cleanupTempExport(at: url) }
    }

    // MARK: - 3. Fallback

    /// Exporter throws → service swallows the error, deletes the temp
    /// file it created, and returns nil so the caller falls back to the
    /// asset path. Story still publishes (spec §3.7 / D-7).
    func test_prepareExport_exportFailure_returnsNil_fallsBackToLegacy() async {
        let (sut, exporter) = makeSUT(
            exporterBehavior: .failure(StoryExporterError.exportFailed("simulated"))
        )

        let result = await sut.prepareExport(
            slide: makeVideoSlide(),
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertNil(result, "Failure must surface as nil — caller picks legacy path.")
        XCTAssertEqual(exporter.exportCallCount, 1,
                       "Service must still attempt the export before falling back.")
        // Cleanup is internal on failure : the temp URL the exporter was
        // handed should no longer exist on disk (the file may never have
        // been created — `removeItem` is no-op on missing files anyway).
        if let attemptedURL = exporter.lastOutputURL {
            XCTAssertFalse(
                FileManager.default.fileExists(atPath: attemptedURL.path),
                "Failed export must not leave an orphan temp file on disk."
            )
        }
    }

    /// On failure, the phase callback may still fire `.exporting` (we
    /// commit to attempting the export before knowing it will fail) — but
    /// no `.completed` / `.failed` follow-up. P6 will own the terminal
    /// phases ; for P3 we just assert the .exporting signal got out.
    func test_prepareExport_exportFailure_stillEmitsExportingPhase() async {
        let (sut, _) = makeSUT(
            exporterBehavior: .failure(StoryExporterError.sessionCreationFailed)
        )
        var phases: [StoryUploadPhase] = []

        _ = await sut.prepareExport(
            slide: makeVideoSlide(),
            onProgress: nil,
            onPhaseChange: { phases.append($0) }
        )

        XCTAssertEqual(phases, [.exporting])
    }

    // MARK: - 4. Cleanup

    /// `cleanupTempExport(at:)` must remove an existing temp file. Used
    /// by callers after a successful TUS upload (spec §3.4).
    func test_cleanupTempExport_existingFile_removesIt() throws {
        let (sut, _) = makeSUT()
        let tmpURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-test-cleanup-\(UUID().uuidString).mp4")
        try Data([0x00, 0x01]).write(to: tmpURL)
        XCTAssertTrue(FileManager.default.fileExists(atPath: tmpURL.path))

        sut.cleanupTempExport(at: tmpURL)

        XCTAssertFalse(
            FileManager.default.fileExists(atPath: tmpURL.path),
            "cleanupTempExport must delete the temp file."
        )
    }

    /// `cleanupTempExport(at:)` must be a no-op when the file is already
    /// gone. Important : after a resume-eligible failure the queue may
    /// retry cleanup on a path that no longer exists ; throwing here
    /// would mask real errors elsewhere.
    func test_cleanupTempExport_missingFile_isNoop() {
        let (sut, _) = makeSUT()
        let nonexistent = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-test-missing-\(UUID().uuidString).mp4")
        XCTAssertFalse(FileManager.default.fileExists(atPath: nonexistent.path))

        // Should not crash, throw, or log a fault.
        sut.cleanupTempExport(at: nonexistent)
    }

    /// On a successful export the caller owns lifecycle : the file MUST
    /// still exist when `prepareExport` returns so the caller can hand
    /// it to TUS. Cleanup only happens via the public `cleanupTempExport`
    /// entry point, never implicitly on success.
    func test_prepareExport_successfulExport_leavesFileForCaller() async throws {
        let (sut, _) = makeSUT(exporterBehavior: .success)

        guard let url = await sut.prepareExport(
            slide: makeVideoSlide(),
            onProgress: nil,
            onPhaseChange: nil
        ) else {
            XCTFail("Expected a non-nil URL for a successful export.")
            return
        }

        XCTAssertTrue(
            FileManager.default.fileExists(atPath: url.path),
            "Service must NOT auto-cleanup on success — caller drives TUS first."
        )

        // Tidy up so we don't pollute the simulator's tmpdir across runs.
        sut.cleanupTempExport(at: url)
    }
}

// MARK: - ProgressCollector

/// Thread-safe collector for progress fractions emitted across the
/// `Task { @MainActor in ... }` trampoline. The service jumps off the
/// caller's actor briefly when forwarding fractions, so a plain
/// `[Double]` captured by closure trips Swift 6's strict isolation
/// checker. A `@MainActor`-isolated reference class with a `nonisolated`
/// append (lock-protected) is the minimal safe alternative.
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

/// Test seam for `StoryExporting`. Conforms to the protocol declared in
/// `StoryVideoExportService.swift` and stubs the three behaviours the
/// service has branching logic on : success, success with progress
/// emission, and failure. Tracks call count and the last `outputURL` so
/// tests can assert the service handed off the right path.
///
/// `@unchecked Sendable` + NSLock is the minimum needed to satisfy the
/// `Sendable` protocol conformance while letting the test read mutable
/// state from `@MainActor` after the `await` returns. The lock is held
/// only for the trivial trackers — never across the `await` itself.
final class MockStoryExporter: StoryExporting, @unchecked Sendable {

    enum Behavior: Sendable {
        /// Returns immediately, creates an empty output file so
        /// `prepareExport` callers see it on disk. Default for the
        /// happy path.
        case success
        /// Synthesises a temp MP4, then calls `progress` with each
        /// fraction in order before returning. Lets us assert end-to-end
        /// callback forwarding.
        case successEmittingProgress([Double])
        /// Throws the wrapped error. Used to exercise the fallback path.
        case failure(Error)
    }

    private let lock = NSLock()
    private var _exportCallCount = 0
    private var _lastOutputURL: URL?
    let behavior: Behavior

    init(behavior: Behavior) {
        self.behavior = behavior
    }

    var exportCallCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return _exportCallCount
    }

    var lastOutputURL: URL? {
        lock.lock()
        defer { lock.unlock() }
        return _lastOutputURL
    }

    func export(
        slide: StorySlide,
        to outputURL: URL,
        progress: (@Sendable (Double) -> Void)?
    ) async throws {
        lock.lock()
        _exportCallCount += 1
        _lastOutputURL = outputURL
        lock.unlock()

        switch behavior {
        case .success:
            // Touch the file so callers see a real artefact on disk —
            // matches what the real `StoryExporter` does on completion.
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
