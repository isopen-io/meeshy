import Foundation
import SwiftUI
import Testing
@testable import MeeshyUI

/// **La bulle vocale porte UNE puce au début de l'onde : la durée au repos, le
/// décompte suivi du pourcentage en lecture, séparés d'une espace** (#18421,
/// directives porteur du 2026-11-14). La loi des libellés est pure ; les vues
/// la composent.
@Suite("AudioWaveformChips")
struct AudioWaveformChipsTests {

    private let fr = Locale(identifier: "fr_FR")
    private let en = Locale(identifier: "en_US")

    // MARK: - Le libellé de décompte

    @Test("en lecture : le temps qui reste, une espace, le pourcentage — aucun compteur de temps lu")
    func countdownLabel_readsRemainingThenPercent() {
        let english = AudioWaveformChipLaw.countdownLabel(total: 60, elapsed: 12, fraction: 0.2, locale: en)
        #expect(english == "0:48 20%")
        #expect(!english.contains("·"))

        let french = AudioWaveformChipLaw.countdownLabel(total: 60, elapsed: 12, fraction: 0.2, locale: fr)
        #expect(french.hasPrefix("0:48 20"))
        #expect(french.hasSuffix("%"))
    }

    @Test("le pourcentage est borné à 0…100 et tronqué à l'entier")
    func percentage_isBoundedAndTruncated() {
        #expect(AudioWaveformChipLaw.percentage(-0.3) == 0)
        #expect(AudioWaveformChipLaw.percentage(1.7) == 100)
        #expect(AudioWaveformChipLaw.percentage(0.999) == 99)
        #expect(AudioWaveformChipLaw.percentage(.nan) == 0)
        #expect(AudioWaveformChipLaw.countdownLabel(total: 10, elapsed: 0, fraction: .infinity, locale: en) == "0:10 100%")
    }

    @Test("le reste ne descend jamais sous zéro, et une durée inconnue rend zéro")
    func remaining_isClamped() {
        #expect(AudioWaveformChipLaw.remaining(total: 65, elapsed: 65) == 0)
        #expect(AudioWaveformChipLaw.remaining(total: 65, elapsed: 80) == 0)
        #expect(AudioWaveformChipLaw.remaining(total: 65, elapsed: -3) == 65)
        #expect(AudioWaveformChipLaw.remaining(total: .nan, elapsed: 3) == 0)
    }

    @Test("une lecture finie dit 0:00 et 100 %")
    func countdownLabel_atTheEnd() {
        #expect(AudioWaveformChipLaw.countdownLabel(total: 65, elapsed: 65, fraction: 1, locale: en) == "0:00 100%")
    }

    @Test("la puce dit la durée au repos et décompte dès qu'un avancement existe")
    func label_restThenCountdown() {
        #expect(AudioWaveformChipLaw.label(total: 65, elapsed: 0, fraction: 0, locale: en) == "1:05")
        #expect(AudioWaveformChipLaw.label(total: 65, elapsed: 5, fraction: 5.0 / 65, locale: en) == "1:00 7%")
        #expect(AudioWaveformChipLaw.label(total: 0, elapsed: 0, fraction: 0, locale: en) == nil)
        #expect(!AudioWaveformChipLaw.isCountingDown(elapsed: 0, fraction: .nan))
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
        #expect(AudioWaveformChip(text: "0:48 20%", isEmphasized: true, isCompact: false, accent: .blue)
            == AudioWaveformChip(text: "0:48 20%", isEmphasized: true, isCompact: false, accent: .blue))
        #expect(AudioWaveformChip(text: "0:48 20%", isEmphasized: true, isCompact: false, accent: .blue)
            != AudioWaveformChip(text: "0:48 20%", isEmphasized: false, isCompact: false, accent: .blue))
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
        #expect(player.contains(".overlay(alignment: .bottomLeading) { waveformChips }"), "la puce vit dans la bande basse du ruban (#18526)")
        #expect(!player.contains("var timeRow"))
        #expect(!player.contains("AudioPlayerChipsColumn"))
    }

    @Test("aucun compteur de temps lu : la vue ne compose que la loi, et la loi ne connaît pas le point médian")
    func overlay_hasNoElapsedCounter() throws {
        let chips = try source("Sources/MeeshyUI/Media/AudioWaveformChips.swift")
        #expect(!chips.contains("progressLabel("))
        #expect(!chips.contains("\" · \""))
        #expect(AudioWaveformChipLaw.separator == " ")
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
