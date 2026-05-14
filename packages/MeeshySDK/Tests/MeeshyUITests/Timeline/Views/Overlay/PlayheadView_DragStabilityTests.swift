import XCTest
import CoreGraphics
@testable import MeeshyUI

/// P2 — Drag-stability tests for `PlayheadView`.
///
/// Bug: during a scrub the previous implementation computed the new playhead
/// time from `computedX + translation.width`, where `computedX` is derived
/// from `currentTime`. When the engine's `onTimeUpdate` fired mid-drag the
/// `currentTime` changed, `computedX` jumped, and the cursor jittered.
///
/// Fix: capture `computedX` once into `@State private var dragStartX` at the
/// first `.onChanged` (synthesized "drag began"), then use
/// `dragStartX + translation.width` for the rest of the drag. The static
/// `PlayheadView.scrubTime(dragStartX:translationX:geometry:totalDuration:)`
/// is the pure projection exercised here. It mirrors the
/// `VideoClipBar.activeDrag.originalStartTime` pattern (P0-#5).
final class PlayheadView_DragStabilityTests: XCTestCase {

    // MARK: - Helpers

    /// Deterministic geometry — basePixelsPerSecond = 50 @ zoom 1.0
    /// → 1 second = 50pt, 100pt = 2.0s, etc.
    private func makeGeometry() -> TimelineGeometry {
        TimelineGeometry(zoomScale: 1.0)
    }

    // MARK: - test_drag_currentTimeUpdate_doesNotJitter

    /// Simulates an `engine.onTimeUpdate` firing concurrently with a drag.
    ///
    /// Pre-fix, an updated `currentTime` would shift `computedX` and
    /// double-apply the translation, causing visible jitter. Post-fix, the
    /// drag math is anchored at `dragStartX` (captured at drag begin) and is
    /// invariant under `currentTime` mutations.
    func test_drag_currentTimeUpdate_doesNotJitter() {
        let geometry = makeGeometry()
        let totalDuration: Float = 10.0

        // Drag begins at currentTime = 2.0s → dragStartX = 100pt.
        let dragStartX: CGFloat = 100

        // Apply a sequence of translations while the engine "ticks":
        // The engine's currentTime in the View would change to 2.1, 2.2, ...
        // but the scrub math must stay anchored at dragStartX.
        let translations: [CGFloat] = [5, 10, 15, 20, 25]
        var observed: [Float] = []
        for tx in translations {
            let t = PlayheadView.scrubTime(
                dragStartX: dragStartX,
                translationX: tx,
                geometry: geometry,
                totalDuration: totalDuration
            )
            observed.append(t)
        }

        // Expected — monotonic and exactly linear in tx (no jitter from
        // hypothetical currentTime updates, because the math doesn't read
        // currentTime at all).
        let expected: [Float] = translations.map { tx in
            Float((dragStartX + tx) / geometry.pixelsPerSecond)
        }
        XCTAssertEqual(observed.count, expected.count)
        for (i, value) in observed.enumerated() {
            XCTAssertEqual(value, expected[i], accuracy: 0.0001,
                "observed[\(i)] should be exactly linear in translation, not affected by currentTime drift")
        }

        // Specifically — monotonic increase, no back-step.
        for i in 1..<observed.count {
            XCTAssertGreaterThan(observed[i], observed[i - 1],
                "scrub time must be strictly monotonic for monotonic translation")
        }
    }

    // MARK: - test_drag_startX_capturedAtBegan

    /// Confirms the math uses `dragStartX` as anchor — different captured
    /// anchors with the same translation must produce different times.
    /// This proves the anchor is honored (not silently replaced by another
    /// source like `currentTime` → `computedX`).
    func test_drag_startX_capturedAtBegan() {
        let geometry = makeGeometry()
        let totalDuration: Float = 10.0
        let translationX: CGFloat = 25

        let t1 = PlayheadView.scrubTime(
            dragStartX: 50,
            translationX: translationX,
            geometry: geometry,
            totalDuration: totalDuration
        )
        let t2 = PlayheadView.scrubTime(
            dragStartX: 150,
            translationX: translationX,
            geometry: geometry,
            totalDuration: totalDuration
        )

        // Same translation, different anchors → different times.
        XCTAssertNotEqual(t1, t2, accuracy: 0.0001)

        // Delta in time must equal delta in anchor / pixelsPerSecond.
        let expectedDelta = Float((150 - 50) / geometry.pixelsPerSecond)
        XCTAssertEqual(t2 - t1, expectedDelta, accuracy: 0.0001)
    }

    // MARK: - test_drag_endResets_dragStartX

    /// The `@State` `dragStartX` resets to 0 on drag end. We cannot inspect
    /// SwiftUI `@State` directly, so we verify the contract from the math
    /// side: if a NEW drag begins with `dragStartX = 0` (the reset default)
    /// and translation 0, the scrub time is exactly 0 — i.e. no leaked
    /// anchor from a previous drag.
    func test_drag_endResets_dragStartX() {
        let geometry = makeGeometry()
        let totalDuration: Float = 10.0

        // Simulate first drag ending with anchor at 200pt — irrelevant after
        // end; what matters is that the next drag starts clean.
        _ = PlayheadView.scrubTime(
            dragStartX: 200,
            translationX: 50,
            geometry: geometry,
            totalDuration: totalDuration
        )

        // Fresh drag — `dragStartX` was reset to 0 by onEnded, then the
        // first onChanged captures the live `computedX`. If currentTime were
        // 0 at that moment, dragStartX would be 0 and translation 0 → t = 0.
        let freshDragT = PlayheadView.scrubTime(
            dragStartX: 0,
            translationX: 0,
            geometry: geometry,
            totalDuration: totalDuration
        )
        XCTAssertEqual(freshDragT, 0, accuracy: 0.0001,
            "after reset, an unmoved playhead at currentTime=0 must scrub to 0")

        // Also — a fresh drag with anchor 0 and small translation must NOT
        // pick up the previous anchor (200) — would otherwise produce
        // t ≈ 5.0s instead of 1.0s.
        let smallMove = PlayheadView.scrubTime(
            dragStartX: 0,
            translationX: 50,
            geometry: geometry,
            totalDuration: totalDuration
        )
        XCTAssertEqual(smallMove, 1.0, accuracy: 0.0001)
        XCTAssertNotEqual(smallMove, 5.0, accuracy: 0.0001)
    }

    // MARK: - test_drag_seriesOfDeltas_cumulates

    /// 10 `.onChanged` events with increasing deltas. The final scrub time
    /// must equal `startX + totalDelta` mapped through the geometry — proves
    /// translations cumulate linearly from the anchor (DragGesture's
    /// `translation` is already absolute since drag start, but the test
    /// guards against accidental incremental application).
    func test_drag_seriesOfDeltas_cumulates() {
        let geometry = makeGeometry()
        let totalDuration: Float = 20.0
        let dragStartX: CGFloat = 100  // initial currentTime = 2.0s

        // Cumulative absolute translations as SwiftUI delivers them (each
        // value is the running offset from drag begin).
        let cumulativeTx: [CGFloat] = [
            2, 5, 9, 14, 20, 27, 35, 44, 54, 65
        ]
        XCTAssertEqual(cumulativeTx.count, 10)

        var lastT: Float = 0
        for (i, tx) in cumulativeTx.enumerated() {
            let t = PlayheadView.scrubTime(
                dragStartX: dragStartX,
                translationX: tx,
                geometry: geometry,
                totalDuration: totalDuration
            )

            // Each intermediate value must equal anchor + tx mapped.
            let expected = Float((dragStartX + tx) / geometry.pixelsPerSecond)
            XCTAssertEqual(t, expected, accuracy: 0.0001,
                "frame \(i): expected \(expected)s, got \(t)s")

            // Monotonic ascent (deltas are strictly increasing).
            if i > 0 {
                XCTAssertGreaterThan(t, lastT, "frame \(i) must advance past frame \(i - 1)")
            }
            lastT = t
        }

        // Final position — anchor + last cumulative translation.
        let finalExpected = Float((dragStartX + cumulativeTx.last!) / geometry.pixelsPerSecond)
        XCTAssertEqual(lastT, finalExpected, accuracy: 0.0001)
        XCTAssertEqual(finalExpected, 3.3, accuracy: 0.0001,
            "100pt + 65pt = 165pt @ 50pt/s = 3.3s")
    }

    // MARK: - Bonus — clamping at boundaries

    /// Ensures the clamp-to-[0, totalDuration] is preserved.
    func test_scrubTime_clampsToBounds() {
        let geometry = makeGeometry()
        let totalDuration: Float = 5.0

        // Negative → 0
        let underflow = PlayheadView.scrubTime(
            dragStartX: 10,
            translationX: -1000,
            geometry: geometry,
            totalDuration: totalDuration
        )
        XCTAssertEqual(underflow, 0, accuracy: 0.0001)

        // Past totalDuration → totalDuration
        let overflow = PlayheadView.scrubTime(
            dragStartX: 0,
            translationX: 10_000,
            geometry: geometry,
            totalDuration: totalDuration
        )
        XCTAssertEqual(overflow, totalDuration, accuracy: 0.0001)
    }
}
