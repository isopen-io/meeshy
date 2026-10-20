import XCTest
import AVFoundation
import MeeshySDK
@testable import MeeshyUI

/// #11063, décision porteur h (2026-10-20) — un appel Meeshy décroché arrête
/// la lecture en la marquant « interrompue » : la vidéo (PiP compris) et les
/// lecteurs qui savent reprendre reprennent au raccrochage
/// (`.callEndedShouldResume`). Ils ne sont plus détruits par `stopAll()`.
@MainActor
final class PlaybackCoordinatorCallInterruptionTests: XCTestCase {

    private final class ResumablePlayer: InterruptiblePlayer {
        nonisolated deinit {}
        var interrupted = 0
        var stopped = 0
        func interruptForCall() { interrupted += 1 }
        func stop() { stopped += 1 }
    }

    private final class PlainPlayer: StoppablePlayer {
        nonisolated deinit {}
        var stopped = 0
        func stop() { stopped += 1 }
    }

    func test_anAnsweredCall_marksThePlayingVideoInterrupted_soItResumesAtHangUp() {
        let manager = SharedAVPlayerManager.shared
        manager.stop()
        manager.interruptionLedger = InterruptionResumeLedger()
        addTeardownBlock { @MainActor in
            manager.interruptionLedger = InterruptionResumeLedger()
            manager.wantsPlayback = false
        }
        manager.wantsPlayback = true

        PlaybackCoordinator.shared.interruptAllForCall()

        XCTAssertTrue(manager.interruptionLedger.holdsInterruptedPlayback, "la vidéo attend la fin de l'appel")
        XCTAssertFalse(manager.wantsPlayback, "elle est en pause pendant l'appel")
    }

    func test_externalPlayers_areInterruptedWhenTheyCanResume_stoppedOtherwise() {
        let resumable = ResumablePlayer()
        let plain = PlainPlayer()
        PlaybackCoordinator.shared.registerExternal(resumable)
        PlaybackCoordinator.shared.registerExternal(plain)
        addTeardownBlock { @MainActor in
            PlaybackCoordinator.shared.unregisterExternal(resumable)
            PlaybackCoordinator.shared.unregisterExternal(plain)
        }

        PlaybackCoordinator.shared.interruptAllForCall()

        XCTAssertEqual(resumable.interrupted, 1)
        XCTAssertEqual(resumable.stopped, 0)
        XCTAssertEqual(plain.stopped, 1)
    }
}
