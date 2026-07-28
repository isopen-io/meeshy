import XCTest
import CoreGraphics
@testable import MeeshyUI

/// La bande de forme d'onde est partagée par les pistes audio et vidéo. On
/// teste la géométrie qu'elle produit, sans monter la vue.
final class WaveformStripTests: XCTestCase {

    /// Hauteur de piste réaliste : 52 pt de lane moins la marge intérieure.
    private let availableHeight: CGFloat = 106   // 100 pt utiles après le retrait de 6

    func test_noSamples_yieldsNoBars() {
        XCTAssertTrue(WaveformStrip.barHeights(samples: [],
                                               availableHeight: availableHeight).isEmpty)
    }

    /// Le point qui justifie ce composant : les échantillons stockés sont des
    /// RMS LINÉAIRES, et c'est ici — et nulle part ailleurs — que l'échelle dB
    /// s'applique. Rendus tels quels, la plupart des contenus (0,05 à 0,3)
    /// dessineraient une bande quasi vide alors que la mesure est juste.
    func test_appliesDecibelScale_notRawAmplitude() {
        let h = WaveformStrip.barHeights(samples: [0.1], availableHeight: availableHeight)[0]

        // 0,1 en amplitude = -20 dB, soit 2/3 de la plage sur un plancher
        // à -60 dB. En linéaire la barre ferait 10 pt : illisible.
        XCTAssertEqual(h, 66.67, accuracy: 0.5,
                       "L'échelle dB doit être appliquée — 10 pt signifierait un rendu linéaire")
    }

    func test_fullScaleSampleFillsTheAvailableHeight() {
        let h = WaveformStrip.barHeights(samples: [1.0], availableHeight: availableHeight)[0]
        XCTAssertEqual(h, 100, accuracy: 0.01)
    }

    /// Un gain saturé ne doit pas déborder de la piste.
    func test_sampleAboveFullScaleIsClamped() {
        let h = WaveformStrip.barHeights(samples: [1.8], availableHeight: availableHeight)[0]
        XCTAssertEqual(h, 100, accuracy: 0.01)
    }

    /// Le silence garde un trait minimal : une piste vide se distingue ainsi
    /// d'une piste dont la forme d'onde n'a pas encore été calculée.
    func test_silenceKeepsAMinimalBar() {
        let h = WaveformStrip.barHeights(samples: [0], availableHeight: availableHeight)[0]
        XCTAssertEqual(h, 2, accuracy: 0.01)
    }

    /// L'ordre relatif est ce qui rend la bande exploitable pour régler un
    /// volume : plus fort doit être plus haut.
    func test_louderSamplesAreTaller() {
        let heights = WaveformStrip.barHeights(samples: [0.05, 0.2, 0.8],
                                               availableHeight: availableHeight)
        XCTAssertLessThan(heights[0], heights[1])
        XCTAssertLessThan(heights[1], heights[2])
    }

    /// Une piste très basse ne doit pas produire de hauteur négative.
    func test_tinyLaneNeverProducesNegativeHeights() {
        let heights = WaveformStrip.barHeights(samples: [0.5, 1.0], availableHeight: 4)
        XCTAssertTrue(heights.allSatisfy { $0 >= 0 }, "hauteurs = \(heights)")
    }
}
