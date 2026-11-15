import XCTest
import MeeshySDK
import MeeshyUI
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

    func test_activityValues_withServedStats_areTheCardsOfMyActivity() {
        let stats = UserStats(totalMessages: 12, totalConversations: 3, totalTranslations: 40)

        XCTAssertEqual(ProfileActivityBand.values(of: stats), UserActivityCards.make(stats: stats),
                       "la bande et l'écran Mon activité disent les mêmes nombres, sous les mêmes noms et les mêmes couleurs")
    }

    // MARK: - Contact

    func test_contactFieldFocus_emailAndPhone_openSecurityOnTheirOwnSection() {
        XCTAssertEqual(ProfileContactSection.Field.email.securityFocus, .securityEmail)
        XCTAssertEqual(ProfileContactSection.Field.phone.securityFocus, .securityPhone)
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

    // MARK: - Recette du 2026-11-15 et contre-audit (#18590)

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    func test_activityBand_atAccessibilityTextSizes_stacksItsCardsOnePerLine() {
        XCTAssertTrue(ProfileActivityBand.stacksVertically(isAccessibilitySize: true),
                      "côte à côte en grand texte, « Conversations » se tronquait")
        XCTAssertFalse(ProfileActivityBand.stacksVertically(isAccessibilitySize: false))
    }

    func test_pillLayouts_atStandardSizes_triesOneRowThenTwo_neverShrinkingTheNames() {
        XCTAssertEqual(ProfileCirclesSection.pillLayouts(isAccessibilitySize: false), [5, 3])
        XCTAssertEqual(ProfileCirclesSection.pillLayouts(isAccessibilitySize: true), [3])
        XCTAssertGreaterThanOrEqual(ProfileCirclesSection.pillSpacing, MeeshySpacing.sm,
                                    "« Communauté » et « Connaissance » ne se touchent plus")
    }

    func test_profileButtons_answerTheTouch_withThePressResponseOfTheKit() throws {
        for path in ["Meeshy/Features/Profile/Views/ProfileSectionChrome.swift",
                     "Meeshy/Features/Profile/Views/ProfileContactSection.swift",
                     "Meeshy/Features/Profile/Views/ProfileCirclesSection.swift",
                     "Meeshy/Features/Profile/Views/ProfileActivityBand.swift"] {
            let source = try code(path)
            XCTAssertFalse(source.contains(".buttonStyle(.plain)"), "\(path) : rien ne répondait au toucher")
            XCTAssertTrue(source.contains(".buttonStyle(PressableButtonStyle())"), path)
        }
    }

    func test_profileView_bannerAndAvatar_areButtonsThatSinkUnderTheFinger() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertFalse(profile.contains(".onTapGesture"), "un toucher nu ne répond pas avant le zoom")
        XCTAssertTrue(profile.contains("photoButton(ProfileOwnBanner.openablePhoto(of: user))"))
        XCTAssertTrue(profile.contains("photoButton(user?.avatar)"))
        XCTAssertTrue(profile.contains(".zoomTransitionSource(id: url ?? \"\", in: photoZoomSpace)"))
    }

    func test_profileView_securitySheet_declaresItselfToTheSurfaceRegistry() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(profile.contains("SecurityView(focus: focus).environmentObject(authManager).closesForConversationOpening(.sheet)"))
    }

    func test_myActivity_opensOnTheRouterStack() {
        let router = Router()
        RouterCommands(router: router).push(.userStats)
        XCTAssertEqual(router.path, [.userStats])
    }

    // MARK: - La fiche part, puis le contenu s'ouvre

    func test_departure_dismissesTheSheet_butOpensNothingBeforeItLeaves() {
        let departure = ProfileSheetDeparture()
        var dismissed = 0
        var opened = 0

        departure.leave(dismissing: { dismissed += 1 }, then: { opened += 1 })

        XCTAssertEqual(dismissed, 1)
        XCTAssertEqual(opened, 0, "présentée pendant que la fiche descend, la feuille serait avalée")
    }

    func test_departure_opensOnce_whenTheSheetHasLeft() {
        let departure = ProfileSheetDeparture()
        var opened = 0
        departure.leave(dismissing: {}, then: { opened += 1 })

        departure.sheetDidLeave()
        departure.sheetDidLeave()

        XCTAssertEqual(opened, 1)
    }

    func test_departure_withNothingWaiting_opensNothing() {
        let departure = ProfileSheetDeparture()
        departure.sheetDidLeave()
        var opened = 0
        departure.leave(dismissing: {}, then: { opened += 1 })
        departure.leave(dismissing: {}, then: { opened += 10 })
        departure.sheetDidLeave()

        XCTAssertEqual(opened, 10, "une seule ouverture attend : la dernière demandée")
    }

    func test_postsOpener_noLongerWaitsAClockNorPostsANotification() throws {
        let opening = try code("Meeshy/Features/Profile/Views/ProfilePostOpening.swift")
        XCTAssertFalse(opening.contains("pushNavigateToRoute"))
        XCTAssertFalse(opening.contains("cancellableSleep"))
        let list = try code("Meeshy/Features/Profile/Views/ProfileUserPostsList.swift")
        XCTAssertFalse(list.contains("asyncAfter"))
        XCTAssertTrue(list.contains(".onDisappear(perform: listDidLeave)"))
        XCTAssertTrue(list.contains("departure.sheetDidLeave()"))
        XCTAssertTrue(list.contains("router.push(.postDetail(post.id, post))"))
    }

    // MARK: - L'auteur touché sur une carte du profil

    func test_authorTap_onTheListedAuthor_opensNothing_hisProfileIsAlreadyThere() {
        let post = FeedPost(author: "Ana", authorId: "ana", authorUsername: "ana", content: "réel")
        XCTAssertNil(ProfileAuthorTap.profile(of: "ana", in: post, listedUserId: "ana"))
        XCTAssertNil(ProfileAuthorTap.profile(of: "", in: post, listedUserId: "ana"))
    }

    func test_authorTap_onARepublishedAuthor_opensHisOwnProfile() {
        let original = RepostContent(author: "Bob", authorId: "bob", authorUsername: "bobby", content: "original")
        let post = FeedPost(author: "Ana", authorId: "ana", authorUsername: "ana", content: "", repost: original)

        let profile = ProfileAuthorTap.profile(of: "bob", in: post, listedUserId: "ana")

        XCTAssertEqual(profile?.userId, "bob")
        XCTAssertEqual(profile?.username, "bobby")
    }

    func test_postsList_authorTap_isNeverAnInertButton_andTheFilterUsesAMotionToken() throws {
        let list = try code("Meeshy/Features/Profile/Views/ProfileUserPostsList.swift")
        XCTAssertFalse(list.contains("onTapAuthor: { _ in }"))
        XCTAssertTrue(list.contains("onTapAuthor: { authorId in openAuthor(authorId, of: post) }"))
        XCTAssertFalse(list.contains("withAnimation(.spring("))
    }
}
