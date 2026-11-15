import XCTest
import AVFoundation
import MeeshySDK
@testable import MeeshyUI

/// #11042 — la vidéo partagée (en ligne, plein écran, PiP) qui joue avec le
/// son BAISSE pendant un enregistrement, sans s'arrêter, puis REMONTE ; une
/// vidéo coupée n'est pas touchée.
@MainActor
final class RecordingDucksSharedVideoTests: XCTestCase {

    private func makeSUT(muted: Bool) -> (manager: SharedAVPlayerManager, player: AVPlayer) {
        _ = PlaybackCoordinator.shared
        let manager = SharedAVPlayerManager.shared
        let player = AVPlayer()
        manager.isForceMuted = muted
        manager.player = player
        manager.isPlaying = true
        addTeardownBlock { @MainActor in
            RecordingPlaybackDucker.shared.restore()
            manager.isPlaying = false
            manager.player = nil
            manager.isForceMuted = false
        }
        return (manager, player)
    }

    func test_aVideoPlayingWithSound_isLoweredThenRestored() {
        let (_, player) = makeSUT(muted: false)
        player.volume = 0.9

        RecordingPlaybackDucker.shared.duck()
        XCTAssertEqual(player.volume, 0.9 * PlaybackDuckLedger.duckedFactor, accuracy: 0.0001)
        XCTAssertTrue(RecordingPlaybackDucker.shared.hasAudiblePlayback)

        RecordingPlaybackDucker.shared.restore()
        XCTAssertEqual(player.volume, 0.9, accuracy: 0.0001)
    }

    func test_aMutedVideo_isNotTouched() {
        let (_, player) = makeSUT(muted: true)

        RecordingPlaybackDucker.shared.duck()

        XCTAssertEqual(player.volume, 1)
    }

    func test_thePlaybackRegistry_namesThePlayingVideo() {
        let (_, player) = makeSUT(muted: false)

        let targets = PlaybackCoordinator.shared.audibleVolumeTargets

        XCTAssertTrue(targets.contains { $0 === player })
    }
}
