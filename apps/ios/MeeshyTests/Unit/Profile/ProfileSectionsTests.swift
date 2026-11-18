import XCTest
import SwiftUI
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

    func test_circlesPhase_paintsNoZeroBeforeAnythingIsServed_andOffersRetryAfterAFailure() {
        XCTAssertEqual(ProfileCirclesSection.phase(hasServedLinks: false, loadState: .loading), .loading)
        XCTAssertEqual(ProfileCirclesSection.phase(hasServedLinks: false, loadState: .idle), .loading)
        XCTAssertEqual(ProfileCirclesSection.phase(hasServedLinks: false, loadState: .offline), .unavailable(offline: true))
        XCTAssertEqual(ProfileCirclesSection.phase(hasServedLinks: false, loadState: .error("x")), .unavailable(offline: false))
        XCTAssertEqual(ProfileCirclesSection.phase(hasServedLinks: true, loadState: .error("x")), .counts,
                       "un échec ne retire jamais ce qui est servi")
        let label = ProfileCirclesSection.accessibilityLabel(summary: .empty, isLoading: true)
        XCTAssertFalse(label.contains("0"), "pendant le chargement, VoiceOver ne dit aucun zéro : \(label)")
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

    /// Planche `Etat-Vide` vue 1 : ma face Liens sans lien propose ses trois familles, chacune menant à sa page.
    func test_firstLinkShortcuts_areShareTrackingAndReferral_eachLeadingToItsPage() {
        XCTAssertEqual(ProfileCreatedLinks.firstLinkShortcuts, [.share, .tracking, .referral])
        XCTAssertEqual(ProfileCreatedLinks.firstLinkShortcuts.map { ProfileCreatedLinks.route(for: $0) },
                       [.shareLinks, .trackingLinks, .affiliate])
        XCTAssertEqual(ProfileCreatedLinks.route(for: .community), .communityLinks)
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

    func test_activityFigures_whileLoadingAnEmptyCache_haveNoValue_soTheKitDrawsItsSkeleton() {
        let figures = ProfileActivityBand.figures(of: nil, isLoading: true)
        XCTAssertEqual(figures.map(\.value), [nil, nil, nil], "jamais un zéro inventé pendant le chargement")
        XCTAssertEqual(figures.map(\.unit), UserActivityCards.make(stats: nil).map(\.label))
    }

    func test_activityFigures_whileLoadingWithACachedValue_showTheCache() {
        let stats = UserStats(totalMessages: 12, totalConversations: 3, totalTranslations: 40)
        let figures = ProfileActivityBand.figures(of: stats, isLoading: true, locale: Locale(identifier: "en_US"))
        XCTAssertEqual(figures.map(\.value), ["12", "3", "40"], "le cache se peint, le squelette cède")
    }

    func test_activityAccessibilityLabel_whileLoading_saysItLoads_andNoZero() {
        let label = ProfileActivityBand.accessibilityLabel(stats: nil, isLoading: true)
        XCTAssertEqual(label, "\(ProfileActivityBand.title): \(ProfileActivityBand.loadingLabel)")
        XCTAssertFalse(label.contains("0"), label)
    }

    func test_activityPhase_emptyCacheWhileLoading_isTheSkeleton() {
        XCTAssertEqual(ProfileActivityBand.phase(stats: nil, isLoading: true, isOffline: false), .skeleton)
        XCTAssertEqual(ProfileActivityBand.phase(stats: nil, isLoading: true, isOffline: true), .skeleton)
    }

    func test_activityPhase_withAValue_showsTheFigures_evenOfflineOrAfterAFailure() {
        let stats = UserStats(totalMessages: 12, totalConversations: 3, totalTranslations: 40)
        XCTAssertEqual(ProfileActivityBand.phase(stats: stats, isLoading: false, isOffline: true), .figures,
                       "un échec garde ce qui est affiché : le cache reste peint")
        XCTAssertEqual(ProfileActivityBand.phase(stats: stats, isLoading: true, isOffline: false), .figures)
    }

    func test_activityPhase_nothingServedAndLoadingOver_isUnavailable_neverZeros() {
        XCTAssertEqual(ProfileActivityBand.phase(stats: nil, isLoading: false, isOffline: false),
                       .unavailable(offline: false))
        XCTAssertEqual(ProfileActivityBand.phase(stats: nil, isLoading: false, isOffline: true),
                       .unavailable(offline: true), "hors ligne se dit hors ligne, pas « erreur »")
    }

    func test_activityFigures_afterAFailureOnAnEmptyCache_haveNoValue_neverAnInventedZero() {
        let figures = ProfileActivityBand.figures(of: nil, isLoading: false)
        XCTAssertEqual(figures.map(\.value), [nil, nil, nil])
    }

    func test_activityUnavailableTitles_sayOfflineOrUnavailable_andTheBlockOffersRetry() throws {
        XCTAssertNotEqual(ProfileActivityBand.unavailableTitle(offline: true),
                          ProfileActivityBand.unavailableTitle(offline: false))
        let band = try code("Meeshy/Features/Profile/Views/ProfileActivityBand.swift")
        XCTAssertTrue(band.contains("MeeshyStateBlock("), "l'état indisponible est le bloc d'état K38")
        XCTAssertTrue(band.contains("ProfilePublicationsCopy.retry"), "Réessayer, le même mot que Publications")
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(profile.contains("onRetry: retryStats"), "Réessayer relance le chargement de Mon activité")
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

    func test_vitrineSections_titleWithTheSectionHeaderOfTheKit_neverTheOldOverline() throws {
        for path in ["Meeshy/Features/Profile/Views/ProfileCirclesSection.swift",
                     "Meeshy/Features/Profile/Faces/ProfileVoiceSection.swift",
                     "Meeshy/Features/Profile/Faces/ProfilePublicationsSection.swift"] {
            let source = try code(path)
            XCTAssertTrue(source.contains("MeeshySectionHeader("), "\(path) : l'en-tête est K44")
            XCTAssertFalse(source.contains("ProfileSectionHeader("), "\(path) : aucun en-tête redessiné sur place (loi 12)")
        }
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(profile.contains("MeeshySectionHeader(title: ProfileActivityBand.title)"), "Mon activité porte l'en-tête K44")
    }

    func test_circlesSection_putsTheRequestsInItsHeader_andInvitesWithTheButtonOfTheKit() throws {
        let circles = try code("Meeshy/Features/Profile/Views/ProfileCirclesSection.swift")
        XCTAssertTrue(circles.contains("accessory: { requestsButton }"), "« N demandes à répondre » est l'accessoire de l'en-tête")
        XCTAssertTrue(circles.contains("MeeshyButton(Self.inviteTitle"), "« Inviter quelqu'un » est le bouton K40")
        XCTAssertFalse(circles.contains("ProfileNavigationRow("), "plus de rangées sous l'échelle : la planche n'en dessine pas")
        XCTAssertTrue(circles.contains("onOpen(.requests)"))
        XCTAssertTrue(circles.contains("onOpen(.invite)"))
    }

    func test_profileButtons_answerTheTouch_withThePressResponseOfTheKit() throws {
        for path in ["Meeshy/Features/Profile/Views/ProfileCirclesSection.swift",
                     "Meeshy/Features/Profile/Views/ProfileActivityBand.swift"] {
            let source = try code(path)
            XCTAssertFalse(source.contains(".buttonStyle(.plain)"), "\(path) : rien ne répondait au toucher")
            XCTAssertTrue(source.contains(".buttonStyle(PressableButtonStyle())"), path)
        }
        let contact = try code("Meeshy/Features/Profile/Views/ProfileContactSection.swift")
        XCTAssertFalse(contact.contains(".buttonStyle(.plain)"))
        XCTAssertTrue(contact.contains("MeeshyToggleRow("), "une rangée de Contact s'enfonce sous le doigt avec la rangée K06")
    }

    // MARK: - Ma vitrine est faite du kit : plus d'en-tête ni de carte maison (#19537)

    private static let vitrineSurfaces = ["Views/ProfileContactSection.swift", "Views/ProfileIdentitySection.swift",
                                          "Views/ProfileCirclesSection.swift", "Views/ProfileActivityBand.swift",
                                          "Faces/VitrineCrans.swift", "Faces/ProfileVoiceSection.swift"]

    func test_vitrineSections_titleWithK44_andSitOnK43_neverOnTheHouseChrome() throws {
        for path in Self.vitrineSurfaces {
            let source = try code("Meeshy/Features/Profile/" + path)
            XCTAssertFalse(source.contains("ProfileSectionHeader("), "\(path) : aucun en-tête redessiné sur place (loi 12)")
            XCTAssertFalse(source.contains("ProfileSectionCard("), "\(path) : aucune carte redessinée sur place (loi 12)")
            XCTAssertFalse(source.contains("ProfileFieldIcon("), "\(path) : aucune pastille d'icône redessinée sur place")
            XCTAssertTrue(source.contains("MeeshyGroupCard("), "\(path) : la surface est la carte K43")
        }
        for path in ["Views/ProfileContactSection.swift", "Views/ProfileIdentitySection.swift"] {
            XCTAssertTrue(try code("Meeshy/Features/Profile/" + path).contains("MeeshySectionHeader("), "\(path) : l'en-tête est K44")
        }
    }

    func test_houseChrome_hasLeftTheApp_onceNoSectionCallsIt() {
        XCTAssertThrowsError(try AppSourceGuard.unit("Meeshy/Features/Profile/Views/ProfileSectionChrome.swift"),
                             "ProfileSectionChrome.swift n'a plus d'appelant : il est retiré")
    }

    func test_contactRow_saysItsFieldValueAndVerification_inTheRowOfTheKit() {
        let verified = ProfileContactSection.rowContent(title: "E-mail", value: "aissa@exemple.sn", verified: true)
        XCTAssertEqual(verified.title, "E-mail")
        XCTAssertEqual(verified.subtitle, "aissa@exemple.sn")
        XCTAssertEqual(verified.accessory, .chevron, "la rangée mène à Sécurité, elle le montre")
        XCTAssertEqual(verified.titleAccessoryLabel, ProfileContactSection.verificationWord(isVerified: true),
                       "la pastille est muette : la rangée dit l'état de vérification à VoiceOver")
        let unverified = ProfileContactSection.rowContent(title: "Téléphone", value: "+221 42", verified: false)
        XCTAssertEqual(unverified.titleAccessoryLabel, ProfileContactSection.verificationWord(isVerified: false))
        XCTAssertNotEqual(ProfileContactSection.verificationWord(isVerified: true),
                          ProfileContactSection.verificationWord(isVerified: false))
        let missing = ProfileContactSection.rowContent(title: "Téléphone", value: nil, verified: nil)
        XCTAssertEqual(missing.subtitle, "—")
        XCTAssertNil(missing.titleAccessoryLabel, "un contact absent n'a rien à vérifier")
    }

    func test_contactVerification_isTheBadgeOfTheKit() throws {
        let contact = try code("Meeshy/Features/Profile/Views/ProfileContactSection.swift")
        XCTAssertTrue(contact.contains("MeeshyBadge("), "« Vérifié » / « Non vérifié » est la pastille K41")
        XCTAssertFalse(contact.contains("Capsule()"), "aucune pastille redessinée sur place")
        XCTAssertTrue(contact.contains("onOpenSecurity(field.securityFocus)"), "chaque rangée ouvre toujours SA section de Sécurité")
    }

    func test_identity_editsInTheFieldOfTheKit_andTheBioCountsUpToTheServerLimit() throws {
        XCTAssertEqual(ProfileIdentitySection.bioLimit, 500, "la passerelle refuse une bio au-delà de 500 caractères")
        let identity = try code("Meeshy/Features/Profile/Views/ProfileIdentitySection.swift")
        XCTAssertTrue(identity.contains("MeeshyField("), "en édition, chaque champ est K08")
        XCTAssertFalse(identity.contains("TextField("), "aucun champ redessiné sur place")
        XCTAssertTrue(identity.contains("MeeshyToggleRowFace("), "au repos, chaque valeur se lit dans le dessin de la rangée K06")
        XCTAssertTrue(identity.contains("MeeshySectionHeader(title: ProfileAccentCopy.title"), "« Couleur d'accent » porte l'en-tête K44")
    }

    func test_decorEntry_isTheRowOfTheKit_andStillOpensTheDecorSheet() throws {
        let decor = try code("Meeshy/Features/Profile/Views/ProfileDecorSheet.swift")
        XCTAssertTrue(decor.contains("MeeshyToggleRow(ProfileDecorEntry.title"), "l'entrée du décor est la rangée K06")
        XCTAssertFalse(decor.contains("theme.surface(tint: MeeshyColors.indigo300Hex"), "plus de fond de rangée dessiné à la main")
        XCTAssertTrue(decor.contains("showSheet = true"), "toucher la rangée ouvre toujours la feuille du décor")
        XCTAssertNotEqual(ProfileDecorEntry.title, ProfileDecorEntry.subtitle)
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

    // MARK: - Ma voix (K35)

    func test_voiceSample_withoutAServedSample_hasNoSection() {
        XCTAssertNil(ProfileVoiceSample.make(user: nil))
        XCTAssertNil(ProfileVoiceSample.make(user: MeeshyUser(id: "me", username: "aicha")))
        XCTAssertNil(ProfileVoiceSample.make(user: MeeshyUser(id: "me", username: "aicha", voiceSampleUrl: "  ")))
    }

    func test_voiceSample_readsTheServedUrl_itsVisibility_andItsDurationInSeconds() {
        let user = MeeshyUser(id: "me", username: "aicha", voicePublic: true,
                              voiceSampleUrl: "/media/voice.m4a", voiceSampleDurationMs: 12_400)
        let sample = ProfileVoiceSample.make(user: user)
        XCTAssertEqual(sample, ProfileVoiceSample(url: "/media/voice.m4a", isPublic: true, servedDuration: 12.4))
        let unsaid = ProfileVoiceSample.make(user: MeeshyUser(id: "me", username: "aicha", voiceSampleUrl: "/v.m4a"))
        XCTAssertEqual(unsaid?.isPublic, false, "une visibilité absente se lit privée")
    }

    func test_voiceToggle_startsTheSample_untilItIsLoaded_thenPausesOrResumesIt() {
        let sample = ProfileVoiceSample(url: "/v.m4a", isPublic: true, servedDuration: 9)
        XCTAssertEqual(sample.toggle(loadedURL: nil), .start("/v.m4a"), "jamais lu, ou allé au bout")
        XCTAssertEqual(sample.toggle(loadedURL: "/autre.m4a"), .start("/v.m4a"), "un autre son chargé ne se reprend pas")
        XCTAssertEqual(sample.toggle(loadedURL: "/v.m4a"), .pauseOrResume)
        XCTAssertFalse(sample.acceptsScrub(loadedURL: nil), "rien à déplacer avant le chargement")
        XCTAssertTrue(sample.acceptsScrub(loadedURL: "/v.m4a"))
    }

    func test_voiceToggle_afterAFailedLoad_startsAgain_insteadOfResumingNothing() {
        let sample = ProfileVoiceSample(url: "/v.m4a", isPublic: true, servedDuration: 9)
        let failed = ProfileVoiceSample.loadedURL(currentUrl: "/v.m4a", hasPlayer: false, isLoading: false)
        XCTAssertNil(failed, "un son demandé sans lecteur n'est pas chargé")
        XCTAssertEqual(sample.toggle(loadedURL: failed), .start("/v.m4a"), "le toucher suivant relance l'échantillon")
        XCTAssertFalse(sample.acceptsScrub(loadedURL: failed), "aucun glissement vers un lecteur absent")
        let playing = ProfileVoiceSample.loadedURL(currentUrl: "/v.m4a", hasPlayer: true, isLoading: false)
        XCTAssertEqual(sample.toggle(loadedURL: playing), .pauseOrResume)
        let buffering = ProfileVoiceSample.loadedURL(currentUrl: "/v.m4a", hasPlayer: false, isLoading: true)
        XCTAssertEqual(buffering, "/v.m4a", "un chargement en cours tient le son")
    }

    func test_voiceSection_saysAFailedLoad_andTheKitForgetsTheUrlItCouldNotLoad() throws {
        let voice = try code("Meeshy/Features/Profile/Faces/ProfileVoiceSection.swift")
        XCTAssertTrue(voice.contains("if player.loadFailed"), "l'échec se dit, le disque reste touchable")
        XCTAssertFalse(voice.contains("toggle(loadedURL: player.currentUrl)"), "jamais l'URL seulement demandée")
    }

    func test_voiceDuration_isTheServedOne_untilTheFileTellsItsOwn() {
        let sample = ProfileVoiceSample(url: "/v.m4a", isPublic: true, servedDuration: 9)
        XCTAssertEqual(sample.shownDuration(playerDuration: 0), 9)
        XCTAssertEqual(sample.shownDuration(playerDuration: .nan), 9)
        XCTAssertEqual(sample.shownDuration(playerDuration: 11.5), 11.5)
        XCTAssertEqual(ProfileVoiceSample.phase(isLoading: true), .buffering)
        XCTAssertEqual(ProfileVoiceSample.phase(isLoading: false), .ready)
    }

    func test_vitrine_mountsMyVoice_outOfEditing_andItsPlayerIsTheKitWavePlayer() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(profile.contains("ProfileVoiceBlock.resolve(sample: sample, isEditing: isEditing)"))
        let voice = try code("Meeshy/Features/Profile/Faces/ProfileVoiceSection.swift")
        XCTAssertTrue(voice.contains("MeeshyWavePlayer("), "le lecteur est K35, aucun lecteur redessiné sur place")
        XCTAssertTrue(voice.contains("player.play(urlString: url)"), "le disque lit vraiment l'échantillon servi")
        XCTAssertTrue(voice.contains(".onDisappear { player.stop() }"), "la voix se tait quand on quitte la fiche")
    }

    // MARK: - Face Actions (Moi-Actions)

    func test_actionsHeader_namesMyHandle_withTheAtSign_andSaysNothingWithoutAUser() {
        XCTAssertEqual(ProfileActionsCopy.handle(of: MeeshyUser(id: "me", username: "aissa")), "@aissa")
        XCTAssertNil(ProfileActionsCopy.handle(of: MeeshyUser(id: "me", username: "  ")))
        XCTAssertNil(ProfileActionsCopy.handle(of: nil))
    }

    func test_actionsFace_opensWithMyAvatar_theActionsTitle_andMyHandle() throws {
        let face = try code("Meeshy/Features/Profile/Faces/ProfileActionsFace.swift")
        let header = try code("Meeshy/Features/Profile/Faces/ProfileFaceHeader.swift")
        XCTAssertTrue(face.contains("ProfileFaceHeader(user: user, title: ProfileActionsCopy.title"),
                      "l'en-tête commun des faces, titré « Actions »")
        XCTAssertTrue(header.contains("MeeshyAvatar(name:"), "l'avatar de la planche, celui du kit")
        XCTAssertTrue(header.contains("ProfileActionsCopy.handle(of: user)"))
        XCTAssertTrue(header.contains(".accessibilityAddTraits(.isHeader)"), "le nom de la face est son titre pour VoiceOver")
    }

    func test_actionsHeader_sitsOnTheLivingBannerOfTheKit_asAVeilOfThePlancheHeight() throws {
        let header = try code("Meeshy/Features/Profile/Faces/ProfileFaceHeader.swift")
        XCTAssertTrue(header.contains("MeeshyLivingBanner(tint: Color(hex: accentColor), mode: .veil, height: Self.height)"),
                      "le dégradé et les orbes de la planche sont la bannière K27, jamais redessinés (loi 12)")
        XCTAssertFalse(header.contains("LinearGradient("), "aucun dégradé redessiné sur place")
        XCTAssertEqual(ProfileFaceHeader<EmptyView>.height, 150, "la hauteur de l'en-tête de Moi-Actions et Moi-Liens")
    }

    func test_actionsFace_offersMyStatus_whichOpensTheMoodComposerDoor_onlyWhereTheStatusModelIsServed() throws {
        let face = try code("Meeshy/Features/Profile/Faces/ProfileActionsFace.swift")
        XCTAssertTrue(face.contains("if canSetMood"), "« Mon statut » n'est offert que là où le modèle des statuts est servi")
        XCTAssertTrue(face.contains("ProfileActionsCopy.mood"))
        XCTAssertTrue(face.contains("onAction(.mood)"))
        let presentations = try code("Meeshy/Features/Profile/Faces/ProfileFacesPresentations.swift")
        XCTAssertTrue(presentations.contains("MoodComposerDoor("), "la même porte que la pastille d'humeur, jamais un composer redessiné")
        XCTAssertTrue(presentations.contains("ComposerIntent(origin: .moodChip)"))
        let chrome = try code("Meeshy/Features/Navigation/SocialChromeEnvironment.swift")
        XCTAssertTrue(chrome.contains(".environment(\\.meeshyStatusComposer, status)"),
                      "le modèle des statuts voyage par EnvironmentValues : une feuille en hérite, l'absence ne trappe pas")
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(profile.contains("case .mood: moodComposerShown = true"))
        XCTAssertTrue(profile.contains("canSetMood: statusComposer != nil"))
    }

    // MARK: - Publications (K49)

    func test_publicationTiles_onAnEmptyCacheWhileLoading_areThreeSkeletons_neverASpinner() {
        let tiles = ProfilePublicationTiles.items(posts: [], isLoading: true)
        XCTAssertEqual(tiles.map(\.kind), [.skeleton, .skeleton, .skeleton])
        XCTAssertTrue(ProfilePublicationTiles.items(posts: [], isLoading: false).isEmpty, "rien de publié : la section se tait")
    }

    func test_publicationsState_whenTheFirstLoadFailsOnAnEmptyCache_offersToRetry_insteadOfFallingSilent() {
        let state = ProfilePublicationTiles.state(posts: [], isLoading: false, pagination: .error("x"))
        XCTAssertEqual(state, .failed, "une erreur a toujours une sortie : Réessayer")
    }

    func test_publicationsState_whileRetrying_showsTheSkeletons_andAServedListIsNeverHiddenByAnError() {
        let retrying = ProfilePublicationTiles.state(posts: [], isLoading: true, pagination: .error("x"))
        XCTAssertEqual(retrying, .tiles(ProfilePublicationTiles.items(posts: [], isLoading: true)))
        let post = FeedPost(id: "p1", author: "Aïcha", content: "Bonjour")
        let served = ProfilePublicationTiles.state(posts: [post], isLoading: false, pagination: .error("x"))
        XCTAssertEqual(served, .tiles(ProfilePublicationTiles.items(posts: [post], isLoading: false)),
                       "une page suivante en échec ne retire pas ce qui est déjà affiché")
        let notYetAsked = ProfilePublicationTiles.state(posts: [], isLoading: false, pagination: .idle)
        XCTAssertEqual(notYetAsked, .silent, "rien encore demandé : la section attend sans rien affirmer")
    }

    /// Planche `Etat-Vide` vue 3 : le serveur a répondu qu'il n'y a rien — « Rien de publié pour l'instant » et
    /// « Publier quelque chose », jamais une section muette.
    func test_publicationsState_servedAndEmpty_isTheEmptyStateWithItsExit() {
        let nothing = ProfilePublicationTiles.state(posts: [], isLoading: false, pagination: .exhausted)
        XCTAssertEqual(nothing, .empty)
    }

    func test_publicationsSection_onFailure_isTheStateBlockOfTheKit_withRetry() throws {
        let section = try code("Meeshy/Features/Profile/Faces/ProfilePublicationsSection.swift")
        XCTAssertTrue(section.contains("MeeshyStateBlock(kind: .error"), "l'erreur est le bloc d'état K38")
        XCTAssertTrue(section.contains("await viewModel.loadInitial()"))
        XCTAssertTrue(section.contains("ProfilePublicationsCopy.retry"))
    }

    func test_publicationTiles_showMyThreeLatest_aPictureTile_orATextTile() {
        let photo = FeedPost(id: "p1", author: "Aïcha", content: "", media: [FeedMedia(type: .image, url: "/a.jpg")])
        let text = FeedPost(id: "p2", author: "Aïcha", content: "  Bonjour Dakar  ")
        let video = FeedPost(id: "p3", author: "Aïcha", content: "",
                             media: [FeedMedia(type: .video, url: "/v.mp4", thumbnailUrl: "/v.jpg")])
        let older = FeedPost(id: "p4", author: "Aïcha", content: "plus ancien")

        let tiles = ProfilePublicationTiles.items(posts: [photo, text, video, older], isLoading: false)

        XCTAssertEqual(tiles.map(\.id), ["p1", "p2", "p3"], "trois tuiles, la suite derrière « Tout voir »")
        XCTAssertEqual(tiles.map(\.kind), [.media, .text, .media])
        XCTAssertEqual(tiles[1].text, "Bonjour Dakar")
        XCTAssertEqual(ProfilePublicationTiles.thumbnail(of: photo), "/a.jpg")
        XCTAssertEqual(ProfilePublicationTiles.thumbnail(of: video), "/v.jpg", "une vidéo se montre par sa vignette")
        XCTAssertNil(ProfilePublicationTiles.thumbnail(of: text))
    }

    func test_publicationTile_ofAReel_carriesThePlayGlyphAndItsDuration_andSaysWhatItIs() {
        let reel = FeedPost(id: "r1", author: "Aïcha", type: "REEL", content: "Au marché",
                            media: [FeedMedia(type: .video, thumbnailUrl: "/r.jpg", duration: 24)])
        let tile = ProfilePublicationTiles.item(for: reel)
        XCTAssertEqual(tile.badge, MeeshyMediaTileBadge(systemImage: "play.fill", value: reel.media.first?.durationFormatted))
        XCTAssertTrue(tile.label.hasPrefix(ProfilePublicationsCopy.kindName(of: reel)), tile.label)
        XCTAssertTrue(tile.label.contains("Au marché"), tile.label)
        XCTAssertNil(ProfilePublicationTiles.item(for: FeedPost(id: "t", author: "A", content: "x")).badge)
    }

    func test_vitrine_mountsMyPublications_inTheKitGrid_withSeeAll() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(profile.contains("ProfilePublicationsSection(userId: userId, accentColor: accentColor)"))
        let section = try code("Meeshy/Features/Profile/Faces/ProfilePublicationsSection.swift")
        XCTAssertTrue(section.contains("MeeshyMediaGrid("), "la grille est K49, aucune tuile redessinée sur place")
        XCTAssertTrue(section.contains("ProfileUserPostsList(userId: userId"), "« Tout voir » ouvre toute ma liste")
        XCTAssertTrue(section.contains(".closesForConversationOpening(.sheet)"))
    }

    // MARK: - Voir comme : trois crans, la voix, la pastille sur la bannière

    func test_crans_arePublicFriendAndBlood_eachOpeningWhatTheLawOpens() {
        let crans = VitrineCran.make(ownerRole: nil)
        XCTAssertEqual(crans.map(\.level), [.public, .friend, .blood])
        for cran in crans {
            let seen = VitrineSeenAs.make(view: ProfileCircleView.seenAs(cran.level))
            let locked = Set(seen.lockedRows.map(\.row))
            XCTAssertEqual(cran.opened, VitrineSeenAs.Row.allCases.filter { !locked.contains($0) },
                           "le cran \(cran.level) se lit dans la loi, jamais dans une liste à la main")
            XCTAssertEqual(cran.contact, seen.contact)
        }
    }

    func test_crans_neverCloseWhatALowerCircleOpens() {
        let crans = VitrineCran.make(ownerRole: nil)
        let opened = crans.map { Set($0.opened) }
        XCTAssertTrue(opened[0].isSubset(of: opened[1]))
        XCTAssertTrue(opened[1].isSubset(of: opened[2]))
        XCTAssertTrue(opened[2].contains(.presence), "Sang voit ma présence")
    }

    func test_cranSpokenLabel_namesTheCircle_thenWhatItOpens_neverAValue() {
        let cran = VitrineCran(level: .friend, opened: [.presence, .game], contact: .write)
        let label = cran.spokenLabel
        XCTAssertTrue(label.hasPrefix(CircleLevelNames.title(of: .friend)), label)
        XCTAssertTrue(label.contains(VitrineSeenAsCopy.rowTitle(.presence)), label)
        XCTAssertTrue(label.contains(VitrineSeenAsCopy.write), label)
        let empty = VitrineCran(level: .public, opened: [], contact: .unavailable).spokenLabel
        XCTAssertTrue(empty.contains(VitrineSeenAsCopy.cranNothing), empty)
    }

    func test_seenAs_showsMyVoice_onlyWhenIMadeItPublic() {
        let privateVoice = MeeshyUser(id: "me", username: "aicha", voicePublic: false, voiceSampleUrl: "/v.m4a")
        let publicVoice = MeeshyUser(id: "me", username: "aicha", voicePublic: true, voiceSampleUrl: "/v.m4a")
        XCTAssertNil(VitrineSeenAsView.publicVoice(of: privateVoice), "une voix privée ne paraît à aucun cercle")
        XCTAssertEqual(VitrineSeenAsView.publicVoice(of: publicVoice)?.url, "/v.m4a")
    }

    /// « Voir comme » montre ma ville au cercle que j'ai choisi et au-dessus, jamais en dessous ni sans cercle (#19388).
    func test_seenAs_showsMyCity_onlyFromTheCircleIChose() {
        let me = MeeshyUser(id: "me", username: "aicha", city: "Dakar", cityCircle: "FRIEND")
        XCTAssertNil(VitrineSeenAsView.seenCity(of: me, by: .public), "le Public ne lit pas une ville réservée aux amis")
        XCTAssertNil(VitrineSeenAsView.seenCity(of: me, by: .acquaintance))
        XCTAssertEqual(VitrineSeenAsView.seenCity(of: me, by: .friend), "Dakar")
        XCTAssertEqual(VitrineSeenAsView.seenCity(of: me, by: .blood), "Dakar")
        let undecided = MeeshyUser(id: "me", username: "aicha", city: "Dakar")
        XCTAssertNil(VitrineSeenAsView.seenCity(of: undecided, by: .blood), "sans cercle choisi, ma ville n'est qu'à moi")
    }

    func test_viewedByAndWhatSees_sitOnTheBanner() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        let hero = try code("Meeshy/Features/Profile/Views/ProfileOwnHeroPlan.swift")
        XCTAssertTrue(profile.contains("trailing: { heroControls(ProfileOwnHeroPlan.trailing(isEditing: isEditing, progress: progress)) }"),
                      "« Vue par : Moi » est posé sur la bannière, dans les commandes de fin du héros (#19589)")
        XCTAssertEqual(hero.components(separatedBy: "VitrineSeenAsCopy.viewedByMe").count, 2, "une seule porte « Vue par »")
        XCTAssertFalse(profile.contains("VitrineSeenAsCopy.viewedByMe"))
        XCTAssertTrue(profile.contains("case .viewedBy: perform(.seenAs)"), "« Vue par » ouvre l'aperçu par cercle")
        let seenAs = try code("Meeshy/Features/Profile/Faces/VitrineSeenAsView.swift")
        XCTAssertTrue(seenAs.contains(".overlay(alignment: .bottomTrailing) { whatSeesBadge }"))
        XCTAssertTrue(seenAs.contains("VitrineCransSection("))
    }

    func test_bannerWithoutPhotoOrDesign_isTheKitLivingBanner() throws {
        let decor = try code("Meeshy/Features/Profile/Views/ProfileDecorSheet.swift")
        XCTAssertTrue(decor.contains("MeeshyLivingBanner(tint: Color(hex: accentHex), height: Double(height))"),
                      "la bannière nue est K27, plus un dégradé redessiné sur place")
    }

    /// La valeur SERVIE par le catalogue pour la langue du simulateur : le témoin tient en français comme en anglais (CI).
    private func served(_ key: String) -> String { Bundle.main.localizedString(forKey: key, value: nil, table: nil) }
}

// MARK: - La face Liens (#18871, planche `Moi-Liens`)

/// Mes adresses sur le fil, pour les témoins : chaque appel se note, un refus se commande.
private actor AddressServiceDouble: ProfileAddressProviding {
    private(set) var listed: [ProfileAddress]
    private(set) var updates: [(id: String, draft: ProfileAddressDraft)] = []
    private(set) var reorders: [[String]] = []
    private(set) var removed: [String] = []
    private var refuses: Bool

    init(listed: [ProfileAddress] = [], refuses: Bool = false) {
        self.listed = listed
        self.refuses = refuses
    }

    func refuse() { refuses = true }

    func list() async throws -> [ProfileAddress] {
        if refuses { throw URLError(.notConnectedToInternet) }
        return listed
    }

    func create(_ draft: ProfileAddressDraft) async throws -> ProfileAddress {
        if refuses { throw URLError(.badServerResponse) }
        return ProfileAddress(id: "new", title: draft.title ?? "", url: draft.url ?? "", glyph: draft.glyph ?? .site,
                              circle: draft.circle, position: listed.count, clicks: 0, trackedPath: "/l/new")
    }

    func update(id: String, _ draft: ProfileAddressDraft) async throws -> ProfileAddress {
        updates.append((id, draft))
        if refuses { throw URLError(.badServerResponse) }
        return listed.first { $0.id == id } ?? ProfileAddress(id: id, title: "", url: "")
    }

    func remove(id: String) async throws {
        removed.append(id)
        if refuses { throw URLError(.badServerResponse) }
    }

    func reorder(ids: [String]) async throws -> [ProfileAddress] {
        reorders.append(ids)
        if refuses { throw URLError(.badServerResponse) }
        return ids.enumerated().map { index, id in ProfileAddress(id: id, title: id, url: "https://\(id).io", position: index) }
    }
}

/// Les interrupteurs posés depuis les billets, dans leur ordre.
private actor SwitchLog {
    private(set) var sent: [String] = []

    func note(_ entry: String) { sent.append(entry) }
}

private nonisolated struct AddressCacheDouble: ProfileAddressCaching {
    let result: CacheResult<[ProfileAddress]>

    func load() async -> CacheResult<[ProfileAddress]> { result }
    func save(_ addresses: [ProfileAddress]) async {}
}

@MainActor
final class ProfileLinksFaceTests: XCTestCase {

    private func address(_ id: String, shown: Bool = true, clicks: Int? = nil) -> ProfileAddress {
        ProfileAddress(id: id, title: id.capitalized, url: "https://\(id).io", glyph: .site, circle: .public,
                       isShown: shown, clicks: clicks)
    }

    private func shareLink(_ id: String) -> MyShareLink {
        MyShareLink(id: id, linkId: "mshy_\(id)", identifier: nil, name: "Studio", isActive: true, currentUses: 23,
                    maxUses: 50, expiresAt: nil, createdAt: Date(timeIntervalSince1970: 0), conversationTitle: nil)
    }

    private func sources(cached: ProfileLinksSnapshot, fetched: ProfileLinksSnapshot,
                         fetches: @escaping () -> Void = {}) -> ProfileLinksSources {
        ProfileLinksSources(cached: { cached }, fetch: { fetches(); return fetched }, save: { _ in })
    }

    // MARK: Liens créés — cache d'abord

    func test_createdLinks_aCachedListIsShownAtOnce_andSurvivesANetworkFailure() async {
        let cached = ProfileLinksSnapshot(share: [shareLink("a")], isFresh: false)
        let model = ProfileLinksFaceModel(sources: sources(cached: cached, fetched: .none))

        await model.load()

        XCTAssertEqual(model.phase, .ready, "un cache non vide ne montre jamais d'erreur ni de squelette")
        XCTAssertEqual(model.summary.tickets.map(\.title), ["Studio"])
    }

    func test_createdLinks_anEmptyCacheAndAFailedNetwork_offerRetry() async {
        let model = ProfileLinksFaceModel(sources: sources(cached: .none, fetched: .none))

        await model.load()

        XCTAssertEqual(model.phase, .failed)
    }

    func test_createdLinks_aFreshCacheIsNotRefetched() async {
        var fetches = 0
        let fresh = ProfileLinksSnapshot(share: [shareLink("a")], tracking: [], community: [], referral: [], isFresh: true)
        let model = ProfileLinksFaceModel(sources: sources(cached: fresh, fetched: .none, fetches: { fetches += 1 }))

        await model.load()

        XCTAssertEqual(fetches, 0)
        XCTAssertEqual(model.phase, .ready)
    }

    func test_createdLinks_aFamilyThatFailsAtTheNetworkKeepsWhatTheCacheHad() async {
        let cached = ProfileLinksSnapshot(share: [shareLink("a")], community: [])
        let fetched = ProfileLinksSnapshot(share: nil, community: [], isFresh: true)
        let model = ProfileLinksFaceModel(sources: sources(cached: cached, fetched: fetched))

        await model.load()

        XCTAssertEqual(model.summary.count(of: .share), 1)
    }

    func test_createdLinks_aFilterWhoseFamilyVanishedFallsBackToAll() async {
        let model = ProfileLinksFaceModel(sources: sources(cached: .none,
                                                           fetched: ProfileLinksSnapshot(share: [], isFresh: true)))
        model.filter = .family(.tracking)

        await model.refresh()

        XCTAssertEqual(model.filter, .all)
    }

    // MARK: Mes adresses — optimiste, défait sur refus

    func test_addresses_aStaleCacheIsShown_thenTheServedListReplacesIt() async {
        let service = AddressServiceDouble(listed: [address("site"), address("music")])
        let store = ProfileAddressesStore(service: service,
                                          cache: AddressCacheDouble(result: .stale([address("site")], age: 600)))

        await store.load()

        XCTAssertEqual(store.addresses.map(\.id), ["site", "music"])
        XCTAssertEqual(store.phase, .ready)
    }

    func test_addresses_hidingAnAddressAppliesAtOnce_andIsSent() async {
        let service = AddressServiceDouble(listed: [address("site")])
        let store = ProfileAddressesStore(service: service, cache: AddressCacheDouble(result: .empty))
        await store.load()

        await store.setShown(false, for: "site")

        XCTAssertEqual(store.addresses.first?.isShown, false)
        let updates = await service.updates
        XCTAssertEqual(updates.first?.draft, ProfileAddressDraft(isShown: false))
        XCTAssertNil(store.refusal)
    }

    func test_addresses_aRefusedGestureIsUndone_andSaid() async {
        let store = ProfileAddressesStore(service: AddressServiceDouble(refuses: true),
                                          cache: AddressCacheDouble(result: .fresh([address("site")], age: 1)))
        await store.load()

        await store.remove(id: "site")

        XCTAssertEqual(store.addresses.map(\.id), ["site"], "le geste refusé se défait")
        XCTAssertEqual(store.refusal, ProfileLinksCopy.addressRefused)
    }

    func test_addresses_movingSendsEveryIdOnce_inTheNewOrder() async {
        let service = AddressServiceDouble(listed: [address("a"), address("b"), address("c")])
        let store = ProfileAddressesStore(service: service, cache: AddressCacheDouble(result: .empty))
        await store.load()

        await store.move(from: 2, to: 0)

        let reorders = await service.reorders
        XCTAssertEqual(reorders, [["c", "a", "b"]])
        XCTAssertEqual(store.addresses.map(\.id), ["c", "a", "b"])
    }

    func test_addresses_switchingAccountClearsWhatWasInMemory() async {
        var account = "aissa"
        let service = AddressServiceDouble(listed: [address("site")])
        let store = ProfileAddressesStore(service: service, cache: AddressCacheDouble(result: .empty), owner: { account })
        await store.load()
        XCTAssertEqual(store.addresses.map(\.id), ["site"])

        await service.refuse()
        account = "leo"
        await store.load()

        XCTAssertTrue(store.addresses.isEmpty, "rien du compte précédent ne reste affiché")
        XCTAssertEqual(store.phase, .failed)
    }

    func test_addresses_theClicksAddUp_andTwelveIsTheCeiling() async {
        let many = (0..<ProfileAddressRules.maxCount).map { address("a\($0)", clicks: 2) }
        let store = ProfileAddressesStore(service: AddressServiceDouble(), cache: AddressCacheDouble(result: .fresh(many, age: 1)))
        await store.load()

        XCTAssertEqual(store.totalClicks, 24)
        XCTAssertFalse(store.canAdd)
    }

    // MARK: La face est faite du kit (loi 12)

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    func test_linksFace_isMadeOfTheKit() throws {
        let face = try code("Meeshy/Features/Profile/Faces/ProfileLinksFace.swift")
        XCTAssertTrue(face.contains("MeeshyTicket("), "le lien de profil est un billet K30")
        XCTAssertTrue(face.contains("MeeshyCodeCard("), "son QR est la carte de code K31")
        XCTAssertTrue(face.contains("MeeshyLabeledAction("), "ses gestes sont des actions libellées K32")
        for drawn in ["RoundedRectangle(", "LinearGradient(", "Capsule("] {
            XCTAssertFalse(face.contains(drawn), "\(drawn) : aucun composant redessiné sur place")
        }
    }

    func test_linksHub_isTheLinksFace_inAPushedPage() throws {
        let hub = try code("Meeshy/Features/Links/Views/LinksHubView.swift")
        XCTAssertTrue(hub.contains("ProfileLinksFace(user: authManager.currentUser"))
        XCTAssertTrue(hub.contains("showsHeader: false"), "la page poussée a déjà son en-tête")
    }

    func test_profileCard_sendsTheProfileAsACardAndShowsOnlyThePublicAddress() {
        let user = MeeshyUser(id: "u1", username: "aissa")
        let link = ProfileLink(username: user.username)
        let card = link.map { ProfileLinksShare.card(of: user, link: $0) }
        XCTAssertEqual(card?.kind, .profile)
        XCTAssertEqual(card?.url?.absoluteString, "https://meeshy.me/@aissa")
        XCTAssertEqual(card?.subtitle, "@aissa")
    }

    /// #19442 — la carte d'un AUTRE part par la même feuille d'envoi : son nom, son pseudo, son avatar, son adresse,
    /// et sa bio lue sous le pseudo ; « Ce qui part » se lit du côté de l'ami.
    func test_theirCard_carriesWhatTheFriendWillReceive() throws {
        let url = try XCTUnwrap(URL(string: "https://meeshy.me/@leo.m"))
        let request = ProfileSendRequest(userId: "u-leo", displayName: "Léo Marchetti", username: "leo.m",
                                         avatarURL: "https://cdn/leo.jpg", bio: "Photographe de rue.", url: url)
        let card = ProfileLinksShare.card(of: request)
        XCTAssertEqual(card.kind, .profile)
        XCTAssertEqual(card.contentId, "u-leo")
        XCTAssertEqual(card.title, "Léo Marchetti")
        XCTAssertEqual(card.subtitle, "@leo.m")
        XCTAssertEqual(card.imageURL, "https://cdn/leo.jpg")
        XCTAssertEqual(card.detail, "Photographe de rue.")
        XCTAssertEqual(card.messageText, "https://meeshy.me/@leo.m")
        XCTAssertFalse(card.mintsTrackedLink)
    }

    func test_cardZone_readsFromTheFriendsSide_forAProfileOnly() {
        XCTAssertNotEqual(ShareSheetCopy.cardZone(.profile), ShareSheetCopy.contentZone)
        XCTAssertEqual(ShareSheetCopy.cardZone(.post), ShareSheetCopy.contentZone)
    }

    func test_myCard_carriesMyBio_andABlankBioTravelsAsAbsent() {
        let link = ProfileLink(username: "aissa")
        let withBio = link.map { ProfileLinksShare.card(of: MeeshyUser(id: "u1", username: "aissa", bio: " Lyon "), link: $0) }
        let blank = link.map { ProfileLinksShare.card(of: MeeshyUser(id: "u1", username: "aissa", bio: "  "), link: $0) }
        XCTAssertEqual(withBio?.detail, "Lyon")
        XCTAssertNil(blank?.detail)
    }

    func test_theirProfileSheets_receiveTheMeeshySendSheet() throws {
        let app = try code("Meeshy/MeeshyApp.swift")
        XCTAssertTrue(app.contains(".environment(\\.profileSendSheet, ProfileSendHost.sheet)"))
    }
}

/// Le détail d'un lien de suivi (planche `Lien-Detail`, #18871) : ce que ses chiffres, ses parts et son graphique DISENT
/// des clics reçus, et l'interrupteur « Actif » qui répond tout de suite puis revient si le serveur refuse.
@MainActor
final class TrackingLinkInsightsTests: XCTestCase {

    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        return calendar
    }()

    private static let now = Date(timeIntervalSince1970: 1_763_380_800)

    private func daysAgo(_ days: Int) -> Date {
        Self.now.addingTimeInterval(-Double(days) * 86_400)
    }

    private func sample(country: String? = nil, device: String? = nil, source: String? = nil,
                        daysAgo days: Int = 0) -> TrackingClickSample {
        TrackingClickSample(country: country, device: device, source: source, clickedAt: daysAgo(days))
    }

    func test_countries_rankTheirSharesOverTheClicksThatKnowTheirCountry() {
        let insights = TrackingLinkInsights(samples: [
            sample(country: "SN"), sample(country: "SN"), sample(country: "SN"), sample(country: "FR"), sample()
        ])
        XCTAssertEqual(insights.countryCount, 2)
        XCTAssertEqual(insights.countries(), [TrackingShare(key: "SN", count: 3, percent: 75),
                                              TrackingShare(key: "FR", count: 1, percent: 25)])
    }

    func test_countries_showFourAtMost_theLargestFirst() {
        let codes = ["SN", "SN", "FR", "FR", "FR", "CI", "PT", "BE"]
        let insights = TrackingLinkInsights(samples: codes.map { sample(country: $0) })
        let shown = insights.countries()
        XCTAssertEqual(insights.countryCount, 5)
        XCTAssertEqual(shown.map(\.key), ["FR", "SN", "BE", "CI"])
    }

    func test_devices_groupIntoPhoneComputerTabletAndOther() {
        let insights = TrackingLinkInsights(samples: [
            sample(device: "mobile"), sample(device: "phone"), sample(device: "desktop"), sample()
        ])
        XCTAssertEqual(insights.devices, [TrackingShare(key: TrackingDeviceFamily.phone.rawValue, count: 2, percent: 50),
                                          TrackingShare(key: TrackingDeviceFamily.desktop.rawValue, count: 1, percent: 25),
                                          TrackingShare(key: TrackingDeviceFamily.other.rawValue, count: 1, percent: 25)])
    }

    func test_sources_countAClickWithoutSourceAsDirect() {
        let insights = TrackingLinkInsights(samples: [
            sample(source: "Instagram"), sample(source: "Instagram"), sample(), sample(source: "  ")
        ])
        XCTAssertEqual(insights.sources, [TrackingShare(key: "Instagram", count: 2, percent: 50),
                                          TrackingShare(key: TrackingLinkInsights.directSource, count: 2, percent: 50)])
    }

    func test_days_overAWeek_countEachOfTheSevenLastDays_andDropOlderClicks() {
        let insights = TrackingLinkInsights(samples: [
            sample(daysAgo: 0), sample(daysAgo: 0), sample(daysAgo: 1), sample(daysAgo: 10)
        ])
        let days = insights.days(period: .week, now: Self.now, calendar: Self.calendar)
        XCTAssertEqual(days.count, 7)
        XCTAssertEqual(days.last?.count, 2)
        XCTAssertEqual(days.dropLast().last?.count, 1)
        XCTAssertEqual(days.map(\.count).reduce(0, +), 3)
        XCTAssertEqual(days.last?.day, Self.calendar.startOfDay(for: Self.now))
    }

    func test_days_overEverything_startAtTheFirstClick() {
        let insights = TrackingLinkInsights(samples: [sample(daysAgo: 10), sample(daysAgo: 3), sample(daysAgo: 0)])
        let days = insights.days(period: .all, now: Self.now, calendar: Self.calendar)
        XCTAssertEqual(days.count, 11)
        XCTAssertEqual(days.first?.count, 1)
        XCTAssertEqual(days.map(\.count).reduce(0, +), 3)
    }

    func test_days_overEverything_withoutAnyClick_areEmpty() {
        XCTAssertEqual(TrackingLinkInsights(samples: []).days(period: .all, now: Self.now, calendar: Self.calendar), [])
    }

    func test_activeSwitch_answersAtOnce_andComesBackWhenTheServerRefuses() async {
        struct Refused: Error {}
        let refused = TrackingDetailViewModel(token: "t", isActive: true,
                                              setActiveRemote: { _, _ in throw Refused() })
        await refused.setActive(false)
        XCTAssertTrue(refused.isActive, "le serveur a refusé : l'interrupteur revient")

        let accepted = TrackingDetailViewModel(token: "t", isActive: true, setActiveRemote: { _, _ in })
        await accepted.setActive(false)
        XCTAssertFalse(accepted.isActive)
    }

    func test_stoppedLink_offersTheGestureItsDetailKnows_andNoneWhenExpired() {
        XCTAssertEqual(ProfileCreatedLinkTicket.relaunchTitle(.full, family: .share), ProfileLinksCopy.raiseLimit)
        XCTAssertNil(ProfileCreatedLinkTicket.relaunchTitle(.paused, family: .share), "un lien en pause se rallume par son interrupteur")
        XCTAssertNil(ProfileCreatedLinkTicket.relaunchTitle(.paused, family: .tracking))
        XCTAssertNil(ProfileCreatedLinkTicket.relaunchTitle(.expired, family: .share), "un lien expiré ne se relance pas d'un geste")
        XCTAssertNil(ProfileCreatedLinkTicket.relaunchTitle(.full, family: .tracking), "un lien de suivi n'a pas de limite")
        XCTAssertNil(ProfileCreatedLinkTicket.relaunchTitle(.paused, family: .referral))
    }

    func test_pausedLink_ofShareOrTracking_isSwitchedBackOnFromItsTicket_theOthersOpenTheirDetail() throws {
        XCTAssertTrue(ProfileCreatedLinkTicket.switchesInPlace(.paused, family: .share))
        XCTAssertTrue(ProfileCreatedLinkTicket.switchesInPlace(.paused, family: .tracking))
        XCTAssertFalse(ProfileCreatedLinkTicket.switchesInPlace(.paused, family: .community), "aucun service ne rallume un lien de communauté")
        XCTAssertFalse(ProfileCreatedLinkTicket.switchesInPlace(.full, family: .share), "un lien plein se règle par sa limite")
        XCTAssertFalse(ProfileCreatedLinkTicket.switchesInPlace(.expired, family: .tracking))
        let ticket = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Profile/Faces/ProfileCreatedLinkTicket.swift"))
        XCTAssertTrue(ticket.contains("MeeshyToggleRow(ProfileLinksCopy.linkActive"), "« Lien actif » est la ligne à interrupteur du kit")
        XCTAssertTrue(ticket.contains("accessory: .toggle(isOn: false)"))
        XCTAssertTrue(ticket.contains("action: { onSwitch(true) }"))
    }

    func test_pausedLink_saysWhatItKeeps_inTheWordsOfItsFigure() throws {
        let french = Locale(identifier: "fr_FR")
        XCTAssertEqual(ProfileLinksCopy.kept(.clicks(412), locale: french), String(format: String(localized: "profile.links.kept.clicks", defaultValue: "Ses %@ clics sont gardés.", bundle: .main), "412"))
        XCTAssertNotEqual(ProfileLinksCopy.kept(.members(3), locale: french), ProfileLinksCopy.kept(.clicks(3), locale: french), "chaque chiffre se dit avec ce qu'il compte")
        let ticket = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Profile/Faces/ProfileCreatedLinkTicket.swift"))
        XCTAssertTrue(ticket.contains("if let kept = ticket.keptFigure()"), "le compte gardé suit la conséquence de la pause")
        XCTAssertTrue(ticket.contains("ProfileLinksCopy.kept(kept, locale: locale)"))
    }

    func test_createdLinks_putTheStoppedOnesUnderTheirOwnHeader() throws {
        let face = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Profile/Faces/ProfileLinksFaceSections.swift"))
        XCTAssertTrue(face.contains("tickets(model.summary.serving(model.visibleTickets))"), "ceux qui servent d'abord")
        XCTAssertTrue(face.contains("stoppedSection(model.summary.stopped(model.visibleTickets))"), "« À l'arrêt » dessous")
        XCTAssertTrue(face.contains("MeeshySectionHeader(title: ProfileLinksCopy.stoppedTitle, count: stopped.count"))
    }

    func test_contactlessUnavailable_isAStateBlock_thenTheQRInstead_withShowMyQR() throws {
        let card = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Profile/Links/ProfileCardView.swift"))
        XCTAssertTrue(card.contains("MeeshyStateBlock(kind: .denied, title: ProfileLinksCopy.contactlessUnavailable"),
                      "« Ce téléphone ne sait pas faire ça » est un bloc d'état K38")
        XCTAssertTrue(card.contains("MeeshySectionHeader(title: ProfileLinksCopy.instead"), "« À la place »")
        XCTAssertTrue(card.contains("action: { mode = .qr }"), "« Montrer mon QR » passe au QR")
        XCTAssertTrue(card.contains("scannerShown = true"), "scanner celui de l'autre reste possible")
    }

    func test_trackingDetail_isMadeOfTheKit() throws {
        let detail = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Links/Views/TrackingLinkDetailView.swift"))
        for piece in ["MeeshyTicket(", "MeeshyCodeCard(", "MeeshyLabeledAction(", "MeeshyFigureBand(", "MeeshyChart(",
                      "MeeshyShareBar(", "MeeshySegmented("] {
            XCTAssertTrue(detail.contains(piece), "\(piece) : le détail d'un lien est fait du kit")
        }
        for drawn in ["RoundedRectangle(", "GeometryReader", "Capsule("] {
            XCTAssertFalse(detail.contains(drawn), "\(drawn) : aucun composant redessiné sur place")
        }
    }
}

/// Les interrupteurs des billets créés vivent avec les autres témoins de la face Liens, qui portent leurs fabriques.
@MainActor
extension ProfileLinksFaceTests {

    func test_createdLinks_switchingAPausedShareLinkOn_appliesAtOnce_andSendsItsLinkId() async {
        let log = SwitchLog()
        let paused = shareLink("a").withActive(false)
        let model = ProfileLinksFaceModel(
            sources: sources(cached: ProfileLinksSnapshot(share: [paused]), fetched: .none),
            switches: ProfileLinksSwitches(share: { id, isActive in await log.note("\(id):\(isActive)") },
                                           tracking: { _, _ in })
        )
        await model.load()
        XCTAssertEqual(model.summary.stopped(model.visibleTickets).count, 1)

        let accepted = await model.setActive(true, ticketId: "share:a")

        XCTAssertTrue(accepted)
        XCTAssertEqual(model.shareLink(id: "share:a")?.isActive, true)
        XCTAssertTrue(model.summary.stopped(model.visibleTickets).isEmpty, "le billet rallumé quitte « À l'arrêt »")
        let sent = await log.sent
        XCTAssertEqual(sent, ["mshy_a:true"])
    }

    func test_createdLinks_aRefusedSwitchIsUndone() async {
        let paused = shareLink("a").withActive(false)
        let model = ProfileLinksFaceModel(
            sources: sources(cached: ProfileLinksSnapshot(share: [paused]), fetched: .none),
            switches: ProfileLinksSwitches(share: { _, _ in throw URLError(.notConnectedToInternet) },
                                           tracking: { _, _ in })
        )
        await model.load()

        let accepted = await model.setActive(true, ticketId: "share:a")

        XCTAssertFalse(accepted)
        XCTAssertEqual(model.shareLink(id: "share:a")?.isActive, false, "le serveur a refusé : le lien reste en pause")
    }

    func test_createdLinks_switchingAPausedTrackingLinkOn_sendsItsToken() async throws {
        let log = SwitchLog()
        let json = """
        {"id":"t1","token":"dkr-nuit","name":"Réel","originalUrl":"https://a.io","shortUrl":"https://meeshy.me/l/dkr-nuit",
         "totalClicks":412,"uniqueClicks":3,"isActive":false,"createdAt":0}
        """
        let paused = try JSONDecoder().decode(TrackingLink.self, from: Data(json.utf8))
        let model = ProfileLinksFaceModel(
            sources: sources(cached: ProfileLinksSnapshot(tracking: [paused]), fetched: .none),
            switches: ProfileLinksSwitches(share: { _, _ in },
                                           tracking: { token, isActive in await log.note("\(token):\(isActive)") })
        )
        await model.load()

        let accepted = await model.setActive(true, ticketId: "tracking:t1")

        XCTAssertTrue(accepted)
        XCTAssertEqual(model.trackingLink(id: "tracking:t1")?.isActive, true)
        let sent = await log.sent
        XCTAssertEqual(sent, ["dkr-nuit:true"])
    }
}
