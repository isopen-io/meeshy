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
