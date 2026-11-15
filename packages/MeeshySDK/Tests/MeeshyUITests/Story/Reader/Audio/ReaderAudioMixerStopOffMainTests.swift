import XCTest
import AVFoundation
import os
@testable import MeeshyUI

/// **Arrêter un mixeur ne bloque pas le fil principal** (#18511) :
/// `-[AVAudioPlayerNode stop]` interroge `outputLatency` du serveur audio
/// (0,60 et 0,69 s relevés), et le lecteur l'appelait sur chaque mixeur voisin
/// à chaque story qui devient visible.
@MainActor
final class ReaderAudioMixerStopOffMainTests: XCTestCase {

    func test_mustStopNodes_aMixerThatNeverScheduled_hasNothingToStop() {
        XCTAssertFalse(ReaderAudioStopPolicy.mustStopNodes(hasScheduledPass: false))
        XCTAssertTrue(ReaderAudioStopPolicy.mustStopNodes(hasScheduledPass: true))
    }

    func test_stop_idleMixer_advancesTheEpochWithoutRetiringNodes() {
        let mixer = ReaderAudioMixer()
        let epoch = mixer.playbackEpoch

        mixer.stop()

        XCTAssertEqual(mixer.playbackEpoch, epoch &+ 1)
        XCTAssertFalse(mixer.isPlaying)
        XCTAssertFalse(mixer.nodeRetirement.isPending)
    }

    func test_retire_runsTheStopsOffTheMainThread() {
        var retirement = ReaderAudioNodeRetirement()
        let ranOffMain = expectation(description: "arrêt hors du fil principal")
        let onMain = OSAllocatedUnfairLock(initialState: true)

        retirement.retire {
            onMain.withLock { $0 = Thread.isMainThread }
            ranOffMain.fulfill()
        }

        XCTAssertTrue(retirement.isPending)
        wait(for: [ranOffMain], timeout: 2)
        XCTAssertFalse(onMain.withLock { $0 })
    }

    func test_settle_waitsForThePendingStopsBeforeTheNodesAreReused() {
        var retirement = ReaderAudioNodeRetirement()
        let stopped = OSAllocatedUnfairLock(initialState: false)
        retirement.retire { stopped.withLock { $0 = true } }

        retirement.settle()

        XCTAssertTrue(stopped.withLock { $0 })
        XCTAssertFalse(retirement.isPending)
    }
}
