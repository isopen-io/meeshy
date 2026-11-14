import Foundation
import SwiftUI
import Testing
@testable import MeeshyUI

/// **La bulle vocale porte sa durée au début de l'onde et son avancement
/// « temps lu · pourcentage » à la fin, sur l'onde** (#18421, directive porteur
/// du 2026-11-14). La loi des libellés est pure ; les vues la composent.
@Suite("AudioWaveformChips")
struct AudioWaveformChipsTests {

    private let fr = Locale(identifier: "fr_FR")
    private let en = Locale(identifier: "en_US")

    // MARK: - Le libellé d'avancement

    @Test("temps lu, point médian, pourcentage — formaté par la locale")
    func progressLabel_readsElapsedThenPercent() {
        let english = AudioWaveformChipLaw.progressLabel(elapsed: 12, fraction: 0.45, locale: en)
        #expect(english == "0:12 · 45%")

        let french = AudioWaveformChipLaw.progressLabel(elapsed: 12, fraction: 0.45, locale: fr)
        #expect(french.hasPrefix("0:12 · 45"))
        #expect(french.hasSuffix("%"))
    }

    @Test("le pourcentage est borné à 0…100 et tronqué à l'entier")
    func percentage_isBoundedAndTruncated() {
        #expect(AudioWaveformChipLaw.percentage(-0.3) == 0)
        #expect(AudioWaveformChipLaw.percentage(1.7) == 100)
        #expect(AudioWaveformChipLaw.percentage(0.999) == 99)
        #expect(AudioWaveformChipLaw.percentage(.nan) == 0)
        #expect(AudioWaveformChipLaw.progressLabel(elapsed: 0, fraction: .infinity, locale: en) == "0:00 · 100%")
    }

    @Test("une lecture finie dit 100 % et sa durée")
    func progressLabel_atTheEnd() {
        #expect(AudioWaveformChipLaw.progressLabel(elapsed: 65, fraction: 1, locale: en) == "1:05 · 100%")
    }

    // MARK: - Le libellé de durée

    @Test("la durée se lit en horloge, et se tait quand elle est inconnue")
    func durationLabel_clockOrSilence() {
        #expect(AudioWaveformChipLaw.durationLabel(total: 65, locale: en) == "1:05")
        #expect(AudioWaveformChipLaw.durationLabel(total: 0, locale: en) == nil)
        #expect(AudioWaveformChipLaw.durationLabel(total: -3, locale: en) == nil)
        #expect(AudioWaveformChipLaw.durationLabel(total: .nan, locale: en) == nil)
    }

    // MARK: - Les vues sont des valeurs

    @Test("l'overlay se compare sur ses valeurs, et sur la présence de l'affordance plein écran")
    @MainActor
    func overlay_equality() {
        let a = AudioWaveformChipsOverlay(total: 60, elapsed: 12, fraction: 0.2, isLive: true, isCompact: false, accent: .blue, onProgressTap: nil)
        let b = AudioWaveformChipsOverlay(total: 60, elapsed: 12, fraction: 0.2, isLive: true, isCompact: false, accent: .blue, onProgressTap: nil)
        let moved = AudioWaveformChipsOverlay(total: 60, elapsed: 13, fraction: 0.21, isLive: true, isCompact: false, accent: .blue, onProgressTap: nil)
        let tappable = AudioWaveformChipsOverlay(total: 60, elapsed: 12, fraction: 0.2, isLive: true, isCompact: false, accent: .blue, onProgressTap: {})
        #expect(a == b)
        #expect(a != moved)
        #expect(a != tappable)
    }

    @Test("une puce est une valeur : même texte, même tenue ⇒ égale")
    @MainActor
    func chip_equality() {
        #expect(AudioWaveformChip(text: "0:12 · 45%", isEmphasized: true, isCompact: false, accent: .blue)
            == AudioWaveformChip(text: "0:12 · 45%", isEmphasized: true, isCompact: false, accent: .blue))
        #expect(AudioWaveformChip(text: "0:12 · 45%", isEmphasized: true, isCompact: false, accent: .blue)
            != AudioWaveformChip(text: "0:12 · 45%", isEmphasized: false, isCompact: false, accent: .blue))
    }

    // MARK: - Le lecteur compose le kit

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }

    @Test("les puces vivent SUR l'onde, les temps ne vivent plus dessous")
    func player_mountsChipsOnTheWaveform() throws {
        let player = try source("Sources/MeeshyUI/Media/AudioPlayerView.swift")
        #expect(player.contains(".overlay { waveformChips }"))
        #expect(!player.contains("var timeRow"))
        #expect(!player.contains("AudioPlayerChipsColumn"))
    }

    @Test("la commande de lecture est le bouton rond du kit, l'attente son anneau")
    func playControl_composesTheKit() throws {
        let control = try source("Sources/MeeshyUI/Media/AudioPlayerPlayControl.swift")
        #expect(control.contains("MeeshyGlassButton("))
        #expect(control.contains("MeeshyProgressRing("))
        #expect(control.contains("haptic: .none"), "l'hôte joue l'haptique, le bouton ne la double pas")
        #expect(!control.contains("LinearGradient"), "plus de disque dégradé maison")
    }
}
