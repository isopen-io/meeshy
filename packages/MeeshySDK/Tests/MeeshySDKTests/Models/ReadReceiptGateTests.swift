import XCTest
@testable import MeeshySDK

/// A read receipt must be TRUTHFUL: the client may only tell the sender "I read
/// this" when the user could actually have read it — app foregrounded AND the
/// message visible at the bottom of the viewport. These tests pin the precision
/// rule that prevents false read receipts (backgrounded app, scrolled-away).
final class ReadReceiptGateTests: XCTestCase {

    // Both conditions hold: the user is looking at the screen and the newest
    // message is in view — the only case where a read receipt is truthful.
    func test_shouldEmitAutoRead_activeAndAtBottom_emits() {
        XCTAssertTrue(
            ReadReceiptGate.shouldEmitAutoRead(
                isApplicationActive: true, isViewportAtBottom: true))
    }

    // Backgrounded app: a message arriving while the phone is in a pocket must
    // NOT be marked read even though the conversation handler is still wired.
    func test_shouldEmitAutoRead_backgrounded_doesNotEmit() {
        XCTAssertFalse(
            ReadReceiptGate.shouldEmitAutoRead(
                isApplicationActive: false, isViewportAtBottom: true))
    }

    // Scrolled away reading history: a new message lands off-screen at the
    // bottom and must NOT be marked read until the user scrolls back.
    func test_shouldEmitAutoRead_scrolledAway_doesNotEmit() {
        XCTAssertFalse(
            ReadReceiptGate.shouldEmitAutoRead(
                isApplicationActive: true, isViewportAtBottom: false))
    }

    // Neither condition: doubly false, still no emission.
    func test_shouldEmitAutoRead_backgroundedAndScrolledAway_doesNotEmit() {
        XCTAssertFalse(
            ReadReceiptGate.shouldEmitAutoRead(
                isApplicationActive: false, isViewportAtBottom: false))
    }
}
