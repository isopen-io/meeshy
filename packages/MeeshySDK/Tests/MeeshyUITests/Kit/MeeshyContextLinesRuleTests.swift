import XCTest
import CoreGraphics
@testable import MeeshyUI

/// Témoins de comportement des lois pures de K24 (fiche § 3, loi 13 ; § 8).
/// Aucune vue ici : les lois se lisent sans rendu.
final class MeeshyContextLinesRuleTests: XCTestCase {

    // MARK: - Énumérés et défauts

    func test_defauts_surfaceMediaAlignementCentreHapticLight() {
        XCTAssertEqual(MeeshyContextSurface.media, .media)
        XCTAssertEqual(MeeshyContextAlignment.center, .center)
        XCTAssertEqual(MeeshyContextHaptic.light, .light)
    }

    // MARK: - Onde (ligne de son)

    func test_bars_levelsNil_neRendRienDuTout() {
        XCTAssertEqual(MeeshyContextWaveRule.bars(levels: nil, count: 18), [])
    }

    func test_bars_levelsVide_rendLOndeDeRepliDeLaBonneLongueur() {
        let bars = MeeshyContextWaveRule.bars(levels: [], count: 18)
        XCTAssertEqual(bars.count, 18)
        XCTAssertTrue(bars.allSatisfy { $0 >= MeeshyContextLinesRecipe.waveFloor && $0 <= 1 })
    }

    func test_bars_releveCourt_etendLaLongueurSansInventerDeValeurHorsBornes() {
        let bars = MeeshyContextWaveRule.bars(levels: [0.2, 0.9], count: 18)
        XCTAssertEqual(bars.count, 18)
        XCTAssertTrue(bars.allSatisfy { $0 >= MeeshyContextLinesRecipe.waveFloor && $0 <= 1 })
    }

    func test_bars_releveLong_rembobineParEchantillonnageSansDepasserLeCount() {
        let levels: [Float] = (0..<100).map { Float($0) / 99 }
        let bars = MeeshyContextWaveRule.bars(levels: levels, count: 18)
        XCTAssertEqual(bars.count, 18)
        XCTAssertLessThan(bars.first ?? 1, bars.last ?? 0)
    }

    func test_bars_valeursHorsBornes_plafonnentAUnEtPlanchentAuPlancher() {
        let bars = MeeshyContextWaveRule.bars(levels: [-3, 7], count: 2)
        XCTAssertEqual(bars[0], MeeshyContextLinesRecipe.waveFloor)
        XCTAssertEqual(bars[1], 1)
    }

    // MARK: - Loi 13 : ligne de son

    func test_soundLine_sansTitreSansOndeSansDuree_nAffichePas() {
        XCTAssertFalse(MeeshyContextLinesRule.soundLineHasContent(title: "", levels: nil, detail: nil))
    }

    func test_soundLine_titreSeul_suffit() {
        XCTAssertTrue(MeeshyContextLinesRule.soundLineHasContent(title: "Afro Sunset", levels: nil, detail: nil))
    }

    func test_soundLine_dureeVideNeCompteQuePourRien() {
        XCTAssertFalse(MeeshyContextLinesRule.soundLineHasContent(title: "  ", levels: nil, detail: ""))
    }

    func test_soundLine_ondeSeuleSuffit_etOndeNulleNeSeDessinePas() {
        XCTAssertTrue(MeeshyContextLinesRule.soundLineHasContent(title: "", levels: [], detail: nil))
        XCTAssertFalse(MeeshyContextLinesRule.showsWave(levels: nil))
        XCTAssertTrue(MeeshyContextLinesRule.showsWave(levels: []))
    }

    // MARK: - Loi 13 : ligne de références

    func test_references_vides_ouBlanches_neSontPasServies() {
        XCTAssertEqual(MeeshyContextLinesRule.visibleReferences(["", "  ", "#dakar"]), ["#dakar"])
    }

    func test_references_separateursSeulementEntreDeuxServies() {
        XCTAssertEqual(MeeshyContextLinesRule.separatorCount(visible: ["#dakar", "#plage"]), 1)
        XCTAssertEqual(MeeshyContextLinesRule.separatorCount(visible: ["#dakar"]), 0)
        XCTAssertEqual(MeeshyContextLinesRule.separatorCount(visible: []), 0)
    }

    func test_references_sansReferenceAuTexteNonVide_pasDeLigne() {
        XCTAssertFalse(MeeshyContextLinesRule.referenceLineHasContent(references: ["", " "]))
        XCTAssertTrue(MeeshyContextLinesRule.referenceLineHasContent(references: ["", "Plage de Ngor"]))
    }

    // MARK: - Loi 13 : puce

    func test_chevron_sansAction_jamais_meme_si_demande() {
        XCTAssertFalse(MeeshyContextLinesRule.showsChevron(hasAction: false, requested: true))
        XCTAssertFalse(MeeshyContextLinesRule.showsChevron(hasAction: false, requested: nil))
    }

    func test_chevron_avecAction_nulVautVrai_etFauxSiRefuse() {
        XCTAssertTrue(MeeshyContextLinesRule.showsChevron(hasAction: true, requested: nil))
        XCTAssertFalse(MeeshyContextLinesRule.showsChevron(hasAction: true, requested: false))
    }

    func test_haptique_sansAction_nAttendRien() {
        XCTAssertFalse(MeeshyContextLinesRule.firesHaptic(hasAction: false, haptic: .light))
        XCTAssertFalse(MeeshyContextLinesRule.firesHaptic(hasAction: true, haptic: .none))
        XCTAssertTrue(MeeshyContextLinesRule.firesHaptic(hasAction: true, haptic: .light))
    }

    func test_puce_sansTitreNiGlyphe_nAffichePas() {
        XCTAssertFalse(MeeshyContextLinesRule.showsChip(title: "", glyph: nil))
        XCTAssertTrue(MeeshyContextLinesRule.showsChip(title: "", glyph: "globe"))
        XCTAssertTrue(MeeshyContextLinesRule.showsChip(title: "Amis", glyph: nil))
    }

    // MARK: - Estompe et ajustement

    func test_estompe_toutTient_pasDEstompe() {
        XCTAssertFalse(MeeshyContextLinesRule.needsFade(contentWidth: 200, available: 300))
        XCTAssertTrue(MeeshyContextLinesRule.needsFade(contentWidth: 400, available: 300))
    }

    func test_chipFit_titreTientOuDisque() {
        XCTAssertTrue(MeeshyContextChipFit.showsTitle(titleWidth: 80, available: 100))
        XCTAssertFalse(MeeshyContextChipFit.showsTitle(titleWidth: 120, available: 100))
    }

    // MARK: - Recette (valeurs de la fiche § 6)

    func test_recette_valeursDeLaPlanche() {
        XCTAssertEqual(MeeshyContextLinesRecipe.barCount, 18)
        XCTAssertEqual(MeeshyContextLinesRecipe.pressedOpacity, 0.7)
        XCTAssertEqual(MeeshyContextLinesRecipe.hoverOpacity, 0.85)
        XCTAssertEqual(MeeshyContextLinesRecipe.longPressDelay, 0.5)
        XCTAssertEqual(MeeshyContextLinesRecipe.fadeWidth, 44)
        XCTAssertEqual(MeeshyContextLinesRecipe.maxTextScale, 1.5)
        XCTAssertEqual(MeeshyContextLinesRecipe.chipHeight, 36)
        XCTAssertEqual(MeeshyContextLinesRecipe.minimumTarget, 44)
    }
}
