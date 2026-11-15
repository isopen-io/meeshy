import Testing
import SwiftUI
@testable import MeeshyUI

@Suite("MeeshyContrast")
struct MeeshyContrastTests {

    @Test("contraste augmenté ⇒ isIncreased")
    func test_init_contrasteAugmente_isIncreasedVrai() {
        let sut = MeeshyContrast(colorSchemeContrast: .increased, differentiateWithoutColor: false)
        #expect(sut.isIncreased)
    }

    @Test("contraste standard ⇒ isIncreased faux")
    func test_init_contrasteStandard_isIncreasedFaux() {
        let sut = MeeshyContrast(colorSchemeContrast: .standard, differentiateWithoutColor: false)
        #expect(!sut.isIncreased)
    }

    @Test("différencier sans couleur ⇒ prefersNonColorCues")
    func test_init_differencierSansCouleur_prefersNonColorCuesVrai() {
        let sut = MeeshyContrast(colorSchemeContrast: .standard, differentiateWithoutColor: true)
        #expect(sut.prefersNonColorCues)
    }

    @Test("standard : l'opacité de base est rendue telle quelle")
    func test_foregroundOpacity_standard_rendLaBase() {
        #expect(MeeshyContrast.standard.foregroundOpacity(0.3) == 0.3)
    }

    @Test("augmenté : l'opacité est relevée à 0.85 au moins, jamais abaissée")
    func test_foregroundOpacity_augmente_releveAuMoinsAIntense() {
        let sut = MeeshyContrast(colorSchemeContrast: .increased, differentiateWithoutColor: false)
        #expect(sut.foregroundOpacity(0.3) == 0.85)
        #expect(sut.foregroundOpacity(0.95) == 0.95)
    }

    @Test("bordure : 0 en standard, 1 en contraste augmenté")
    func test_borderWidth_standardZero_augmenteUn() {
        let increased = MeeshyContrast(colorSchemeContrast: .increased, differentiateWithoutColor: false)
        #expect(MeeshyContrast.standard.borderWidth == 0)
        #expect(increased.borderWidth == 1)
    }

    @Test("standard est la valeur neutre")
    func test_standard_estLaValeurNeutre() {
        #expect(!MeeshyContrast.standard.isIncreased)
        #expect(!MeeshyContrast.standard.prefersNonColorCues)
    }
}
