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

/// #5027 — **le glissement BAS rend l'écran à la scène.**
///
/// > « Le swipe bas doit tout cacher, même l'outil activé à l'instant doit se
/// > désactiver pour laisser pleine place à la scène. » — porteur, 2026-09-03
///
/// Ces témoins portent sur ce que la règle REFUSE, comme ceux du bord : le
/// geste replie le panneau qu'on est en train de lire, donc chaque faux positif
/// se paie par un réglage qui disparaît sous les doigts.
final class ComposerObjectEditorDismissGestureTests: XCTestCase {

    func test_unGlissementFranchementBas_rendLÉcran() {
        XCTAssertTrue(ComposerObjectEditorDismissGesture.completes(
            translation: CGSize(width: 5, height: 140)))
    }

    /// Un frôlement n'est pas une intention. Le seuil est plus généreux que
    /// celui du bord (70 contre 60) : ce geste part du corps de l'écran, où la
    /// main a plus de course.
    func test_unGlissementTropCourt_neRendRien() {
        XCTAssertFalse(ComposerObjectEditorDismissGesture.completes(
            translation: CGSize(width: 0, height: 40)))
    }

    /// **Le cas que le seuil vertical seul laisse passer** : la rangée
    /// d'options défile à l'HORIZONTALE (les dix-huit polices, les fonds), et
    /// le plan 2D panne. Sans la dominance, tout balayage un peu penché
    /// replierait le panneau en cours de lecture.
    func test_unBalayageHorizontalPenché_neRendRien() {
        XCTAssertFalse(ComposerObjectEditorDismissGesture.completes(
            translation: CGSize(width: 200, height: 90)))
    }

    /// Vers le HAUT, jamais : c'est le geste par lequel on ouvre, pas celui
    /// par lequel on range.
    func test_unGlissementVersLeHaut_neRendRien() {
        XCTAssertFalse(ComposerObjectEditorDismissGesture.completes(
            translation: CGSize(width: 0, height: -140)))
    }

    /// **Les deux gestes de cet écran ne se recouvrent pas.** Le retour part du
    /// bord et va vers l'avant ; le repli va vers le bas. Un geste diagonal
    /// depuis le bord ne doit pas déclencher les deux — c'est la dominance,
    /// dans chacune des deux règles, qui l'en empêche.
    func test_lesDeuxGestes_neSeRecouvrentJamais() {
        let diagonales = [CGSize(width: 120, height: 130),
                          CGSize(width: 130, height: 120),
                          CGSize(width: 100, height: 100)]
        for d in diagonales {
            let retour = ComposerEdgeBackGesture.completes(startX: 4, translation: d)
            let repli = ComposerObjectEditorDismissGesture.completes(translation: d)
            XCTAssertFalse(retour && repli,
                           "\(d) déclenche les DEUX gestes — l'écran se fermerait en se repliant")
        }
    }
}
