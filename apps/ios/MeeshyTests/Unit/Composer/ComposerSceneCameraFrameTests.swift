import XCTest
@testable import Meeshy

/// **Le témoin d'un viseur qui GRANDIT** (directive porteur 2026-09-04).
///
/// Il n'interroge pas la courbe d'animation — une courbe ne se teste pas et
/// n'était pas la cause. Il interroge la GÉOMÉTRIE : un seul aperçu, deux
/// rectangles, et la bascule qui va de l'un à l'autre.
final class ComposerSceneCameraFrameTests: XCTestCase {

    private let carte = CGRect(x: 24, y: 60, width: 300, height: 533)
    private let ecran = CGRect(x: 0, y: 0, width: 393, height: 852)

    // MARK: - La bascule de taille

    func test_enCarte_leViseurOccupeLeDessin_jamaisLaFrame() {
        XCTAssertEqual(
            ComposerSceneCameraFrame.rect(card: carte, full: ecran, size: .card),
            carte)
    }

    func test_enPleinEcran_leViseurOccupeToutCeQuOnLuiDonne() {
        XCTAssertEqual(
            ComposerSceneCameraFrame.rect(card: carte, full: ecran, size: .fullScreen),
            ecran)
    }

    /// Le témoin qui dirait « la bascule change quelque chose » sans dire QUOI
    /// passerait sur deux rectangles identiques. Celui-ci exige qu'ils diffèrent
    /// — c'est la seule forme qui tombe si la bascule devient inerte.
    func test_lesDeuxTailles_nOccupentPasLeMemeRectangle() {
        XCTAssertNotEqual(
            ComposerSceneCameraFrame.rect(card: carte, full: ecran, size: .card),
            ComposerSceneCameraFrame.rect(card: carte, full: ecran, size: .fullScreen))
    }

    func test_leRayon_suitLaTaille() {
        XCTAssertEqual(ComposerSceneCameraFrame.radius(for: .card),
                       ComposerSceneCameraFrame.cardRadius)
        XCTAssertEqual(ComposerSceneCameraFrame.radius(for: .fullScreen), 0)
    }

    // MARK: - Le glissement vers le bas

    func test_unGlissementVersLeHaut_neDeplaceRien() {
        XCTAssertEqual(ComposerSceneCameraFrame.dismissOffset(translationY: -80), 0)
        XCTAssertEqual(ComposerSceneCameraFrame.dismissOpacity(translationY: -80), 1)
    }

    /// **Progressif** : le viseur suit le doigt dès le premier point.
    func test_leViseurSuitLeDoigt_desLePremierPoint() {
        XCTAssertEqual(ComposerSceneCameraFrame.dismissOffset(translationY: 12), 12)
        XCTAssertLessThan(ComposerSceneCameraFrame.dismissOpacity(translationY: 12), 1)
    }

    func test_laCourse_estBornee() {
        XCTAssertEqual(
            ComposerSceneCameraFrame.dismissOffset(translationY: 4000),
            ComposerSceneCameraFrame.dismissTravel)
    }

    /// Un viseur invisible qui n'est pas encore désarmé mentirait sur son état.
    func test_leViseur_neDevientJamaisInvisiblePendantLeGeste() {
        XCTAssertGreaterThan(ComposerSceneCameraFrame.dismissOpacity(translationY: 4000), 0)
    }

    // MARK: - La décision

    func test_enDecaDuSeuil_leGesteSAnnule() {
        XCTAssertFalse(ComposerSceneCameraFrame.dismisses(
            translationY: ComposerSceneCameraFrame.dismissThreshold - 1))
    }

    func test_auSeuil_leGesteDesarme() {
        XCTAssertTrue(ComposerSceneCameraFrame.dismisses(
            translationY: ComposerSceneCameraFrame.dismissThreshold))
    }

    func test_unGlissementVersLeHaut_neDesarmeJamais() {
        XCTAssertFalse(ComposerSceneCameraFrame.dismisses(translationY: -400))
    }

    /// **Le point de non-retour vient AVANT la fin de la course.** Sans cet
    /// écart, l'auteur ne verrait jamais qu'il a dépassé le seuil : le viseur
    /// s'arrêterait au moment exact où la décision bascule.
    func test_leSeuilPrecedeLaFinDeCourse_doncLeDepassementSeVoit() {
        XCTAssertLessThan(ComposerSceneCameraFrame.dismissThreshold,
                          ComposerSceneCameraFrame.dismissTravel)
    }
}
