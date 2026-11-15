import XCTest
import MeeshySDK
@testable import Meeshy

/// Les sections neuves de ma fiche (#18590) : ce qu'elles DISENT (VoiceOver compris) et où chacune de leurs portes MÈNE.
/// Un contrôle existe s'il a un effet : chaque porte est suivie jusqu'à la pile du routeur.
@MainActor
final class ProfileSectionsTests: XCTestCase {

    private func openedPath(_ door: ProfileDoor) -> [Route] {
        let router = Router()
        door.open(with: RouterCommands(router: router))
        _ = PackShopLauncher.shared.consume()
        return router.path
    }

    // MARK: - Mes cercles

    func test_pillAccessibilityLabel_namesTheCircleThenItsPeople() {
        XCTAssertEqual(ProfileCirclesSection.pillAccessibilityLabel(title: "Ami", count: 3), "Ami, 3 personnes")
    }

    func test_requestsText_withNothingToAnswer_isAbsent() {
        XCTAssertNil(ProfileCirclesSection.requestsText(count: 0))
    }

    func test_requestsText_withRequests_saysHowManyToAnswer() {
        XCTAssertEqual(ProfileCirclesSection.requestsText(count: 2), "2 demandes à répondre")
    }

    func test_emptyPhrase_isSaidOnlyWhenNoCircleHasAnyone() {
        XCTAssertEqual(ProfileCirclesSection.emptyPhrase(for: .empty, hasServedLinks: true), "Tes cercles se remplissent à mesure que tu échanges")
        let filled = ProfileCirclesSummary.make(links: [RelationLink(userId: "a", effectiveLevel: .friend, grantedByMe: .friend)], pendingCount: 0)
        XCTAssertNil(ProfileCirclesSection.emptyPhrase(for: filled, hasServedLinks: true))
    }

    func test_pillColumns_atAccessibilityTextSizes_wrapTheFiveCirclesOnTwoRows() {
        XCTAssertEqual(ProfileCirclesSection.pillColumns(isAccessibilitySize: false), 5, "les cinq cercles d'une seule rangée")
        XCTAssertEqual(ProfileCirclesSection.pillColumns(isAccessibilitySize: true), 3, "aux grandes tailles, aucun nom n'est écrasé")
    }

    func test_emptyPhrase_beforeTheLinksAreServed_isAbsent() {
        XCTAssertNil(ProfileCirclesSection.emptyPhrase(for: .empty, hasServedLinks: false),
                     "cinq zéros pendant le chargement ne disent pas encore « aucun lien »")
    }

    func test_circleDoors_leadToMyCircles_myRequests_andTheReferral() {
        XCTAssertEqual(openedPath(.circles), [.contacts(.circles)])
        XCTAssertEqual(openedPath(.requests), [.peopleDiscovery(.requests)])
        XCTAssertEqual(openedPath(.invite), [.affiliate])
    }

    // MARK: - Mon activité

    func test_activityAccessibilityLabel_pairsEachOfTheThreeValuesWithItsNoun() {
        let stats = UserStats(totalMessages: 12, totalConversations: 3, totalTranslations: 40, friendRequestsReceived: 9)

        let label = ProfileActivityBand.accessibilityLabel(stats: stats)

        XCTAssertTrue(label.contains("12 Messages"), label)
        XCTAssertTrue(label.contains("3 Conversations"), label)
        XCTAssertTrue(label.contains("40 Traductions"), label)
        XCTAssertFalse(label.contains("9"), "un compteur de demandes n'est pas une statistique : \(label)")
    }

    func test_activityValues_beforeTheServerAnswers_areZeros() {
        XCTAssertEqual(ProfileActivityBand.values(of: nil).map(\.value), [0, 0, 0])
    }

    // MARK: - Mes contenus

    func test_savedContentRows_areStarred_thenBookmarks_thenMyPacks() {
        XCTAssertEqual(ProfileSavedContentRows.doors, [.starredMessages, .bookmarks, .myPacks])
    }

    func test_savedContentDoors_leadToTheStarredMessages_theBookmarks_andMyPacks() {
        XCTAssertEqual(openedPath(.starredMessages), [.starredMessages])
        XCTAssertEqual(openedPath(.bookmarks), [.bookmarks])
        XCTAssertEqual(openedPath(.myPacks), [.settings], "Mes packs s'ouvrent par les Réglages, qui présentent la page « Mes packs »")
    }

    func test_myPacksDoor_asksTheShopForMyPacksPage() {
        let router = Router()
        ProfileDoor.myPacks.open(with: RouterCommands(router: router))
        let request = PackShopLauncher.shared.consume()
        XCTAssertEqual(request?.page, .mine)
    }
}
