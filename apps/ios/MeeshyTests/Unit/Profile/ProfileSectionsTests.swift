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
        XCTAssertTrue(profile.contains("if !isEditing, let voice = ProfileVoiceSample.make(user: user)"))
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
        XCTAssertTrue(face.contains("MeeshyAvatar(name:"), "l'avatar de la planche, celui du kit")
        XCTAssertTrue(face.contains("ProfileActionsCopy.title"))
        XCTAssertTrue(face.contains("ProfileActionsCopy.handle(of: user)"))
        XCTAssertTrue(face.contains(".accessibilityAddTraits(.isHeader)"), "« Actions » est le titre de la face pour VoiceOver")
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
        let nothing = ProfilePublicationTiles.state(posts: [], isLoading: false, pagination: .exhausted)
        XCTAssertEqual(nothing, .silent, "rien de publié : la section se tait")
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

    func test_viewedByAndWhatSees_sitOnTheBanner() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(profile.contains(".overlay(alignment: .topTrailing)"), "« Vue par : Moi » est posé sur la bannière")
        XCTAssertEqual(profile.components(separatedBy: "VitrineSeenAsCopy.viewedByMe").count, 2, "une seule porte « Vue par »")
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
