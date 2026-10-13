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

    // MARK: - Le détail

    func test_registerDetailOpen_secondAppear_doesNotRecount() async {
        let service = MockPostService()
        let sut = makeDetail(postService: service)

        await sut.registerDetailOpen("p1")
        await sut.registerDetailOpen("p1")

        XCTAssertEqual(service.recordImpressionCallCount, 1,
                       "Le `.task` du détail se relance au retour d'un écran poussé : ce n'est pas une nouvelle ouverture.")
    }

    func test_registerDetailOpen_anotherPost_isCounted() async {
        let service = MockPostService()
        let sut = makeDetail(postService: service)

        await sut.registerDetailOpen("p1")
        await sut.registerDetailOpen("p2")

        XCTAssertEqual(service.recordImpressionCallCount, 2)
    }

    func test_registerDetailOpen_fromANotification_usesTheNotificationSource() async {
        let service = MockPostService()
        let sources = DetailOpenSources()
        sources.markOpenedFromNotification("p1")
        let sut = makeDetail(postService: service, openSources: sources)

        await sut.registerDetailOpen("p1")

        XCTAssertEqual(service.lastRecordImpressionSource, "notification")
    }

    func test_registerDetailOpen_withoutNotification_keepsTheDetailSource() async {
        let service = MockPostService()
        let sut = makeDetail(postService: service)

        await sut.registerDetailOpen("p1")

        XCTAssertEqual(service.lastRecordImpressionSource, "detail")
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

    // MARK: - Les réels

    func test_reelView_queuesAFeedImpression_onTheReelsSurface() async {
        let service = MockPostService()
        let sut = ReelsViewModel(
            service: service,
            cache: MockReelFeedCache(),
            postDeletedEvents: Empty().eraseToAnyPublisher()
        )

        sut.recordView("r1")
        await sut.flushImpressions()

        XCTAssertTrue(service.recordedSocialEvents.contains(.impression(postId: "r1", source: "feed", surface: .reels)))
        XCTAssertEqual(service.recordImpressionCallCount, 0, "Le réel ne passe plus par la route unitaire sans surface.")
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
