import Foundation
import Testing
@testable import MeeshyUI

/// **L'onde se lit grande, la puce vit sous elle** (#18526).
@Suite("AudioWaveformStripLayout")
struct AudioWaveformStripLayoutTests {

    @Test("deux bandes qui font le ruban : les barres en haut, la puce en bas, sans recouvrement")
    func bands_partitionTheStrip() {
        #expect(AudioWaveformStripLayout.barsHeight + AudioWaveformStripLayout.chipBandHeight == AudioWaveformStripLayout.stripHeight)
        #expect(AudioWaveformStripLayout.chipBandHeight >= 16, "une puce de verre fait au moins 16 pt")
        #expect(AudioWaveformStripLayout.barMaxHeight <= AudioWaveformStripLayout.barsHeight)
    }

    @Test("le ruban est plus grand que l'ancien (24 pt) et les barres plus hautes (22 pt)")
    func strip_isAmplified() {
        #expect(AudioWaveformStripLayout.stripHeight > 24)
        #expect(AudioWaveformStripLayout.barMaxHeight > 22)
    }

    @Test("la courbe relève les passages calmes : 25 % d'amplitude donne la moitié de la hauteur")
    func barHeight_curveIsPronounced() {
        let quarter = AudioWaveformStripLayout.barHeight(normalized: 0.25)
        #expect(abs(quarter - AudioWaveformStripLayout.barMaxHeight * 0.5) < 0.01)
        #expect(AudioWaveformStripLayout.barHeight(normalized: 1) == AudioWaveformStripLayout.barMaxHeight)
        #expect(AudioWaveformStripLayout.barHeight(normalized: 0) == AudioWaveformStripLayout.barMinHeight)
    }

    @Test("une amplitude hors bornes ou NaN reste dans le ruban")
    func barHeight_isClamped() {
        #expect(AudioWaveformStripLayout.barHeight(normalized: 7) == AudioWaveformStripLayout.barMaxHeight)
        #expect(AudioWaveformStripLayout.barHeight(normalized: -1) == AudioWaveformStripLayout.barMinHeight)
        #expect(AudioWaveformStripLayout.barHeight(normalized: .nan) == AudioWaveformStripLayout.barMinHeight)
        for i in 0..<96 {
            let h = AudioWaveformStripLayout.placeholderHeight(index: i)
            #expect(h >= AudioWaveformStripLayout.barMinHeight && h <= AudioWaveformStripLayout.barMaxHeight)
        }
    }

    @Test("la vue compose la loi : barres en bande haute, puce en bas à gauche")
    func player_composesTheLayout() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let player = try String(contentsOf: root.appendingPathComponent("Sources/MeeshyUI/Media/AudioPlayerView.swift"), encoding: .utf8)
        #expect(player.contains("AudioWaveformStripLayout.stripHeight"))
        #expect(player.contains("AudioWaveformStripLayout.barsHeight"))
        #expect(player.contains(".overlay(alignment: .bottomLeading) { waveformChips }"))
        #expect(!player.contains("frame(height: 24)"))
        #expect(!player.contains("pow(normalized, 0.65)"))
    }
}
