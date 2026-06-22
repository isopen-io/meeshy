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

    func test_begin_whenConsentDenied_recordsNothing() async {
        let (tracker, sink, clock) = makeSUT(consent: false)
        tracker.begin(postId: "p1", contentType: .post, surface: .detail)
        clock.value += 5000
        await tracker.end(surface: .detail)

        XCTAssertEqual(sink.opened.count, 0)
        XCTAssertEqual(sink.finalized.count, 0)
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
    var opened: [EngagementSession] { lock.lock(); defer { lock.unlock() }; return _opened }
    var finalized: [EngagementSession] { lock.lock(); defer { lock.unlock() }; return _finalized }
    func beginSession(_ s: EngagementSession) async { lock.withLock { _opened.append(s) } }
    func checkpoint(_ s: EngagementSession) async {}
    func finalizeSession(_ s: EngagementSession) async { lock.withLock { _finalized.append(s) } }
    func requestFlush() async {}
}
final class MutableClockMs { var value: Int = 0 }
