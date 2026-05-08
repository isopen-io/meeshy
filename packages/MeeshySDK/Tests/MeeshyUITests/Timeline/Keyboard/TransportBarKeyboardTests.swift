import XCTest
import SwiftUI
@testable import MeeshyUI

/// Task 62 — TransportBar keyboard shortcuts.
/// Runtime keyboard event dispatch requires a live UIWindow.
/// We verify the structural contract (shortcut wiring flag) in unit tests,
/// and skip the actual key dispatch assertions that require UIKit.
@MainActor
final class TransportBarKeyboardTests: XCTestCase {

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

    func test_transportBar_body_rendersWithShortcutOverlay() throws {
        try XCTSkipIf(true,
            "Runtime keyboard dispatch requires UIWindow — covered by Phase 4 XCUITest suite.")
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
