import XCTest
@testable import MeeshySDK

/// **Une borne calculée contre un ratio provisoire est enregistrée comme un
/// choix** (#5100).
///
/// `MediaCropRule.centered` est juste, et c'est ce qui rend le défaut sournois :
/// elle calcule exactement, sur une entrée qui ne l'est pas encore. Sur les
/// chemins vidéo, le ratio réel arrive APRÈS la pose de l'objet ; taper `9:16`
/// pendant cette fenêtre sur une source 16:9 produit un sous-rectangle dont le
/// rapport effectif vaut 1:1 — un carré, publié, indistinguable d'une intention.
final class MediaCropReadinessTests: XCTestCase {

    /// Le cas nominal : la mesure est là, les pastilles agissent.
    func test_avecMesure_lesPastillesAgissent() {
        XCTAssertTrue(MediaCropReadiness.ratioPadsMayAct(measuredAspectRatio: 16.0 / 9.0))
        XCTAssertTrue(MediaCropReadiness.ratioPadsMayAct(measuredAspectRatio: 1.0),
                      "un carré MESURÉ est une mesure comme une autre")
    }

    /// **Le cas qui a fait naître le lot** : la fenêtre asynchrone.
    func test_sansMesure_lesPastillesSAbstiennent() {
        XCTAssertFalse(MediaCropReadiness.ratioPadsMayAct(measuredAspectRatio: nil))
    }

    /// Un ratio non fini ou négatif ne peut venir que d'une source corrompue.
    /// `centered` en tirerait une borne arbitraire plutôt qu'une erreur — donc
    /// il est traité comme non mesuré.
    func test_uneMesureAberrante_vautUneAbsenceDeMesure() {
        for aberrant in [0.0, -1.0, Double.nan, Double.infinity] {
            XCTAssertFalse(MediaCropReadiness.ratioPadsMayAct(measuredAspectRatio: aberrant),
                           "\(aberrant) n'est pas un ratio")
        }
    }

    /// **`LIBRE` reste offert sans mesure, et ce n'est pas une exception
    /// arbitraire** : il ne calcule rien. Rendre la pleine étendue ne dépend
    /// d'aucun ratio, donc aucune borne fausse ne peut en sortir — et c'est le
    /// seul geste qui ANNULE un recadrage, qu'il serait absurde de retenir.
    func test_libre_agitMemeSansMesure() {
        XCTAssertTrue(MediaCropReadiness.mayAct(ratio: .free, measuredAspectRatio: nil))
        XCTAssertTrue(MediaCropReadiness.mayAct(ratio: .free, measuredAspectRatio: 1.777))
    }

    /// Les trois pastilles qui CALCULENT suivent la mesure, toutes les trois.
    /// Un témoin qui n'en éprouverait qu'une se périmerait à la quatrième.
    func test_lesPastillesQuiCalculent_suiventLaMesure() {
        for ratio in MediaCropRatio.allCases where ratio.value != nil {
            XCTAssertFalse(MediaCropReadiness.mayAct(ratio: ratio, measuredAspectRatio: nil),
                           "\(ratio) calcule, donc elle attend la mesure")
            XCTAssertTrue(MediaCropReadiness.mayAct(ratio: ratio, measuredAspectRatio: 16.0 / 9.0),
                          "\(ratio) agit dès que la mesure est là")
        }
    }

    /// **Le défaut, reproduit** — pour que le témoin montre ce qu'il évite plutôt
    /// que de l'affirmer. Sur une source 16:9 non mesurée, `centered` rend une
    /// borne dont le rapport effectif vaut 1:1 au lieu de 9:16.
    func test_leDefautQueLaGardeEvite_estReproduit() {
        let sourceReelle = 16.0 / 9.0
        let borneFausse = MediaCropRule.centered(ratio: .portrait916,
                                                 sourceRatio: StoryMediaObject.unmeasuredAspectRatio)
        let rapportObtenu = MediaCropRule.effectiveRatio(sourceRatio: sourceReelle,
                                                         crop: borneFausse)
        XCTAssertEqual(rapportObtenu, 1.0, accuracy: 0.001,
                       "calculée contre le repli, la borne « 9:16 » rend un CARRÉ sur une 16:9")
        XCTAssertNotEqual(rapportObtenu, 9.0 / 16.0, accuracy: 0.001)

        let borneJuste = MediaCropRule.centered(ratio: .portrait916, sourceRatio: sourceReelle)
        XCTAssertEqual(MediaCropRule.effectiveRatio(sourceRatio: sourceReelle, crop: borneJuste),
                       9.0 / 16.0, accuracy: 0.001,
                       "avec la vraie mesure, la même pastille rend bien 9:16")
    }
}
