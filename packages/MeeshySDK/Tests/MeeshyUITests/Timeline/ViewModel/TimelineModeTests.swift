import XCTest
@testable import MeeshyUI

final class TimelineModeTests: XCTestCase {

    func test_toggle_quickToPro() {
        XCTAssertEqual(TimelineMode.quick.toggled, .pro)
    }

    func test_toggle_proToQuick() {
        XCTAssertEqual(TimelineMode.pro.toggled, .quick)
    }

    func test_codable_roundTrip() throws {
        let encoded = try JSONEncoder().encode(TimelineMode.pro)
        let decoded = try JSONDecoder().decode(TimelineMode.self, from: encoded)
        XCTAssertEqual(decoded, .pro)
    }

    func test_isPro_quick_false() {
        XCTAssertFalse(TimelineMode.quick.isPro)
    }

    func test_isPro_pro_true() {
        XCTAssertTrue(TimelineMode.pro.isPro)
    }
}
