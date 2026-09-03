import XCTest
@testable import Meeshy

/// #4997 — **le glissement du bord de tête ramène à la scène.**
///
/// > « le swipe bordure gauche vers la droite doit retourner sur la scène
/// > principale » — porteur, 2026-09-03
///
/// Ces témoins portent surtout sur ce que la règle REFUSE : la sortie referme
/// un écran de réglage sous les doigts de l'auteur, et les trois refus
/// ci-dessous sont les gestes qu'il fait en voulant faire autre chose.
final class ComposerEdgeBackGestureTests: XCTestCase {

    func test_unGlissementDepuisLeBord_versLAvant_ferme() {
        XCTAssertTrue(ComposerEdgeBackGesture.completes(
            startX: 4, translation: CGSize(width: 120, height: 10)))
    }

    /// Le geste doit PARTIR du bord. Sinon tout balayage de la rangée
    /// d'options, qui défile à l'horizontale, refermerait l'écran.
    func test_unGlissementPartiDuMilieu_neFermePas() {
        XCTAssertFalse(ComposerEdgeBackGesture.completes(
            startX: 180, translation: CGSize(width: 200, height: 0)))
    }

    /// Un frôlement n'est pas une intention.
    func test_unGlissementTropCourt_neFermePas() {
        XCTAssertFalse(ComposerEdgeBackGesture.completes(
            startX: 2, translation: CGSize(width: 20, height: 0)))
    }

    /// **Le cas que le seuil horizontal seul laisse passer** : la diagonale
    /// que fait le doigt pour attraper une glissière posée à gauche. Sans le
    /// terme vertical, elle referme l'écran — et c'est le seul refus que
    /// l'utilisateur ne comprendrait pas s'il manquait.
    func test_uneDiagonaleÀDominanteVerticale_neFermePas() {
        XCTAssertFalse(ComposerEdgeBackGesture.completes(
            startX: 6, translation: CGSize(width: 70, height: 160)))
    }

    /// Vers l'ARRIÈRE, jamais : un glissement du bord vers l'extérieur n'est
    /// pas un retour.
    func test_unGlissementVersLArrière_neFermePas() {
        XCTAssertFalse(ComposerEdgeBackGesture.completes(
            startX: 8, translation: CGSize(width: -120, height: 0)))
    }
}
