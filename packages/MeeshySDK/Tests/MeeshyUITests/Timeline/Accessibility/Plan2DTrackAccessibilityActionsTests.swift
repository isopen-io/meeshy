import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class Plan2DTrackAccessibilityActionsTests: XCTestCase {

    private final class Recorder {
        var events: [String] = []
    }

    private func track(bar: TrackBar = .timed(start: 1, end: 3), locked: Bool = false,
                       keyframes: [Plan2DKeyframe] = []) -> Plan2DTrack {
        Plan2DTrack(id: "t1", label: "Clip", plane: .content, z: 0, bar: bar,
                    keyframes: keyframes, isLocked: locked)
    }

    private func handlers(_ recorder: Recorder) -> Plan2DTrackHandlers {
        Plan2DTrackHandlers(
            onSelectTrack: { recorder.events.append("select(\($0))") },
            onSelectKeyframe: { recorder.events.append("keyframe(\($0))") },
            onReorder: { recorder.events.append("reorder(\($0),\($1))") },
            onTrimStart: { recorder.events.append("trimStart(\($0),\($1))") },
            onTrimEnd: { recorder.events.append("trimEnd(\($0),\($1))") },
            onMove: { recorder.events.append("move(\($0),\($1))") },
            onMoveEnded: { recorder.events.append("ended(\($0))") }
        )
    }

    func test_timedUnlocked_offersTrims_moveUpDown_andOneActionPerKeyframe() {
        let subject = Plan2DTrackAccessibility(
            track: track(keyframes: [Plan2DKeyframe(id: "k1", time: 1.5), Plan2DKeyframe(id: "k2", time: 2)]),
            index: 1, count: 3)
        XCTAssertEqual(subject.actionKinds, [
            .startLater, .startEarlier, .endLater, .endEarlier, .moveUp, .moveDown,
            .selectKeyframe(id: "k1", time: 1.5), .selectKeyframe(id: "k2", time: 2),
        ])
    }

    func test_ghost_noTrims_adjustNil() {
        let subject = Plan2DTrackAccessibility(track: track(bar: .ghost), index: 0, count: 2)
        XCTAssertEqual(subject.actionKinds, [.moveDown])
        XCTAssertNil(subject.adjustSeconds(.increment))
    }

    func test_locked_noTrims_adjustNil_butReorderKept() {
        let subject = Plan2DTrackAccessibility(track: track(locked: true), index: 1, count: 3)
        XCTAssertEqual(subject.actionKinds, [.moveUp, .moveDown])
        XCTAssertNil(subject.adjustSeconds(.decrement))
    }

    func test_firstRow_noMoveUp_lastRow_noMoveDown() {
        XCTAssertFalse(Plan2DTrackAccessibility(track: track(), index: 0, count: 2).actionKinds.contains(.moveUp))
        XCTAssertFalse(Plan2DTrackAccessibility(track: track(), index: 1, count: 2).actionKinds.contains(.moveDown))
    }

    func test_adjust_increment_callsOnMovePointOneThenOnMoveEnded() {
        let recorder = Recorder()
        Plan2DTrackAccessibility(track: track(), index: 0, count: 1)
            .adjust(.increment, handlers: handlers(recorder))
        XCTAssertEqual(recorder.events, ["move(t1,0.1)", "ended(t1)"])
    }

    func test_adjust_onGhost_doesNothing() {
        let recorder = Recorder()
        Plan2DTrackAccessibility(track: track(bar: .ghost), index: 0, count: 1)
            .adjust(.increment, handlers: handlers(recorder))
        XCTAssertTrue(recorder.events.isEmpty)
    }

    func test_perform_trimStartLater_callsOnTrimStartPlus0_1() {
        let recorder = Recorder()
        Plan2DTrackAccessibility(track: track(), index: 0, count: 1)
            .perform(.startLater, handlers: handlers(recorder))
        XCTAssertEqual(recorder.events, ["trimStart(t1,0.1)"])
    }

    func test_perform_endEarlier_callsOnTrimEndMinus0_1() {
        let recorder = Recorder()
        Plan2DTrackAccessibility(track: track(), index: 0, count: 1)
            .perform(.endEarlier, handlers: handlers(recorder))
        XCTAssertEqual(recorder.events, ["trimEnd(t1,-0.1)"])
    }

    func test_perform_moveUp_callsOnReorderIndexMinusOne_moveDown_plusOne() {
        let recorder = Recorder()
        let subject = Plan2DTrackAccessibility(track: track(), index: 2, count: 5)
        subject.perform(.moveUp, handlers: handlers(recorder))
        subject.perform(.moveDown, handlers: handlers(recorder))
        XCTAssertEqual(recorder.events, ["reorder(t1,1)", "reorder(t1,3)"])
    }

    func test_perform_selectKeyframe_callsOnSelectKeyframe() {
        let recorder = Recorder()
        Plan2DTrackAccessibility(track: track(), index: 0, count: 1)
            .perform(.selectKeyframe(id: "k9", time: 2), handlers: handlers(recorder))
        XCTAssertEqual(recorder.events, ["keyframe(k9)"])
    }

    func test_labels_resolve_andKeyframeLabelCarriesItsTime() {
        let subject = Plan2DTrackAccessibility(track: track(), index: 0, count: 1)
        for action in [Plan2DTrackAction.startLater, .startEarlier, .endLater, .endEarlier, .moveUp, .moveDown] {
            XCTAssertFalse(subject.label(for: action).hasPrefix("story.timeline.a11y.action"))
        }
        let keyframe = subject.label(for: .selectKeyframe(id: "k", time: 1.5))
        XCTAssertFalse(keyframe.contains("%"))
        XCTAssertFalse(keyframe.hasPrefix("story.timeline"))
    }

    func test_value_isTheDisplayedRange_forTimed_andEmptyForGhost() {
        XCTAssertTrue(Plan2DTrackAccessibility(track: track(), index: 0, count: 1).value.contains("1.0"))
        XCTAssertEqual(Plan2DTrackAccessibility(track: track(bar: .ghost), index: 0, count: 1).value, "")
    }

    func test_stepSeconds_isTheSharedAdjustStep() {
        XCTAssertEqual(Plan2DView.accessibilityStepSeconds, MeeshyAdjustStep.seconds)
    }
}
