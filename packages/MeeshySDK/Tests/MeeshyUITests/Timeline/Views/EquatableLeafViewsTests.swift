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

    func test_videoClipBar_equal_whenPropsIdentical() {
        let geo = makeGeometry()
        let noop: () -> Void = {}
        let noopc: (CGFloat) -> Void = { _ in }
        let a = VideoClipBar(
            clipId: "v1", title: "Clip 1", startTime: 0, duration: 4,
            fadeIn: 0, fadeOut: 0, isSelected: false, isLocked: false,
            isDark: false, geometry: geo, laneHeight: 44, frames: [],
            onTap: noop, onDoubleTap: noop, onLongPress: noop,
            onTrimStartDelta: noopc, onTrimEndDelta: noopc, onMoveDelta: noopc
        )
        let b = VideoClipBar(
            clipId: "v1", title: "Clip 1", startTime: 0, duration: 4,
            fadeIn: 0, fadeOut: 0, isSelected: false, isLocked: false,
            isDark: false, geometry: geo, laneHeight: 44, frames: [],
            onTap: noop, onDoubleTap: noop, onLongPress: noop,
            onTrimStartDelta: noopc, onTrimEndDelta: noopc, onMoveDelta: noopc
        )
        XCTAssertEqual(a, b, "VideoClipBar must be Equatable and bit-equal when props match")
    }

    func test_videoClipBar_notEqual_whenSelectionChanges() {
        let geo = makeGeometry()
        let noop: () -> Void = {}
        let noopc: (CGFloat) -> Void = { _ in }
        let a = VideoClipBar(
            clipId: "v1", title: "Clip 1", startTime: 0, duration: 4,
            fadeIn: 0, fadeOut: 0, isSelected: false, isLocked: false,
            isDark: false, geometry: geo, laneHeight: 44, frames: [],
            onTap: noop, onDoubleTap: noop, onLongPress: noop,
            onTrimStartDelta: noopc, onTrimEndDelta: noopc, onMoveDelta: noopc
        )
        let b = VideoClipBar(
            clipId: "v1", title: "Clip 1", startTime: 0, duration: 4,
            fadeIn: 0, fadeOut: 0, isSelected: true, isLocked: false,
            isDark: false, geometry: geo, laneHeight: 44, frames: [],
            onTap: noop, onDoubleTap: noop, onLongPress: noop,
            onTrimStartDelta: noopc, onTrimEndDelta: noopc, onMoveDelta: noopc
        )
        XCTAssertNotEqual(a, b, "Selection change must invalidate equality")
    }

    // MARK: - AudioClipBar

    func test_audioClipBar_equal_whenPropsIdentical() {
        let geo = makeGeometry()
        let noop: () -> Void = {}
        let noopc: (CGFloat) -> Void = { _ in }
        let a = AudioClipBar(
            clipId: "a1", title: "Audio 1", startTime: 0, duration: 8,
            volume: 1.0, isMuted: false, isSelected: false, isLocked: false,
            isDark: false, geometry: geo, laneHeight: 36, waveformSamples: [0.1, 0.5, 0.9],
            onTap: noop, onDoubleTap: noop, onLongPress: noop, onMoveDelta: noopc
        )
        let b = AudioClipBar(
            clipId: "a1", title: "Audio 1", startTime: 0, duration: 8,
            volume: 1.0, isMuted: false, isSelected: false, isLocked: false,
            isDark: false, geometry: geo, laneHeight: 36, waveformSamples: [0.1, 0.5, 0.9],
            onTap: noop, onDoubleTap: noop, onLongPress: noop, onMoveDelta: noopc
        )
        XCTAssertEqual(a, b)
    }

    func test_audioClipBar_notEqual_whenMutedChanges() {
        let geo = makeGeometry()
        let noop: () -> Void = {}
        let noopc: (CGFloat) -> Void = { _ in }
        let a = AudioClipBar(
            clipId: "a1", title: "Audio 1", startTime: 0, duration: 8,
            volume: 1.0, isMuted: false, isSelected: false, isLocked: false,
            isDark: false, geometry: geo, laneHeight: 36, waveformSamples: [],
            onTap: noop, onDoubleTap: noop, onLongPress: noop, onMoveDelta: noopc
        )
        let b = AudioClipBar(
            clipId: "a1", title: "Audio 1", startTime: 0, duration: 8,
            volume: 1.0, isMuted: true, isSelected: false, isLocked: false,
            isDark: false, geometry: geo, laneHeight: 36, waveformSamples: [],
            onTap: noop, onDoubleTap: noop, onLongPress: noop, onMoveDelta: noopc
        )
        XCTAssertNotEqual(a, b, "Mute change must invalidate equality")
    }

    // MARK: - TextClipBar

    func test_textClipBar_equal_whenPropsIdentical() {
        let geo = makeGeometry()
        let noop: () -> Void = {}
        let noopc: (CGFloat) -> Void = { _ in }
        let a = TextClipBar(
            clipId: "t1", content: "Hello", startTime: 0, duration: 3,
            isSelected: false, isLocked: false, isDark: false, geometry: geo, laneHeight: 28,
            onTap: noop, onDoubleTap: noop, onLongPress: noop, onMoveDelta: noopc
        )
        let b = TextClipBar(
            clipId: "t1", content: "Hello", startTime: 0, duration: 3,
            isSelected: false, isLocked: false, isDark: false, geometry: geo, laneHeight: 28,
            onTap: noop, onDoubleTap: noop, onLongPress: noop, onMoveDelta: noopc
        )
        XCTAssertEqual(a, b)
    }

    // MARK: - TransitionBadge

    func test_transitionBadge_equal_whenPropsIdentical() {
        let noop: () -> Void = {}
        let noopc: (CGFloat) -> Void = { _ in }
        let a = TransitionBadge(
            id: "tr1", kind: .crossfade, duration: 0.5,
            isSelected: false, isDark: false, anchorX: 60, laneHeight: 44,
            onTap: noop, onLongPress: noop, onDurationDelta: noopc
        )
        let b = TransitionBadge(
            id: "tr1", kind: .crossfade, duration: 0.5,
            isSelected: false, isDark: false, anchorX: 60, laneHeight: 44,
            onTap: noop, onLongPress: noop, onDurationDelta: noopc
        )
        XCTAssertEqual(a, b)
    }

    func test_transitionBadge_notEqual_whenKindChanges() {
        let noop: () -> Void = {}
        let noopc: (CGFloat) -> Void = { _ in }
        let a = TransitionBadge(
            id: "tr1", kind: .crossfade, duration: 0.5,
            isSelected: false, isDark: false, anchorX: 60, laneHeight: 44,
            onTap: noop, onLongPress: noop, onDurationDelta: noopc
        )
        let b = TransitionBadge(
            id: "tr1", kind: .dissolve, duration: 0.5,
            isSelected: false, isDark: false, anchorX: 60, laneHeight: 44,
            onTap: noop, onLongPress: noop, onDurationDelta: noopc
        )
        XCTAssertNotEqual(a, b, "Kind change must invalidate equality")
    }

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

    func test_playheadView_equal_whenTimeIdentical() {
        let geo = makeGeometry()
        let a = PlayheadView(currentTime: 3.25, totalDuration: 60, geometry: geo,
                             laneHeight: 80, isDark: false, onScrub: { _ in })
        let b = PlayheadView(currentTime: 3.25, totalDuration: 60, geometry: geo,
                             laneHeight: 80, isDark: false, onScrub: { _ in })
        XCTAssertEqual(a, b)
    }

    func test_playheadView_notEqual_whenTimeChanges() {
        let geo = makeGeometry()
        let a = PlayheadView(currentTime: 3.25, totalDuration: 60, geometry: geo,
                             laneHeight: 80, isDark: false, onScrub: { _ in })
        let b = PlayheadView(currentTime: 3.26, totalDuration: 60, geometry: geo,
                             laneHeight: 80, isDark: false, onScrub: { _ in })
        XCTAssertNotEqual(a, b, "Sub-frame time change must invalidate equality")
    }

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
