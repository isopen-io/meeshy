import XCTest
import MeeshyUI
@testable import Meeshy

/// **Sous un fond figé, l'écran n'offre plus rien qui le changerait** (#9994).
///
/// Le ViewModel défait déjà toute écriture du fond ; ces témoins gardent
/// l'autre moitié : aucune commande du fond ne reste à l'écran sans effet.
final class ComposerBackgroundLockOfferTests: XCTestCase {

    func test_laPorteFond_disparaitSousUnFondFige() {
        let portes: [ComposerRailDoor] = [.text, .background, .sticker]
        XCTAssertEqual(ComposerBackgroundLockOffer.doors(portes, locked: true), [.text, .sticker])
        XCTAssertEqual(ComposerBackgroundLockOffer.doors(portes, locked: false), portes)
    }

    func test_leMenuDuFond_neSOuvrePasSousUnFondFige() {
        XCTAssertFalse(ComposerBackgroundLockOffer.opensBackgroundMenu(locked: true))
        XCTAssertTrue(ComposerBackgroundLockOffer.opensBackgroundMenu(locked: false))
    }

    func test_lObjetDeFondFige_naAucuneAction() {
        let offertes: [StoryCanvasContextAction] = [.duplicate, .delete]
        XCTAssertEqual(ComposerBackgroundLockOffer.objectActions(
            offertes, selectedId: "bg", lockedBackgroundId: "bg", locked: true), [])
    }

    func test_unPremierPlan_gardeSesActions_saufDevenirLeFond() {
        let offertes: [StoryCanvasContextAction] = [.duplicate, .setAsBackground, .replaceBackground, .delete]
        XCTAssertEqual(ComposerBackgroundLockOffer.objectActions(
            offertes, selectedId: "fg", lockedBackgroundId: "bg", locked: true), [.duplicate, .delete])
        XCTAssertEqual(ComposerBackgroundLockOffer.objectActions(
            offertes, selectedId: "fg", lockedBackgroundId: "bg", locked: false), offertes)
    }

    func test_leMenuPlus_neChoisitNiNeRetireLeFond() {
        let entrees: [ComposerOverflowEntry] = [.preview, .pickBackground, .removeBackground, .clearAll]
        XCTAssertEqual(ComposerBackgroundLockOffer.overflow(entrees, locked: true), [.preview, .clearAll])
        XCTAssertEqual(ComposerBackgroundLockOffer.overflow(entrees, locked: false), entrees)
    }

    /// L'effet VISUEL filtre le fond ; l'effet d'ouverture anime la slide.
    func test_seulLEffetVisuel_disparait() {
        XCTAssertEqual(ComposerBackgroundLockOffer.sceneEffects([.opening, .visual], locked: true), [.opening])
        XCTAssertEqual(ComposerBackgroundLockOffer.sceneEffects([.opening, .visual], locked: false),
                       [.opening, .visual])
    }

    /// **Chaque site LIT la règle.** Une règle juste qu'un site n'appelle pas
    /// laisse sa commande à l'écran : le témoin interroge le meuble, pas la règle.
    func test_leMeuble_litLaRegleAChaqueSite() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        for appel in ["ComposerBackgroundLockOffer.doors(",
                      "ComposerBackgroundLockOffer.opensBackgroundMenu(",
                      "ComposerBackgroundLockOffer.objectActions(",
                      "ComposerBackgroundLockOffer.overflow(",
                      "ComposerBackgroundLockOffer.sceneEffects("] {
            XCTAssertTrue(code.contains(appel), "le meuble ne lit pas \(appel)")
        }
        XCTAssertEqual(code.components(separatedBy: "sceneObjectActions(ComposerTrailingRailPolicy.actions(").count - 1, 2,
                       "les DEUX listes d'actions d'objet (colonne et menu) passent par le filtre du fond figé")
    }
}
