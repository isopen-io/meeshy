import Testing
import Foundation
@testable import MeeshySDK

/// **Les EFFETS de l'ancien éditeur d'image reviennent dans la scène — ceux qui
/// n'étaient pas déjà des réglages** (#9498). L'outil « Effets » de
/// `MeeshyImageEditorView` offrait flou, vignette, netteté, bloom et grain ; les
/// trois premiers sont des curseurs de `AdjustmentKind` depuis #9175. Le BLOOM
/// et le GRAIN entrent dans le MÊME sac, sous une famille à eux : une seule
/// source de vérité, une seule chaîne, un seul fil.
struct ImageEffectsRuleTests {

    @Test func lesEffets_sontLeBloomEtLeGrain_etRienDAutre() {
        #expect(AdjustmentKind.allCases.filter { $0.family == .effect } == [.bloom, .grain])
    }

    @Test func leFlouLaVignetteEtLaNettete_restentDesReglages() {
        #expect(AdjustmentKind.blur.family == .tone)
        #expect(AdjustmentKind.vignette.family == .tone)
        #expect(AdjustmentKind.sharpness.family == .tone)
    }

    @Test func unEffet_vaDeZeroAUn_neutreAZero() {
        for kind in [AdjustmentKind.bloom, .grain] {
            #expect(kind.range == 0...1)
            #expect(kind.neutralValue == 0)
            #expect(!kind.isEssential)
        }
    }

    @Test func lEditeurDeLAvatar_neMontreQueLesReglages() {
        #expect(AdjustmentKind.toneCases == AdjustmentKind.allCases.filter { $0.family == .tone })
        #expect(!AdjustmentKind.toneCases.contains(.bloom) && !AdjustmentKind.toneCases.contains(.grain))
    }

    @Test func uneImage_recoitLesEffets_uneVideoAucun() {
        #expect(AdjustmentKind.served(for: .image, in: .effect) == [.bloom, .grain])
        #expect(AdjustmentKind.served(for: .video, in: .effect).isEmpty,
                "Le bloom est un flou de plus par trame ; le grain, un bruit que la compression ne tient pas.")
    }

    @Test func lesReglages_neComptentPasLesEffets() {
        #expect(AdjustmentKind.served(for: .image, in: .tone)
                == [.exposure, .brightness, .contrast, .saturation, .vibrance, .temperature, .sharpness, .blur, .vignette])
    }

    @Test func laProjectionVideo_neutraliseLesEffets() {
        let charge = ImageAdjustments(contrast: 1.2, bloom: 0.6, grain: 0.4)
        #expect(charge.served(for: .video) == ImageAdjustments(contrast: 1.2))
        #expect(charge.served(for: .image) == charge)
    }

    @Test func reinitialiserUneFamille_garderLAutre() {
        let charge = ImageAdjustments(contrast: 1.2, bloom: 0.6, grain: 0.4)
        #expect(charge.resetting(.effect) == ImageAdjustments(contrast: 1.2))
        #expect(charge.resetting(.tone) == ImageAdjustments(bloom: 0.6, grain: 0.4))
        #expect(charge.activeCount(in: .effect) == 2)
        #expect(charge.activeCount(in: .tone) == 1)
    }

    @Test func lesEffets_voyagentDansLeSacDesReglages_etEnReviennent() throws {
        let charge = ImageAdjustments(bloom: 0.5, grain: 0.25)
        let data = try JSONEncoder().encode(charge)
        let objet = try #require(JSONSerialization.jsonObject(with: data) as? [String: Double])
        #expect(objet == ["bloom": 0.5, "grain": 0.25])
        #expect(try JSONDecoder().decode(ImageAdjustments.self, from: data) == charge)
    }

    @Test func unEffetHorsBornes_estRameneASonCurseur() throws {
        let data = Data(#"{"bloom": 9, "grain": -3}"#.utf8)
        let relu = try JSONDecoder().decode(ImageAdjustments.self, from: data)
        #expect(relu.bloom == 1)
        #expect(relu.grain == 0)
    }

    @Test func unAncienSacSansEffet_seRelitSansEffet() throws {
        let data = Data(#"{"contrast": 1.2}"#.utf8)
        let relu = try JSONDecoder().decode(ImageAdjustments.self, from: data)
        #expect(relu.bloom == 0 && relu.grain == 0)
        #expect(relu.activeCount(in: .effect) == 0)
    }
}
