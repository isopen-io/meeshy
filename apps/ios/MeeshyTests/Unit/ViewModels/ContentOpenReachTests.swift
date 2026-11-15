import XCTest
import Combine
@testable import Meeshy
import MeeshySDK

/// #10483 — les sources justes : une ouverture du détail se compte une fois
/// par instance, porte `notification` quand c'est une notification qui l'a
/// ouverte, et un réel dit sa surface.
@MainActor
final class ContentOpenReachTests: XCTestCase {

    private func makeDetail(
        postService: MockPostService = MockPostService(),
        openSources: DetailOpenSources = DetailOpenSources()
    ) -> PostDetailViewModel {
        PostDetailViewModel(
            postService: postService,
            languageProvider: MockLanguageProvider(preferredLanguages: []),
            offlineQueue: OfflineQueue.shared,
            socialSocket: MockSocialSocket(),
            openSources: openSources
        )
    }

    private func makeReels(service: MockPostService, entries: DetailOpenSources = DetailOpenSources()) -> ReelsViewModel {
        ReelsViewModel(
            service: service,
            cache: MockReelFeedCache(),
            postDeletedEvents: Empty().eraseToAnyPublisher(),
            openSources: entries
        )
    }

    private func views(in service: MockPostService) -> [SocialEvent] {
        service.recordedSocialEvents.filter { if case .view = $0 { return true } else { return false } }
    }

    // MARK: - Le détail

    func test_registerDetailOpen_secondAppear_doesNotRecount() async {
        let service = MockPostService()
        let sut = makeDetail(postService: service)

        await sut.registerDetailOpen("p1")
        await sut.registerDetailOpen("p1")

        XCTAssertEqual(service.recordedImpressions.count, 1,
                       "Le `.task` du détail se relance au retour d'un écran poussé : ce n'est pas une nouvelle ouverture.")
    }

    /// `viewCount` est le total : chaque OUVERTURE compte une vue — une
    /// relance du `.task` du même écran n'en est pas une.
    func test_registerDetailOpen_countsOneViewPerOpening() async {
        let service = MockPostService()
        let sut = makeDetail(postService: service)

        await sut.registerDetailOpen("p1")
        await sut.registerDetailOpen("p1")

        XCTAssertEqual(views(in: service).map(\.postId), ["p1"])

        let reopened = makeDetail(postService: service)
        await reopened.registerDetailOpen("p1")

        XCTAssertEqual(views(in: service).count, 2, "Rouvrir le détail recompte une vue.")
    }

    func test_registerDetailOpen_anotherPost_isCounted() async {
        let service = MockPostService()
        let sut = makeDetail(postService: service)

        await sut.registerDetailOpen("p1")
        await sut.registerDetailOpen("p2")

        XCTAssertEqual(service.recordedImpressions.count, 2)
    }

    func test_registerDetailOpen_fromANotification_usesTheNotificationSource() async {
        let service = MockPostService()
        let sources = DetailOpenSources()
        sources.markOpenedFromNotification("p1")
        let sut = makeDetail(postService: service, openSources: sources)

        await sut.registerDetailOpen("p1")

        XCTAssertEqual(service.recordedImpressionSources.last, "notification")
    }

    func test_marks_expiredUnconsumedOnesArePurgedOnTheNextMark() {
        var now = Date(timeIntervalSince1970: 1_000)
        let sources = DetailOpenSources(clock: { now })
        for index in 0..<50 { sources.mark("never-opened-\(index)", entry: .listing(.feed)) }
        XCTAssertEqual(sources.markCount, 50)

        now = now.addingTimeInterval(DetailOpenSources.markLifetime + 1)
        sources.mark("fresh", entry: .listing(.feed))

        XCTAssertEqual(sources.markCount, 1, "les marques jamais consommées et expirées sont retirées")
        XCTAssertEqual(sources.consumeMarkedEntry(for: "fresh"), .listing(.feed))
    }

    func test_registerDetailOpen_withoutNotification_keepsTheDetailSource() async {
        let service = MockPostService()
        let sut = makeDetail(postService: service)

        await sut.registerDetailOpen("p1")

        XCTAssertEqual(service.recordedImpressionSources.last, "detail")
    }

    func test_notificationMark_isConsumedOnce() {
        let sources = DetailOpenSources()
        sources.markOpenedFromNotification("p1")

        XCTAssertEqual(sources.consumeSource(for: "p1"), "notification")
        XCTAssertEqual(sources.consumeSource(for: "p1"), "detail")
    }

    func test_notificationMark_expires() {
        var now = Date(timeIntervalSince1970: 0)
        let sources = DetailOpenSources(clock: { now })
        sources.markOpenedFromNotification("p1")

        now = now.addingTimeInterval(DetailOpenSources.markLifetime + 1)

        XCTAssertEqual(sources.consumeSource(for: "p1"), "detail",
                       "Un tap de notification qui n'a pas abouti sur le détail ne déteint pas sur une ouverture ultérieure.")
    }

    // MARK: - Depuis un profil

    private func feedPost(_ id: String) -> FeedPost {
        FeedPost(id: id, author: "author", content: "texte")
    }

    /// Rouvrir un post depuis un profil dans l'heure compte à chaque fois : la
    /// liste du profil n'a plus de fenêtre, et c'est la destination (le
    /// détail) qui compte la vue de chaque ouverture — une seule.
    func test_profileOpen_sameTwiceWithinTheHour_eachOpeningCountsOneView() async {
        let service = MockPostService()
        var opened: [String] = []
        let opening = ProfilePostOpening(onOpenPost: { opened.append($0.id) }, onOpenReel: nil, opens: RecordingContentOpens())

        opening.openPost(feedPost("p1"))
        opening.openPost(feedPost("p1"))
        for id in opened {
            await makeDetail(postService: service).registerDetailOpen(id)
        }

        XCTAssertEqual(opened, ["p1", "p1"], "Aucune fenêtre ne tait une réouverture.")
        XCTAssertEqual(views(in: service).count, 2, "Une vue par ouverture, comptée par le détail seul.")
    }

    func test_profileOpenReel_withoutAReelHost_fallsBackToTheDetail() {
        var opened: [String] = []
        var reels: [String] = []
        let fallback = ProfilePostOpening(onOpenPost: { opened.append($0.id) }, onOpenReel: nil, opens: RecordingContentOpens())
        let hosted = ProfilePostOpening(onOpenPost: { opened.append($0.id) }, onOpenReel: { reel, _ in reels.append(reel.id) }, opens: RecordingContentOpens())

        fallback.openReel(feedPost("r1"), in: [])
        hosted.openReel(feedPost("r2"), in: [feedPost("r2")])

        XCTAssertEqual(opened, ["r1"])
        XCTAssertEqual(reels, ["r2"])
    }

    // MARK: - Les réels

    func test_reelView_queuesAFeedImpression_onTheReelsSurface() async {
        let service = MockPostService()
        let sut = makeReels(service: service)

        sut.recordView("r1")
        await sut.flushImpressions()

        XCTAssertEqual(service.recordedCountedImpressions, [.impression(postId: "r1", source: "feed", surface: .reels)])
    }

    // MARK: - Le tap d'un listing : un engagement d'ouverture, aucune vue

    private func makeOpens(
        service: MockPostService,
        entries: DetailOpenSources,
        visitor: MockVisitorReachReporter = MockVisitorReachReporter(),
        account: String? = "u1"
    ) -> ContentOpenReporter {
        ContentOpenReporter(
            entries: entries,
            postService: service,
            visitor: visitor,
            accountId: { account },
            flushDelay: 60
        )
    }

    func test_tapInTheFeed_sendsOneOpenWithTheFeedOrigin_andNoView() async {
        let service = MockPostService()
        let sut = makeOpens(service: service, entries: DetailOpenSources())

        sut.open("p1", from: .feed)
        await sut.flushNow()

        XCTAssertEqual(service.recordedSocialEventBatches, [[.open(postId: "p1", origin: .feed)]],
                       "L'engagement part seul, dans sa requête.")
        XCTAssertEqual(service.recordedSocialEventsCredentials, [.account])
        XCTAssertTrue(views(in: service).isEmpty, "Le tap ne compte aucune vue : l'écran ouvert la compte.")
    }

    func test_tapWithoutAccount_goesThroughTheVisitorQueue() async {
        let service = MockPostService()
        let visitor = MockVisitorReachReporter()
        let sut = makeOpens(service: service, entries: DetailOpenSources(), visitor: visitor, account: nil)

        sut.open("p1", from: .profile)
        await sut.flushNow()

        XCTAssertEqual(visitor.recorded, [.open(postId: "p1", origin: .profile)])
        XCTAssertEqual(service.recordSocialEventsCallCount, 0)
    }

    /// Un serveur antérieur à l'engagement d'ouverture le refuse (400) : il
    /// sort de la file sans rejeu.
    func test_openRefusedByAnOldServer_isDroppedWithoutReplay() async {
        let service = MockPostService()
        service.recordSocialEventsResult = .failure(MeeshyError.server(statusCode: 400, message: "invalid"))
        let sut = makeOpens(service: service, entries: DetailOpenSources())

        sut.open("p1", from: .feed)
        await sut.flushNow()
        await sut.flushNow()

        XCTAssertEqual(service.recordSocialEventsCallCount, 1)
        XCTAssertTrue(sut.pendingEvents.isEmpty)
    }

    func test_openLostToTheNetwork_isKeptForTheNextFlush() async {
        let service = MockPostService()
        service.recordSocialEventsResultsQueue = [.failure(MeeshyError.network(.noConnection))]
        let sut = makeOpens(service: service, entries: DetailOpenSources())

        sut.open("p1", from: .bookmarks)
        await sut.flushNow()
        XCTAssertEqual(sut.pendingEvents, [.open(postId: "p1", origin: .bookmarks)])

        await sut.flushNow()
        XCTAssertEqual(service.recordSocialEventsCallCount, 2)
        XCTAssertTrue(sut.pendingEvents.isEmpty)
    }

    // MARK: - L'écran détail : une impression et une vue, avec leur provenance

    func test_detailOpenedFromTheFeed_countsOneImpressionAndOneListingView() async {
        let service = MockPostService()
        let entries = DetailOpenSources()
        makeOpens(service: service, entries: entries).open("p1", from: .feed)

        await makeDetail(postService: service, openSources: entries).registerDetailOpen("p1")

        XCTAssertEqual(service.recordedImpressions.count, 1)
        XCTAssertEqual(service.recordedImpressionSources.last, "detail")
        XCTAssertEqual(views(in: service), [.view(postId: "p1", durationMs: nil, surface: .detail, entry: .listing(.feed))])
    }

    /// L'impression et la vue partent ENSEMBLE, dans une seule requête : un
    /// serveur antérieur à #10483 connaît les deux types, et retire sans refus
    /// la provenance qu'il ne connaît pas. L'impression dit la surface détail.
    func test_detailOpen_sendsImpressionAndViewInOneRequest_onTheDetailSurface() async {
        let service = MockPostService()
        let entries = DetailOpenSources()
        entries.markOpenedFromNotification("p1")

        await makeDetail(postService: service, openSources: entries).registerDetailOpen("p1")

        XCTAssertEqual(service.recordedSocialEventBatches, [[
            .impression(postId: "p1", source: "notification", surface: .detail),
            .view(postId: "p1", durationMs: nil, surface: .detail, entry: .notification),
        ]])
        XCTAssertEqual(service.recordedSocialEventsCredentials, [.account])
    }

    /// Une impression NON unique et une vue à CHAQUE ouverture, même déjà vue.
    func test_detailReopenedFromTheFeed_countsOneMoreImpressionAndView() async {
        let service = MockPostService()
        let entries = DetailOpenSources()
        let opens = makeOpens(service: service, entries: entries)

        opens.open("p1", from: .feed)
        await makeDetail(postService: service, openSources: entries).registerDetailOpen("p1")
        opens.open("p1", from: .feed)
        await makeDetail(postService: service, openSources: entries).registerDetailOpen("p1")

        XCTAssertEqual(service.recordedImpressions.count, 2)
        XCTAssertEqual(views(in: service), [
            .view(postId: "p1", durationMs: nil, surface: .detail, entry: .listing(.feed)),
            .view(postId: "p1", durationMs: nil, surface: .detail, entry: .listing(.feed)),
        ])
    }

    func test_detailWithoutReferrer_isDirect() async {
        let service = MockPostService()

        await makeDetail(postService: service).registerDetailOpen("p1")

        XCTAssertEqual(views(in: service), [.view(postId: "p1", durationMs: nil, surface: .detail, entry: .direct)])
    }

    func test_detailFromANotification_viewCarriesNotification() async {
        let service = MockPostService()
        let entries = DetailOpenSources()
        entries.markOpenedFromNotification("p1")

        await makeDetail(postService: service, openSources: entries).registerDetailOpen("p1")

        XCTAssertEqual(service.recordedImpressionSources.last, "notification")
        XCTAssertEqual(views(in: service), [.view(postId: "p1", durationMs: nil, surface: .detail, entry: .notification)])
    }

    // MARK: - Les liens

    private func makeRouter(entries: DetailOpenSources) -> DeepLinkRouter {
        DeepLinkRouter(isAuthenticated: { true }, hasResolvedSession: { true }, entries: entries)
    }

    func test_trackingLink_resolvedToAPost_viewCarriesTrackingLink() async {
        let service = MockPostService()
        let entries = DetailOpenSources()
        let router = makeRouter(entries: entries)
        let links = ReachTrackedLinkResolver(ResolvedTrackedLink(kind: "tracking", targetType: "POST", targetId: "p1"))

        router.resolveTrackedLink("tok123", resolver: links)
        let resolved = await waitUntil { router.pendingDeepLink != nil }
        XCTAssertTrue(resolved)
        await makeDetail(postService: service, openSources: entries).registerDetailOpen("p1")

        XCTAssertEqual(service.recordedImpressionSources.last, "shared_link", "Un lien de suivi garde la source shared_link.")
        XCTAssertEqual(views(in: service), [.view(postId: "p1", durationMs: nil, surface: .detail, entry: .trackingLink)])
    }

    func test_viaLink_viewCarriesSharedLink() async throws {
        let service = MockPostService()
        let entries = DetailOpenSources()
        let url = try XCTUnwrap(URL(string: "https://meeshy.me/post/p1?via=Ab12Cd"))

        XCTAssertTrue(makeRouter(entries: entries).handle(url: url))
        await makeDetail(postService: service, openSources: entries).registerDetailOpen("p1")

        XCTAssertEqual(service.recordedImpressionSources.last, "shared_link")
        XCTAssertEqual(views(in: service), [.view(postId: "p1", durationMs: nil, surface: .detail, entry: .sharedLink)])
    }

    func test_universalLinkWithoutMark_isExternal_andCustomSchemeIsDirect() throws {
        let entries = DetailOpenSources()
        let router = makeRouter(entries: entries)

        XCTAssertTrue(router.handle(url: try XCTUnwrap(URL(string: "https://meeshy.me/post/p1"))))
        XCTAssertTrue(router.handle(url: try XCTUnwrap(URL(string: "meeshy://post/p2"))))

        XCTAssertEqual(entries.consumeEntry(for: "p1"), .external)
        XCTAssertEqual(entries.consumeEntry(for: "p2"), .direct)
    }

    // MARK: - Le lecteur de réels est un écran détail

    func test_reelTappedInTheFeed_opensThenCountsOneImpressionAndOneListingView() async {
        let service = MockPostService()
        let entries = DetailOpenSources()
        let opens = makeOpens(service: service, entries: entries)
        let reader = makeReels(service: service, entries: entries)

        opens.open("r1", from: .feed)
        await opens.flushNow()
        reader.recordView("r1")
        await reader.flushImpressions()
        let viewed = await waitUntil { self.views(in: service).count == 1 }

        XCTAssertTrue(viewed)
        XCTAssertTrue(service.recordedSocialEventBatches.contains([.open(postId: "r1", origin: .feed)]))
        XCTAssertEqual(views(in: service), [.view(postId: "r1", durationMs: nil, surface: .reels, entry: .listing(.feed))])
        XCTAssertEqual(service.recordedCountedImpressions.filter { $0 == .impression(postId: "r1", source: "feed", surface: .reels) }.count, 1)
    }

    /// Un réel atteint par BALAYAGE : une impression et une vue de plus,
    /// listing `reels`.
    func test_reelReachedBySwiping_countsOneMoreImpressionAndAReelsListingView() async {
        let service = MockPostService()
        let entries = DetailOpenSources()
        makeOpens(service: service, entries: entries).open("r1", from: .profile)
        let reader = makeReels(service: service, entries: entries)

        reader.recordView("r1")
        reader.recordView("r2")
        await reader.flushImpressions()
        let viewed = await waitUntil { self.views(in: service).count == 2 }

        XCTAssertTrue(viewed)
        XCTAssertEqual(Set(views(in: service).map(\.postId)), ["r1", "r2"])
        XCTAssertTrue(views(in: service).contains(.view(postId: "r1", durationMs: nil, surface: .reels, entry: .listing(.profile))))
        XCTAssertTrue(views(in: service).contains(.view(postId: "r2", durationMs: nil, surface: .reels, entry: .listing(.reels))))
        XCTAssertTrue(service.recordedCountedImpressions.contains(.impression(postId: "r2", source: "feed", surface: .reels)))
    }

    /// Un réel seulement LISTÉ au profil, sans tap : une impression, rien d'autre.
    func test_reelListedInAProfileWithoutTap_countsOneImpressionOnly() async {
        let service = MockPostService()
        let profile = ProfileUserPostsViewModel(
            userId: "profile-reach-\(UUID().uuidString)",
            postService: service,
            userService: MockUserService(),
            languageProvider: MockLanguageProvider(preferredLanguages: [])
        )

        profile.trackImpression("r1")
        await profile.flushImpressions()

        XCTAssertEqual(service.recordedSocialEvents.filter { $0.postId == "r1" },
                       [.impression(postId: "r1", source: "profile", surface: .profile)])
        XCTAssertFalse(service.recordedSocialEvents.contains { $0.isOpen })
        XCTAssertTrue(views(in: service).isEmpty)
    }

    func test_profileTap_sendsAnOpenWithTheProfileOrigin() {
        let opens = RecordingContentOpens()
        var reels: [String] = []
        let opening = ProfilePostOpening(onOpenPost: nil, onOpenReel: { reel, _ in reels.append(reel.id) }, opens: opens)

        opening.openReel(feedPost("r1"), in: [feedPost("r1")])

        XCTAssertEqual(opens.opened, ["r1:profile"])
        XCTAssertEqual(reels, ["r1"])
    }

    // MARK: - Le rail de stories

    func test_storyRailTap_opensTheStoryTheRingShows() {
        let opens = RecordingContentOpens()
        let group = StoryGroup(
            id: "author-1", username: "alice", avatarColor: "#6366F1", avatarURL: nil,
            stories: [
                StoryItem(id: "s-seen", content: "a", media: [], storyEffects: nil, createdAt: Date(), expiresAt: nil, isViewed: true),
                StoryItem(id: "s-new", content: "b", media: [], storyEffects: nil, createdAt: Date(), expiresAt: nil, isViewed: false),
            ]
        )

        opens.openStory(of: group)

        XCTAssertEqual(opens.opened, ["s-new:story_rail"])
    }

    func test_storyView_carriesItsMark_elseTheRail() {
        let vm = StoryViewModel(postService: MockPostService())
        let entries = DetailOpenSources()
        entries.markOpenedFromNotification("s1")
        vm.storyViewEntries = entries

        XCTAssertEqual(vm.storyViewEntry(for: "s1"), .notification)
        XCTAssertEqual(vm.storyViewEntry(for: "s2"), .listing(.storyRail),
                       "Une story atteinte en avançant dans le lecteur vient du rail.")
    }

    private func waitUntil(timeout: TimeInterval = 3, _ condition: @escaping @MainActor () -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        return condition()
    }

    // MARK: - La liste des vues

    func test_visitorsLine_absentFromAnOldServer_showsNothing() {
        XCTAssertNil(PublicationViewersVisitors.line(anonymousViewCount: nil))
        XCTAssertNil(PublicationViewersVisitors.line(anonymousViewCount: 0))
    }

    func test_visitorsLine_withVisitors_saysHowManyWithoutNamingThem() throws {
        let line = try XCTUnwrap(PublicationViewersVisitors.line(anonymousViewCount: 3))

        XCTAssertTrue(line.contains("3"))
    }
}

@MainActor
private final class RecordingContentOpens: ContentOpenReporting {
    nonisolated deinit {}

    private(set) var opened: [String] = []

    func open(_ postId: String, from origin: OpenOrigin) {
        opened.append("\(postId):\(origin.rawValue)")
    }

    func flushNow() async {}
}

private final class ReachTrackedLinkResolver: TrackedLinkResolving, @unchecked Sendable {
    private let resolved: ResolvedTrackedLink

    init(_ resolved: ResolvedTrackedLink) {
        self.resolved = resolved
    }

    func resolve(token: String) async throws -> ResolvedTrackedLink {
        resolved
    }

    func recordClick(token: String) async {}
}

/// #10500 — un `open` gardé par une panne repart avec l'enveloppe posée au
/// TAP : même `eventId`, même heure.
extension ContentOpenReachTests {

    func test_openKeptByANetworkFailure_isResentWithTheSameEnvelope() async {
        let service = MockPostService()
        service.recordSocialEventsResultsQueue = [.failure(MeeshyError.network(.noConnection))]
        let clock = StampClock(now: Date(timeIntervalSince1970: 1_700_000_000))
        let sut = ContentOpenReporter(
            entries: DetailOpenSources(), postService: service, visitor: MockVisitorReachReporter(),
            accountId: { "u1" }, flushDelay: 60, clock: { clock.now }
        )

        sut.open("p1", from: .feed)
        clock.now = Date(timeIntervalSince1970: 1_700_000_300)
        await sut.flushNow()
        await sut.flushNow()

        let attempts = service.recordedStampedSocialEventBatches.map { $0.map(\.stamp) }
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts[1], attempts[0], "La tentative 2 renvoie le même eventId.")
        XCTAssertEqual(attempts[0].first?.occurredAt, Date(timeIntervalSince1970: 1_700_000_000), "Daté du tap, pas de l'envoi.")
    }
}

@MainActor
private final class StampClock {
    nonisolated deinit {}
    var now: Date
    init(now: Date) { self.now = now }
}
