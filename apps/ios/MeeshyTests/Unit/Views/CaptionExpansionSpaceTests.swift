import XCTest
import SwiftUI
@testable import Meeshy

/// **Déplier une légende prend de la place, et chaque surface la prend
/// ailleurs** (directive porteur 2026-09-02).
///
/// Les deux règles sont VOLONTAIREMENT différentes, et ces témoins existent
/// pour qu'un futur « uniformisons » ait à les contredire explicitement plutôt
/// qu'à les aligner par distraction.
final class CaptionExpansionSpaceTests: XCTestCase {

    // MARK: Le plein écran média — l'auteur cède la place

    func test_legendeRepliee_lAuteurEstVisible() {
        XCTAssertTrue(CaptionExpansionSpace.showsAuthorDetails(captionExpanded: false))
    }

    func test_legendeDepliee_lAuteurSEfface() {
        XCTAssertFalse(CaptionExpansionSpace.showsAuthorDetails(captionExpanded: true),
            "Le bas de l'écran est fini : une légende dépliée et une carte d'auteur s'y disputent la place.")
    }

    // MARK: La story — la scène recule, rien ne se cache

    func test_storyAuRepos_laSceneEstPLEINE() {
        XCTAssertEqual(CaptionExpansionSpace.storySceneOpacity(captionExpanded: false), 1,
            "Au repos la scène se voit entière — rien ne se paie tant que personne n'a demandé à lire.")
    }

    func test_storyDepliee_laSceneSEFFACE_sansDisparaitre() {
        let o = CaptionExpansionSpace.storySceneOpacity(captionExpanded: true)
        XCTAssertLessThan(o, 1, "La scène doit s'effacer pour laisser remonter le fond naturel.")
        XCTAssertGreaterThan(o, 0,
            "Elle s'efface, elle ne DISPARAÎT pas : on doit encore deviner ce qu'on lisait.")
    }

    /// Le témoin qui dit la DIFFÉRENCE, et pas seulement les deux valeurs :
    /// dépliée, la story ne cache rien ET floute ; le plein écran cache ET ne
    /// floute pas. Aligner les deux surfaces ferait tomber celui-ci.
    func test_lesDeuxSurfaces_repondentDIFFEREMMENT() {
        let depliee = true
        XCTAssertFalse(CaptionExpansionSpace.showsAuthorDetails(captionExpanded: depliee),
            "Plein écran : on cache.")
        XCTAssertLessThan(CaptionExpansionSpace.storySceneOpacity(captionExpanded: depliee), 1,
            "Story : la scène s'efface — et on ne cache rien.")
    }
}
