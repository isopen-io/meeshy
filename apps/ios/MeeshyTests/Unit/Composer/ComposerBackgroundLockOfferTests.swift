import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Sous un fond figé, l'écran n'offre plus rien qui le changerait** (#9994).
///
/// Le ViewModel défait déjà toute écriture du fond ; ces témoins gardent
/// l'autre moitié : aucune commande du fond ne reste à l'écran sans effet.
final class ComposerBackgroundLockOfferTests: XCTestCase {

    /// Le verrou d'une scène dont le média de fond est l'objet `bg`.
    private func lock() -> StoryBackgroundLock {
        let bg = StoryMediaObject(id: "bg", mediaURL: "file:///bg.jpg", mediaType: "image",
                                  aspectRatio: 0.5625, isBackground: true)
        return StoryBackgroundLock(locking: StorySlide(id: "s1", effects: StoryEffects(mediaObjects: [bg])))
    }

    func test_laPorteFond_disparaitSousUnFondFige() {
        let portes: [ComposerRailDoor] = [.text, .background, .sticker]
        XCTAssertEqual(ComposerBackgroundLockOffer.doors(portes, hasBackgroundMedia: false, lock: lock()),
                       [.text, .sticker])
        XCTAssertEqual(ComposerBackgroundLockOffer.doors(portes, hasBackgroundMedia: false, lock: nil), portes)
    }

    /// La règle d'avant le verrou tient toujours : sous un média de fond, la
    /// porte « Fond » (une couleur) n'a plus d'objet.
    func test_laPorteFond_disparaitSousUnMediaDeFond_memeSansVerrou() {
        XCTAssertEqual(ComposerBackgroundLockOffer.doors([.text, .background], hasBackgroundMedia: true, lock: nil),
                       [.text])
    }

    func test_leMenuDuFond_neSOuvrePasSousUnFondFige() {
        XCTAssertNil(ComposerBackgroundLockOffer.backgroundMenuTarget("bg", lock: lock()))
        XCTAssertEqual(ComposerBackgroundLockOffer.backgroundMenuTarget("bg", lock: nil), "bg")
    }

    func test_lObjetDeFondFige_naAucuneAction() {
        let offertes: [StoryCanvasContextAction] = [.duplicate, .delete]
        XCTAssertEqual(ComposerBackgroundLockOffer.objectActions(offertes, selectedId: "bg", lock: lock()), [])
    }

    func test_unPremierPlan_gardeSesActions_saufDevenirLeFond() {
        let offertes: [StoryCanvasContextAction] = [.duplicate, .setAsBackground, .replaceBackground, .delete]
        XCTAssertEqual(ComposerBackgroundLockOffer.objectActions(offertes, selectedId: "fg", lock: lock()),
                       [.duplicate, .delete])
        XCTAssertEqual(ComposerBackgroundLockOffer.objectActions(offertes, selectedId: "fg", lock: nil), offertes)
    }

    func test_leMenuPlus_neChoisitNiNeRetireLeFond() {
        let entrees: [ComposerOverflowEntry] = [.preview, .pickBackground, .removeBackground, .clearAll]
        XCTAssertEqual(ComposerBackgroundLockOffer.overflow(entrees, lock: lock()), [.preview, .clearAll])
        XCTAssertEqual(ComposerBackgroundLockOffer.overflow(entrees, lock: nil), entrees)
    }

    /// L'effet VISUEL filtre le fond ; l'effet d'ouverture anime la slide.
    func test_seulLEffetVisuel_disparait() {
        XCTAssertEqual(ComposerBackgroundLockOffer.sceneEffects([.opening, .visual], lock: lock()), [.opening])
        XCTAssertEqual(ComposerBackgroundLockOffer.sceneEffects([.opening, .visual], lock: nil), [.opening, .visual])
    }

    /// **Chaque site LIT la règle.** Une règle juste qu'un site n'appelle pas
    /// laisse sa commande à l'écran : le témoin interroge le meuble, pas la règle.
    func test_leMeuble_litLaRegleAChaqueSite() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        for appel in ["ComposerBackgroundLockOffer.doors(",
                      "ComposerBackgroundLockOffer.backgroundMenuTarget(",
                      "ComposerBackgroundLockOffer.overflow(",
                      "ComposerBackgroundLockOffer.sceneEffects("] {
            XCTAssertTrue(code.contains(appel), "le meuble ne lit pas \(appel)")
        }
        XCTAssertEqual(code.components(separatedBy: "ComposerBackgroundLockOffer.objectActions(ComposerTrailingRailPolicy.actions(").count - 1, 2,
                       "les DEUX listes d'actions d'objet (colonne et menu) passent par le filtre du fond figé")
    }
}
