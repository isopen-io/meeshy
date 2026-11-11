import XCTest
import SwiftUI
@testable import MeeshyUI

/// Témoins de comportement de K09 (`MeeshyProgressRing`) : la recette en valeurs,
/// la valeur dite et la garde de source. Les vecteurs de parité sont ceux de
/// `docs/product/kit/K09-MeeshyProgressRing.vectors.json`.
final class MeeshyProgressRingTests: XCTestCase {

    private func recipe(progress: Double?,
                        diameter: CGFloat = 44,
                        sweeps: Bool = false,
                        showsPercent: Bool = true,
                        hasCenter: Bool = false,
                        tone: MeeshyGlassTone? = nil,
                        reduceMotion: Bool = false,
                        increasedContrast: Bool = false) -> MeeshyProgressRingRecipe {
        MeeshyProgressRingRecipe.resolve(progress: progress,
                                         diameter: diameter,
                                         sweeps: sweeps,
                                         showsPercent: showsPercent,
                                         hasCenter: hasCenter,
                                         tone: tone,
                                         reduceMotion: reduceMotion,
                                         increasedContrast: increasedContrast)
    }

    func test_resolve_vecteurs_trait_rayon_pourcentage_centre_pour14() {
        let r = recipe(progress: 0.62, diameter: 14)
        XCTAssertEqual(r.stroke, 1.5)
        XCTAssertEqual(r.radius, (14 - 1.5) / 2)
        XCTAssertNil(r.digits)
    }

    func test_resolve_vecteurs_trait_rayon_pourcentage_centre_pour22() {
        let r = recipe(progress: 0.60, diameter: 22)
        XCTAssertEqual(r.stroke, 3)
        XCTAssertEqual(r.digits, 60)
        XCTAssertFalse(r.showsSign)
        XCTAssertEqual(r.digitSize, MeeshyFont.microSize)
    }

    func test_resolve_vecteurs_trait_rayon_pourcentage_centre_pour40() {
        let r = recipe(progress: 0.62, diameter: 40)
        XCTAssertEqual(r.stroke, 4)
        XCTAssertEqual(r.digits, 62)
        XCTAssertTrue(r.showsSign)
        XCTAssertEqual(r.digitSize, MeeshyFont.smallSize)
    }

    func test_resolve_vecteurs_trait_rayon_pourcentage_centre_pour44() {
        let r = recipe(progress: 0.62, diameter: 44)
        XCTAssertEqual(r.stroke, 4)
        XCTAssertEqual(r.radius, (44 - 4) / 2)
        XCTAssertEqual(r.digits, 62)
    }

    func test_resolve_vecteurs_trait_rayon_pourcentage_centre_pour102() {
        let r = recipe(progress: 0.5, diameter: 102)
        XCTAssertEqual(r.stroke, 6)
        XCTAssertEqual(r.digits, 50)
    }

    func test_resolve_fractionHorsBornes_estBornee() {
        XCTAssertEqual(recipe(progress: -0.5).fraction, 0)
        XCTAssertEqual(recipe(progress: 1.7).fraction, 1)
        XCTAssertEqual(recipe(progress: 1.7).digits, 100)
    }

    func test_resolve_nonNombre_vautZeroSansException() {
        XCTAssertEqual(recipe(progress: .nan).fraction, 0)
        XCTAssertEqual(recipe(progress: .infinity).fraction, 0)
    }

    func test_resolve_zero_dessineUnPointAMidi() {
        XCTAssertEqual(recipe(progress: 0).arcFraction, 0.001)
    }

    func test_resolve_progressAbsente_estIndeterminee() {
        let r = recipe(progress: nil)
        XCTAssertTrue(r.isIndeterminate)
        XCTAssertNil(r.digits)
        XCTAssertTrue(r.sweeps)
        XCTAssertEqual(r.arcFraction, MeeshyProgressRingRecipe.sweepFraction)
    }

    func test_resolve_centerRempli_masqueLeChiffre() {
        let r = recipe(progress: 0.5, hasCenter: true)
        XCTAssertNil(r.digits)
    }

    func test_resolve_showsPercentFaux_masqueLeChiffre() {
        XCTAssertNil(recipe(progress: 0.5, showsPercent: false).digits)
    }

    func test_resolve_sweeps_poseLeBalayageSurLArc() {
        XCTAssertTrue(recipe(progress: 0.5, sweeps: true).sweeps)
        XCTAssertFalse(recipe(progress: 0.5).sweeps)
    }

    func test_resolve_diametreBorne_de10a120() {
        XCTAssertEqual(recipe(progress: 0.5, diameter: 500).diameter, 120)
        XCTAssertEqual(recipe(progress: 0.5, diameter: 2).diameter, 10)
    }

    func test_resolve_contrasteAccru_portePisteA60() {
        XCTAssertEqual(recipe(progress: 0.5).trackOpacity, MeeshyOpacity.medium)
        XCTAssertEqual(recipe(progress: 0.5, increasedContrast: true).trackOpacity, 0.6)
    }

    func test_resolve_reduireLesAnimations_figeLeBalayage() {
        XCTAssertNil(recipe(progress: nil, reduceMotion: true).animation)
        XCTAssertFalse(recipe(progress: nil, reduceMotion: true).spins)
    }

    func test_resolve_tonTheme_donneLEncreDuTheme() {
        XCTAssertEqual(recipe(progress: 0.5, tone: .theme).ink, .themeInk)
        XCTAssertEqual(recipe(progress: 0.5, tone: .deep).ink, .onMedia)
    }

    func test_spokenValue_valueTextLEmporte() {
        XCTAssertEqual(MeeshyProgressRingWords.spokenValue(percent: 62, valueText: "3 sur 4", locale: Locale(identifier: "fr")), "3 sur 4")
    }

    func test_spokenValue_pourcentageSansValueText() {
        XCTAssertEqual(MeeshyProgressRingWords.spokenValue(percent: 62, valueText: nil, locale: Locale(identifier: "fr")), "62 %")
    }

    func test_spokenValue_indetermineDitEnCours() {
        XCTAssertEqual(MeeshyProgressRingWords.spokenValue(percent: nil, valueText: nil, locale: Locale(identifier: "fr")), "En cours")
    }

    func test_spokenValue_arabeNumerotationArabe() {
        let spoken = MeeshyProgressRingWords.spokenValue(percent: 62, valueText: nil, locale: Locale(identifier: "ar"))
        XCTAssertFalse(spoken.isEmpty)
        XCTAssertFalse(spoken.contains("62"))
    }
}
