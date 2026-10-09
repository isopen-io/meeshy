import XCTest
@testable import Meeshy

/// **Un vocal en cours d'enregistrement reste visible et s'arrête depuis
/// l'îlot dynamique** (#9784).
@MainActor
final class VoiceRecordingActivityLawTests: XCTestCase {

    private let wording = VoiceRecordingActivityLaw.Wording(recording: "Enregistrement en cours")
    private let t0 = Date(timeIntervalSince1970: 20_000)

    private func input(
        recording: Bool = true,
        conversation: String = "conv1",
        title: String = "Famille",
        levels: [Double] = [0, 0, 0],
        at offset: TimeInterval = 0
    ) -> VoiceRecordingActivityLaw.Input {
        VoiceRecordingActivityLaw.Input(
            isRecording: recording,
            conversationId: conversation,
            title: title,
            startedAt: t0,
            levels: levels,
            now: t0.addingTimeInterval(offset)
        )
    }

    private func step(
        _ running: VoiceRecordingActivityLaw.Running?,
        _ input: VoiceRecordingActivityLaw.Input?
    ) -> VoiceRecordingActivityLaw.Step {
        VoiceRecordingActivityLaw.step(running: running, input: input, wording: wording)
    }

    func test_step_noRecording_doesNothing() {
        XCTAssertEqual(step(nil, nil).action, .none)
        XCTAssertEqual(step(nil, input(recording: false)).action, .none)
    }

    func test_step_recordingStarts_opensWithDestinationAndClockAnchor() {
        let result = step(nil, input())
        guard case .start(let snapshot) = result.action else { return XCTFail("attendu .start") }
        XCTAssertEqual(snapshot.conversationId, "conv1")
        XCTAssertEqual(snapshot.title, "Famille")
        XCTAssertEqual(snapshot.statusLabel, "Enregistrement en cours")
        XCTAssertEqual(snapshot.startedAt, t0)
        XCTAssertFalse(snapshot.isFinished)
    }

    func test_step_clockRunning_doesNotWakeTheActivity() {
        let opened = step(nil, input())
        XCTAssertEqual(step(opened.running, input(at: 30)).action, .none, "le chrono se déroule dans la vue")
    }

    func test_step_levelChange_isThrottled() {
        let opened = step(nil, input(levels: [0, 0, 0]))
        let tooSoon = step(opened.running, input(levels: [1, 1, 1], at: 0.3))
        XCTAssertEqual(tooSoon.action, .none)

        let later = step(tooSoon.running, input(levels: [1, 1, 1], at: 1.2))
        guard case .update(let snapshot) = later.action else { return XCTFail("attendu .update") }
        XCTAssertEqual(snapshot.level, VoiceRecordingSnapshot.maxLevel)
        XCTAssertEqual(snapshot.startedAt, t0, "le chrono garde son ancre")
    }

    func test_step_stop_closesImmediatelyAsFinished() {
        let opened = step(nil, input())
        let stopped = step(opened.running, input(recording: false, at: 4))
        XCTAssertNil(stopped.running)
        guard case .end(let final) = stopped.action else { return XCTFail("attendu .end") }
        XCTAssertTrue(final.isFinished)
        XCTAssertEqual(final.level, 0)
    }

    func test_step_sessionGone_neverLeavesAGhostRecording() {
        let opened = step(nil, input())
        guard case .end = step(opened.running, nil).action else { return XCTFail("attendu .end") }
    }

    func test_step_recordingForAnotherConversation_reopensForIt() {
        let opened = step(nil, input(conversation: "conv1"))
        let other = step(opened.running, input(conversation: "conv2", title: "Bob", at: 5))
        guard case .start(let snapshot) = other.action else { return XCTFail("attendu .start") }
        XCTAssertEqual(snapshot.conversationId, "conv2")
    }

    func test_quantizedLevel_mapsTheMeanOnFiveSteps() {
        XCTAssertEqual(VoiceRecordingActivityLaw.quantizedLevel([]), 0)
        XCTAssertEqual(VoiceRecordingActivityLaw.quantizedLevel([0, 0]), 0)
        XCTAssertEqual(VoiceRecordingActivityLaw.quantizedLevel([0.5, 0.5]), 2)
        XCTAssertEqual(VoiceRecordingActivityLaw.quantizedLevel([1, 1]), 4)
        XCTAssertEqual(VoiceRecordingActivityLaw.quantizedLevel([2, 3]), 4, "une mesure hors bornes est bornée")
    }
}
