import XCTest
@testable import Meeshy
import MeeshySDK

/// Sprint 8 Phase 6 — publish→exporter wiring (spec §3.5).
///
/// Pins the row label rendered in the story tray while
/// `StoryVideoExportService` bakes an MP4 for a slide that reports
/// `needsVideoExport == true`. The avatar overlay (progress ring +
/// percentage) is already covered by visual inspection in the composer
/// preview ; what these tests pin is the textual row beneath the
/// "Moi" avatar so the user understands the (potentially multi-second)
/// delay is the local export step, not a network upload.
///
/// Rather than instantiate the (private) `MyStoryButton` SwiftUI view —
/// which would force us to ship test-only EnvironmentObjects, a stub
/// `StoryViewModel`, and a working `MeeshyAvatar` rendering stack — we
/// drive the pure helper `storyTrayUploadLabel(phase:progress:)` that
/// the view calls. The helper is the only thing actually exercised by
/// these scenarios ; the view is a thin `if let label = … { Text(label) }`
/// wrapper around it.
///
/// Phases covered :
///  1. `.exporting` surfaces the localized "Export en cours…" copy.
///  2. The progress percentage is rounded to the nearest integer
///     (matches the spec example "67%" at progress 0.67).
///  3. Progress 0.5 → "50%" (boundary, no rounding ambiguity).
///  4. Regression : `.uploading`, `.publishing`, `.failed` must NOT
///     return the exporting copy — they fall back to `nil` so the view
///     keeps showing the legacy "Moi" caption.
@MainActor
final class StoryTrayView_ExportingPhaseTests: XCTestCase {

    // MARK: - Helpers

    /// Resolves the same localized format string the production helper
    /// uses, then formats it with the given integer percent. Mirrors
    /// the production path (`String(localized:defaultValue:)` →
    /// `String(format:locale:_:)`) so the test isn't coupled to a
    /// specific locale's display copy ; we only assert the percent and
    /// the language-independent presence of the format's prefix below.
    private func expectedLabel(percent: Int) -> String {
        let format = String(
            localized: "story.tray.upload.exporting",
            defaultValue: "Export en cours… %lld%%"
        )
        return String(format: format, locale: .current, percent)
    }

    // MARK: - .exporting

    func test_trayView_exportingPhase_showsExportLabel() {
        let label = storyTrayUploadLabel(phase: .exporting, progress: 0.67)

        XCTAssertNotNil(label, "Exporting phase must surface a tray row label")
        XCTAssertEqual(label, expectedLabel(percent: 67))
    }

    func test_trayView_exportingPhase_showsProgressPercent() {
        let label = storyTrayUploadLabel(phase: .exporting, progress: 0.67)

        // The spec example is "Export en cours… 67%" — assert the
        // integer percent appears in the rendered string (allowing for
        // future locale changes that may reword the prefix but keep the
        // percent placeholder).
        XCTAssertNotNil(label)
        XCTAssertTrue(
            label?.contains("67") == true,
            "Expected label to contain '67' for progress=0.67, got \(label ?? "nil")"
        )
        XCTAssertTrue(
            label?.contains("%") == true,
            "Expected label to contain percent sign, got \(label ?? "nil")"
        )
    }

    func test_trayView_exportingPhase_50percent_shows50() {
        let label = storyTrayUploadLabel(phase: .exporting, progress: 0.5)

        XCTAssertEqual(label, expectedLabel(percent: 50))
        XCTAssertTrue(label?.contains("50") == true)
    }

    func test_trayView_exportingPhase_0percent_shows0() {
        // Boundary : progress 0 must not crash / underflow and must
        // still surface the localized copy with "0%".
        let label = storyTrayUploadLabel(phase: .exporting, progress: 0.0)

        XCTAssertEqual(label, expectedLabel(percent: 0))
        XCTAssertTrue(label?.contains("0") == true)
    }

    func test_trayView_exportingPhase_100percent_clampsAt100() {
        // Boundary : progress 1.0 → 100%. Also covers the upper clamp
        // for any caller that overshoots 1.0 by a hair due to FP error.
        let label = storyTrayUploadLabel(phase: .exporting, progress: 1.0)

        XCTAssertEqual(label, expectedLabel(percent: 100))
    }

    func test_trayView_exportingPhase_clampsNegativeProgress() {
        // Defensive : a caller bug that emits progress < 0 must still
        // surface a valid "0%" label rather than a negative percent.
        let label = storyTrayUploadLabel(phase: .exporting, progress: -0.5)

        XCTAssertEqual(label, expectedLabel(percent: 0))
    }

    func test_trayView_exportingPhase_clampsOverflowProgress() {
        // Defensive : a caller bug that emits progress > 1 must still
        // surface a valid "100%" label rather than e.g. "150%".
        let label = storyTrayUploadLabel(phase: .exporting, progress: 1.5)

        XCTAssertEqual(label, expectedLabel(percent: 100))
    }

    // MARK: - Regression : other phases stay silent

    func test_trayView_exportingPhase_distinguishedFromOtherPhases() {
        // Regression : the row label is dedicated to `.exporting`. The
        // legacy `.uploading` / `.publishing` paths (static slides,
        // post-export TUS upload, server publish) must NOT show the
        // export copy — the view falls back to its existing "Moi"
        // caption for those, driven by the helper returning `nil`.
        XCTAssertNil(
            storyTrayUploadLabel(phase: .uploading, progress: 0.67),
            ".uploading must NOT surface the exporting label"
        )
        XCTAssertNil(
            storyTrayUploadLabel(phase: .publishing, progress: 0.67),
            ".publishing must NOT surface the exporting label"
        )
        XCTAssertNil(
            storyTrayUploadLabel(phase: .failed("network"), progress: 0.0),
            ".failed must NOT surface the exporting label"
        )
    }
}
