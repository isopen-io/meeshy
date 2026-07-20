import XCTest
import AVFoundation
import CoreMedia
import Foundation
@testable import MeeshyUI
@testable import MeeshySDK

/// Tests for the Sprint 8 Phase 2 progress callback wiring on
/// `StoryExporter.export(_:to:progress:)`.
///
/// Contract (spec §3.6):
///   * The new `progress` parameter is `@Sendable` and optional; existing
///     callers that don't pass it MUST compile and run unchanged.
///   * When provided, the callback receives `0.0...1.0` values polled at
///     ~10Hz against `AVAssetExportSession.progress`.
///   * The terminal call after `.completed` MUST be exactly `1.0` so the
///     caller's `ProgressView` lands on its filled state.
///   * The poll cadence MUST stay at ~10Hz (no busy loop) so callers don't
///     get N×1000 invocations on a fast export.
///
/// All tests honour `MEESHY_SKIP_EXPORT_TESTS` because the export pipeline
/// can be flaky on CI Metal/AVFoundation builds — matching the rest of the
/// `Story/Export/` suite.
final class StoryExporter_ProgressTests: XCTestCase {

    // MARK: - Back-compat regression

    /// The original API (`progress` parameter absent) MUST still compile and
    /// produce a video file. This is the load-bearing back-compat test for
    /// callers in `apps/ios/` that don't yet pass a callback.
    @MainActor
    func test_export_without_progress_callback_compiles_and_runs() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_no_progress_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = ProgressTestFixture.makeStaticSlide(duration: 1.0)

        // Note: no `progress:` argument — exercises the default `nil` value.
        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        XCTAssertTrue(FileManager.default.fileExists(atPath: outputURL.path),
                      "Back-compat export should produce a file at the output URL")
    }

    // MARK: - Callback delivery

    /// When a progress callback is supplied, it MUST receive at least one
    /// invocation with a value in `[0.0, 1.0]` over the lifetime of the
    /// export. The polling task runs on every export regardless of whether
    /// AVAssetExportSession crossed 50% — so even a tiny clip produces ≥1
    /// sample (the immediate first poll before sleep + the terminal 1.0).
    @MainActor
    func test_export_with_progress_callback_receives_updates() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_progress_updates_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let collector = ProgressCollector()
        let slide = ProgressTestFixture.makeStaticSlide(duration: 1.0)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL, progress: { value in
                Task { await collector.record(value) }
            })
        }.value

        // Give the @MainActor record() tasks a moment to drain so we don't
        // race the terminal callback. AVAssetExportSession returns from
        // `await export()` synchronously after `.completed`, but the inner
        // `Task { await collector.record(...) }` calls scheduled by the
        // polling task may still be queued on the actor.
        try await Task.sleep(nanoseconds: 50_000_000) // 50ms drain

        let samples = await collector.samples()
        XCTAssertGreaterThanOrEqual(samples.count, 1,
                                    "Progress callback should fire at least once")
        for sample in samples {
            XCTAssertGreaterThanOrEqual(sample, 0.0,
                                        "Progress sample should be ≥ 0.0 (got \(sample))")
            XCTAssertLessThanOrEqual(sample, 1.0,
                                     "Progress sample should be ≤ 1.0 (got \(sample))")
        }
    }

    // MARK: - Terminal 1.0 contract

    /// The LAST progress callback after a successful export MUST be exactly
    /// `1.0`. AVAssetExportSession can flip its `.status` to `.completed`
    /// before the `.progress` property finishes climbing — the implementation
    /// explicitly emits `progress?(1.0)` after `await session.export()`
    /// returns, and this test pins that behaviour.
    @MainActor
    func test_export_progress_final_call_is_one() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_progress_terminal_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let collector = ProgressCollector()
        let slide = ProgressTestFixture.makeStaticSlide(duration: 1.0)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL, progress: { value in
                Task { await collector.record(value) }
            })
        }.value

        // Drain pending actor tasks (the inner `Task { await record(...) }`
        // dispatches may still be in flight after export() returns).
        try await Task.sleep(nanoseconds: 50_000_000)

        let samples = await collector.samples()
        let last = try XCTUnwrap(samples.last,
                                 "At least the terminal 1.0 call should land")
        XCTAssertEqual(last, 1.0,
                       "Final progress call must be exactly 1.0, got \(last)")
    }

    // MARK: - Throttle cadence

    /// The polling task sleeps 100ms between samples (10Hz). Over the
    /// lifetime of an export of duration `D` seconds, the callback should
    /// fire AT MOST `~10 * D + 2` times (the +2 covers the immediate first
    /// poll before any sleep and the terminal explicit `progress?(1.0)`).
    ///
    /// This protects against a regression where someone accidentally drops
    /// the `Task.sleep` and busy-loops the callback. The bound is generous
    /// to keep the test stable on slow CI runners but still catches a true
    /// busy loop (which would emit thousands of samples in the same window).
    @MainActor
    func test_export_progress_throttled_at_10Hz() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_progress_throttle_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let collector = ProgressCollector()
        let slide = ProgressTestFixture.makeStaticSlide(duration: 1.5)

        let exportStart = Date()
        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL, progress: { value in
                Task { await collector.record(value) }
            })
        }.value
        let elapsedSeconds = Date().timeIntervalSince(exportStart)

        try await Task.sleep(nanoseconds: 100_000_000) // 100ms drain

        let samples = await collector.samples()
        // 10Hz target + 1 initial poll + 1 terminal call + 50% slack for
        // scheduler jitter on CI. With `elapsedSeconds` ≈ 1-3s for a 1.5s
        // slide, max ≈ (3 * 10 + 2) * 1.5 ≈ 48 — anything above that means
        // we lost the throttle.
        let maxAllowed = Int(elapsedSeconds * 10.0 + 2.0) * 2 + 5
        XCTAssertLessThanOrEqual(samples.count, maxAllowed,
                                 "Progress callback fired \(samples.count) times in \(elapsedSeconds)s — expected ≤ \(maxAllowed) at 10Hz. Throttle is likely missing.")
    }
}

// MARK: - Helpers

/// Thread-safe collector for progress samples. The progress callback is
/// `@Sendable` and may fire from a `Task { @MainActor in }` inside
/// `StoryExporter`, so we route each sample through an actor to avoid
/// data races on the underlying array.
private actor ProgressCollector {
    private var values: [Double] = []

    func record(_ value: Double) {
        values.append(value)
    }

    func samples() -> [Double] {
        values
    }
}

/// Builds the minimal slide required to exercise the export pipeline — a
/// static-only slide with one text object and no media. Reuses the
/// transparent synthetic substrate, so each test runs in ~1-3s on the
/// simulator.
private enum ProgressTestFixture {
    static func makeStaticSlide(duration: TimeInterval) -> StorySlide {
        let text = StoryTextObject(
            id: UUID().uuidString,
            text: "Progress test",
            x: 0.5, y: 0.5,
            fontSize: 48.0,
            startTime: 0.0,
            duration: duration
        )
        var effects = StoryEffects()
        effects.textObjects = [text]
        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: duration,
                          order: 0)
    }
}
