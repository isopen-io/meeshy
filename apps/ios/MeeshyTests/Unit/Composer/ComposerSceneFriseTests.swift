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

    // MARK: - Glisser une piste, tirer ses ancres (#8473)

    func test_leGlisser_seMesureEnSecondesSurLaLargeurDeLaPiste() {
        XCTAssertEqual(ComposerSceneFriseMetrics.seconds(forDelta: 50, width: 200, total: 6), 1.5, accuracy: 0.0001)
        XCTAssertEqual(ComposerSceneFriseMetrics.seconds(forDelta: 50, width: 0, total: 6), 0)
    }

    func test_glisserLaBarre_gardeSaDuree_etResteDansLaSlide() {
        let p = piste(.text, start: 1, end: 3)
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(p, edge: .barre, by: 1.5, total: 6), 2.5, accuracy: 0.0001)
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(p, edge: .barre, by: 10, total: 6), 4, accuracy: 0.0001)
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(p, edge: .barre, by: -5, total: 6), 0)
    }

    func test_lAncreDeDebut_neDepassePasLaFin() {
        let p = piste(.text, start: 1, end: 3)
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(p, edge: .debut, by: -0.5, total: 6), 0.5, accuracy: 0.0001)
        XCTAssertLessThan(ComposerSceneFriseMetrics.dragged(p, edge: .debut, by: 9, total: 6), 3)
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(p, edge: .debut, by: -9, total: 6), 0)
    }

    func test_lAncreDeFin_neRecolePasAvantLeDebut_niApresLaSlide() {
        let p = piste(.text, start: 1, end: 3)
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(p, edge: .fin, by: 1, total: 6), 4, accuracy: 0.0001)
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(p, edge: .fin, by: 9, total: 6), 6)
        XCTAssertGreaterThan(ComposerSceneFriseMetrics.dragged(p, edge: .fin, by: -9, total: 6), 1)
    }
}
