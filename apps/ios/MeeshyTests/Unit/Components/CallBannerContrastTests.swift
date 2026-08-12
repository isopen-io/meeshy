import XCTest
import SwiftUI
@testable import Meeshy
import MeeshyUI

final class CallBannerContrastTests: XCTestCase {

    // MARK: - contrastRatio: cas de référence connus

    func test_contrastRatio_blackAndWhite_is21to1() {
        XCTAssertEqual(CallBannerContrast.contrastRatio(.black, .white), 21.0, accuracy: 0.01)
    }

    func test_contrastRatio_sameColor_is1to1() {
        XCTAssertEqual(CallBannerContrast.contrastRatio(MeeshyColors.indigo500, MeeshyColors.indigo500), 1.0, accuracy: 0.01)
    }

    func test_contrastRatio_isSymmetric() {
        let a = CallBannerContrast.contrastRatio(.white, MeeshyColors.indigo500)
        let b = CallBannerContrast.contrastRatio(MeeshyColors.indigo500, .white)
        XCTAssertEqual(a, b, accuracy: 0.001)
    }

    // MARK: - scrimmed: composition alpha correcte

    func test_scrimmed_zeroOpacity_returnsSameColor() {
        let result = CallBannerContrast.scrimmed(MeeshyColors.indigo500, scrimOpacity: 0)
        XCTAssertEqual(result.luminance, MeeshyColors.indigo500.luminance, accuracy: 0.001)
    }

    func test_scrimmed_fullOpacity_returnsBlack() {
        let result = CallBannerContrast.scrimmed(MeeshyColors.indigo500, scrimOpacity: 1)
        XCTAssertEqual(result.luminance, Color.black.luminance, accuracy: 0.001)
    }

    func test_scrimmed_darkensProgressively() {
        let light = CallBannerContrast.scrimmed(MeeshyColors.indigo500, scrimOpacity: 0.1)
        let dark = CallBannerContrast.scrimmed(MeeshyColors.indigo500, scrimOpacity: 0.5)
        XCTAssertLessThan(dark.luminance, light.luminance)
    }

    // MARK: - Le scrim calibré (CallBannerContrast.scrimOpacity) fait passer
    // TOUS les éléments de la bannière d'appel, contre LES DEUX arrêts du
    // dégradé (indigo500 clair, indigo700 foncé) — le texte peut se trouver
    // n'importe où le long de la diagonale du dégradé.

    private let backgrounds: [(name: String, color: Color)] = [
        ("indigo500", MeeshyColors.indigo500),
        ("indigo700", MeeshyColors.indigo700),
    ]

    private func scrimmedBackgrounds() -> [(name: String, color: Color)] {
        backgrounds.map { ($0.name, CallBannerContrast.scrimmed($0.color, scrimOpacity: CallBannerContrast.scrimOpacity)) }
    }

    func test_scrimCalibration_whiteName_passesNormalTextThreshold() {
        for bg in scrimmedBackgrounds() {
            let ratio = CallBannerContrast.contrastRatio(.white, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 4.5, "nom (blanc) sur \(bg.name) scrimmé : \(ratio)")
        }
    }

    func test_scrimCalibration_callDuration_passesNormalTextThreshold() {
        for bg in scrimmedBackgrounds() {
            let ratio = CallBannerContrast.contrastRatio(MeeshyColors.success, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 4.5, "durée (success) sur \(bg.name) scrimmé : \(ratio)")
        }
    }

    func test_scrimCalibration_ringingGlyph_passesUIComponentThreshold() {
        for bg in scrimmedBackgrounds() {
            let ratio = CallBannerContrast.contrastRatio(MeeshyColors.warning, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 3.0, "glyphe sonnerie (warning) sur \(bg.name) scrimmé : \(ratio)")
        }
    }

    func test_scrimCalibration_reconnectingGlyph_passesUIComponentThreshold() {
        for bg in scrimmedBackgrounds() {
            let ratio = CallBannerContrast.contrastRatio(MeeshyColors.error, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 3.0, "glyphe reconnexion (error) sur \(bg.name) scrimmé : \(ratio)")
        }
    }

    func test_scrimCalibration_activeSpeaker_passesUIComponentThreshold() {
        for bg in scrimmedBackgrounds() {
            let ratio = CallBannerContrast.contrastRatio(MeeshyColors.indigo400, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 3.0, "haut-parleur actif (indigo400) sur \(bg.name) scrimmé : \(ratio)")
        }
    }
}
