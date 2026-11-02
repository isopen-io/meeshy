import XCTest
@testable import Meeshy

/// `CallAudioSessionController` possède la file sérielle de la session audio et
/// le filet « micro muet » (#11522) : la file garde son libellé et son identité
/// (le proxy CallKit la lit depuis sa propre file), le filet ne s'arme que pour
/// un appel attaché.
@MainActor
final class CallAudioSessionControllerTests: XCTestCase {

    func test_theQueue_keepsItsLabel() {
        let controller = CallAudioSessionController()

        XCTAssertEqual(controller.audioSessionQueue.label, "me.meeshy.callmanager.audiosession")
    }

    func test_theManagerQueue_isTheControllerQueue_onEveryRead() {
        let manager = CallManager.shared

        XCTAssertTrue(manager.audioSessionQueue === manager.audio.audioSessionQueue)
        XCTAssertTrue(manager.audioSessionQueue === manager.audioSessionQueue)
    }

    func test_cancellingTheFallback_disarmsIt() {
        let controller = CallAudioSessionController()

        controller.cancelStuckMutedFallback()

        XCTAssertFalse(controller.isStuckMutedFallbackArmed)
    }

    func test_schedulingTheFallback_armsItForTheCurrentCall_andCancellingDisarmsIt() {
        let controller = CallAudioSessionController()

        controller.scheduleStuckMutedFallback()
        XCTAssertTrue(controller.isStuckMutedFallbackArmed)

        controller.cancelStuckMutedFallback()
        XCTAssertFalse(controller.isStuckMutedFallbackArmed)
    }

    func test_aFreshController_hasNotSelfActivatedTheSession() {
        let controller = CallAudioSessionController()

        XCTAssertFalse(controller.audioSessionSelfActivated)
    }

    func test_withoutAnAttachedCall_theSpeakerRouteHasNothingToRevert() {
        let controller = CallAudioSessionController()

        XCTAssertTrue(controller.applySpeakerRoute())
    }
}
