import XCTest
import CoreGraphics
@testable import MeeshySDK

/// **Deux objets posés ne se superposent pas** (#4939).
///
/// > Le premier objet ne prouve rien : il est au centre dans les deux cas — avec
/// > la règle et sans elle. Tous les témoins qui comptent portent donc sur le
/// > SECOND.
final class StoryObjectPlacementTests: XCTestCase {

    /// Sur une scène vide, le centre. La règle ne punit pas le cas nominal pour
    /// protéger le second.
    func test_surUneSceneVide_leCentre() {
        XCTAssertEqual(StoryObjectPlacement.next(avoiding: []), StoryObjectPlacement.center)
    }

    /// **Le témoin qui porte la loi.** Sans la règle, ce point serait le centre.
    func test_leSecondObjet_neTombePasSurLePremier() {
        let second = StoryObjectPlacement.next(avoiding: [StoryObjectPlacement.center])
        XCTAssertNotEqual(second, StoryObjectPlacement.center)
        XCTAssertGreaterThanOrEqual(
            max(abs(second.x - 0.5), abs(second.y - 0.5)), StoryObjectPlacement.tolerance,
            "le second doit être assez loin pour se distinguer au doigt")
    }

    /// Et le troisième ne retombe sur aucun des deux.
    func test_leTroisieme_evitLesDeuxPremiers() {
        let a = StoryObjectPlacement.next(avoiding: [])
        let b = StoryObjectPlacement.next(avoiding: [a])
        let c = StoryObjectPlacement.next(avoiding: [a, b])
        for (nom, point) in [("premier", a), ("second", b)] {
            XCTAssertGreaterThanOrEqual(max(abs(c.x - point.x), abs(c.y - point.y)),
                                        StoryObjectPlacement.tolerance,
                                        "le troisième recouvre le \(nom)")
        }
    }

    /// **Rien ne sort du cadre.** Un objet posé hors champ serait pire que deux
    /// superposés : le second, au moins, se voit.
    func test_aucunObjet_neSortDuCadre() {
        var poses: [CGPoint] = []
        for _ in 0..<20 {
            let p = StoryObjectPlacement.next(avoiding: poses)
            XCTAssertGreaterThanOrEqual(p.x, StoryObjectPlacement.margin)
            XCTAssertGreaterThanOrEqual(p.y, StoryObjectPlacement.margin)
            XCTAssertLessThanOrEqual(p.x, 1 - StoryObjectPlacement.margin)
            XCTAssertLessThanOrEqual(p.y, 1 - StoryObjectPlacement.margin)
            poses.append(p)
        }
    }

    /// **Elle TERMINE, même sur une scène saturée.** Une boucle non bornée
    /// gèlerait l'app — et la superposition qu'elle évite est moins grave qu'un
    /// gel. Le témoin s'écrit sur une scène où toutes les places sont prises.
    func test_surUneSceneSaturee_elleRendUnPointPlutotQueDeTourner() {
        let saturee = (0...40).map { i in
            CGPoint(x: 0.5 + StoryObjectPlacement.step * CGFloat(i - 20),
                    y: 0.5 + StoryObjectPlacement.step * CGFloat(i - 20))
        }
        let p = StoryObjectPlacement.next(avoiding: saturee)
        XCTAssertFalse(p.x.isNaN || p.y.isNaN)
        XCTAssertGreaterThanOrEqual(p.x, StoryObjectPlacement.margin)
    }
}
