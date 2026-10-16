import XCTest
@testable import Meeshy

/// **La bande des communautés de la recherche est deux fois plus petite et
/// disparaît dès que le champ perd le focus** (#10841, retour porteur
/// 2026-10-16 : « diminuer la card des communautés par 2, et faire disparaître
/// cette partie lorsqu'on perd le focus du champ de recherche automatiquement »).
final class ConversationSearchCommunitiesBandTests: XCTestCase {

    // MARK: - La bande suit le focus

    func test_band_isShownWhileTheSearchFieldHasFocus() {
        XCTAssertTrue(ConversationSearchCommunitiesBandLaw.isShown(afterFocusChangeTo: true))
    }

    /// Clavier fermé, toucher ailleurs, défilement qui rend le focus : la bande
    /// se retire d'elle-même, sans le bouton de fermeture.
    func test_band_isRemovedAsSoonAsTheSearchFieldLosesFocus() {
        XCTAssertFalse(ConversationSearchCommunitiesBandLaw.isShown(afterFocusChangeTo: false))
    }

    // MARK: - La carte fait la moitié de sa taille d'avant

    func test_card_isHalfItsFormerWidthAndHeight() {
        XCTAssertEqual(CommunityCardMetrics.width, CommunityCardMetrics.formerWidth / 2)
        XCTAssertEqual(CommunityCardMetrics.height, CommunityCardMetrics.formerHeight / 2)
        XCTAssertEqual(CommunityCardMetrics.formerWidth, 130)
        XCTAssertEqual(CommunityCardMetrics.formerHeight, 110)
    }

    /// Le contenu ajusté reste lisible : le nom tient sur deux lignes de
    /// caption2 dans la hauteur de la carte, marges comprises.
    func test_card_contentFitsTheHalvedCard() {
        let twoLines = 2 * (CommunityCardMetrics.nameSize * 1.2)
        XCTAssertLessThanOrEqual(twoLines + 2 * CommunityCardMetrics.padding, CommunityCardMetrics.height)
        XCTAssertGreaterThanOrEqual(CommunityCardMetrics.nameSize, 11, "plus petit que caption2, le nom ne se lit plus")
    }
}
