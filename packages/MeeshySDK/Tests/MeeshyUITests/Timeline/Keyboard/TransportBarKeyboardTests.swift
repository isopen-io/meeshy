import XCTest
import SwiftUI
@testable import MeeshyUI

/// Task 62 — TransportBar keyboard shortcuts.
///
/// B22 — `test_transportBar_body_rendersWithShortcutOverlay` previously read
/// `try XCTSkipIf(true, "... covered by Phase 4 XCUITest suite.")`
/// permanently. That suite never existed (see `HitTargetTests` /
/// `apps/ios/project.yml`'s `MeeshyTests` target comment — no XCUITest
/// target is defined anywhere in this project). Runtime key-event dispatch
/// genuinely does require a live `UIWindow`, so it stays untestable here,
/// but the STRUCTURAL wiring (which is what regresses in practice — a
/// refactor silently dropping the `.keyboardShortcut` modifier) is fully
/// verifiable by reading `TransportBar.swift`'s source, same convention as
/// `HitTargetTests`/`CallManagerTests`.
@MainActor
final class TransportBarKeyboardTests: XCTestCase {

    private static let source: String = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Keyboard/
            .deletingLastPathComponent()   // Timeline/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent("Sources/MeeshyUI/Story/Timeline/Views/Controls/TransportBar.swift")
        return (try? String(contentsOf: url, encoding: .utf8)) ?? ""
    }()

    /// Loud by construction: a missing start OR end marker fails the test via
    /// `XCTFail` (never a silent skip) instead of silently widening the window.
    private func body(from startMarker: String, to endMarker: String, file: StaticString = #filePath, line: UInt = #line) -> String? {
        guard !Self.source.isEmpty else {
            XCTFail("Could not read TransportBar.swift", file: file, line: line)
            return nil
        }
        guard let start = Self.source.range(of: startMarker) else {
            XCTFail("Start marker not found — file structure changed: \"\(startMarker)\"", file: file, line: line)
            return nil
        }
        guard let end = Self.source.range(of: endMarker, range: start.upperBound..<Self.source.endIndex) else {
            XCTFail("End marker not found — file structure changed: \"\(endMarker)\"", file: file, line: line)
            return nil
        }
        return String(Self.source[start.lowerBound..<end.lowerBound])
    }

    // MARK: - Structural contract

    func test_transportBar_hasKeyboardShortcuts_isTrue() {
        XCTAssertTrue(TransportBar.hasKeyboardShortcuts,
                      "TransportBar must declare keyboard shortcut support")
    }

    func test_transportBar_playToggle_invokedOnAction() {
        var toggled = false
        let bar = TransportBar(
            isPlaying: false, currentTime: 0, duration: 10,
            zoomScale: 1.0, isMuted: false,
            onPlayToggle: { toggled = true },
            onMuteToggle: {},
            onZoomIn: {}, onZoomOut: {}, onZoomReset: {}
        )
        _ = bar.body  // Body renders without crash
        bar.onPlayToggle()
        XCTAssertTrue(toggled, "onPlayToggle closure must fire when invoked")
    }

    func test_transportBar_body_rendersWithShortcutOverlay() {
        // Runtime key dispatch needs a live UIWindow (untestable here) — verify
        // the two structural wiring points instead: the Space shortcut on the
        // bar's own body, AND the always-present hidden overlay Button that
        // makes it reliably reachable even when the row itself isn't focused.
        guard let mainBody = body(from: "public var body: some View {", to: "private func trailingCluster") else { return }
        XCTAssertTrue(
            mainBody.contains(".keyboardShortcut(\" \", modifiers: [])"),
            "TransportBar's body must wire the Space bar to play/pause."
        )
        guard let overlay = body(
            from: "private var keyboardShortcutOverlay: some View {",
            to: "public static let hasKeyboardShortcuts"
        ) else { return }
        XCTAssertTrue(
            overlay.contains("Button(action: onPlayToggle)") && overlay.contains(".keyboardShortcut(.space, modifiers: [])"),
            "keyboardShortcutOverlay must attach the Space shortcut to a hidden, always-present " +
            "Button wired to onPlayToggle — the row-level shortcut alone can be swallowed by focus state."
        )
    }

    // MARK: - Zoom controls wired

    func test_transportBar_zoomClosures_areDistinct() {
        var zoomInCalled = false
        var zoomOutCalled = false
        var resetCalled = false

        let bar = TransportBar(
            isPlaying: false, currentTime: 0, duration: 10,
            zoomScale: 1.0, isMuted: false,
            onPlayToggle: {},
            onMuteToggle: {},
            onZoomIn: { zoomInCalled = true },
            onZoomOut: { zoomOutCalled = true },
            onZoomReset: { resetCalled = true }
        )
        bar.onZoomIn()
        bar.onZoomOut()
        bar.onZoomReset()

        XCTAssertTrue(zoomInCalled)
        XCTAssertTrue(zoomOutCalled)
        XCTAssertTrue(resetCalled)
    }
}
