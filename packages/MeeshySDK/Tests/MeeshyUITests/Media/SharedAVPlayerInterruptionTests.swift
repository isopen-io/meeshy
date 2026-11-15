import XCTest
import AVFoundation
import MeeshySDK
@testable import MeeshyUI

/// #11040 — la vidéo partagée (en ligne, plein écran, PiP) n'avait aucun
/// observateur d'interruption : un appel ou une autre app qui lance un son la
/// laissait jouer, ou la coupait sans jamais la reprendre.
@MainActor
final class SharedAVPlayerInterruptionTests: XCTestCase {

    private func makeSUT() -> SharedAVPlayerManager {
        let manager = SharedAVPlayerManager.shared
        manager.stop()
        manager.interruptionLedger = InterruptionResumeLedger()
        manager.wantsPlayback = false
        addTeardownBlock { @MainActor in
            manager.interruptionLedger = InterruptionResumeLedger()
            manager.wantsPlayback = false
            manager.otherAudioIsPlaying = { AVAudioSession.sharedInstance().isOtherAudioPlaying }
        }
        return manager
    }

    func test_anInterruptionWhileTheVideoPlays_isRemembered() {
        let manager = makeSUT()
        manager.wantsPlayback = true

        manager.handleSessionEvent(.interruptionBegan)

        XCTAssertTrue(manager.interruptionLedger.holdsInterruptedPlayback)
        XCTAssertFalse(manager.wantsPlayback, "la vidéo est mise en pause")
    }

    func test_anInterruptionWhileTheVideoIsPaused_isNotRemembered() {
        let manager = makeSUT()

        manager.handleSessionEvent(.interruptionBegan)

        XCTAssertFalse(manager.interruptionLedger.holdsInterruptedPlayback)
    }

    func test_theEndOfTheInterruption_consumesIt() {
        let manager = makeSUT()
        manager.wantsPlayback = true
        manager.handleSessionEvent(.interruptionBegan)

        manager.handleSessionEvent(.interruptionEndedShouldResume)

        XCTAssertFalse(manager.interruptionLedger.holdsInterruptedPlayback)
    }

    func test_aUserPauseDuringTheInterruption_cancelsTheResume() {
        let manager = makeSUT()
        manager.wantsPlayback = true
        manager.handleSessionEvent(.interruptionBegan)

        manager.pause()

        XCTAssertFalse(manager.interruptionLedger.holdsInterruptedPlayback)
    }

    func test_returningToTheAppOnceTheVideoLeft_forgetsIt() {
        let manager = makeSUT()
        manager.otherAudioIsPlaying = { false }
        manager.wantsPlayback = true
        manager.handleSessionEvent(.interruptionBegan)

        manager.handleReturnToForeground()

        XCTAssertFalse(manager.interruptionLedger.holdsInterruptedPlayback, "plus de lecteur à l'écran : rien à reprendre")
    }
}
