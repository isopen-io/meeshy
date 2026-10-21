import XCTest
import MeeshySDK
@testable import Meeshy

/// #10508 — la capture d'écran d'un contenu SOCIAL : QU'elle a eu lieu, sur
/// quelle surface, quels contenus étaient à l'écran. Jamais l'image. Une
/// capture dans une conversation reste l'affaire de #9617.
@MainActor
final class SocialCaptureReporterTests: XCTestCase {

    @MainActor
    private final class StubSocialSource: SocialCaptureSource {
        nonisolated deinit {}
        var snapshot: SocialCaptureSnapshot?
        init(_ snapshot: SocialCaptureSnapshot?) { self.snapshot = snapshot }
        func socialCaptureSnapshot(at now: Date) -> SocialCaptureSnapshot? { snapshot }
    }

    @MainActor
    private final class Clock {
        nonisolated deinit {}
        var date = Date(timeIntervalSince1970: 1_760_000_000)
    }

    @MainActor
    private final class RecordingSocialObserver: SocialCaptureObserving {
        nonisolated deinit {}
        private(set) var calls: [String] = []
        func screenshotTaken() { calls.append("screenshot") }
        func screenCaptureChanged(isCaptured: Bool) { calls.append(isCaptured ? "captured" : "released") }
    }

    private func feedSnapshot() -> SocialCaptureSnapshot {
        SocialCaptureSnapshot(surface: SocialSurface(.feed), targets: [
            SocialVisibleTarget(kind: .post, id: "p1", visibleFraction: 1),
            SocialVisibleTarget(kind: .post, id: "p2", visibleFraction: 0.4),
        ])
    }

    private func makeReporter(
        conversationOnScreen: Bool = false,
        source: StubSocialSource,
        clock: Clock = Clock()
    ) -> (SocialCaptureReporter, MockSocialEventsV2Reporter) {
        let sink = MockSocialEventsV2Reporter()
        let reporter = SocialCaptureReporter(
            reporter: { sink },
            isConversationOnScreen: { conversationOnScreen },
            fallback: StubSocialSource(nil),
            now: { clock.date }
        )
        reporter.register(source)
        return (reporter, sink)
    }

    func test_screenshot_onTheFeed_emitsScreenshotWithTheVisibleTargets() throws {
        let source = StubSocialSource(feedSnapshot())
        let (reporter, sink) = makeReporter(source: source)

        reporter.screenshotTaken()

        let event = try XCTUnwrap(sink.emitted.first)
        XCTAssertEqual(sink.emitted.count, 1)
        XCTAssertEqual(event.type, "screen_capture")
        XCTAssertEqual(event.action, "screenshot")
        XCTAssertEqual(event.surface, SocialSurface(.feed))
        XCTAssertEqual(event.target, SocialTarget(kind: .post, id: "p1"))
        guard case .screenCapture(let capture) = event.payload else { return XCTFail("charge \(event.payload.type)") }
        XCTAssertEqual(capture.visibleTargets.map(\.id), ["p1", "p2"])
        XCTAssertEqual(capture.captureKind, .screenshot)
    }

    func test_screenshot_inAConversation_emitsNoSocialCapture() {
        let source = StubSocialSource(feedSnapshot())
        let (reporter, sink) = makeReporter(conversationOnScreen: true, source: source)

        reporter.screenshotTaken()
        reporter.screenCaptureChanged(isCaptured: true)
        reporter.screenCaptureChanged(isCaptured: false)

        XCTAssertTrue(sink.emitted.isEmpty)
    }

    func test_isCapturedTrueThenFalse_givesStartedThenStopped_withTheDuration() throws {
        let clock = Clock()
        let source = StubSocialSource(feedSnapshot())
        let (reporter, sink) = makeReporter(source: source, clock: clock)

        reporter.screenCaptureChanged(isCaptured: true)
        reporter.screenCaptureChanged(isCaptured: true)
        clock.date = clock.date.addingTimeInterval(4.25)
        reporter.screenCaptureChanged(isCaptured: false)

        XCTAssertEqual(sink.actions, ["recording_started", "recording_stopped"])
        guard case .screenCapture(let stop) = try XCTUnwrap(sink.emitted.last).payload else { return XCTFail("pas une capture") }
        XCTAssertEqual(stop.recordingMs, 4_250)
        XCTAssertEqual(stop.captureKind, .recordingOrMirroring)
    }

    func test_nothingSocialOnScreen_emitsNothing() {
        let (reporter, sink) = makeReporter(source: StubSocialSource(nil))
        reporter.screenshotTaken()
        XCTAssertTrue(sink.emitted.isEmpty)
    }

    /// Une seule inscription NotificationCenter : le second abonné ne s'abonne
    /// à rien, il est APPELÉ par le rapporteur de #9617.
    func test_theConversationReporter_forwardsToTheSocialObserver() {
        let observer = RecordingSocialObserver()
        let reporter = ContentCaptureReporter(
            declarer: OutboxContentCaptureDeclarer(readSettleDelay: .seconds(60)),
            isConversationCovered: { false },
            isScreenCaptured: { false },
            social: { observer }
        )

        reporter.screenshotTaken()
        reporter.screenCaptureChanged(isCaptured: true)
        reporter.screenCaptureChanged(isCaptured: false)

        XCTAssertEqual(observer.calls, ["screenshot", "captured", "released"])
        XCTAssertFalse(reporter.showsConversationContent)
    }

    func test_recentDisplays_giveTheFrontSurfaceAndItsLastTenContents() throws {
        let source = RecentDisplayCaptureSource()
        let start = Date(timeIntervalSince1970: 1_760_000_000)
        source.noteDisplayed(postId: "old", source: "feed", surface: .feed, at: start)
        (0..<12).forEach { source.noteDisplayed(postId: "r\($0)", source: "reels", surface: .reels, at: start.addingTimeInterval(Double($0))) }
        source.noteDisplayed(postId: "quoted", source: "shared_link", surface: .citation, at: start.addingTimeInterval(20))

        let snapshot = try XCTUnwrap(source.socialCaptureSnapshot(at: start.addingTimeInterval(30)))
        XCTAssertEqual(snapshot.surface, SocialSurface(.reels))
        XCTAssertEqual(snapshot.targets.count, 10)
        XCTAssertEqual(snapshot.targets.first?.id, "r11")
        XCTAssertEqual(snapshot.targets.first?.kind, .reel)
        XCTAssertNil(source.socialCaptureSnapshot(at: start.addingTimeInterval(500)))
    }
}
