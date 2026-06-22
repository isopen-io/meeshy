import XCTest
@testable import Meeshy

@MainActor
final class BubbleEphemeralLifecycleTests: XCTestCase {

    func test_initial_pastExpiry_returnsExpired() {
        let now = Date(timeIntervalSince1970: 100)
        let expiresAt = Date(timeIntervalSince1970: 50)
        let state = BubbleEphemeralLifecycle.State.evaluate(expiresAt: expiresAt, now: now)
        XCTAssertEqual(state, .expired)
    }

    func test_initial_futureExpiry_returnsRunningWithRemaining() {
        let now = Date(timeIntervalSince1970: 100)
        let expiresAt = Date(timeIntervalSince1970: 105)
        let state = BubbleEphemeralLifecycle.State.evaluate(expiresAt: expiresAt, now: now)
        XCTAssertEqual(state, .running(remaining: 5))
    }

    func test_initial_nilExpiry_returnsNone() {
        let state = BubbleEphemeralLifecycle.State.evaluate(expiresAt: nil)
        XCTAssertEqual(state, .none)
    }

    func test_format_underTenSeconds_showsSeconds() {
        XCTAssertEqual(BubbleEphemeralLifecycle.format(remaining: 7), "7s")
    }

    func test_format_minutesAndSeconds() {
        XCTAssertEqual(BubbleEphemeralLifecycle.format(remaining: 65), "1m 05s")
    }
}
