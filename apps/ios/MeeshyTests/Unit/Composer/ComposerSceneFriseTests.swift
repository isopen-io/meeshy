import XCTest
@testable import Meeshy
import MeeshyUI

/// **La frise de la scène animée suit la maquette** (#8370, lot 6 —
/// `docs/product/composer-plein-ecran/Main.dc.html`, bloc « plan temps »).
final class ComposerSceneFriseTests: XCTestCase {

    private func piste(_ kind: SceneFriseTrack.Kind, label: String = "",
                       start: Float = 0, end: Float = 6) -> SceneFriseTrack {
        SceneFriseTrack(id: "p", kind: kind, label: label, start: start, end: end)
    }

    // MARK: - « 1.2 s / 6 s »

    func test_leTemps_sEcritAuDixiemeSurLaDureeEntiere() {
        XCTAssertEqual(ComposerSceneFriseMetrics.timeLabel(current: 1.23, total: 6), "1.2 s / 6 s")
        XCTAssertEqual(ComposerSceneFriseMetrics.timeLabel(current: 0, total: 6), "0.0 s / 6 s")
    }

    func test_uneDureeNonEntiere_garderSonDixieme() {
        XCTAssertEqual(ComposerSceneFriseMetrics.timeLabel(current: 3, total: 7.5), "3.0 s / 7.5 s")
    }

    // MARK: - La tête et les barres restent dans la frise

    func test_laFraction_estBorneeALaDuree() {
        XCTAssertEqual(ComposerSceneFriseMetrics.fraction(3, of: 6), 0.5, accuracy: 0.0001)
        XCTAssertEqual(ComposerSceneFriseMetrics.fraction(9, of: 6), 1)
        XCTAssertEqual(ComposerSceneFriseMetrics.fraction(-1, of: 6), 0)
        XCTAssertEqual(ComposerSceneFriseMetrics.fraction(.nan, of: 6), 0)
        XCTAssertEqual(ComposerSceneFriseMetrics.fraction(3, of: 0), 0)
    }

    // MARK: - Chaque piste a un NOM

    func test_unTexteSeNommeParSonContenu() {
        XCTAssertEqual(ComposerSceneFriseCopy.label(for: piste(.text, label: "Bonjour")), "Bonjour")
    }

    func test_unStickerSeNommeParSonEmoji() {
        XCTAssertEqual(ComposerSceneFriseCopy.label(for: piste(.sticker, label: "🔥")), "🔥")
    }

    /// Un média ou un son n'a pas de nom propre : la piste prend le mot de sa
    /// nature — jamais une ligne sans nom, qu'on ne saurait pas choisir.
    func test_sansNom_laPistePrendLeMotDeSaNature() {
        XCTAssertEqual(ComposerSceneFriseCopy.label(for: piste(.video)), ComposerSceneFriseCopy.video)
        XCTAssertEqual(ComposerSceneFriseCopy.label(for: piste(.image)), ComposerSceneFriseCopy.media)
        XCTAssertEqual(ComposerSceneFriseCopy.label(for: piste(.audio)), ComposerSceneFriseCopy.sound)
        XCTAssertEqual(ComposerSceneFriseCopy.label(for: piste(.place, label: "  ")), ComposerSceneFriseCopy.place)
    }

    func test_laFenetreSeLitEnSecondes() {
        XCTAssertEqual(ComposerSceneFriseMetrics.windowLabel(piste(.text, start: 0.8, end: 6)), "0.8 s – 6 s")
    }

    // MARK: - « Temps » n'existe qu'en scène animée

    /// La maquette ne dessine « Temps » qu'en mode dynamique ; le meuble le
    /// passe au rail sous la même condition — un bouton sans frise à ranger
    /// serait un contrôle inerte.
    func test_temps_nEstServiQuEnSceneAnimee() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("onTimeButton:sceneIsAnimated&&!returnsImageToConversation?{toggleSceneFrise()}:nil"),
                      "« Temps » doit n'exister qu'en scène animée, et jamais dans la retouche d'une image.")
    }

    // MARK: - Glisser une piste, tirer ses poignées (retour porteur 2026-09-28)

    private typealias W = ComposerSceneFriseMetrics.Window

    func test_glisserLaBarre_deplaceLObjet_sansChangerSaDuree() {
        let w = ComposerSceneFriseMetrics.dragged(W(start: 1, end: 3), grip: .move, by: 1.5, duration: 6)
        XCTAssertEqual(w, W(start: 2.5, end: 4.5))
    }

    func test_laBarreGlissee_resteDansLaSlide() {
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 1, end: 3), grip: .move, by: 9, duration: 6),
                       W(start: 4, end: 6))
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 1, end: 3), grip: .move, by: -9, duration: 6),
                       W(start: 0, end: 2))
    }

    func test_laPoigneeDeDebut_allongeOuRaccourcit_sansToucherLaFin() {
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .start, by: -1, duration: 6),
                       W(start: 1, end: 4))
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .start, by: 1, duration: 6),
                       W(start: 3, end: 4))
    }

    func test_laPoigneeDeFin_allongeOuRaccourcit_sansToucherLeDebut() {
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .end, by: 1.5, duration: 6),
                       W(start: 2, end: 5.5))
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .end, by: 9, duration: 6),
                       W(start: 2, end: 6))
    }

    /// Une poignée ne franchit jamais l'autre : la piste garde une durée
    /// saisissable.
    func test_unePoignee_neFranchitJamaisLAutre() {
        let debut = ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .start, by: 5, duration: 6)
        XCTAssertLessThan(debut.start, debut.end)
        let fin = ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .end, by: -5, duration: 6)
        XCTAssertLessThan(fin.start, fin.end)
        XCTAssertEqual(fin.start, 2)
    }

    func test_unGlissementInvalide_neBougeRien() {
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .move, by: .nan, duration: 6),
                       W(start: 2, end: 4))
    }
}
