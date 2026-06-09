import XCTest
@testable import MeeshyUI

/// Locks the ISO-8601 parsing behavior of `NotificationRowView.relativeTime`
/// after its two per-render `ISO8601DateFormatter()` allocations were replaced
/// by two memoized static formatters (perf). The two-attempt fallback
/// (fractional seconds, then whole seconds) must be preserved.
@MainActor
final class NotificationRowViewTests: XCTestCase {

    func test_parseISODate_withFractionalSeconds_parses() {
        XCTAssertNotNil(NotificationRowView.parseISODate("2026-06-09T10:15:30.123Z"))
    }

    func test_parseISODate_withoutFractionalSeconds_parses() {
        XCTAssertNotNil(NotificationRowView.parseISODate("2026-06-09T10:15:30Z"))
    }

    func test_parseISODate_invalid_returnsNil() {
        XCTAssertNil(NotificationRowView.parseISODate("not a date"))
        XCTAssertNil(NotificationRowView.parseISODate(""))
    }

    func test_parseISODate_fractionalAndWhole_resolveToSameInstant() {
        // "…30Z" falls through to the whole-second formatter; "…30.000Z" parses
        // with the fractional one. Both denote the same instant.
        let whole = NotificationRowView.parseISODate("2026-06-09T10:15:30Z")
        let frac = NotificationRowView.parseISODate("2026-06-09T10:15:30.000Z")
        XCTAssertNotNil(whole)
        XCTAssertEqual(whole, frac)
    }
}
