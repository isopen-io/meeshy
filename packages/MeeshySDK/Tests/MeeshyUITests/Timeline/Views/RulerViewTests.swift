import XCTest
@testable import MeeshyUI

final class RulerViewTests: XCTestCase {

    func test_tickInterval_zoomedOut_returnsMultipleSeconds() {
        // 0.3x → 15 px/s → ticks every 5s
        XCTAssertEqual(RulerView.tickInterval(for: 0.3), 5.0, accuracy: 0.01)
    }

    func test_tickInterval_zoom1x_returnsOneSecond() {
        XCTAssertEqual(RulerView.tickInterval(for: 1.0), 1.0, accuracy: 0.01)
    }

    func test_tickInterval_zoomedIn_returnsHalfSecond() {
        XCTAssertEqual(RulerView.tickInterval(for: 5.0), 0.2, accuracy: 0.01)
    }

    func test_tickInterval_extremeZoom_returnsMillisecond() {
        XCTAssertEqual(RulerView.tickInterval(for: 15.0), 0.05, accuracy: 0.01)
    }

    func test_format_msFormatting_under1s() {
        XCTAssertEqual(RulerView.formatTick(0.05), "50ms")
    }

    func test_format_secondsFormatting_under60s() {
        XCTAssertEqual(RulerView.formatTick(12.5), "12.5s")
    }

    func test_format_minutesFormatting_above60s() {
        XCTAssertEqual(RulerView.formatTick(125), "2:05")
    }
}
