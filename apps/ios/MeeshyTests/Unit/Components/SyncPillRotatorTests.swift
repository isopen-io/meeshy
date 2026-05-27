import XCTest
@testable import Meeshy

@MainActor
final class SyncPillRotatorTests: XCTestCase {

    private var now: Date = Date(timeIntervalSince1970: 1_750_000_000)

    func test_setItemCount_resets_currentIndex_on_shrink() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(3)
        r.advance()
        r.advance()
        XCTAssertEqual(r.currentIndex, 2)
        r.setItemCount(1)
        XCTAssertEqual(r.currentIndex, 0)
    }

    func test_advance_wraps_to_zero() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(2)
        r.advance()
        XCTAssertEqual(r.currentIndex, 1)
        r.advance()
        XCTAssertEqual(r.currentIndex, 0)
    }

    func test_advance_single_item_is_noop() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(1)
        r.advance()
        XCTAssertEqual(r.currentIndex, 0)
    }

    func test_advance_pauses_auto_tick_for_5_seconds() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(3)
        r.advance()
        XCTAssertEqual(r.currentIndex, 1)
        now = now.addingTimeInterval(2.7)
        r.simulateTick()
        XCTAssertEqual(r.currentIndex, 1)
        now = now.addingTimeInterval(3.0)
        r.simulateTick()
        XCTAssertEqual(r.currentIndex, 2)
    }

    func test_rewind_decrements_with_wrap() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(3)
        r.rewind()
        XCTAssertEqual(r.currentIndex, 2)
        r.rewind()
        XCTAssertEqual(r.currentIndex, 1)
    }

    func test_setItemCount_zero_cancels_rotation() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(3)
        r.advance()
        r.setItemCount(0)
        XCTAssertEqual(r.currentIndex, 0)
        XCTAssertEqual(r.itemCount, 0)
    }

    // MARK: - 3-cycle auto-hide (spec 2026-05-27)

    /// Three full cycles through every item flips hasCompletedAllCycles.
    /// Each cycle = N advances where N is the item count, with the cycle
    /// counter ticking on wrap-around (N-1 → 0).
    func test_simulateTick_threeCompleteCycles_setsHasCompletedAllCycles() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(2)
        XCTAssertFalse(r.hasCompletedAllCycles)
        // Cycle 1: 0→1→0 (two ticks)
        for _ in 0..<2 {
            now = now.addingTimeInterval(2.8)
            r.simulateTick()
        }
        XCTAssertEqual(r.cycleCount, 1)
        XCTAssertFalse(r.hasCompletedAllCycles)
        // Cycle 2
        for _ in 0..<2 {
            now = now.addingTimeInterval(2.8)
            r.simulateTick()
        }
        XCTAssertEqual(r.cycleCount, 2)
        XCTAssertFalse(r.hasCompletedAllCycles)
        // Cycle 3 — wrap at the end flips the flag
        for _ in 0..<2 {
            now = now.addingTimeInterval(2.8)
            r.simulateTick()
        }
        XCTAssertEqual(r.cycleCount, 3)
        XCTAssertTrue(r.hasCompletedAllCycles)
    }

    /// New item enqueued (count goes from N to N+1) resets the cycle
    /// counter so the user is shown the fresh queue from start.
    func test_setItemCount_change_resetsCycleCount() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(2)
        for _ in 0..<6 {
            now = now.addingTimeInterval(2.8)
            r.simulateTick()
        }
        XCTAssertTrue(r.hasCompletedAllCycles)
        r.setItemCount(3)
        XCTAssertFalse(r.hasCompletedAllCycles)
        XCTAssertEqual(r.cycleCount, 0)
    }

    /// Same itemCount passed twice (no-op refresh) does NOT reset the
    /// cycle counter so the auto-hide eventually fires even on a stable
    /// queue.
    func test_setItemCount_sameValue_preservesCycleCount() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(2)
        for _ in 0..<2 {
            now = now.addingTimeInterval(2.8)
            r.simulateTick()
        }
        XCTAssertEqual(r.cycleCount, 1)
        r.setItemCount(2)
        XCTAssertEqual(r.cycleCount, 1)
        XCTAssertFalse(r.hasCompletedAllCycles)
    }
}
