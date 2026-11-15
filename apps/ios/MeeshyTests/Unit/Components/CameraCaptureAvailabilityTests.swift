import XCTest
@testable import Meeshy

/// L'état « prête » DÉRIVÉ de la session réelle, et ce qu'un toucher en fait (#17433).
final class CameraCaptureAvailabilityTests: XCTestCase {

    private func facts(wants: Bool = true, running: Bool = true, interrupted: Bool = false,
                       reason: Int? = nil, switching: Bool = false, connection: Bool = true,
                       active: Bool = true, enabled: Bool = true) -> CameraCaptureAvailability.Facts {
        CameraCaptureAvailability.Facts(wantsToRun: wants, isRunning: running, isInterrupted: interrupted,
                                        interruptionReason: reason, isSwitching: switching,
                                        hasPhotoConnection: connection, photoConnectionIsActive: active,
                                        photoConnectionIsEnabled: enabled)
    }

    // MARK: - L'état

    func test_resolve_runningWithActiveConnection_isReady() {
        XCTAssertEqual(CameraCaptureAvailability.resolve(facts()), .ready)
    }

    func test_resolve_nobodyWantsTheSession_isClosedEvenIfStillRunning() {
        XCTAssertEqual(CameraCaptureAvailability.resolve(facts(wants: false)), .closed)
    }

    func test_resolve_wantedButNotYetRunning_isStarting() {
        XCTAssertEqual(CameraCaptureAvailability.resolve(facts(running: false)), .starting)
    }

    func test_resolve_interrupted_carriesItsReason() {
        XCTAssertEqual(CameraCaptureAvailability.resolve(facts(running: false, interrupted: true, reason: 2)),
                       .interrupted(reason: 2))
    }

    func test_resolve_switchingLens_isSwitchingEvenIfRunning() {
        XCTAssertEqual(CameraCaptureAvailability.resolve(facts(switching: true)), .switching)
    }

    func test_resolve_runningWithInactiveConnection_isStalled() {
        XCTAssertEqual(CameraCaptureAvailability.resolve(facts(active: false)), .stalled)
        XCTAssertEqual(CameraCaptureAvailability.resolve(facts(enabled: false)), .stalled)
        XCTAssertEqual(CameraCaptureAvailability.resolve(facts(connection: false)), .stalled)
    }

    // MARK: - Le toucher qui attend

    func test_decide_ready_shootsAtOnce() {
        XCTAssertEqual(CameraCaptureWait.decide(.ready, elapsed: 0), .shoot)
    }

    func test_decide_closed_givesUpAtOnce() {
        XCTAssertEqual(CameraCaptureWait.decide(.closed, elapsed: 0), .giveUp)
    }

    /// Le défaut : un démarrage à froid lent sous un talkie qui occupe le fil principal
    /// dépassait les trois secondes comptées depuis le doigt ⇒ toast, alors que la session
    /// arrivait.
    func test_decide_startingAfterThreeSeconds_stillWaits() {
        XCTAssertEqual(CameraCaptureWait.decide(.starting, elapsed: 3.5), .wait)
        XCTAssertEqual(CameraCaptureWait.decide(.switching, elapsed: 3.5), .wait)
    }

    func test_decide_startingBeyondTheRecoveringBudget_givesUp() {
        XCTAssertEqual(CameraCaptureWait.decide(.starting, elapsed: CameraCaptureWait.recoveringBudget), .giveUp)
    }

    func test_decide_interruptedByAnotherAudioClient_waitsForTheRecovery() {
        XCTAssertEqual(CameraCaptureWait.decide(.interrupted(reason: 2), elapsed: 4), .wait)
    }

    func test_decide_interruptedForAnotherReason_givesUpAfterTheSettledBudget() {
        XCTAssertEqual(CameraCaptureWait.decide(.interrupted(reason: 3), elapsed: 1), .wait)
        XCTAssertEqual(CameraCaptureWait.decide(.interrupted(reason: 3), elapsed: CameraCaptureWait.settledBudget), .giveUp)
    }

    func test_decide_stalled_givesUpAfterTheSettledBudget() {
        XCTAssertEqual(CameraCaptureWait.decide(.stalled, elapsed: 1), .wait)
        XCTAssertEqual(CameraCaptureWait.decide(.stalled, elapsed: 3), .giveUp)
    }

    // MARK: - L'interruption

    func test_response_audioDeviceTakenOutsideARecording_dropsTheMicrophone() {
        XCTAssertEqual(CameraInterruptionResponse.response(reason: 2, isRecording: false), .dropMicrophoneAndResume)
    }

    func test_response_audioDeviceTakenDuringARecording_waits() {
        XCTAssertEqual(CameraInterruptionResponse.response(reason: 2, isRecording: true), .waitForEnd)
    }

    func test_response_otherReasons_wait() {
        [nil, 1, 3, 4, 5].forEach {
            XCTAssertEqual(CameraInterruptionResponse.response(reason: $0, isRecording: false), .waitForEnd)
        }
    }
}
