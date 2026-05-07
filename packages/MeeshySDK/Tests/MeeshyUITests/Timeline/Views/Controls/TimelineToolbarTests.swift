import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class TimelineToolbarTests: XCTestCase {

    private func makeSUT(
        canUndo: Bool = true,
        canRedo: Bool = false,
        isSnapEnabled: Bool = true,
        rulerResolutionSeconds: Float = 0.5
    ) -> TimelineToolbar {
        TimelineToolbar(
            canUndo: canUndo,
            canRedo: canRedo,
            isSnapEnabled: isSnapEnabled,
            rulerResolutionSeconds: rulerResolutionSeconds,
            onUndo: {},
            onRedo: {},
            onSnapToggle: {}
        )
    }

    func test_init_doesNotCrash() {
        _ = makeSUT().body
    }

    func test_rulerResolutionLabel_belowOneSecond_usesMs() {
        XCTAssertEqual(TimelineToolbar.formatRulerResolution(seconds: 0.5), "RULER:500ms")
        XCTAssertEqual(TimelineToolbar.formatRulerResolution(seconds: 0.1), "RULER:100ms")
    }

    func test_rulerResolutionLabel_oneOrMoreSeconds_usesSeconds() {
        XCTAssertEqual(TimelineToolbar.formatRulerResolution(seconds: 1.0), "RULER:1s")
        XCTAssertEqual(TimelineToolbar.formatRulerResolution(seconds: 5.0), "RULER:5s")
    }

    func test_snapAccessibility_reflectsState() {
        XCTAssertEqual(TimelineToolbar.snapAccessibilityKey(isOn: true), "story.timeline.a11y.snap.on")
        XCTAssertEqual(TimelineToolbar.snapAccessibilityKey(isOn: false), "story.timeline.a11y.snap.off")
    }
}
