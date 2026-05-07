import XCTest
import SwiftUI
@testable import MeeshyUI

/// Task 63 — TimelineToolbar keyboard shortcuts (⌘Z, ⇧⌘Z, ⌘B, ⌘D, Delete).
/// Runtime key dispatch requires UIWindow — we verify structural contracts here.
@MainActor
final class TimelineToolbarKeyboardTests: XCTestCase {

    // MARK: - Structural contract

    func test_timelineToolbar_hasKeyboardShortcuts_isTrue() {
        XCTAssertTrue(TimelineToolbar.hasKeyboardShortcuts,
                      "TimelineToolbar must declare keyboard shortcut support")
    }

    func test_timelineToolbar_undoClosure_isInvoked() {
        var undoCalled = false
        let toolbar = TimelineToolbar(
            canUndo: true, canRedo: false, isSnapEnabled: true,
            rulerResolutionSeconds: 0.5,
            onUndo: { undoCalled = true },
            onRedo: {},
            onSnapToggle: {}
        )
        _ = toolbar.body  // Renders without crash
        toolbar.onUndo()
        XCTAssertTrue(undoCalled, "onUndo closure must fire when invoked")
    }

    func test_timelineToolbar_redoClosure_isInvoked() {
        var redoCalled = false
        let toolbar = TimelineToolbar(
            canUndo: false, canRedo: true, isSnapEnabled: true,
            rulerResolutionSeconds: 0.5,
            onUndo: {},
            onRedo: { redoCalled = true },
            onSnapToggle: {}
        )
        toolbar.onRedo()
        XCTAssertTrue(redoCalled, "onRedo closure must fire when invoked")
    }

    func test_timelineToolbar_snapToggleClosure_isInvoked() {
        var snapToggled = false
        let toolbar = TimelineToolbar(
            canUndo: false, canRedo: false, isSnapEnabled: true,
            rulerResolutionSeconds: 0.5,
            onUndo: {},
            onRedo: {},
            onSnapToggle: { snapToggled = true }
        )
        toolbar.onSnapToggle()
        XCTAssertTrue(snapToggled, "onSnapToggle closure must fire when invoked")
    }

    func test_timelineToolbar_keyboardDispatch_requiresUIWindow() throws {
        try XCTSkipIf(true,
            "Runtime ⌘Z / ⇧⌘Z key dispatch requires UIWindow — covered by Phase 4 XCUITest suite.")
    }
}
