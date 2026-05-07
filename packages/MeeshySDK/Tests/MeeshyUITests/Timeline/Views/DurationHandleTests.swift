import XCTest
@testable import MeeshyUI

@MainActor
final class DurationHandleViewTests: XCTestCase {

    func test_init_doesNotCrash() {
        var captured: Float = 0
        let h = DurationHandle(
            duration: 10,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 200,
            isDark: false,
            minDuration: 2, maxDuration: 600,
            onChange: { captured = $0 }
        )
        _ = h.body
        XCTAssertEqual(captured, 0)
    }

    func test_clampDuration_belowMin_clampsToMin() {
        XCTAssertEqual(DurationHandle.clamp(1.0, min: 2.0, max: 600), 2.0)
    }

    func test_clampDuration_aboveMax_clampsToMax() {
        XCTAssertEqual(DurationHandle.clamp(900, min: 2, max: 600), 600)
    }
}
