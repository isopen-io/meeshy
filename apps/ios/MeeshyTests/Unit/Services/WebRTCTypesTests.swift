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

// MARK: - Audio Bitrate Tier Constants

/// `adjustBitrate` in WebRTCService drives Opus audio bitrate through three tiers:
///  max (excellent conditions) → default (good) → min (any degradation).
/// These constants are the precise boundaries; a typo here silently mis-tunes audio.
@MainActor
final class QualityThresholdsAudioBitrateTests: XCTestCase {

    func test_audioBitrate_tiers_ordered_min_default_max() {
        XCTAssertLessThan(QualityThresholds.minBitrate, QualityThresholds.defaultBitrate)
        XCTAssertLessThan(QualityThresholds.defaultBitrate, QualityThresholds.maxBitrate)
    }

    func test_audioBitrate_minBitrate_is24kbps() {
        XCTAssertEqual(QualityThresholds.minBitrate, 24_000,
                       "Floor bitrate for degraded audio (24 kbps speech codec quality floor)")
    }

    func test_audioBitrate_defaultBitrate_is64kbps() {
        XCTAssertEqual(QualityThresholds.defaultBitrate, 64_000,
                       "Mid-tier audio bitrate for good but not excellent network conditions")
    }

    func test_audioBitrate_maxBitrate_is128kbps() {
        XCTAssertEqual(QualityThresholds.maxBitrate, 128_000,
                       "Ceiling audio bitrate used on excellent network (low RTT + low loss)")
    }

    func test_excellentRTT_boundary_is100ms() {
        XCTAssertEqual(QualityThresholds.excellentRTT, 100.0,
                       "Max RTT for 'excellent' quality tier (triggers max audio bitrate)")
    }

    func test_goodRTT_boundary_is250ms() {
        XCTAssertEqual(QualityThresholds.goodRTT, 250.0,
                       "Max RTT for 'good' quality tier (triggers default audio bitrate)")
    }

    func test_excellentPacketLoss_boundary_is1percent() {
        XCTAssertEqual(QualityThresholds.excellentPacketLoss, 0.01, accuracy: 0.0001,
                       "Max Δ-loss ratio for 'excellent' tier (1% interval loss)")
    }

    func test_goodPacketLoss_boundary_is5percent() {
        XCTAssertEqual(QualityThresholds.goodPacketLoss, 0.05, accuracy: 0.0001,
                       "Max Δ-loss ratio for 'good' tier (5% interval loss)")
    }

    func test_statsIntervalSeconds_is5() {
        XCTAssertEqual(QualityThresholds.statsIntervalSeconds, 5.0,
                       "Stats collection cadence — also the minimum gap between quality-level transitions (debounce)")
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

// MARK: - VideoQualityLevel encoder targets (drive applyVideoQuality)

/// These three computed properties determine what the video encoder is told to do.
/// A regression silently misconfigures bitrate/fps/resolution without compile error.
@MainActor
final class VideoQualityLevelEncoderTargetsTests: XCTestCase {

    // MARK: targetVideoBitrate

    func test_targetVideoBitrate_excellent_is2500kbps() {
        XCTAssertEqual(VideoQualityLevel.excellent.targetVideoBitrate, 2_500_000)
    }

    func test_targetVideoBitrate_good_is1500kbps() {
        XCTAssertEqual(VideoQualityLevel.good.targetVideoBitrate, 1_500_000)
    }

    func test_targetVideoBitrate_fair_is800kbps() {
        XCTAssertEqual(VideoQualityLevel.fair.targetVideoBitrate, 800_000)
    }

    func test_targetVideoBitrate_poor_is400kbps() {
        XCTAssertEqual(VideoQualityLevel.poor.targetVideoBitrate, 400_000)
    }

    func test_targetVideoBitrate_critical_isZero_signalsVideoSuspension() {
        XCTAssertEqual(VideoQualityLevel.critical.targetVideoBitrate, 0,
                       "0 signals VideoSurvivalController to suspend the track, not kill it")
    }

    func test_targetVideoBitrate_strictlyDecreasing() {
        XCTAssertGreaterThan(VideoQualityLevel.excellent.targetVideoBitrate, VideoQualityLevel.good.targetVideoBitrate)
        XCTAssertGreaterThan(VideoQualityLevel.good.targetVideoBitrate, VideoQualityLevel.fair.targetVideoBitrate)
        XCTAssertGreaterThan(VideoQualityLevel.fair.targetVideoBitrate, VideoQualityLevel.poor.targetVideoBitrate)
        XCTAssertGreaterThan(VideoQualityLevel.poor.targetVideoBitrate, VideoQualityLevel.critical.targetVideoBitrate)
    }

    // MARK: targetFPS

    func test_targetFPS_excellent_is30() {
        XCTAssertEqual(VideoQualityLevel.excellent.targetFPS, 30)
    }

    func test_targetFPS_good_is24() {
        XCTAssertEqual(VideoQualityLevel.good.targetFPS, 24)
    }

    func test_targetFPS_fair_is20() {
        XCTAssertEqual(VideoQualityLevel.fair.targetFPS, 20)
    }

    func test_targetFPS_poor_is15() {
        XCTAssertEqual(VideoQualityLevel.poor.targetFPS, 15)
    }

    func test_targetFPS_critical_isZero_signalsSuspension() {
        XCTAssertEqual(VideoQualityLevel.critical.targetFPS, 0)
    }

    // MARK: targetResolutionHeight

    func test_targetResolutionHeight_excellent_and_good_are720p() {
        XCTAssertEqual(VideoQualityLevel.excellent.targetResolutionHeight, 720)
        XCTAssertEqual(VideoQualityLevel.good.targetResolutionHeight, 720)
    }

    func test_targetResolutionHeight_fair_is480p() {
        XCTAssertEqual(VideoQualityLevel.fair.targetResolutionHeight, 480)
    }

    func test_targetResolutionHeight_poor_is360p() {
        XCTAssertEqual(VideoQualityLevel.poor.targetResolutionHeight, 360)
    }

    func test_targetResolutionHeight_critical_isZero_signalsSuspension() {
        XCTAssertEqual(VideoQualityLevel.critical.targetResolutionHeight, 0)
    }
}
