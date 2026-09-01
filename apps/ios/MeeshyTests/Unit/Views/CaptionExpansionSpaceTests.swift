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

    func test_storyAuRepos_aucunFlou() {
        XCTAssertEqual(CaptionExpansionSpace.storySceneBlurRadius(captionExpanded: false), 0,
            "Un flou permanent ferait payer à toute lecture le coût d'un geste que personne n'a fait.")
    }

    func test_storyDepliee_laSceneSeFloute() {
        XCTAssertGreaterThan(CaptionExpansionSpace.storySceneBlurRadius(captionExpanded: true), 0)
    }

    /// Le témoin qui dit la DIFFÉRENCE, et pas seulement les deux valeurs :
    /// dépliée, la story ne cache rien ET floute ; le plein écran cache ET ne
    /// floute pas. Aligner les deux surfaces ferait tomber celui-ci.
    func test_lesDeuxSurfaces_repondentDIFFEREMMENT() {
        let depliee = true
        XCTAssertFalse(CaptionExpansionSpace.showsAuthorDetails(captionExpanded: depliee),
            "Plein écran : on cache.")
        XCTAssertGreaterThan(CaptionExpansionSpace.storySceneBlurRadius(captionExpanded: depliee), 0,
            "Story : on floute — et on ne cache rien.")
    }
}
