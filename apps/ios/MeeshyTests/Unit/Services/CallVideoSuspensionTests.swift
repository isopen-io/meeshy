import XCTest
@testable import Meeshy

/// `CallVideoSuspension` actionne la vidéo sortante que l'utilisateur n'a pas
/// éteinte (#11522) : attente CallKit, survie réseau, chaleur. Sans appel
/// attaché, aucune de ces entrées n'arme de tâche ni ne touche à l'appareil.
@MainActor
final class CallVideoSuspensionTests: XCTestCase {

    func test_survivalSuspend_withoutAnAttachedCall_reportsFailure() async {
        let suspension = CallVideoSuspension()

        let suspended = await suspension.suspendOutboundVideo()

        XCTAssertFalse(suspended)
    }

    func test_survivalResume_withoutAnAttachedCall_reportsFailure() async {
        let suspension = CallVideoSuspension()

        let resumed = await suspension.resumeOutboundVideo()

        XCTAssertFalse(resumed)
    }

    func test_holdAndUnhold_withoutAnAttachedCall_doNothing() {
        let suspension = CallVideoSuspension()

        suspension.handleHold(true)
        suspension.handleHold(false)
    }

    func test_criticalThermalState_withoutAnAttachedCall_doesNothing() async {
        let suspension = CallVideoSuspension()

        suspension.thermalStateDidChange(to: .critical)
        await Task.yield()
    }

    func test_dtmf_withoutAnAttachedCall_doesNothing() {
        let suspension = CallVideoSuspension()

        suspension.sendDTMF(digits: "123")
    }

    func test_bindingTheSurvivalFreeze_withoutAnAttachedCall_doesNothing() {
        let suspension = CallVideoSuspension()

        suspension.bindSurvivalFreeze()
    }
}
