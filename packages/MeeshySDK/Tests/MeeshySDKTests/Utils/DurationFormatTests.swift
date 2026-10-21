import XCTest
@testable import MeeshySDK

final class DurationFormatTests: XCTestCase {

    func test_clock_boundaries_accumulateMinutesWithoutHours() {
        XCTAssertEqual(DurationFormat.clock(0), "0:00")
        XCTAssertEqual(DurationFormat.clock(59), "0:59")
        XCTAssertEqual(DurationFormat.clock(60), "1:00")
        XCTAssertEqual(DurationFormat.clock(3599), "59:59")
        XCTAssertEqual(DurationFormat.clock(3600), "60:00")
    }

    func test_clock_defaultRoundingTruncates() {
        XCTAssertEqual(DurationFormat.clock(59.9), "0:59")
    }

    func test_clock_roundedRoundsToNearest() {
        XCTAssertEqual(DurationFormat.clock(59.6, rounding: .toNearestOrAwayFromZero), "1:00")
        XCTAssertEqual(DurationFormat.clock(59.4, rounding: .toNearestOrAwayFromZero), "0:59")
    }

    func test_clock_invalidInputsFallBackToZero() {
        XCTAssertEqual(DurationFormat.clock(-5), "0:00")
        XCTAssertEqual(DurationFormat.clock(.nan), "0:00")
        XCTAssertEqual(DurationFormat.clock(.infinity), "0:00")
        XCTAssertEqual(DurationFormat.clock(wholeSeconds: -3), "0:00")
    }

    func test_clock_hugeValueDoesNotTrap() {
        XCTAssertFalse(DurationFormat.clock(1e30).isEmpty)
    }
}
