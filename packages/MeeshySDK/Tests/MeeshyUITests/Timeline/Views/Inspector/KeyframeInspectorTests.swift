import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class KeyframeInspectorTests: XCTestCase {

    private func makeSnapshot(
        x: CGFloat = 0.3,
        y: CGFloat = 0.5,
        scale: CGFloat = 1.2,
        opacity: CGFloat = 1.0
    ) -> KeyframeInspector.KeyframeSnapshot {
        KeyframeInspector.KeyframeSnapshot(
            id: "kf-1",
            absoluteTime: 2.5,
            x: x, y: y, scale: scale, opacity: opacity
        )
    }

    func test_init_doesNotCrash() {
        let view = KeyframeInspector(
            keyframe: makeSnapshot(),
            isAdvancedEnabled: false,
            onPositionChanged: { _, _ in },
            onScaleChanged: { _ in },
            onOpacityChanged: { _ in },
            onEasingChanged: { _ in },
            onDelete: {}
        )
        _ = view.body
    }

    func test_easingPicker_default_exposesOnlyLinear() {
        XCTAssertEqual(KeyframeInspector.exposedEasingsAtLaunch, [.linear])
    }

    func test_easingPicker_advancedFlag_exposesAllCases() {
        XCTAssertGreaterThan(KeyframeInspector.exposedEasings(advanced: true).count, 1)
    }

    func test_positionChanged_emitsBothComponents() {
        var captured: (CGFloat, CGFloat)?
        let view = KeyframeInspector(
            keyframe: makeSnapshot(x: 0.1, y: 0.2),
            isAdvancedEnabled: false,
            onPositionChanged: { captured = ($0, $1) },
            onScaleChanged: { _ in },
            onOpacityChanged: { _ in },
            onEasingChanged: { _ in },
            onDelete: {}
        )
        view.simulatePositionCommit(x: 0.45, y: 0.6)
        XCTAssertEqual(captured?.0 ?? -1, 0.45, accuracy: 0.001)
        XCTAssertEqual(captured?.1 ?? -1, 0.6, accuracy: 0.001)
    }
}
