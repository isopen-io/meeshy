import XCTest
@testable import MeeshyUI

/// Largeur de la forme d'onde de la cellule audio du composer.
///
/// Symptôme : ajouter un son « détruit le visuel » du panneau — les chips
/// d'outils débordent SYMÉTRIQUEMENT à gauche et à droite.
///
/// Ce n'est pas un défaut de scroll, c'est un débordement de largeur. Les
/// barres sont posées à largeur FIXE (2 pt + 1,5 pt d'espace) dans un `HStack`
/// sans borne : la largeur intrinsèque vaut donc `n × 3,5 pt`. Or
/// `AudioWaveformAnalyzer.analyze` produit **120 barres** par défaut, soit
/// ~418 pt, quand la cellule n'en a qu'environ 144 de disponibles. La cellule
/// gonfle, le `VStack` du panneau adopte sa largeur, et les rangées de chips —
/// centrées dans ce conteneur trop large — débordent des deux côtés.
///
/// Le déclencheur exact du « ça casse quand j'ajoute » : le repli
/// (`generateFallback(count: 40)`) tient, lui, dans la largeur. La cellule est
/// donc correcte à l'affichage initial et explose quand l'analyse réelle la
/// remplace, une fraction de seconde plus tard.
@MainActor
final class StoryAudioCellWaveformTests: XCTestCase {

    // MARK: - Bornage

    func test_displayedSamples_neverExceedsTheBarBudget() {
        let analyzed = (0..<120).map { Float($0) / 120 }
        XCTAssertEqual(
            StoryAudioCell.displayedSamples(analyzed).count,
            StoryAudioCell.maxWaveformBars,
            "120 barres — la valeur par défaut de l'analyseur — doivent être "
            + "ramenées au budget de la cellule."
        )
    }

    /// La borne n'est pas un chiffre rond choisi au hasard : elle doit tenir
    /// dans la largeur réellement disponible une fois retirés le bouton play,
    /// la durée, l'icône de volume, le slider et la corbeille.
    func test_barBudget_fitsTheAvailableWidth() {
        let bars = CGFloat(StoryAudioCell.maxWaveformBars)
        let intrinsic = bars * StoryAudioCell.waveformBarWidth
            + (bars - 1) * StoryAudioCell.waveformBarSpacing
        XCTAssertLessThanOrEqual(
            intrinsic, 140,
            "La forme d'onde doit tenir dans l'espace laissé par les contrôles "
            + "de la cellule sur la plus étroite des largeurs d'iPhone."
        )
    }

    /// Cohérence repli / analyse : les deux sources doivent produire une
    /// cellule de MÊME largeur, sinon elle change de taille sous l'œil de
    /// l'utilisateur quand l'analyse aboutit.
    func test_fallbackAndAnalyzedWaveforms_yieldTheSameWidth() {
        let fallback = AudioWaveformAnalyzer.generateFallback(count: 40)
        let analyzed = (0..<120).map { _ in Float.random(in: 0...1) }
        XCTAssertEqual(
            StoryAudioCell.displayedSamples(fallback).count,
            StoryAudioCell.displayedSamples(analyzed).count
        )
    }

    // MARK: - Fidélité

    /// Sous-échantillonner par le MAXIMUM de chaque paquet, pas en piochant un
    /// échantillon : une crête isolée est ce qui donne son relief à la forme
    /// d'onde ; l'échantillonnage par saut la perd une fois sur trois.
    func test_downsampling_preservesPeaks() {
        var samples = [Float](repeating: 0.1, count: 120)
        samples[77] = 1.0
        XCTAssertEqual(
            StoryAudioCell.displayedSamples(samples).max(), 1.0,
            "La crête doit survivre au sous-échantillonnage"
        )
    }

    func test_displayedSamples_shorterThanTheBudget_arePassedThrough() {
        let short: [Float] = [0.2, 0.9, 0.4]
        XCTAssertEqual(StoryAudioCell.displayedSamples(short), short)
    }

    func test_displayedSamples_empty_staysEmpty() {
        XCTAssertTrue(StoryAudioCell.displayedSamples([]).isEmpty)
    }
}
