import XCTest
@testable import MeeshyUI

@MainActor
final class KeyframeMarkerViewTests: XCTestCase {

    func test_init_doesNotCrash() {
        let view = KeyframeMarkerView(
            keyframeId: "kf-1",
            absoluteTime: 2.5,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: 44,
            isSelected: false,
            onTap: {},
            onLongPress: {},
            onDragDelta: { _ in }
        )
        _ = view.body
    }

    func test_accessibilityLabel_includesTime() {
        let view = KeyframeMarkerView(
            keyframeId: "kf-1", absoluteTime: 2.5,
            geometry: TimelineGeometry(zoomScale: 1.0), laneHeight: 44,
            isSelected: false, onTap: {}, onLongPress: {}, onDragDelta: { _ in }
        )
        XCTAssertTrue(view.accessibilityComposed.contains("2"))
    }
}
