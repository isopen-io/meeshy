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

    /// Rotator keeps cycling indefinitely as long as the host supplies
    /// items — the 3-cycle auto-hide was retired 2026-05-27 in favour of
    /// the host removing the pill entirely when its entry list goes
    /// empty (drives "absence = no work" semantics).
    func test_simulateTick_keepsCyclingPastThreeRoundtrips() {
        let r = SyncPillRotator(clock: { self.now })
        r.setItemCount(2)
        // Run 10 ticks (5 cycles through a 2-item list)
        for _ in 0..<10 {
            now = now.addingTimeInterval(2.8)
            r.simulateTick()
        }
        // Rotator still alive: currentIndex is a valid position
        XCTAssertTrue([0, 1].contains(r.currentIndex))
        XCTAssertEqual(r.itemCount, 2)
    }

    @MainActor
    func test_setAutoRotation_false_stopsAdvancingOnTick() {
        let rotator = SyncPillRotator()
        rotator.setItemCount(3)
        rotator.setAutoRotation(false)
        let before = rotator.currentIndex
        rotator.simulateTick()
        XCTAssertEqual(rotator.currentIndex, before, "simulateTick ne doit rien faire d'observable pendant que l'auto-rotation est coupée — le timer réel est annulé par setAutoRotation(false), simulateTick documente juste que rien n'avance côté logique non plus")
    }

    @MainActor
    func test_setAutoRotation_trueAfterFalse_resumesAdvancingOnTick() {
        let rotator = SyncPillRotator()
        rotator.setItemCount(3)
        rotator.setAutoRotation(false)
        rotator.setAutoRotation(true)
        let before = rotator.currentIndex
        rotator.simulateTick()
        XCTAssertEqual(rotator.currentIndex, (before + 1) % 3)
    }

    @MainActor
    func test_autoRotationEnabled_defaultsToTrue() {
        let rotator = SyncPillRotator()
        XCTAssertTrue(rotator.autoRotationEnabled)
    }
}
