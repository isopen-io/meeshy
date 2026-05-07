import XCTest
@testable import MeeshyUI

@MainActor
final class PlayheadViewTests: XCTestCase {

    func test_init_doesNotCrash() {
        let view = PlayheadView(
            currentTime: 1.5,
            totalDuration: 10,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 200,
            isDark: false,
            onScrub: { _ in }
        )
        _ = view.body
    }

    func test_xPosition_matchesGeometry() {
        let view = PlayheadView(
            currentTime: 2.0,
            totalDuration: 10,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 200,
            isDark: false,
            onScrub: { _ in }
        )
        XCTAssertEqual(view.computedX, 100, accuracy: 0.001)
    }
}
