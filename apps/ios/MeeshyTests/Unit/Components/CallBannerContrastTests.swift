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

    // MARK: - Aplat indigo calibré (retour user 2026-08-12, second passage) :
    // AUCUN scrim noir — le contraste vient du choix des arrêts du dégradé
    // (bannerTop/bannerBottom) et des teintes d'état recalibrées pour cette
    // surface. Chaque élément est testé contre LES DEUX arrêts — le contenu
    // peut se trouver n'importe où le long de la diagonale du dégradé.

    private var bannerStops: [(name: String, color: Color)] {
        [
            ("bannerTop (indigo600)", CallBannerContrast.bannerTop),
            ("bannerBottom (indigo800)", CallBannerContrast.bannerBottom),
        ]
    }

    func test_bannerStops_areTheDeepIndigoPair() {
        XCTAssertEqual(CallBannerContrast.bannerTop.luminance, MeeshyColors.indigo600.luminance, accuracy: 0.0001,
                       "l'arrêt haut de la bannière doit rester indigo600 — pleinement indigo, jamais noirci")
        XCTAssertEqual(CallBannerContrast.bannerBottom.luminance, MeeshyColors.indigo800.luminance, accuracy: 0.0001,
                       "l'arrêt bas de la bannière doit rester indigo800")
    }

    func test_whiteContent_passesNormalTextThreshold() {
        // Nom du correspondant ET durée d'appel : tous deux blancs (la durée a
        // quitté le vert `success`, 3.3:1 seulement contre l'arrêt haut).
        for bg in bannerStops {
            let ratio = CallBannerContrast.contrastRatio(.white, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 4.5, "texte blanc sur \(bg.name) : \(ratio)")
        }
    }

    func test_connectedSignalGlyph_passesUIComponentThreshold() {
        for bg in bannerStops {
            let ratio = CallBannerContrast.contrastRatio(MeeshyColors.success, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 3.0, "glyphe signal sain (success) sur \(bg.name) : \(ratio)")
        }
    }

    func test_ringingGlyph_passesUIComponentThreshold() {
        for bg in bannerStops {
            let ratio = CallBannerContrast.contrastRatio(MeeshyColors.warning, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 3.0, "glyphe sonnerie (warning) sur \(bg.name) : \(ratio)")
        }
    }

    func test_errorStateTint_passesUIComponentThreshold() {
        // Glyphe reconnexion, micro coupé, barres signal critiques : tous sur
        // errorStateTint (errorSoft) — `MeeshyColors.error` ne tient que
        // 2.27:1 contre l'arrêt haut, d'où la teinte adoucie de surface.
        for bg in bannerStops {
            let ratio = CallBannerContrast.contrastRatio(CallBannerContrast.errorStateTint, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 3.0, "teinte d'état critique (errorSoft) sur \(bg.name) : \(ratio)")
        }
    }

    func test_speakerActiveTint_passesUIComponentThreshold() {
        // `indigo400` ne tient que 2.1:1 contre l'arrêt haut — la bannière
        // utilise indigo200.
        for bg in bannerStops {
            let ratio = CallBannerContrast.contrastRatio(CallBannerContrast.speakerActiveTint, bg.color)
            XCTAssertGreaterThanOrEqual(ratio, 3.0, "haut-parleur actif (indigo200) sur \(bg.name) : \(ratio)")
        }
    }
}
