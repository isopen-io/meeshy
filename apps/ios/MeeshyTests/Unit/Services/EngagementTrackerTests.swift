import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class EngagementTrackerTests: XCTestCase {
    private func makeSUT(consent: Bool = true) -> (EngagementTracker, MockEngagementSink, MutableClockMs) {
        let sink = MockEngagementSink()
        let clock = MutableClockMs()
        let tracker = EngagementTracker(
            sink: sink,
            nowMs: { clock.value },
            userIdProvider: { "u1" },
            consentProvider: { consent }
        )
        return (tracker, sink, clock)
    }

    func test_endSession_aboveThreshold_finalizesWithDwell() async {
        let (tracker, sink, clock) = makeSUT()
        tracker.begin(postId: "p1", contentType: .post, surface: .detail)
        clock.value += 4000
        await tracker.end(surface: .detail)

        XCTAssertEqual(sink.finalized.count, 1)
        XCTAssertEqual(sink.finalized.first?.postId, "p1")
        XCTAssertEqual(sink.finalized.first?.dwellMs, 4000)
        XCTAssertEqual(sink.finalized.first?.consent, "granted")
    }

    func test_endSession_belowThreshold_isDropped_notFinalized() async {
        let (tracker, sink, clock) = makeSUT()
        tracker.begin(postId: "p1", contentType: .reel, surface: .reels)
        clock.value += 400   // < 1000ms dwell and no watch
        await tracker.end(surface: .reels)

        XCTAssertEqual(sink.finalized.count, 0, "sub-threshold sessions are dropped client-side")
    }

    /// #10764 — l'ouverture, la lecture et la vue qualifiée sont des compteurs
    /// de PORTÉE, comme les vues et les impressions : un refus d'analyse ne les
    /// éteint pas (c'était la cause des compteurs de réels à 0). Il retire de la
    /// session ce qui DÉCRIT le lecteur : ses micro-actions et sa trace de lecture.
    func test_begin_whenConsentDenied_stillCountsTheSession_withoutItsTrace() async {
        let (tracker, sink, clock) = makeSUT(consent: false)
        tracker.begin(postId: "p1", contentType: .reel, surface: .reels)
        clock.value += 1500
        tracker.recordAction(.paused, surface: .reels)
        tracker.attachWatch(surface: .reels, watchMs: 5000, mediaDurationMs: 6000, completed: true,
                            samples: [WatchSample(positionMs: 5800, atMs: 5000)])
        clock.value += 3500
        await tracker.end(surface: .reels)

        XCTAssertEqual(sink.finalized.count, 1)
        let session = sink.finalized.first
        XCTAssertEqual(session?.consent, "denied")
        XCTAssertEqual(session?.dwellMs, 5000)
        XCTAssertEqual(session?.watchMs, 5000)
        XCTAssertEqual(session?.completed, true)
        XCTAssertEqual(session?.actions, [])
        XCTAssertEqual(session?.watchSamples, [])
    }

    /// #10764 — le premier contact part TOUT DE SUITE, sous la clé de la
    /// session que la mesure reprendra à la fin.
    func test_begin_announcesTheFirstContactImmediately_underTheSessionKey() async {
        let (tracker, sink, clock) = makeSUT()
        tracker.begin(postId: "r1", contentType: .reel, surface: .reels)
        await sink.waitForAnnouncements(1)
        clock.value += 4000
        await tracker.end(surface: .reels)

        XCTAssertEqual(sink.announced.map(\.postId), ["r1"])
        XCTAssertEqual(sink.announced.first?.surface, .reels)
        XCTAssertEqual(sink.announced.first?.dwellMs, 0)
        XCTAssertEqual(sink.announced.first?.sessionId, sink.finalized.first?.sessionId)
    }

    func test_recordAction_storesOffsetFromStart() async {
        let (tracker, sink, clock) = makeSUT()
        tracker.begin(postId: "p1", contentType: .post, surface: .detail)
        clock.value += 1200
        tracker.recordAction(.openedComments, surface: .detail)
        clock.value += 2000
        await tracker.end(surface: .detail)

        XCTAssertEqual(sink.finalized.first?.actions.first?.type, .openedComments)
        XCTAssertEqual(sink.finalized.first?.actions.first?.atMs, 1200)
    }

    func test_topmostSurface_pausesUnderlyingDwell() async {
        let (tracker, sink, clock) = makeSUT()
        tracker.begin(postId: "p1", contentType: .post, surface: .detail)
        clock.value += 1000
        tracker.begin(postId: "s1", contentType: .status, surface: .statusBubble)  // overlay on top
        clock.value += 3000                                                          // detail clock paused
        await tracker.end(surface: .statusBubble)
        await tracker.end(surface: .detail)

        let detail = sink.finalized.first { $0.surface == .detail }
        XCTAssertEqual(detail?.dwellMs, 1000, "underlying detail dwell is paused while overlay is active")
    }
}

// Test doubles
final class MockEngagementSink: EngagementSinking, @unchecked Sendable {
    private let lock = NSLock()
    private var _opened: [EngagementSession] = []
    private var _finalized: [EngagementSession] = []
    private var _announced: [EngagementSession] = []
    var announced: [EngagementSession] { lock.lock(); defer { lock.unlock() }; return _announced }
    var opened: [EngagementSession] { lock.lock(); defer { lock.unlock() }; return _opened }
    var finalized: [EngagementSession] { lock.lock(); defer { lock.unlock() }; return _finalized }
    func beginSession(_ s: EngagementSession) async { lock.withLock { _opened.append(s) } }
    func checkpoint(_ s: EngagementSession) async {}
    func finalizeSession(_ s: EngagementSession) async { lock.withLock { _finalized.append(s) } }
    func requestFlush() async {}
    func announceSession(_ s: EngagementSession) async { lock.withLock { _announced.append(s) } }
    /// L'annonce part d'une tâche détachée : on l'attend sans dormir à l'aveugle.
    func waitForAnnouncements(_ count: Int) async {
        for _ in 0..<200 where announced.count < count { await Task.yield() }
    }
}
final class MutableClockMs { var value: Int = 0 }
