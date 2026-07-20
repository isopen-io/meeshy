import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class TransitionInspectorTests: XCTestCase {

    private func makeSnapshot(
        kind: StoryTransitionKind = .crossfade,
        duration: Float = 0.5
    ) -> TransitionInspector.TransitionSnapshot {
        TransitionInspector.TransitionSnapshot(
            id: "tr-1",
            fromClipId: "clip-a",
            toClipId: "clip-b",
            kind: kind,
            duration: duration
        )
    }

    func test_init_doesNotCrash() {
        let view = TransitionInspector(
            transition: makeSnapshot(),
            isAdvancedEnabled: false,
            onKindChanged: { _ in },
            onDurationChanged: { _ in },
            onDelete: {}
        )
        _ = view.body
    }

    func test_durationRange_isClampedTo0_1to2_0() {
        XCTAssertEqual(TransitionInspector.durationRange.lowerBound, 0.1, accuracy: 0.0001)
        XCTAssertEqual(TransitionInspector.durationRange.upperBound, 2.0, accuracy: 0.0001)
    }

    func test_kindPicker_onlyOffersCrossfade() {
        // The picker no longer exposes Dissolve as a selectable option — it
        // renders identically to Crossfade everywhere, so offering it as a
        // distinct choice was a false promise (design doc 2026-07-18).
        XCTAssertEqual(TransitionInspector.availableKinds, [.crossfade])
    }

    func test_kindChanged_emitsCallback() {
        var captured: StoryTransitionKind?
        let view = TransitionInspector(
            transition: makeSnapshot(kind: .crossfade),
            isAdvancedEnabled: false,
            onKindChanged: { captured = $0 },
            onDurationChanged: { _ in },
            onDelete: {}
        )
        view.simulateKindCommit(.dissolve)
        XCTAssertEqual(captured, .dissolve)
    }

    func test_durationChanged_clampsAndEmits() {
        var captured: Float?
        let view = TransitionInspector(
            transition: makeSnapshot(duration: 0.5),
            isAdvancedEnabled: false,
            onKindChanged: { _ in },
            onDurationChanged: { captured = $0 },
            onDelete: {}
        )
        view.simulateDurationCommit(value: 5)
        XCTAssertEqual(captured ?? -1, 2.0, accuracy: 0.001)
    }
}
