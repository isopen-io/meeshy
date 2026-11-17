import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Tests for SOTA P7 — Equatable conformance on 7 leaf views.
/// Equatable conformance lets SwiftUI short-circuit body re-evaluation when
/// props are bit-equal, critical for sustained 60 FPS during playhead scrubbing.
@MainActor
final class EquatableLeafViewsTests: XCTestCase {

    // MARK: - Helpers

    private func makeGeometry(zoom: CGFloat = 1.0) -> TimelineGeometry {
        TimelineGeometry(zoomScale: zoom)
    }

    // MARK: - VideoClipBar

    // MARK: - AudioClipBar

    // MARK: - TextClipBar

    // MARK: - TransitionBadge

    // MARK: - RulerView

    func test_rulerView_equal_whenPropsIdentical() {
        let geo = makeGeometry()
        let a = RulerView(totalDuration: 60, geometry: geo, isDark: false, height: 24, onTapTime: { _ in })
        let b = RulerView(totalDuration: 60, geometry: geo, isDark: false, height: 24, onTapTime: { _ in })
        XCTAssertEqual(a, b)
    }

    func test_rulerView_notEqual_whenDurationChanges() {
        let geo = makeGeometry()
        let a = RulerView(totalDuration: 60, geometry: geo, isDark: false, height: 24, onTapTime: { _ in })
        let b = RulerView(totalDuration: 61, geometry: geo, isDark: false, height: 24, onTapTime: { _ in })
        XCTAssertNotEqual(a, b, "Duration change must invalidate equality")
    }

    // MARK: - PlayheadView

    // MARK: - KeyframeMarkerView

    func test_keyframeMarkerView_equal_whenPropsIdentical() {
        let geo = makeGeometry()
        let a = KeyframeMarkerView(keyframeId: "k1", absoluteTime: 2.0, geometry: geo,
                                   laneHeight: 44, isSelected: false,
                                   onTap: {}, onLongPress: {}, onDragDelta: { _ in })
        let b = KeyframeMarkerView(keyframeId: "k1", absoluteTime: 2.0, geometry: geo,
                                   laneHeight: 44, isSelected: false,
                                   onTap: {}, onLongPress: {}, onDragDelta: { _ in })
        XCTAssertEqual(a, b)
    }

    func test_keyframeMarkerView_notEqual_whenSelectionChanges() {
        let geo = makeGeometry()
        let a = KeyframeMarkerView(keyframeId: "k1", absoluteTime: 2.0, geometry: geo,
                                   laneHeight: 44, isSelected: false,
                                   onTap: {}, onLongPress: {}, onDragDelta: { _ in })
        let b = KeyframeMarkerView(keyframeId: "k1", absoluteTime: 2.0, geometry: geo,
                                   laneHeight: 44, isSelected: true,
                                   onTap: {}, onLongPress: {}, onDragDelta: { _ in })
        XCTAssertNotEqual(a, b, "Selection change must invalidate equality")
    }
}
