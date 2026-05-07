import XCTest
import CoreGraphics
@testable import MeeshyUI

final class TimelineGeometryTests: XCTestCase {

    func test_basePixelsPerSecond_whenZoom1_equals50() {
        let geo = TimelineGeometry(zoomScale: 1.0)
        XCTAssertEqual(geo.pixelsPerSecond, 50, accuracy: 0.001)
    }

    func test_pixelsPerSecond_scalesLinearly() {
        XCTAssertEqual(TimelineGeometry(zoomScale: 0.5).pixelsPerSecond, 25, accuracy: 0.001)
        XCTAssertEqual(TimelineGeometry(zoomScale: 2.0).pixelsPerSecond, 100, accuracy: 0.001)
    }

    func test_xForTime_atZero_isZero() {
        XCTAssertEqual(TimelineGeometry(zoomScale: 1.0).x(for: 0), 0)
    }

    func test_xForTime_atOneSecond_isPixelsPerSecond() {
        XCTAssertEqual(TimelineGeometry(zoomScale: 1.0).x(for: 1), 50, accuracy: 0.001)
    }

    func test_timeForX_isInverseOfX() {
        let geo = TimelineGeometry(zoomScale: 1.5)
        let t = geo.time(forX: geo.x(for: 3.0))
        XCTAssertEqual(t, 3.0, accuracy: 0.001)
    }

    func test_widthForDuration_zoomed() {
        XCTAssertEqual(TimelineGeometry(zoomScale: 2.0).width(for: 4), 400, accuracy: 0.001)
    }

    func test_snapTolerance_dependsOnZoom() {
        // 6 points / pixelsPerSecond
        let lowZoom = TimelineGeometry(zoomScale: 0.5)  // 25 px/s
        let highZoom = TimelineGeometry(zoomScale: 2.0) // 100 px/s
        XCTAssertEqual(lowZoom.snapToleranceSeconds, 6.0 / 25.0, accuracy: 0.001)
        XCTAssertEqual(highZoom.snapToleranceSeconds, 6.0 / 100.0, accuracy: 0.001)
    }
}
