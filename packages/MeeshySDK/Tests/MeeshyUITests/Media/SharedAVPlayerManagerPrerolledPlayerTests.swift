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
