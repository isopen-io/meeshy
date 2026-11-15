import XCTest
import MeeshySDK
@testable import Meeshy

/// #10501 — chaque impression dit sa position, sa page de fil, sa source de
/// classement, et si elle a été visible au sens MRC. Règle de comptage du
/// porteur : CHAQUE LISTING COMPTE — la visibilité qualifie l'impression,
/// elle ne la conditionne jamais.
@MainActor
final class ListingViewabilityTests: XCTestCase {

    /// L'horloge monotone d'une carte, avancée à la main.
    @MainActor
    private final class Clock {
        nonisolated deinit {}
        var ms = 0
    }

    private var defaults: UserDefaults!
    private var suiteName: String!
    /// Les files ouvertes par un test : vidées en fin de test, pour qu'aucun
    /// groupement en attente ne lui survive.
    private var opened: [ImpressionBatcher] = []

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "listing-viewability-tests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() async throws {
        for batcher in opened { await batcher.flushNow() }
        opened = []
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        try await super.tearDown()
    }

    private struct Listing {
        let sut: ImpressionBatcher
        let service: MockPostService
        let reporter: MockSocialEventsV2Reporter
        let clock: Clock
        let tracker: ListingViewabilityTracker
    }

    private func makeListing(
        source: String = "feed",
        surface: ReachSurface = .feed,
        ledger: ListingContextLedger = ListingContextLedger(),
        service: MockPostService = MockPostService()
    ) -> Listing {
        let reporter = MockSocialEventsV2Reporter()
        let clock = Clock()
        let tracker = ListingViewabilityTracker(
            surface: SocialSurface(surface),
            reporter: { reporter },
            clockMs: { clock.ms },
            wallClock: { Date(timeIntervalSince1970: 1_700_000_000) },
            observesLifecycle: false
        )
        let sut = ImpressionBatcher(
            source: source,
            surface: surface,
            postService: service,
            flushDelay: 60,
            defaults: defaults,
            accountId: { "u1" },
            listings: ledger,
            viewability: tracker
        )
        opened.append(sut)
        return Listing(sut: sut, service: service, reporter: reporter, clock: clock, tracker: tracker)
    }

    private func listings(in service: MockPostService) -> [SocialListing?] {
        service.recordedImpressions.map {
            guard case .impression(_, _, _, let listing, _) = $0 else { return nil }
            return listing
        }
    }

    private func visibilities(in service: MockPostService) -> [SocialVisibility?] {
        service.recordedImpressions.map {
            guard case .impression(_, _, _, _, let visibility) = $0 else { return nil }
            return visibility
        }
    }

    private func measures(in reporter: MockSocialEventsV2Reporter) -> [SocialVisibility] {
        reporter.payloads {
            guard case .visibility(let measured) = $0 else { return nil }
            return measured
        }
    }

    // MARK: - Chaque listing compte, et se situe

    func test_recordListed_fromTheFeedThenAHashtag_countsTwoImpressions_eachWithItsOwnListing() async {
        let ledger = ListingContextLedger()
        ledger.note(surface: .feed, feedRequestId: "fr_feed", items: [ListedItem(id: "p1", rankingSource: "for_you")])
        ledger.note(surface: .hashtag, feedRequestId: "fr_tag", items: [ListedItem(id: "p1", rankingSource: "hashtag")])
        let service = MockPostService()
        let feed = makeListing(source: "feed", surface: .feed, ledger: ledger, service: service)
        let hashtag = makeListing(source: "search", surface: .hashtag, ledger: ledger, service: service)

        _ = feed.sut.recordListed("p1", position: 3, isVideo: false)
        _ = hashtag.sut.recordListed("p1", position: 0, isVideo: false)
        await feed.sut.flushNow()
        await hashtag.sut.flushNow()

        XCTAssertEqual(service.recordedCountedImpressions, [
            .impression(postId: "p1", source: "feed", surface: .feed),
            .impression(postId: "p1", source: "search", surface: .hashtag),
        ])
        XCTAssertEqual(listings(in: service), [
            SocialListing(feedRequestId: "fr_feed", position: 3, rankingSource: .forYou),
            SocialListing(feedRequestId: "fr_tag", position: 0, rankingSource: .hashtag),
        ])
    }

    func test_recordListed_twiceInTheSameListing_countsTwoImpressions_withTwoEventIds() async {
        let listing = makeListing()

        let first = listing.sut.recordListed("p1", position: 2, isVideo: false)
        let second = listing.sut.recordListed("p1", position: 2, isVideo: false)
        await listing.sut.flushNow()

        XCTAssertNotNil(first)
        XCTAssertNotEqual(first, second)
        XCTAssertEqual(listing.service.recordedCountedImpressions.count, 2)
        XCTAssertEqual(listing.service.recordedStampedSocialEventBatches.flatMap { $0 }.map(\.stamp.eventId), [first, second].compactMap { $0 })
    }

    func test_recordListed_whenThePageServedNoContext_keepsTheRenderedRankOnly() async {
        let listing = makeListing()

        _ = listing.sut.recordListed("p1", position: 5, isVideo: false)
        await listing.sut.flushNow()

        XCTAssertEqual(listings(in: listing.service), [SocialListing(position: 5)])
    }

    func test_recordListed_withoutRankNorServedContext_countsTheImpressionWithoutListing() async {
        let listing = makeListing()

        _ = listing.sut.recordListed("p1", position: nil, isVideo: false)
        await listing.sut.flushNow()

        XCTAssertEqual(listing.service.recordedCountedImpressions, [.impression(postId: "p1", source: "feed", surface: .feed)])
        XCTAssertEqual(listings(in: listing.service), [nil])
    }

    func test_record_outsideAListing_carriesNeitherListingNorVisibility() async {
        let listing = makeListing()

        listing.sut.record("p1")
        await listing.sut.flushNow()

        XCTAssertEqual(listing.service.recordedImpressions, [.impression(postId: "p1", source: "feed", surface: .feed)])
        XCTAssertTrue(listing.reporter.emitted.isEmpty)
    }

    // MARK: - La visibilité qualifie, elle ne conditionne pas

    func test_cellAtSixtyPercentFor1200ms_isViewable_andItsMeasureIsLinkedToTheImpression() async throws {
        let ledger = ListingContextLedger()
        ledger.note(surface: .feed, feedRequestId: "fr_feed", items: [ListedItem(id: "p1", rankingSource: "following")])
        let listing = makeListing(ledger: ledger)
        let eventId = try XCTUnwrap(listing.sut.recordListed("p1", position: 1, isVideo: false))

        listing.sut.noteVisible(fraction: 0.6, of: eventId)
        listing.clock.ms = 1_200
        listing.sut.noteGone(eventId)
        await listing.sut.flushNow()

        let measured = try XCTUnwrap(listing.reporter.emitted.first)
        XCTAssertEqual(listing.reporter.emitted.count, 1)
        XCTAssertEqual(measured.type, "visibility")
        XCTAssertEqual(measured.action, "measured")
        XCTAssertEqual(measured.target, SocialTarget(kind: .post, id: "p1"))
        XCTAssertEqual(measured.surface, SocialSurface(.feed))
        XCTAssertEqual(measured.listing, SocialListing(feedRequestId: "fr_feed", position: 1, rankingSource: .following))
        XCTAssertEqual(measures(in: listing.reporter), [
            SocialVisibility(maxVisibleFraction: 0.6, visibleMs: 1_200, viewable: true, impressionEventId: eventId),
        ])
        XCTAssertEqual(visibilities(in: listing.service), [SocialVisibility(maxVisibleFraction: 0.6, visibleMs: 1_200, viewable: true)])
        XCTAssertEqual(listing.service.recordedStampedSocialEventBatches.flatMap { $0 }.map(\.stamp.eventId), [eventId])
    }

    func test_cellAtFortyPercent_isNotViewable_butItsImpressionCounts() async throws {
        let listing = makeListing()
        let eventId = try XCTUnwrap(listing.sut.recordListed("p1", position: 0, isVideo: false))

        listing.sut.noteVisible(fraction: 0.4, of: eventId)
        listing.clock.ms = 5_000
        listing.sut.noteGone(eventId)
        await listing.sut.flushNow()

        XCTAssertEqual(listing.service.recordedCountedImpressions, [.impression(postId: "p1", source: "feed", surface: .feed)])
        XCTAssertEqual(visibilities(in: listing.service), [SocialVisibility(maxVisibleFraction: 0.4, visibleMs: 5_000, viewable: false)])
        XCTAssertEqual(measures(in: listing.reporter).map(\.viewable), [false])
        XCTAssertEqual(measures(in: listing.reporter).map(\.impressionEventId), [eventId])
    }

    func test_cellNeverMeasured_stillCountsItsImpression() async throws {
        let listing = makeListing()
        let eventId = try XCTUnwrap(listing.sut.recordListed("p1", position: 0, isVideo: false))

        listing.sut.noteGone(eventId)
        await listing.sut.flushNow()

        XCTAssertEqual(listing.service.recordedCountedImpressions.count, 1)
        XCTAssertEqual(visibilities(in: listing.service), [SocialVisibility(maxVisibleFraction: 0, visibleMs: 0, viewable: false)])
    }

    func test_videoCell_needsTwoContinuousSeconds() async throws {
        let listing = makeListing(surface: .reels)
        let short = try XCTUnwrap(listing.sut.recordListed("r1", position: 0, isVideo: true))
        listing.sut.noteVisible(fraction: 1, of: short)
        listing.clock.ms = 1_200
        listing.sut.noteGone(short)
        let long = try XCTUnwrap(listing.sut.recordListed("r2", position: 1, isVideo: true))
        listing.sut.noteVisible(fraction: 1, of: long)
        listing.clock.ms = 3_200
        listing.sut.noteGone(long)

        XCTAssertEqual(measures(in: listing.reporter).map(\.viewable), [false, true])
        XCTAssertEqual(listing.reporter.emitted.map(\.target), [SocialTarget(kind: .reel, id: "r1"), SocialTarget(kind: .reel, id: "r2")])
    }

    func test_droppingUnderHalf_restartsTheContinuousSecond() async throws {
        let listing = makeListing()
        let eventId = try XCTUnwrap(listing.sut.recordListed("p1", position: 0, isVideo: false))

        listing.sut.noteVisible(fraction: 0.8, of: eventId)
        listing.clock.ms = 700
        listing.sut.noteVisible(fraction: 0.3, of: eventId)
        listing.clock.ms = 800
        listing.sut.noteVisible(fraction: 0.8, of: eventId)
        listing.clock.ms = 1_700
        listing.sut.noteGone(eventId)

        XCTAssertEqual(measures(in: listing.reporter), [
            SocialVisibility(maxVisibleFraction: 0.8, visibleMs: 1_700, viewable: false, impressionEventId: eventId),
        ])
    }

    /// Le lot part pendant que la carte est encore à l'écran : l'impression
    /// porte la mesure du moment, et la sortie d'écran émet la mesure finale.
    func test_impressionSentWhileTheCellIsStillOnScreen_carriesTheMeasureSoFar() async throws {
        let listing = makeListing()
        let eventId = try XCTUnwrap(listing.sut.recordListed("p1", position: 0, isVideo: false))

        listing.sut.noteVisible(fraction: 0.7, of: eventId)
        listing.clock.ms = 400
        await listing.sut.flushNow()
        listing.clock.ms = 1_500
        listing.sut.noteGone(eventId)

        XCTAssertEqual(visibilities(in: listing.service), [SocialVisibility(maxVisibleFraction: 0.7, visibleMs: 400, viewable: false)])
        XCTAssertEqual(measures(in: listing.reporter), [
            SocialVisibility(maxVisibleFraction: 0.7, visibleMs: 1_500, viewable: true, impressionEventId: eventId),
        ])
    }

    func test_noteGone_twice_emitsOneMeasure() async throws {
        let listing = makeListing()
        let eventId = try XCTUnwrap(listing.sut.recordListed("p1", position: 0, isVideo: false))

        listing.sut.noteGone(eventId)
        listing.sut.noteGone(eventId)
        listing.sut.noteVisible(fraction: 1, of: eventId)

        XCTAssertEqual(listing.reporter.emitted.count, 1)
    }

    // MARK: - L'app quitte le premier plan

    func test_timeInBackground_isNeitherVisibleNorContinuous() async throws {
        let listing = makeListing()
        let eventId = try XCTUnwrap(listing.sut.recordListed("p1", position: 0, isVideo: false))

        listing.sut.noteVisible(fraction: 0.6, of: eventId)
        listing.clock.ms = 500
        listing.tracker.suspend()
        listing.clock.ms = 10_000
        listing.tracker.resume()
        listing.clock.ms = 10_600
        listing.sut.noteGone(eventId)

        XCTAssertEqual(measures(in: listing.reporter), [
            SocialVisibility(maxVisibleFraction: 0.6, visibleMs: 1_100, viewable: false, impressionEventId: eventId),
        ])
    }

    // MARK: - La file persistée

    func test_pendingListedImpression_survivesARelaunch_withItsListingAndMeasure() async throws {
        let ledger = ListingContextLedger()
        ledger.note(surface: .feed, feedRequestId: "fr_feed", items: [ListedItem(id: "p1", rankingSource: "trending")])
        let first = makeListing(ledger: ledger)
        let eventId = try XCTUnwrap(first.sut.recordListed("p1", position: 7, isVideo: false))
        first.sut.noteVisible(fraction: 1, of: eventId)
        first.clock.ms = 1_000
        first.sut.noteGone(eventId)

        let relaunched = makeListing()

        XCTAssertEqual(relaunched.sut.pendingImpressions.map(\.postId), ["p1"])
        XCTAssertEqual(relaunched.sut.pendingImpressions.map(\.stamp.eventId), [eventId])
        XCTAssertEqual(relaunched.sut.pendingImpressions.map(\.listing), [SocialListing(feedRequestId: "fr_feed", position: 7, rankingSource: .trending)])
        XCTAssertEqual(relaunched.sut.pendingImpressions.map(\.visibility), [SocialVisibility(maxVisibleFraction: 1, visibleMs: 1_000, viewable: true)])
    }

    func test_queuePersistedBeforeListings_isReadWithoutContext() throws {
        let key = ImpressionBatcher.storageKey(source: "feed", surface: .feed, accountId: "u1")
        defaults.set(Data(#"[{"postId":"p1","eventId":"0f8fad5b-d9cb-469f-a165-70867728950e"}]"#.utf8), forKey: key)

        let listing = makeListing()

        XCTAssertEqual(listing.sut.pendingImpressions.map(\.postId), ["p1"])
        XCTAssertNil(listing.sut.pendingImpressions.first?.listing)
        XCTAssertNil(listing.sut.pendingImpressions.first?.visibility)
    }

    // MARK: - Une surface qui ne mesure pas

    func test_surfaceThatDoesNotMeasure_countsTheImpressionAndReturnsNoEventId() {
        let recorder = PlainRecorder()

        let eventId = recorder.recordListed("p1", position: 3, isVideo: false)
        recorder.noteVisible(fraction: 1, of: "any")
        recorder.noteGone("any")

        XCTAssertNil(eventId)
        XCTAssertEqual(recorder.recorded, ["p1"])
    }

    @MainActor
    private final class PlainRecorder: ReachImpressionRecording {
        nonisolated deinit {}
        private(set) var recorded: [String] = []
        func record(_ postId: String) { recorded.append(postId) }
        func flushNow() async {}
    }
}
