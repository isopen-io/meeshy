import XCTest
@testable import Meeshy

/// Spec §6.2 / backlog B.4 — the "sending" clock must stay hidden for the
/// first 200ms of a send (debounce) so a fast round-trip never flashes an
/// icon the user has no time to perceive, and must reveal itself once a
/// send genuinely lingers past that threshold.
@MainActor
final class BubbleDeliveryCheckSendingRevealTests: XCTestCase {

    func test_shouldRevealImmediately_noStartDate_returnsTrue() {
        XCTAssertTrue(BubbleDeliveryCheck.SendingClockGlyph.shouldRevealImmediately(sendStartedAt: nil, now: Date()))
    }

    func test_shouldRevealImmediately_justStarted_returnsFalse() {
        let now = Date()
        XCTAssertFalse(BubbleDeliveryCheck.SendingClockGlyph.shouldRevealImmediately(sendStartedAt: now, now: now))
    }

    func test_shouldRevealImmediately_elapsed100ms_returnsFalse() {
        let start = Date()
        let now = start.addingTimeInterval(0.1)
        XCTAssertFalse(BubbleDeliveryCheck.SendingClockGlyph.shouldRevealImmediately(sendStartedAt: start, now: now))
    }

    func test_shouldRevealImmediately_elapsedExactly200ms_returnsTrue() {
        let start = Date()
        let now = start.addingTimeInterval(0.2)
        XCTAssertTrue(BubbleDeliveryCheck.SendingClockGlyph.shouldRevealImmediately(sendStartedAt: start, now: now))
    }

    func test_shouldRevealImmediately_elapsed5Seconds_returnsTrue() {
        let start = Date()
        let now = start.addingTimeInterval(5)
        XCTAssertTrue(BubbleDeliveryCheck.SendingClockGlyph.shouldRevealImmediately(sendStartedAt: start, now: now))
    }
}
