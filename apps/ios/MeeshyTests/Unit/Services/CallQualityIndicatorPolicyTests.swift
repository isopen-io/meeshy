import XCTest
@testable import Meeshy

// MARK: - Quality signal merge (BWE vs RTT/loss heuristic)

/// The "Connexion instable" pill fired at 00:06 on perfectly healthy calls
/// (prod analytics 2026-07-03: RTT 7 ms, 0 % loss, qualityDistribution
/// poor:1). Root cause: the TWCC GCC bandwidth estimate is calibrated against
/// VIDEO tier bitrates (poor < 400 kbps). On an audio-only call GCC never
/// probes above the ~64 kbps the Opus encoder asks for, and during the first
/// seconds of ANY call it is still ramping from its conservative kick-off
/// (~300 kbps) — both read as .poor/.critical on a healthy link. The BWE
/// signal must only constrain the level when video is actually sending AND
/// the estimator has had time to converge.
@MainActor
final class QualityLevelMergePolicyTests: XCTestCase {

    func test_effectiveQualityLevel_audioOnly_ignoresBweSignal() {
        let level = CallReliabilityPolicy.effectiveQualityLevel(
            heuristic: .excellent,
            bwe: .critical,
            isSendingVideo: false,
            secondsSinceMonitorStart: 120
        )
        XCTAssertEqual(level, .excellent)
    }

    func test_effectiveQualityLevel_videoDuringWarmup_ignoresBweSignal() {
        let level = CallReliabilityPolicy.effectiveQualityLevel(
            heuristic: .good,
            bwe: .poor,
            isSendingVideo: true,
            secondsSinceMonitorStart: CallReliabilityPolicy.bweWarmupSeconds - 1
        )
        XCTAssertEqual(level, .good)
    }

    func test_effectiveQualityLevel_videoAfterWarmup_takesWorstSignal() {
        let level = CallReliabilityPolicy.effectiveQualityLevel(
            heuristic: .excellent,
            bwe: .fair,
            isSendingVideo: true,
            secondsSinceMonitorStart: CallReliabilityPolicy.bweWarmupSeconds + 1
        )
        XCTAssertEqual(level, .fair)
    }

    func test_effectiveQualityLevel_videoAfterWarmup_noBweSample_usesHeuristic() {
        let level = CallReliabilityPolicy.effectiveQualityLevel(
            heuristic: .fair,
            bwe: nil,
            isSendingVideo: true,
            secondsSinceMonitorStart: 60
        )
        XCTAssertEqual(level, .fair)
    }

    func test_effectiveQualityLevel_audioOnly_degradedHeuristic_reportsDegraded() {
        // A genuinely bad audio link (high RTT / loss) must still surface,
        // warm-up or not — only the BWE signal is gated, never the heuristic.
        let level = CallReliabilityPolicy.effectiveQualityLevel(
            heuristic: .poor,
            bwe: nil,
            isSendingVideo: false,
            secondsSinceMonitorStart: 3
        )
        XCTAssertEqual(level, .poor)
    }
}

// MARK: - Sustained-degradation gate for the UI pill

/// One 5 s stats tick is not "vraiment mauvais": a transient RTT spike or a
/// single loss burst self-heals without the user ever needing a warning. The
/// "Connexion instable" pill requires two consecutive degraded ticks (~10 s)
/// and clears on the first healthy one (fast recovery feedback).
@MainActor
final class DegradedLinkTrackerTests: XCTestCase {

    func test_record_singleDegradedTick_doesNotAlert() {
        var tracker = DegradedLinkTracker()
        XCTAssertFalse(tracker.record(level: .poor))
    }

    func test_record_consecutiveDegradedTicks_alerts() {
        var tracker = DegradedLinkTracker()
        _ = tracker.record(level: .critical)
        XCTAssertTrue(tracker.record(level: .poor))
    }

    func test_record_healthyTick_clearsImmediately() {
        var tracker = DegradedLinkTracker()
        _ = tracker.record(level: .poor)
        _ = tracker.record(level: .poor)
        XCTAssertFalse(tracker.record(level: .good))
    }

    func test_record_interruptedStreak_doesNotAlert() {
        var tracker = DegradedLinkTracker()
        _ = tracker.record(level: .poor)
        _ = tracker.record(level: .excellent)
        XCTAssertFalse(tracker.record(level: .poor))
    }

    func test_record_fairLevel_neverAlerts() {
        var tracker = DegradedLinkTracker()
        _ = tracker.record(level: .fair)
        XCTAssertFalse(tracker.record(level: .fair))
    }

    func test_reset_clearsStreakAndAlert() {
        var tracker = DegradedLinkTracker()
        _ = tracker.record(level: .poor)
        _ = tracker.record(level: .poor)
        tracker.reset()
        XCTAssertFalse(tracker.isDegraded)
        XCTAssertFalse(tracker.record(level: .poor))
    }
}
