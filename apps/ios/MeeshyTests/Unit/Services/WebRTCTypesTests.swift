import XCTest
@testable import Meeshy

@MainActor
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
@MainActor
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

// §7.1 — Continuity / external camera catalog (pure ordering/labeling).
@MainActor
final class CameraCatalogTests: XCTestCase {
    private func desc(_ id: String, _ name: String, _ facing: CameraFacing) -> CameraCatalog.Descriptor {
        CameraCatalog.Descriptor(uniqueID: id, localizedName: name, facing: facing)
    }

    func test_emptyInput_returnsEmpty() {
        XCTAssertTrue(CameraCatalog.options(from: []).isEmpty)
    }

    func test_ordersFrontBackThenExternal() {
        let options = CameraCatalog.options(from: [
            desc("ext1", "Studio Display Camera", .external),
            desc("back1", "Back Camera", .back),
            desc("front1", "Front Camera", .front)
        ])
        XCTAssertEqual(options.map(\.id), ["front1", "back1", "ext1"])
        XCTAssertEqual(options.map(\.facing), [.front, .back, .external])
    }

    func test_deduplicatesByUniqueID() {
        let options = CameraCatalog.options(from: [
            desc("front1", "Front Camera", .front),
            desc("front1", "Front Camera", .front)
        ])
        XCTAssertEqual(options.count, 1)
        XCTAssertEqual(options.first?.displayName, "Front Camera")
    }

    func test_disambiguatesIdenticalExternalNames() {
        let options = CameraCatalog.options(from: [
            desc("ext1", "iPhone Camera", .external),
            desc("ext2", "iPhone Camera", .external)
        ])
        XCTAssertEqual(options.map(\.displayName), ["iPhone Camera", "iPhone Camera (2)"])
        XCTAssertEqual(options.map(\.id), ["ext1", "ext2"])
    }

    func test_externalOptionFlagsIsExternal() {
        let options = CameraCatalog.options(from: [desc("ext1", "Continuity Camera", .external)])
        XCTAssertTrue(options.first?.isExternal == true)
    }

    func test_sortsAlphabeticallyWithinSameFacing() {
        let options = CameraCatalog.options(from: [
            desc("b", "Zoom Cam", .external),
            desc("a", "Apple Studio", .external)
        ])
        XCTAssertEqual(options.map(\.displayName), ["Apple Studio", "Zoom Cam"])
    }
}

// MARK: - VideoQualityLevel factory: RTT + packet-loss heuristic

@MainActor
final class VideoQualityLevelFromRttTests: XCTestCase {

    func test_excellent_lowRttNoLoss() {
        XCTAssertEqual(VideoQualityLevel.from(rtt: 50, packetLoss: 0), .excellent)
    }

    func test_excellent_atBoundary_100ms_1pct() {
        XCTAssertEqual(VideoQualityLevel.from(rtt: 100, packetLoss: 0.01), .excellent)
    }

    func test_good_rttDominated() {
        XCTAssertEqual(VideoQualityLevel.from(rtt: 150, packetLoss: 0), .good)
    }

    func test_good_lossDominated() {
        XCTAssertEqual(VideoQualityLevel.from(rtt: 20, packetLoss: 0.02), .good)
    }

    func test_fair_rttDominated() {
        XCTAssertEqual(VideoQualityLevel.from(rtt: 250, packetLoss: 0), .fair)
    }

    func test_fair_lossDominated() {
        XCTAssertEqual(VideoQualityLevel.from(rtt: 20, packetLoss: 0.04), .fair)
    }

    func test_poor_rttDominated() {
        XCTAssertEqual(VideoQualityLevel.from(rtt: 400, packetLoss: 0), .poor)
    }

    func test_poor_lossDominated() {
        XCTAssertEqual(VideoQualityLevel.from(rtt: 20, packetLoss: 0.07), .poor)
    }

    func test_critical_rttDominated() {
        XCTAssertEqual(VideoQualityLevel.from(rtt: 600, packetLoss: 0), .critical)
    }

    func test_critical_lossDominated() {
        XCTAssertEqual(VideoQualityLevel.from(rtt: 20, packetLoss: 0.15), .critical)
    }

    func test_worstAxisWins_rttExcellentButLossCritical() {
        XCTAssertEqual(VideoQualityLevel.from(rtt: 30, packetLoss: 0.20), .critical)
    }

    func test_worstAxisWins_lossGoodButRttCritical() {
        XCTAssertEqual(VideoQualityLevel.from(rtt: 600, packetLoss: 0.001), .critical)
    }
}

// MARK: - VideoQualityLevel Comparable ordering

@MainActor
final class VideoQualityLevelComparableTests: XCTestCase {

    func test_excellent_isGreaterThan_good() {
        XCTAssertGreaterThan(VideoQualityLevel.excellent, VideoQualityLevel.good)
    }

    func test_good_isGreaterThan_fair() {
        XCTAssertGreaterThan(VideoQualityLevel.good, VideoQualityLevel.fair)
    }

    func test_fair_isGreaterThan_poor() {
        XCTAssertGreaterThan(VideoQualityLevel.fair, VideoQualityLevel.poor)
    }

    func test_poor_isGreaterThan_critical() {
        XCTAssertGreaterThan(VideoQualityLevel.poor, VideoQualityLevel.critical)
    }

    func test_min_takesWorseLevel() {
        XCTAssertEqual(min(VideoQualityLevel.excellent, VideoQualityLevel.fair), .fair)
        XCTAssertEqual(min(VideoQualityLevel.poor, VideoQualityLevel.good), .poor)
    }

    func test_min_equalLevels_returnsSame() {
        XCTAssertEqual(min(VideoQualityLevel.good, VideoQualityLevel.good), .good)
    }

    func test_sorted_descendingOrder() {
        let levels: [VideoQualityLevel] = [.critical, .excellent, .fair, .poor, .good]
        let sorted = levels.sorted(by: >)
        XCTAssertEqual(sorted, [.excellent, .good, .fair, .poor, .critical])
    }
}
