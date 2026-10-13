import XCTest
import MeeshySDK
@testable import Meeshy

/// #10506, #10509 — ce que les surfaces de l'app émettent : la navigation du
/// lecteur de story, le défilement du fil, le parcours d'un carrousel.
@MainActor
final class SocialEventsV2SurfacesTests: XCTestCase {

    @MainActor
    private final class Ticker {
        nonisolated deinit {}
        var ms = 0
    }

    private func position(slide: Int, of count: Int, fraction: Double, duration: Double = 6) -> StoryNavigationTelemetry.Position {
        StoryNavigationTelemetry.Position(storyId: "s\(slide)", slideIndex: slide, slideCount: count, fraction: fraction, durationSeconds: duration)
    }

    // MARK: - Story

    func test_exitBeforeEnd_carriesTheSlideIndex() throws {
        let events = StoryNavigationTelemetry.exit(position: position(slide: 1, of: 4, fraction: 0.5))
        let event = try XCTUnwrap(events.first)
        XCTAssertEqual(event.action, "exit_before_end")
        guard case .story(let story) = event.payload else { return XCTFail("pas une story") }
        XCTAssertEqual(story.slideIndex, 1)
        XCTAssertEqual(story.slideCount, 4)
        XCTAssertEqual(story.elapsedMs, 3_000)
    }

    func test_closingAtTheEndOfTheLastSlide_isNotAnEarlyExit() {
        XCTAssertTrue(StoryNavigationTelemetry.exit(position: position(slide: 3, of: 4, fraction: 1)).isEmpty)
    }

    func test_autoAdvance_emitsNothing_aTapForwardEmitsTapForward() {
        XCTAssertTrue(StoryNavigationTelemetry.forward(position: position(slide: 0, of: 3, fraction: 0.99)).isEmpty)
        XCTAssertEqual(StoryNavigationTelemetry.forward(position: position(slide: 0, of: 3, fraction: 0.5)).map(\.action), ["tap_forward"])
    }

    func test_aTapForwardAt600ms_isAQuickSkip_at1200msItIsNot() {
        let quick = StoryNavigationTelemetry.forward(position: position(slide: 0, of: 3, fraction: 0.1, duration: 6))
        XCTAssertEqual(quick.map(\.action), ["tap_forward", "quick_skip"])
        let slow = StoryNavigationTelemetry.forward(position: position(slide: 0, of: 3, fraction: 0.2, duration: 6))
        XCTAssertEqual(slow.map(\.action), ["tap_forward"])
    }

    // MARK: - Défilement du fil

    func test_aThousandOffsets_giveOneListingEventAtTheEnd() throws {
        let sink = MockSocialEventsV2Reporter()
        let ticker = Ticker()
        let tracker = ListingScrollTracker(surface: SocialSurface(.feed), reporter: { sink }, clockMs: { ticker.ms }, observesBackground: false)

        for frame in 1...1_000 {
            ticker.ms = frame * 16
            tracker.noteOffset(CGFloat(frame * 6))
        }
        XCTAssertTrue(sink.emitted.isEmpty, "rien ne part pendant le défilement")

        tracker.finish()
        let event = try XCTUnwrap(sink.emitted.first)
        XCTAssertEqual(sink.emitted.count, 1)
        XCTAssertEqual(event.type, "scroll")
        XCTAssertEqual(event.action, "listing")
        XCTAssertNil(event.target)
        guard case .scrollListing(let summary) = event.payload else { return XCTFail("pas un défilement") }
        XCTAssertGreaterThan(summary.distancePt, 5_000)
        XCTAssertEqual(summary.velocityHistogram.reduce(0, +), summary.activeScrollMs)
    }

    func test_aResumeAfter30sIdle_opensANewPassage() {
        let sink = MockSocialEventsV2Reporter()
        let ticker = Ticker()
        let tracker = ListingScrollTracker(surface: SocialSurface(.feed), reporter: { sink }, clockMs: { ticker.ms }, observesBackground: false)

        tracker.noteOffset(0)
        ticker.ms = 200
        tracker.noteOffset(300)
        ticker.ms = 40_000
        tracker.noteOffset(310)

        XCTAssertEqual(sink.emitted.count, 1)
    }

    // MARK: - Liens et découverte (#10505)

    func test_anOutboundLink_sendsOnlyItsRegistrableDomain() throws {
        let url = try XCTUnwrap(URL(string: "https://www.lemonde.fr/international/article/2026/10/13/x.html?utm_source=meeshy#top"))
        let event = try XCTUnwrap(OutboundLinkEvents.event(for: url, surface: SocialSurface(.feed)))
        XCTAssertEqual(event.action, "outbound_click")
        XCTAssertEqual(event.target, SocialTarget(kind: .link, id: "lemonde.fr"))
        let body = try XCTUnwrap(try SocialEventsV2Wire.encode(event))
        let text = try XCTUnwrap(String(data: body, encoding: .utf8))
        XCTAssertFalse(text.contains("international"), "le chemin ne part pas")
        XCTAssertFalse(text.contains("utm_source"), "la requête ne part pas")
    }

    func test_aMeeshyTrackingLink_isFollowed_anInternalLinkIsNothing() throws {
        let tracked = OutboundLinkEvents.event(for: try XCTUnwrap(URL(string: "https://meeshy.me/l/AbC123")), surface: nil)
        XCTAssertEqual(tracked?.action, "tracking_link_followed")
        XCTAssertEqual(tracked?.target?.id, "AbC123")
        XCTAssertNil(OutboundLinkEvents.event(for: try XCTUnwrap(URL(string: "https://meeshy.me/u/alice")), surface: nil))
        XCTAssertNil(OutboundLinkEvents.event(for: try XCTUnwrap(URL(string: "mailto:a@b.c")), surface: nil))
    }

    func test_aSearch_sendsItsLength_neverItsText() throws {
        let event = try XCTUnwrap(DiscoveryTelemetry.searchSubmitted(searchId: "s-1", query: "  Aminata Diallo ", peopleCount: 3))
        let text = try XCTUnwrap(String(data: try XCTUnwrap(try SocialEventsV2Wire.encode(event)), encoding: .utf8))
        XCTAssertFalse(text.lowercased().contains("aminata"))
        guard case .discovery(let discovery) = event.payload else { return XCTFail("pas une découverte") }
        XCTAssertEqual(discovery.queryLength, 14)
        XCTAssertEqual(discovery.resultCount, 3)
        XCTAssertNil(DiscoveryTelemetry.searchSubmitted(searchId: "s-2", query: "   ", peopleCount: 0))
    }

    func test_aTappedProfileResult_carriesItsPosition_andOwnProfileIsNoVisit() {
        let tap = DiscoveryTelemetry.profileResultTapped(searchId: "s-1", userId: "u7", position: 2)
        XCTAssertEqual(tap.listing?.position, 2)
        XCTAssertEqual(tap.listing?.rankingSource, .search)
        XCTAssertNil(DiscoveryTelemetry.profileVisit("me", viewerId: "me"))
        XCTAssertEqual(DiscoveryTelemetry.profileVisit("u7", viewerId: "me")?.action, "profile_visit")
    }

    /// Revue de conformité R1 — la recherche de personnes est mesurée : le
    /// manifeste le déclare, liée au compte, pour l'analyse, sans traçage.
    func test_thePrivacyManifest_declaresSearchHistory_linked_forAnalytics_withoutTracking() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/PrivacyInfo.xcprivacy")
        let plist = try XCTUnwrap(PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any])
        XCTAssertEqual(plist["NSPrivacyTracking"] as? Bool, false)
        let types = try XCTUnwrap(plist["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        let search = try XCTUnwrap(types.first { $0["NSPrivacyCollectedDataType"] as? String == "NSPrivacyCollectedDataTypeSearchHistory" })
        XCTAssertEqual(search["NSPrivacyCollectedDataTypeLinked"] as? Bool, true)
        XCTAssertEqual(search["NSPrivacyCollectedDataTypeTracking"] as? Bool, false)
        XCTAssertEqual(search["NSPrivacyCollectedDataTypePurposes"] as? [String], ["NSPrivacyCollectedDataTypePurposeAnalytics"])
    }

    // MARK: - Carrousel

    func test_aCarousel_reportsItsDepthOnClose_andNothingIfUntouched() throws {
        let sink = MockSocialEventsV2Reporter()
        let untouched = ContentScrollTracker(target: SocialTarget(kind: .post, id: "p"), contentKind: .carousel, itemsTotal: 4, reporter: { sink })
        untouched.finish()
        XCTAssertTrue(sink.emitted.isEmpty)

        let carousel = ContentScrollTracker(target: SocialTarget(kind: .post, id: "p"), contentKind: .carousel, itemsTotal: 4, reporter: { sink })
        carousel.noteIndex(1)
        carousel.noteIndex(2)
        carousel.finish()
        guard case .scrollContent(let summary) = try XCTUnwrap(sink.emitted.first).payload else { return XCTFail("pas un contenu") }
        XCTAssertEqual(summary.maxIndexReached, 2)
        XCTAssertEqual(summary.itemsTotal, 4)
        XCTAssertEqual(summary.swipes, 2)
    }
}
