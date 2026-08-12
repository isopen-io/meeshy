import XCTest
import AVFoundation
@testable import MeeshyUI

/// Reprise de la lecture après une RÉ-ATTACHE de player.
///
/// Test de CARACTÉRISATION, pas de non-régression d'un correctif : l'invariant
/// est déjà tenu par `attachBackgroundPlayer`, qui se termine par
/// `if isPlaybackActive { alignToTimelineThenPlay() }`. Écrit après avoir
/// soupçonné à tort cette ligne d'être absente — le test est resté vert sans
/// elle, ce qui a prouvé le contraire.
///
/// Il est conservé parce que l'invariant est réel et non évident : `configure`
/// est rejoué à chaque `rebuildLayers()` et reconstruit le player dès que
/// l'identité du contenu, la transform, la taille de rendu, le filtre ou la
/// version de contenu changent. Or `isPlaybackActive` valait déjà `true`, et
/// son `didSet` est gardé sur le CHANGEMENT : rien ne relancerait le nouveau
/// player si cette ligne disparaissait. Le symptôme serait exactement « la
/// vidéo de fond joue moins d'une seconde puis se fige ».
///
@MainActor
final class StoryBackgroundLayerReattachTests: XCTestCase {

    /// Un WAV silencieux minimal : `AVPlayer` a besoin d'un item réellement
    /// lisible pour que `play()` porte. Un fichier bidon laisserait `rate`
    /// retomber à 0 et rendrait le test ininterprétable.
    private func makePlayableFile() throws -> URL {
        let sampleRate = 8_000
        let frames = sampleRate / 10          // 100 ms
        let dataBytes = frames * 2            // mono, 16 bits
        var wav = Data()
        func append(_ string: String) { wav.append(contentsOf: Array(string.utf8)) }
        func append32(_ value: Int) { withUnsafeBytes(of: UInt32(value).littleEndian) { wav.append(contentsOf: $0) } }
        func append16(_ value: Int) { withUnsafeBytes(of: UInt16(value).littleEndian) { wav.append(contentsOf: $0) } }

        append("RIFF"); append32(36 + dataBytes); append("WAVE")
        append("fmt "); append32(16); append16(1); append16(1)
        append32(sampleRate); append32(sampleRate * 2); append16(2); append16(16)
        append("data"); append32(dataBytes)
        wav.append(Data(repeating: 0, count: dataBytes))

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("bg-reattach-\(UUID().uuidString).wav")
        try wav.write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    /// La lecture est déjà active et le player est remplacé : le nouveau doit
    /// repartir de lui-même.
    ///
    /// `looping: false` délibérément — un `AVPlayerLooper` enqueue ses copies de
    /// façon asynchrone, donc `rate` n'y est pas déterministe au retour de la
    /// méthode. Le défaut, lui, est identique dans les deux cas : il porte sur
    /// la ré-attache, pas sur le mode de bouclage.
    func test_reattachingWhilePlaybackIsActive_startsTheNewPlayer() throws {
        let layer = StoryBackgroundLayer()
        let url = try makePlayableFile()

        // Première attache + lecture, comme au premier `rebuildLayers()`.
        layer.attachBackgroundPlayer(url: url, looping: false, mute: true)
        layer.isPlaybackActive = true
        XCTAssertEqual(layer.avPlayer?.rate, 1.0, "précondition : le premier player joue")

        // Second `rebuildLayers()` : identité/géométrie/version modifiées →
        // player NEUF. `isPlaybackActive` reste `true` et n'émet donc rien.
        layer.attachBackgroundPlayer(url: url, looping: false, mute: true)

        XCTAssertEqual(
            layer.avPlayer?.rate, 1.0,
            "Le player ré-attaché doit repartir : retirer le "
            + "`if isPlaybackActive { alignToTimelineThenPlay() }` final de "
            + "`attachBackgroundPlayer` figerait le fond sur sa première frame."
        )
    }

    /// Symétrique — ne pas jouer ce qui ne doit pas jouer. Le prefetcher
    /// hors-écran attache des players sans jamais lever `isPlaybackActive` ;
    /// démarrer à l'attache gaspillerait le décodeur et ferait du son.
    func test_reattachingWhilePlaybackIsInactive_leavesThePlayerPaused() throws {
        let layer = StoryBackgroundLayer()
        let url = try makePlayableFile()

        layer.attachBackgroundPlayer(url: url, looping: false, mute: true)

        XCTAssertEqual(layer.avPlayer?.rate, 0,
                       "Sans lecture active, une attache ne doit rien démarrer")
    }
}
