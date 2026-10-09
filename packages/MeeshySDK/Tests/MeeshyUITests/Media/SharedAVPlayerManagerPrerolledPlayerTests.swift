import AVFoundation
import XCTest
@testable import MeeshyUI

/// **Le moteur vidéo partagé et ses lecteurs préparés (#9702).**
///
/// Trois défauts du passage de réel à réel, chacun tenu par une règle pure :
/// - le lecteur préparé était adopté même construit sur l'URL DISTANTE alors
///   que le fichier était sur le disque (streaming + double téléchargement) ;
/// - le lecteur sortant était DÉTRUIT, si bien qu'un retour en arrière
///   repartait à froid ;
/// - la boucle passait par `seek(0)` + `play()`, et `play()` réactivait la
///   session audio à chaque tour — un trou visible et audible.
final class SharedAVPlayerManagerPrerolledPlayerTests: XCTestCase {

    // MARK: - (a) Le fichier d'abord

    func test_mayAdopt_aPlayerReadingTheLocalFile() {
        XCTAssertTrue(SharedAVPlayerManager.mayAdoptPrerolledPlayer(playsLocalFile: true, localFileOnDisk: true))
    }

    func test_mayNotAdopt_aStreamingPlayerWhenTheFileIsOnDisk() {
        XCTAssertFalse(
            SharedAVPlayerManager.mayAdoptPrerolledPlayer(playsLocalFile: false, localFileOnDisk: true),
            "le fichier est là : un lecteur préparé sur le réseau le re-téléchargerait")
    }

    func test_mayAdopt_aStreamingPlayerWhenNoFileExists() {
        XCTAssertTrue(SharedAVPlayerManager.mayAdoptPrerolledPlayer(playsLocalFile: false, localFileOnDisk: false))
    }

    // MARK: - (b) Le lecteur sortant revient au pool

    func test_mayRecycle_onlyAReadyPlayerReadingTheFile() {
        XCTAssertTrue(SharedAVPlayerManager.mayRecycleOutgoingPlayer(isReadyToPlay: true, playsLocalFile: true))
        XCTAssertFalse(SharedAVPlayerManager.mayRecycleOutgoingPlayer(isReadyToPlay: false, playsLocalFile: true))
        XCTAssertFalse(SharedAVPlayerManager.mayRecycleOutgoingPlayer(isReadyToPlay: true, playsLocalFile: false))
    }

    // MARK: - (d) La boucle sans couture

    func test_actionAtItemEnd_looping_keepsThePlayerRunning() {
        XCTAssertEqual(SharedAVPlayerManager.actionAtItemEnd(looping: true), AVPlayer.ActionAtItemEnd.none)
    }

    func test_actionAtItemEnd_notLooping_pausesAndNeverAdvances() {
        XCTAssertEqual(
            SharedAVPlayerManager.actionAtItemEnd(looping: false), AVPlayer.ActionAtItemEnd.pause,
            "`.advance` viderait la file d'un AVQueuePlayer préparé : la boucle suivante n'aurait plus d'élément")
    }

    @MainActor
    func test_shouldLoop_isAppliedToTheLoadedPlayer() {
        let manager = SharedAVPlayerManager.shared
        manager.stop()
        let player = AVPlayer()
        manager.player = player

        manager.shouldLoop = true
        XCTAssertEqual(player.actionAtItemEnd, AVPlayer.ActionAtItemEnd.none)

        manager.shouldLoop = false
        XCTAssertEqual(player.actionAtItemEnd, AVPlayer.ActionAtItemEnd.pause)
        manager.stop()
    }

    func test_actionAtItemEnd_loopingWithAQueuedSuccessor_advancesWithoutSeam() {
        XCTAssertEqual(
            SharedAVPlayerManager.actionAtItemEnd(looping: true, successorQueued: true),
            AVPlayer.ActionAtItemEnd.advance)
        XCTAssertEqual(
            SharedAVPlayerManager.actionAtItemEnd(looping: false, successorQueued: true),
            AVPlayer.ActionAtItemEnd.pause)
    }

    /// Recette du 2026-10-09 (#9702) : un média de 8,00 s bouclait en 8,10 à
    /// 8,13 s — le retour au début par `seek`. La boucle met en file un
    /// successeur du même média, que la file enchaîne d'elle-même.
    @MainActor
    func test_shouldLoop_onAQueuePlayer_queuesOneSuccessorOfTheSameAsset() throws {
        let manager = SharedAVPlayerManager.shared
        manager.stop()
        let item = AVPlayerItem(url: URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("reel-loop.mp4"))
        let queue = AVQueuePlayer(playerItem: item)
        manager.player = queue

        manager.shouldLoop = true
        manager.shouldLoop = true
        XCTAssertEqual(queue.items().count, 2, "un seul successeur, même réaffirmé à chaque passe")
        XCTAssertTrue(queue.items().first === item, "l'élément déjà préparé reste en tête : rien n'est rechargé")
        let successor = try XCTUnwrap(queue.items().last)
        XCTAssertEqual((successor.asset as? AVURLAsset)?.url, (item.asset as? AVURLAsset)?.url)
        XCTAssertEqual(queue.actionAtItemEnd, AVPlayer.ActionAtItemEnd.advance)

        manager.shouldLoop = false
        XCTAssertEqual(queue.items().count, 1, "sans boucle, la file ne garde que l'élément en cours")
        XCTAssertEqual(queue.actionAtItemEnd, AVPlayer.ActionAtItemEnd.pause)
        manager.player = nil
        manager.stop()
    }

    // MARK: - (e) Le lecteur rendu au pool est préroulé

    func test_mayPrerollRecycledPlayer_onlyAnIdleReadyPlayer() {
        XCTAssertTrue(SharedAVPlayerManager.mayPrerollRecycledPlayer(rate: 0, isReadyToPlay: true))
        XCTAssertFalse(
            SharedAVPlayerManager.mayPrerollRecycledPlayer(rate: 1, isReadyToPlay: true),
            "repris entre-temps, il joue : `preroll` lèverait une exception")
        XCTAssertFalse(
            SharedAVPlayerManager.mayPrerollRecycledPlayer(rate: 0, isReadyToPlay: false),
            "évincé du pool, il n'a plus d'élément prêt")
    }

    /// La boucle ne rappelle plus `play()` — donc plus la session audio.
    func test_theLoopBranch_doesNotCallPlay() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent("Sources/MeeshyUI/Media/SharedAVPlayerManager.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        let start = try XCTUnwrap(source.range(of: "if self.shouldLoop {"))
        let end = try XCTUnwrap(source.range(of: "} else {", range: start.upperBound..<source.endIndex))
        let loopBranch = source[start.upperBound..<end.lowerBound]
            .components(separatedBy: .newlines)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .joined(separator: "\n")
        XCTAssertFalse(loopBranch.contains("self.play()"),
                       "chaque tour de boucle réactivait la session audio sur le fil principal")
    }
}
