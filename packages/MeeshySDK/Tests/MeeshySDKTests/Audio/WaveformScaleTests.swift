import XCTest
@testable import MeeshySDK

/// UNE échelle d'affichage pour la mesure (RMS absolu), UNE pour le champ publié
/// (crête-normalisé) — et jamais l'une sur les données de l'autre.
final class WaveformScaleTests: XCTestCase {

    // MARK: - La mesure : échelle décibel

    func test_displayHeight_usesDecibelScale() {
        let low = WaveformScale.displayHeight(rms: 0.05)
        XCTAssertGreaterThan(low, 0.4, "0,05 de RMS est un signal audible : il ne doit pas paraître vide")
        XCTAssertLessThan(low, 0.8)
    }

    func test_displayHeight_silenceStaysAtFloor() {
        XCTAssertEqual(WaveformScale.displayHeight(rms: 0), 0, accuracy: 0.0001)
    }

    func test_displayHeight_nominalReachesTop() {
        XCTAssertEqual(WaveformScale.displayHeight(rms: 1.0), 1.0, accuracy: 0.01)
        XCTAssertEqual(WaveformScale.displayHeight(rms: 3.0), 1.0, accuracy: 0.01)
    }

    func test_displayHeight_isMonotonic() {
        let a = WaveformScale.displayHeight(rms: 0.02)
        let b = WaveformScale.displayHeight(rms: 0.2)
        let c = WaveformScale.displayHeight(rms: 0.8)
        XCTAssertLessThan(a, b)
        XCTAssertLessThan(b, c)
    }

    // MARK: - Paliers de résolution

    func test_bucketCount_isQuantisedIntoStableTiers() {
        XCTAssertEqual(WaveformScale.bucketCount(forWidth: 300, scale: 3),
                       WaveformScale.bucketCount(forWidth: 310, scale: 3))
        XCTAssertNotEqual(WaveformScale.bucketCount(forWidth: 100, scale: 1),
                          WaveformScale.bucketCount(forWidth: 3000, scale: 3))
    }

    func test_bucketCount_isBounded() {
        XCTAssertGreaterThanOrEqual(WaveformScale.bucketCount(forWidth: 1, scale: 1), 128)
        XCTAssertLessThanOrEqual(WaveformScale.bucketCount(forWidth: 100_000, scale: 3), 2048)
    }

    // MARK: - Le champ publié : crête-normalisé, linéaire

    func test_peakNormalized_scalesThePeakToOne_andKeepsTheProportions() {
        let out = WaveformScale.peakNormalized([0.1, 0.4, 0.2])
        XCTAssertEqual(out[1], 1.0, accuracy: 0.001)
        XCTAssertEqual(out[0], 0.25, accuracy: 0.001)
        XCTAssertEqual(out[2], 0.5, accuracy: 0.001)
    }

    func test_peakNormalized_silence_staysZero_noNoiseAmplification() {
        XCTAssertEqual(WaveformScale.peakNormalized([0, 0.00001, 0]), [0, 0, 0])
        XCTAssertEqual(WaveformScale.peakNormalized([]), [])
    }

    func test_publishedHeight_isLinearAndClamped() {
        XCTAssertEqual(WaveformScale.publishedHeight(0.3), 0.3, accuracy: 0.0001,
                       "le champ publié est déjà normalisé : pas de seconde échelle par-dessus")
        XCTAssertEqual(WaveformScale.publishedHeight(1.7), 1, accuracy: 0.0001)
        XCTAssertEqual(WaveformScale.publishedHeight(-0.2), 0, accuracy: 0.0001)
    }
}
