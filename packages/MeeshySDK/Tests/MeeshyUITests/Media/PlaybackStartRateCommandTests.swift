import XCTest
import AVFoundation
@testable import MeeshyUI

/// **Démarrer une vidéo du fil ne gèle plus le fil principal (#17035).**
///
/// Chaque commande de débit est un aller-retour SYNCHRONE vers le serveur
/// média sur la file du lecteur, et le fil principal attend cette file dès
/// qu'AVFoundation y relit `loadedTimeRanges` (bloc posté par AVFoundation
/// lui-même, sans observateur de l'app). `play()` puis `rate = …` en mettait
/// deux en file : 1 045 ms de gel mesurés sur l'iPhone 18 Pro Max.
final class PlaybackStartRateLawTests: XCTestCase {

    func test_rateToSet_pausedPlayer_setsTheSpeedOnce() {
        XCTAssertEqual(PlaybackStartRateLaw.rateToSet(currentRate: 0, speed: 1), 1)
        XCTAssertEqual(PlaybackStartRateLaw.rateToSet(currentRate: 0, speed: 1.5), 1.5)
    }

    func test_rateToSet_playerAlreadyAtTheSpeed_sendsNothing() {
        XCTAssertNil(PlaybackStartRateLaw.rateToSet(currentRate: 1, speed: 1),
                     "un lecteur adopté qui joue déjà n'a rien à redemander au serveur")
        XCTAssertNil(PlaybackStartRateLaw.rateToSet(currentRate: 1.5, speed: 1.5))
    }

    func test_rateToSet_playerAtAnotherSpeed_setsTheNewSpeed() {
        XCTAssertEqual(PlaybackStartRateLaw.rateToSet(currentRate: 1, speed: 2), 2)
    }
}

@MainActor
final class SharedAVPlayerManagerStartRateCommandTests: XCTestCase {

    private final class ReadyItem: AVPlayerItem {
        override var status: AVPlayerItem.Status { .readyToPlay }
    }

    private final class RateCommandCountingPlayer: AVQueuePlayer {
        private(set) var playCalls = 0
        private(set) var rateSets: [Float] = []

        override func play() {
            playCalls += 1
            super.play()
        }

        override var rate: Float {
            get { super.rate }
            set {
                rateSets.append(newValue)
                super.rate = newValue
            }
        }

        var rateCommands: Int { playCalls + rateSets.count }

        func forgetCommands() {
            playCalls = 0
            rateSets = []
        }
    }

    private func makeSUT(speed: PlaybackSpeed) -> (SharedAVPlayerManager, RateCommandCountingPlayer) {
        let manager = SharedAVPlayerManager.shared
        manager.stop()
        manager.isForceMuted = true
        let item = ReadyItem(url: URL(fileURLWithPath: "/nonexistent/meeshy-17035.mp4"))
        let player = RateCommandCountingPlayer(playerItem: item)
        manager.player = player
        manager.playbackSpeed = speed
        addTeardownBlock { @MainActor in manager.stop() }
        return (manager, player)
    }

    func test_play_pausedPlayerAtNormalSpeed_sendsExactlyOneRateCommand() {
        let (manager, player) = makeSUT(speed: .x1_0)

        manager.play()

        XCTAssertEqual(player.rateCommands, 1,
                       "play() puis rate = … mettait deux SetRate synchrones en file (#17035)")
        XCTAssertEqual(player.rateSets, [1])
    }

    func test_play_pausedPlayerAtChosenSpeed_startsAtThatSpeedInOneCommand() {
        let (manager, player) = makeSUT(speed: .x1_5)

        manager.play()

        XCTAssertEqual(player.rateCommands, 1)
        XCTAssertEqual(player.rateSets, [1.5], "la vitesse choisie reste celle de la lecture")
    }

    func test_play_playerAlreadyPlayingAtTheSpeed_sendsNoRateCommand() {
        let (manager, player) = makeSUT(speed: .x1_0)
        player.rate = 1
        player.forgetCommands()

        manager.play()

        XCTAssertEqual(player.rateCommands, 0,
                       "un lecteur adopté qui joue déjà ne repasse pas par le serveur média")
        XCTAssertTrue(manager.isPlaying)
    }
}
