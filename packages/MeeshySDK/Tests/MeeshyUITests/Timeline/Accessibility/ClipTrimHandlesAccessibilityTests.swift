import XCTest
import SwiftUI
@testable import MeeshyUI

@MainActor
final class ClipTrimHandlesAccessibilityTests: XCTestCase {

    private final class Recorder {
        var starts: [CGFloat] = []
        var ends: [CGFloat] = []
    }

    private func handles(_ recorder: Recorder, step: CGFloat? = nil) -> ClipTrimHandles {
        guard let step else {
            return ClipTrimHandles(laneHeight: 52,
                                   onTrimStartDelta: { recorder.starts.append($0) },
                                   onTrimEndDelta: { recorder.ends.append($0) })
        }
        return ClipTrimHandles(laneHeight: 52,
                               onTrimStartDelta: { recorder.starts.append($0) },
                               onTrimEndDelta: { recorder.ends.append($0) },
                               adjustStepPoints: step)
    }

    func test_handleLabels_areNotFormatKeys() {
        for leading in [true, false] {
            let label = ClipTrimHandles.handleLabel(leading: leading)
            XCTAssertFalse(label.contains("%"), label)
            XCTAssertFalse(label.hasPrefix("story.timeline.trim.handle"), label)
        }
        XCTAssertNotEqual(ClipTrimHandles.handleLabel(leading: true), ClipTrimHandles.handleLabel(leading: false))
    }

    func test_defaultStep_isFivePoints() {
        XCTAssertEqual(ClipTrimHandles.defaultAdjustStepPoints, 5)
    }

    func test_adjustStart_increment_sendsPlusStep() {
        let recorder = Recorder()
        handles(recorder).adjust(leading: true, .increment)
        XCTAssertEqual(recorder.starts, [5])
        XCTAssertTrue(recorder.ends.isEmpty)
    }

    func test_adjustEnd_decrement_sendsMinusStep_withCustomStep() {
        let recorder = Recorder()
        handles(recorder, step: 8).adjust(leading: false, .decrement)
        XCTAssertEqual(recorder.ends, [-8])
        XCTAssertTrue(recorder.starts.isEmpty)
    }
}
