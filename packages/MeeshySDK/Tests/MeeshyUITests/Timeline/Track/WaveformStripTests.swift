import XCTest
import CoreGraphics
import MeeshySDK
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

    /// Le champ PUBLIÉ (normalisé au pic) se lit en linéaire : 0,1 fait 10 pt,
    /// pas les 67 pt de l'échelle décibel (#9886).
    func test_publishedReading_isLinear() {
        let h = WaveformStrip.barHeights(samples: [0.1], availableHeight: availableHeight,
                                         reading: .published)[0]
        XCTAssertEqual(h, 10, accuracy: 0.01)
    }
    // MARK: - #13597 : une scène de 2 h ne rastérise que la tranche visible

    /// 2 h au zoom 1 : 7 200 s × 50 pt = 360 000 pt de bande. `.drawingGroup()` en faisait UNE texture Metal de
    /// cette largeur ; seule la tranche que la règle monte se dessine désormais, bornée quelle que soit la durée.
    func test_visibleSlice_twoHourStrip_isBoundedByTheRulerWindow() {
        let width: CGFloat = 7_200 * TimelineGeometry.basePixelsPerSecond
        let window = RulerView.visibleWindow(scrollX: 180_000, viewportWidth: 390)

        let slice = WaveformStrip.visibleSlice(width: width, minX: 0, window: window)

        XCTAssertNotNil(slice)
        XCTAssertLessThanOrEqual(slice!.upperBound - slice!.lowerBound, 1_200)
        XCTAssertTrue(slice!.contains(180_000))
    }

    func test_visibleSlice_isInTheStripsOwnCoordinates() {
        let slice = WaveformStrip.visibleSlice(width: 10_000, minX: 2_000, window: 2_500...3_000)

        XCTAssertEqual(slice, 500...1_000)
    }

    func test_visibleSlice_withoutWindow_drawsTheWholeStrip() {
        XCTAssertEqual(WaveformStrip.visibleSlice(width: 320, minX: 0, window: nil), 0...320)
    }

    func test_visibleSlice_offScreenStrip_drawsNothing() {
        XCTAssertNil(WaveformStrip.visibleSlice(width: 1_000, minX: 50_000, window: 0...1_200))
        XCTAssertNil(WaveformStrip.visibleSlice(width: 0, minX: 0, window: nil))
    }

    func test_sampleIndices_onlyTheBarsUnderTheSlice() {
        let indices = WaveformStrip.sampleIndices(count: 128, width: 12_800, slice: 1_000...1_250)

        XCTAssertEqual(indices, 10..<13)
    }

    func test_sampleIndices_wholeStrip_keepsEveryBar() {
        XCTAssertEqual(WaveformStrip.sampleIndices(count: 80, width: 320, slice: 0...320), 0..<80)
        XCTAssertEqual(WaveformStrip.sampleIndices(count: 0, width: 320, slice: 0...320), 0..<0)
    }
}
