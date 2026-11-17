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
        let expected = String.localizedStringWithFormat(served("profile.circles.pill.a11y"), "Ami", 3)
        XCTAssertEqual(ProfileCirclesSection.pillAccessibilityLabel(title: "Ami", count: 3), expected)
        XCTAssertTrue(expected.hasPrefix("Ami, "), "le cercle d'abord, puis ses personnes : \(expected)")
        XCTAssertTrue(expected.contains("3"), expected)
    }

    func test_requestsText_withNothingToAnswer_isAbsent() {
        XCTAssertNil(ProfileCirclesSection.requestsText(count: 0))
    }

    func test_requestsText_withRequests_saysHowManyToAnswer() {
        let expected = String.localizedStringWithFormat(served("profile.circles.requests"), 2)
        XCTAssertEqual(ProfileCirclesSection.requestsText(count: 2), expected)
        XCTAssertTrue(expected.hasPrefix("2 "), expected)
    }

    func test_emptyPhrase_isSaidOnlyWhenNoCircleHasAnyone() {
        XCTAssertEqual(ProfileCirclesSection.emptyPhrase(for: .empty, hasServedLinks: true), served("profile.circles.empty"))
        let filled = ProfileCirclesSummary.make(links: [RelationLink(userId: "a", effectiveLevel: .friend, grantedByMe: .friend)], pendingCount: 0)
        XCTAssertNil(ProfileCirclesSection.emptyPhrase(for: filled, hasServedLinks: true))
    }

    func test_scaleLevels_areTheFiveCircles_fromTheWidestToTheMostIntimate() {
        let summary = ProfileCirclesSummary.make(links: [], pendingCount: 0)
        XCTAssertEqual(ProfileCirclesSection.scaleLevels(of: summary).map(\.title),
                       ProfileCirclesSummary.levels.map(CircleLevelNames.title(of:)))
        XCTAssertEqual(ProfileCirclesSection.scaleLevels(of: summary).map(\.systemImage),
                       ProfileCirclesSummary.levels.map(VitrineSeenAsCopy.glyph(of:)),
                       "le même glyphe que l'échelle de « Voir comme »")
    }

    func test_scaleCounts_sayHowManyPeopleLiveInEachCircle_zeroIncluded() {
        let summary = ProfileCirclesSummary.make(links: [
            RelationLink(userId: "a", effectiveLevel: .friend, grantedByMe: .friend),
            RelationLink(userId: "b", effectiveLevel: .friend, grantedByMe: .close),
            RelationLink(userId: "c", effectiveLevel: .blood, grantedByMe: .blood)
        ], pendingCount: 0)
        XCTAssertEqual(ProfileCirclesSection.scaleCounts(of: summary), [0, 0, 2, 0, 1])
    }

    func test_scaleAccessibilityLabel_namesTheSectionThenEveryCircleWithItsPeople() {
        let summary = ProfileCirclesSummary.make(links: [RelationLink(userId: "a", effectiveLevel: .friend, grantedByMe: .friend)],
                                                 pendingCount: 0)
        let label = ProfileCirclesSection.accessibilityLabel(summary: summary)
        XCTAssertTrue(label.hasPrefix(ProfileCirclesSection.title), label)
        let friend = ProfileCirclesSection.pillAccessibilityLabel(title: CircleLevelNames.title(of: .friend), count: 1)
        XCTAssertTrue(label.contains(friend), label)
        let blood = ProfileCirclesSection.pillAccessibilityLabel(title: CircleLevelNames.title(of: .blood), count: 0)
        XCTAssertTrue(label.contains(blood), "un cercle vide se dit aussi : \(label)")
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

        XCTAssertTrue(label.contains("12 " + served("user.stats.messages")), label)
        XCTAssertTrue(label.contains("3 " + served("user.stats.conversations")), label)
        XCTAssertTrue(label.contains("40 " + served("user.stats.translations")), label)
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

    func test_activityFigures_areTheThreeCardsOfMyActivity_writtenByTheLocale() {
        let stats = UserStats(totalMessages: 12480, totalConversations: 86, totalTranslations: 9310)
        let figures = ProfileActivityBand.figures(of: stats, locale: Locale(identifier: "en_US"))
        XCTAssertEqual(figures.map(\.value), ["12,480", "86", "9,310"])
        XCTAssertEqual(figures.map(\.unit), UserActivityCards.make(stats: stats).map(\.label))
    }

    func test_circlesAndActivity_areMadeOfTheKit_theScaleWithCountsAndTheFigureBand() throws {
        let circles = try code("Meeshy/Features/Profile/Views/ProfileCirclesSection.swift")
        XCTAssertTrue(circles.contains("MeeshyCircleScale("), "les pastilles sont l'échelle K33")
        XCTAssertTrue(circles.contains("form: .dots"))
        XCTAssertTrue(circles.contains("counts: Self.scaleCounts(of: summary)"))
        XCTAssertTrue(circles.contains("ScrollView(.horizontal"), "aux grandes tailles, l'échelle défile au lieu d'écraser les noms")
        XCTAssertFalse(circles.contains("ProfileCirclePill"), "aucune pastille redessinée sur place (loi 12)")
        let band = try code("Meeshy/Features/Profile/Views/ProfileActivityBand.swift")
        XCTAssertTrue(band.contains("MeeshyFigureBand("), "les trois nombres sont la bande K34")
        XCTAssertFalse(band.contains("RoundedRectangle"), "aucune carte redessinée sur place (loi 12)")
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

    /// La valeur SERVIE par le catalogue pour la langue du simulateur : le témoin tient en français comme en anglais (CI).
    private func served(_ key: String) -> String { Bundle.main.localizedString(forKey: key, value: nil, table: nil) }
}
