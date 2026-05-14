import XCTest
@testable import MeeshyUI

/// Regression suite for the Backlog #3 fix that switched
/// `ClipInspector.accessibilityLabel` from a single hardcoded
/// `story.timeline.a11y.clip.video` key (announced every clip as a
/// "video clip" to VoiceOver) to a `clip.kind`-aware switch with one
/// localized key per kind.
///
/// The tests target the pure static helper
/// `ClipInspector.accessibilityLabel(for:)` rather than driving the
/// SwiftUI view body — see the helper's doc-comment, which
/// references this file by name.
@MainActor
final class ClipInspector_AccessibilityKindTests: XCTestCase {

    // MARK: - Per-kind resolution

    func test_a11yLabel_videoKind_resolvesViaBundle() {
        let label = ClipInspector.accessibilityLabel(for: .video)
        XCTAssertNotEqual(
            label,
            "story.timeline.a11y.clip.video",
            "Bundle.module must resolve the .video key — got the raw key back, the .strings entry is missing or the bundle is misconfigured."
        )
        XCTAssertFalse(label.isEmpty, "Resolved label must not be empty.")
    }

    func test_a11yLabel_audioKind_resolvesViaBundle() {
        let label = ClipInspector.accessibilityLabel(for: .audio)
        XCTAssertNotEqual(
            label,
            "story.timeline.a11y.clip.audio",
            "Bundle.module must resolve the .audio key — Backlog #3 added this entry to Localizable.xcstrings, regression if missing."
        )
        XCTAssertFalse(label.isEmpty)
    }

    func test_a11yLabel_imageKind_resolvesViaBundle() {
        let label = ClipInspector.accessibilityLabel(for: .image)
        XCTAssertNotEqual(
            label,
            "story.timeline.a11y.clip.image",
            "Bundle.module must resolve the .image key — Backlog #3 added this entry to Localizable.xcstrings, regression if missing."
        )
        XCTAssertFalse(label.isEmpty)
    }

    func test_a11yLabel_textKind_resolvesViaBundle() {
        let label = ClipInspector.accessibilityLabel(for: .text)
        XCTAssertNotEqual(
            label,
            "story.timeline.a11y.clip.text",
            "Bundle.module must resolve the .text key — Backlog #3 added this entry to Localizable.xcstrings, regression if missing."
        )
        XCTAssertFalse(label.isEmpty)
    }

    // MARK: - Distinctness across kinds

    /// Catches a regression where someone reverts the switch to a single
    /// hardcoded key and ships all four kinds with the same label.
    func test_a11yLabel_eachKindReturnsDistinctLabel() {
        let video = ClipInspector.accessibilityLabel(for: .video)
        let audio = ClipInspector.accessibilityLabel(for: .audio)
        let image = ClipInspector.accessibilityLabel(for: .image)
        let text  = ClipInspector.accessibilityLabel(for: .text)

        let labels = [video, audio, image, text]
        let unique = Set(labels)
        XCTAssertEqual(
            unique.count,
            4,
            "Each clip kind must map to a distinct VoiceOver label — got \(labels) (\(unique.count) unique). The pre-Backlog#3 bug was that all four returned the .video string."
        )
    }
}
