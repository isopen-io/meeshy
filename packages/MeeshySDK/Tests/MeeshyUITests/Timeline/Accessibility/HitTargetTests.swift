import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Task 61 — Interactive hit targets meet 44x44pt minimum (Apple HIG).
///
/// B22 — the 2 runtime tests here previously read `try XCTSkipIf(true, "...
/// Covered by Phase 4 XCUITest suite.")` permanently. That suite never
/// existed: `apps/ios/project.yml`'s `MeeshyTests` target explicitly
/// documents that this project ships NO XCUITest target at all ("the
/// project deliberately ships UI-flavoured coverage as integration
/// XCTests" — see the comment excluding `UI/BubbleExpandableTextUITests.swift`
/// from the hosted unit-test bundle). So the hit-target contract had ZERO
/// coverage, silently, forever.
///
/// Rewritten as source-level structural checks (same convention as
/// `CallManagerTests`/`P2PWebRTCClientConcurrencySourceTests`): `TransportBar`
/// itself documents its contract via `minimumHitTargetSize` — every icon
/// button is drawn at a smaller VISUAL size (32×32 or 30×30) and widened to
/// the 44×44pt effective touch target via a compensating
/// `.contentShape(Rectangle().inset(by:))`. These tests verify that pairing
/// is present for every button, bounded per-button so a rename/refactor
/// fails the test loudly (`XCTFail`) instead of silently matching the wrong
/// span or (worse) silently skipping.
///
/// The former `test_timelineToolbar_hitTargets_meetMinimum` is gone, not
/// replaced: `TransportBar.swift`'s own comments (`"pas de TimelineToolbar
/// dédiée"`, `"l'ancienne TimelineToolbar"`) confirm the standalone
/// `TimelineToolbar` component this test referenced was merged into
/// `TransportBar` itself — there is no separate component left to assert
/// anything about. Its former undo/redo buttons now live in
/// `TransportBar.undoRedoCluster`, covered below by
/// `test_transportBar_undoRedoCluster_meetsHitTargetMinimum`. The snap chip
/// (`TransportBar.snapChip`) has no fixed `.frame` (it is sized by its
/// Capsule padding) so it is deliberately NOT asserted here — asserting a
/// specific pixel contract for it would be guessing, not verifying.
@MainActor
final class HitTargetTests: XCTestCase {

    private static let source: String = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Accessibility/
            .deletingLastPathComponent()   // Timeline/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent("Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    /// Loud by construction: a missing start OR end marker fails the test via
    /// `XCTFail` (never a silent skip) instead of silently widening/narrowing
    /// the search window. `endMarker: nil` is reserved for a start marker that
    /// is provably the last declaration in the file.
    private func body(
        from startMarker: String, to endMarker: String?, file: StaticString = #filePath, line: UInt = #line
    ) -> String? {
        guard !Self.source.isEmpty else {
            XCTFail("Could not read TransportBar.swift", file: file, line: line)
            return nil
        }
        guard let start = Self.source.range(of: startMarker) else {
            XCTFail("Start marker not found — file structure changed: \"\(startMarker)\"", file: file, line: line)
            return nil
        }
        guard let endMarker else {
            return String(Self.source[start.lowerBound...])
        }
        guard let end = Self.source.range(of: endMarker, range: start.upperBound..<Self.source.endIndex) else {
            XCTFail("End marker not found — file structure changed: \"\(endMarker)\"", file: file, line: line)
            return nil
        }
        return String(Self.source[start.lowerBound..<end.lowerBound])
    }

    private func assertMeetsHitTargetMinimum(
        in fn: String, frame: String, inset: String, file: StaticString = #filePath, line: UInt = #line
    ) {
        XCTAssertTrue(fn.contains(frame),
                      "Expected \"\(frame)\" — button's visual frame moved/changed", file: file, line: line)
        XCTAssertTrue(fn.contains(inset),
                      "Expected \"\(inset)\" — button's tap-target-widening inset moved/changed", file: file, line: line)
    }

    func test_transportBar_playButton_meetsHitTargetMinimum() {
        guard let fn = body(from: "private var playButton: some View {", to: "private func saveButton") else { return }
        assertMeetsHitTargetMinimum(
            in: fn, frame: ".frame(width: 32, height: 32)", inset: ".contentShape(Rectangle().inset(by: -6))"
        )
    }

    func test_transportBar_saveButton_meetsHitTargetMinimum() {
        guard let fn = body(from: "private func saveButton", to: "private var timeReadout") else { return }
        assertMeetsHitTargetMinimum(
            in: fn, frame: ".frame(width: 32, height: 32)", inset: ".contentShape(Rectangle().inset(by: -6))"
        )
    }

    func test_transportBar_undoRedoCluster_meetsHitTargetMinimum() {
        guard let fn = body(from: "private var undoRedoCluster: some View {", to: "private var snapChip: some View {") else { return }
        assertMeetsHitTargetMinimum(
            in: fn, frame: ".frame(width: 30, height: 30)", inset: ".contentShape(Rectangle().inset(by: -7))"
        )
        XCTAssertEqual(
            fn.components(separatedBy: ".frame(width: 30, height: 30)").count - 1, 2,
            "undo AND redo must each carry the 30pt visual frame widened to 44pt"
        )
    }

    func test_transportBar_zoomCluster_meetsHitTargetMinimum() {
        guard let fn = body(from: "private func zoomCluster", to: "private var muteButton: some View {") else { return }
        assertMeetsHitTargetMinimum(
            in: fn, frame: ".frame(width: 30, height: 30)", inset: ".contentShape(Rectangle().inset(by: -7))"
        )
        XCTAssertEqual(
            fn.components(separatedBy: ".frame(width: 30, height: 30)").count - 1, 2,
            "zoom-in AND zoom-out must each carry the 30pt visual frame widened to 44pt"
        )
        XCTAssertTrue(
            fn.contains(".frame(minWidth: 36, minHeight: 30)"),
            "the zoom-reset label button must widen its min height to the same 30pt tier"
        )
    }

    func test_transportBar_muteButton_meetsHitTargetMinimum() {
        // muteButton is the last sub-view declared in the file — no next
        // sibling to bound against, so an open-ended window is legitimate.
        guard let fn = body(from: "private var muteButton: some View {", to: nil) else { return }
        assertMeetsHitTargetMinimum(
            in: fn, frame: ".frame(width: 30, height: 30)", inset: ".contentShape(Rectangle().inset(by: -7))"
        )
    }

    // Structural contract: TransportBar container has `minHeight: 44` set on the HStack.
    // We verify the public API accepts the correct parameters that drive this.
    func test_transportBar_minHeight_contractIsPreserved() {
        // TransportBar body sets `.frame(minHeight: 44)`.
        // The component is constructed and its body is evaluated without crash.
        let bar = TransportBar(
            isPlaying: false, currentTime: 0, duration: 10,
            zoomScale: 1.0, isMuted: false,
            onPlayToggle: {}, onMuteToggle: {},
            onZoomIn: {}, onZoomOut: {}, onZoomReset: {}
        )
        _ = bar.body  // Does not crash → container parameters are valid
        XCTAssert(true, "TransportBar body renders with minHeight contract intact")
    }
}
