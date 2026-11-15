import XCTest
import MeeshySDK
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

    // MARK: - #10924 — des communautés, ou rien ; jamais les filtres en double

    private func community(_ id: String) -> MeeshyCommunity {
        MeeshyCommunity(id: id, identifier: "mshy_\(id)", name: "Communauté \(id)")
    }

    /// « Communautés · Voir tout » au-dessus d'une bande vide est un titre qui
    /// ment : sans communauté, la bande ne se peint pas du tout.
    func test_band_isNotDrawn_whenTheUserHasNoCommunity() {
        XCTAssertFalse(ConversationSearchCommunitiesBandLaw.drawsBand(for: [], queryIsEmpty: true))
    }

    func test_band_isDrawn_assoonAsTheUserHasOneCommunity() {
        XCTAssertTrue(ConversationSearchCommunitiesBandLaw.drawsBand(for: [community("a")], queryIsEmpty: true))
    }

    // MARK: - #11036 — taper replie la bande pour laisser voir les résultats

    func test_band_foldsAway_fromTheFirstTypedCharacter() {
        XCTAssertFalse(ConversationSearchCommunitiesBandLaw.drawsBand(for: [community("a")], queryIsEmpty: false))
    }

    func test_band_comesBack_whenTheFieldIsCleared() {
        let typed = ConversationSearchCommunitiesBandLaw.drawsBand(for: [community("a")], queryIsEmpty: false)
        let cleared = ConversationSearchCommunitiesBandLaw.drawsBand(for: [community("a")], queryIsEmpty: true)
        XCTAssertFalse(typed)
        XCTAssertTrue(cleared)
    }

    // MARK: - #11036 — la barre de recherche suit le SENS du défilement
    // `offset` est celui de `MeeshyRefreshableScroll` : négatif vers le bas.

    private func replay(_ offsets: [CGFloat]) -> ConversationSearchBarScrollLaw.State {
        offsets.reduce(ConversationSearchBarScrollLaw.State.initial) { ConversationSearchBarScrollLaw.next($0, offset: $1) }
    }

    func test_bar_isVisible_atRestAtTheTopOfTheList() {
        XCTAssertFalse(ConversationSearchBarScrollLaw.State.initial.hidden)
        XCTAssertFalse(replay([0, -(ConversationSearchBarScrollLaw.topZone - 1)]).hidden)
    }

    func test_bar_hides_whenScrollingDownPastTheTopZone() {
        XCTAssertTrue(replay([0, -100, -200]).hidden)
    }

    func test_bar_comesBack_onAPartialScrollUp_farFromTheTop() {
        let hidden = replay([0, -400, -800])
        XCTAssertTrue(hidden.hidden)
        XCTAssertFalse(ConversationSearchBarScrollLaw.next(hidden, offset: -800 + ConversationSearchBarScrollLaw.hysteresis).hidden)
    }

    func test_bar_ignoresAJitterShorterThanTheHysteresis() {
        let hidden = replay([0, -400, -800])
        XCTAssertTrue(ConversationSearchBarScrollLaw.next(hidden, offset: -800 + ConversationSearchBarScrollLaw.hysteresis - 1).hidden)
        let shown = replay([0, -400, -800, -600])
        XCTAssertFalse(shown.hidden)
        XCTAssertFalse(ConversationSearchBarScrollLaw.next(shown, offset: -600 - ConversationSearchBarScrollLaw.hysteresis + 1).hidden)
    }

    func test_bar_measuresTheScrollUpFromTheDeepestPointReached() {
        let state = replay([0, -400, -800, -1200, -1195])
        XCTAssertTrue(state.hidden)
        XCTAssertFalse(ConversationSearchBarScrollLaw.next(state, offset: -1200 + ConversationSearchBarScrollLaw.hysteresis).hidden)
    }

    /// La liste remet la barre par programme (filtre, retour du fil) : la loi
    /// part de l'état AFFICHÉ, pas de son souvenir.
    func test_bar_followsTheDisplayedState_whenTheListShowsItProgrammatically() {
        let hidden = replay([0, -400, -800])
        let shownByTheList = ConversationSearchBarScrollLaw.State(hidden: false, anchor: hidden.anchor)
        XCTAssertFalse(ConversationSearchBarScrollLaw.next(shownByTheList, offset: -805).hidden)
    }

    /// Le détecteur ne bascule `isScrollingDown` qu'au changement de sens :
    /// aucune écriture d'état publié à chaque image.
    func test_list_drivesTheBarWithTheDirectionLaw_andWritesOnlyOnAToggle() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView.swift")
        )
        XCTAssertTrue(code.contains("ConversationSearchBarScrollLaw.next("))
        XCTAssertTrue(code.contains("if next.hidden != isScrollingDown"))
        XCTAssertFalse(code.contains("let scrollingDown = offset < -30"), "la position seule ne ramenait la barre qu'en tête de liste")
    }

    /// Les filtres vivent EN TÊTE de liste, en continu (#4069) : le panneau de
    /// recherche les répétait sous la bande des communautés.
    func test_searchPanel_carriesNoFilterChips() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+BottomBar.swift")
        )
        let start = try XCTUnwrap(code.range(of: "struct ConversationListBottomBar"))
        let end = try XCTUnwrap(code.range(of: "struct ConversationSearchFieldHost"))
        let bar = String(code[start.upperBound..<end.lowerBound])
        XCTAssertFalse(bar.contains("ThemedFilterChip("), "le panneau de recherche ne répète pas les filtres de tête de liste")
        XCTAssertFalse(bar.contains("ConversationFilter.allCases"))
        XCTAssertTrue(bar.contains("ConversationSearchCommunitiesBandLaw.drawsBand(for: userCommunities, queryIsEmpty: searchTextIsEmpty)"))
    }
}
