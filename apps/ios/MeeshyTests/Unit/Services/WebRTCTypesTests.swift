import XCTest
@testable import Meeshy

final class QualityThresholdsHeartbeatTests: XCTestCase {

    func test_heartbeatIntervalSeconds_is10() {
        // Phase 1 fix P1: 5s/15s was too aggressive on cellular (RTT 800ms+).
        // SOTA WhatsApp/Telegram parity: 10s heartbeat.
        // Reference §5.12.
        XCTAssertEqual(QualityThresholds.heartbeatIntervalSeconds, 10.0)
    }

    func test_heartbeatLostThresholdSeconds_is30() {
        // 3 missed beats (~30s) marks heartbeat as lost.
        XCTAssertEqual(QualityThresholds.heartbeatLostThresholdSeconds, 30.0)
    }

    func test_heartbeatAckTimeoutSeconds_is5() {
        // Phase 1 fix P10: cellular RTT worst-case ~3-4s, 5s ACK timeout.
        XCTAssertEqual(QualityThresholds.heartbeatAckTimeoutSeconds, 5.0)
    }
}

// §5.6 — thermal-aware video encoder ceiling.
final class VideoThermalProfileTests: XCTestCase {

    func test_nominal_isStrictNoOp() {
        let r = VideoThermalProfile.apply(bitrateBps: 2_500_000, framerate: 30, scaleDownBy: 1.0, thermalState: .nominal)
        XCTAssertEqual(r.bitrateBps, 2_500_000)
        XCTAssertEqual(r.framerate, 30)
        XCTAssertEqual(r.scaleDownBy, 1.0, accuracy: 0.0001)
    }

    func test_fair_trimsBitrate20Percent_keeps30fps() {
        let r = VideoThermalProfile.apply(bitrateBps: 2_000_000, framerate: 30, scaleDownBy: 1.0, thermalState: .fair)
        XCTAssertEqual(r.bitrateBps, 1_600_000)
        XCTAssertEqual(r.framerate, 30)
        XCTAssertEqual(r.scaleDownBy, 1.0, accuracy: 0.0001)
    }

    func test_serious_halvesBitrate_caps24fps_floorsScale() {
        let r = VideoThermalProfile.apply(bitrateBps: 2_000_000, framerate: 30, scaleDownBy: 1.0, thermalState: .serious)
        XCTAssertEqual(r.bitrateBps, 1_000_000)
        XCTAssertEqual(r.framerate, 24)
        XCTAssertEqual(r.scaleDownBy, 1.5, accuracy: 0.0001)
    }

    func test_critical_aggressivelyShedsLoad() {
        let r = VideoThermalProfile.apply(bitrateBps: 1_000_000, framerate: 30, scaleDownBy: 1.0, thermalState: .critical)
        XCTAssertEqual(r.bitrateBps, 300_000)
        XCTAssertEqual(r.framerate, 15)
        XCTAssertEqual(r.scaleDownBy, 2.0, accuracy: 0.0001)
    }

    func test_takesMoreConservativeOnEachAxis() {
        // Network already requested a stronger downscale (2.5) and lower fps (12)
        // than the .serious thermal floor — the network values must survive.
        let r = VideoThermalProfile.apply(bitrateBps: 400_000, framerate: 12, scaleDownBy: 2.5, thermalState: .serious)
        XCTAssertEqual(r.framerate, 12)                    // min(12, 24)
        XCTAssertEqual(r.scaleDownBy, 2.5, accuracy: 0.0001) // max(2.5, 1.5)
        XCTAssertEqual(r.bitrateBps, 200_000)              // 400k * 0.5
    }

    func test_neverReturnsBelowFloors() {
        let r = VideoThermalProfile.apply(bitrateBps: 1, framerate: 1, scaleDownBy: 1.0, thermalState: .critical)
        XCTAssertGreaterThanOrEqual(r.bitrateBps, 1)
        XCTAssertGreaterThanOrEqual(r.framerate, 1)
        XCTAssertGreaterThanOrEqual(r.scaleDownBy, 1.0)
    }

    func test_ceiling_nominalHasNoEffectiveCaps() {
        let c = VideoThermalProfile.ceiling(for: .nominal)
        XCTAssertEqual(c.bitrateFactor, 1.0, accuracy: 0.0001)
        XCTAssertEqual(c.minScaleDownBy, 1.0, accuracy: 0.0001)
    }
}
