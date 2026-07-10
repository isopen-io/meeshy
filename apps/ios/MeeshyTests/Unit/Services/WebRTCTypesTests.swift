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

// MARK: - Pending Answer Action Safety Net vs SDP Offer Timeout Ordering

/// Regression guard: the CXAnswerCallAction safety net (`holdPendingAnswerAction`
/// in CallManager) MUST fire strictly AFTER `sdpOfferTimeoutSeconds`. If it fired
/// first, CallKit would be told the call "connected" (starting the Recents
/// elapsed timer) only for the SDP-offer timeout to fail the call moments
/// later — Recents would show a call that lasted the gap between the two
/// timeouts but never actually connected.
@MainActor
final class QualityThresholdsPendingAnswerActionSafetyNetTests: XCTestCase {

    func test_pendingAnswerActionSafetyNetSeconds_isStrictlyGreaterThanSdpOfferTimeout() {
        XCTAssertGreaterThan(
            QualityThresholds.pendingAnswerActionSafetyNetSeconds,
            QualityThresholds.sdpOfferTimeoutSeconds,
            "the safety net must never force-fulfill the answer action before the SDP-offer " +
            "timeout has a chance to fail the call — otherwise CallKit shows a phantom 'connected' call"
        )
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

    func test_highJitterThresholdMs_is30ms() {
        XCTAssertEqual(QualityThresholds.highJitterThresholdMs, 30.0, accuracy: 0.001,
                       "Opus PLC degrades noticeably above ~30 ms jitter; this threshold triggers minBitrate cap")
    }

    func test_highJitterThresholdMs_isPositive() {
        XCTAssertGreaterThan(QualityThresholds.highJitterThresholdMs, 0,
                             "A zero threshold would always cap audio bitrate regardless of network conditions")
    }

    func test_highJitterThresholdMs_belowExcellentRTT() {
        // Jitter can be high even on low-latency paths (buffering variability).
        // The threshold must be small enough to detect real PLC degradation before
        // RTT/loss signals fire. 30ms < 100ms (excellentRTT) confirms orthogonality.
        XCTAssertLessThan(QualityThresholds.highJitterThresholdMs, QualityThresholds.excellentRTT,
                          "highJitterThresholdMs must be < excellentRTT to catch jitter-induced degradation on otherwise-healthy paths")
    }

    func test_videoFairRTT_is200ms() {
        XCTAssertEqual(QualityThresholds.videoFairRTT, 200.0, accuracy: 0.001,
                       "RTT boundary between good and fair video tiers (200 ms)")
    }

    func test_videoPoorRTT_is300ms() {
        XCTAssertEqual(QualityThresholds.videoPoorRTT, 300.0, accuracy: 0.001,
                       "RTT boundary between fair and poor video tiers (300 ms)")
    }

    func test_videoFairPacketLoss_is3percent() {
        XCTAssertEqual(QualityThresholds.videoFairPacketLoss, 0.03, accuracy: 0.0001,
                       "Packet-loss boundary between fair and poor video tiers (3 % interval loss)")
    }

    func test_videoQualityRTTBoundaries_areStrictlyOrdered() {
        // Guarantees the RTT ladder never inverts so VideoQualityLevel.from(rtt:) cannot
        // reach an unreachable branch or misclassify a valid RTT sample.
        XCTAssertLessThan(QualityThresholds.excellentRTT, QualityThresholds.videoFairRTT,
                          "excellentRTT must be < videoFairRTT")
        XCTAssertLessThan(QualityThresholds.videoFairRTT, QualityThresholds.videoPoorRTT,
                          "videoFairRTT must be < videoPoorRTT")
        XCTAssertLessThan(QualityThresholds.videoPoorRTT, QualityThresholds.poorRTT,
                          "videoPoorRTT must be < poorRTT (critical boundary)")
    }

    func test_videoQualityPacketLossBoundaries_areStrictlyOrdered() {
        XCTAssertLessThan(QualityThresholds.excellentPacketLoss, QualityThresholds.videoFairPacketLoss,
                          "excellentPacketLoss must be < videoFairPacketLoss")
        XCTAssertLessThan(QualityThresholds.videoFairPacketLoss, QualityThresholds.goodPacketLoss,
                          "videoFairPacketLoss must be < goodPacketLoss (poor boundary)")
        XCTAssertLessThan(QualityThresholds.goodPacketLoss, QualityThresholds.poorPacketLoss,
                          "goodPacketLoss must be < poorPacketLoss (critical boundary)")
    }

    func test_bweExcellentBps_is2Mbps() {
        XCTAssertEqual(QualityThresholds.bweExcellentBps, 2_000_000,
                       "BWE excellent threshold must be 2 Mbps (80% of 2.5 Mbps target)")
    }

    func test_bweGoodBps_is1Mbps() {
        XCTAssertEqual(QualityThresholds.bweGoodBps, 1_000_000,
                       "BWE good threshold must be 1 Mbps (67% of 1.5 Mbps target)")
    }

    func test_bweFairBps_is400kbps() {
        XCTAssertEqual(QualityThresholds.bweFairBps, 400_000,
                       "BWE fair threshold must be 400 kbps (50% of 800 kbps target)")
    }

    func test_bwePoorBps_is150kbps() {
        XCTAssertEqual(QualityThresholds.bwePoorBps, 150_000,
                       "BWE poor threshold must be 150 kbps (37.5% of 400 kbps target)")
    }

    func test_bweThresholds_areStrictlyOrdered() {
        XCTAssertGreaterThan(QualityThresholds.bweExcellentBps, QualityThresholds.bweGoodBps,
                             "BWE excellent must be > good")
        XCTAssertGreaterThan(QualityThresholds.bweGoodBps, QualityThresholds.bweFairBps,
                             "BWE good must be > fair")
        XCTAssertGreaterThan(QualityThresholds.bweFairBps, QualityThresholds.bwePoorBps,
                             "BWE fair must be > poor")
        XCTAssertGreaterThan(QualityThresholds.bwePoorBps, 0,
                             "BWE poor threshold must be > 0 (reserved for TWCC inactive path)")
    }

    func test_bweThresholds_belowTargetBitrates() {
        // BWE thresholds must stay conservatively below each tier's targetVideoBitrate
        // so audio + RTCP overhead doesn't force a tier downgrade on a healthy network.
        XCTAssertLessThan(QualityThresholds.bweExcellentBps, VideoQualityLevel.excellent.targetVideoBitrate,
                          "BWE excellent threshold must be < excellent targetVideoBitrate")
        XCTAssertLessThan(QualityThresholds.bweGoodBps, VideoQualityLevel.good.targetVideoBitrate,
                          "BWE good threshold must be < good targetVideoBitrate")
        XCTAssertLessThan(QualityThresholds.bweFairBps, VideoQualityLevel.fair.targetVideoBitrate,
                          "BWE fair threshold must be < fair targetVideoBitrate")
        XCTAssertLessThan(QualityThresholds.bwePoorBps, VideoQualityLevel.poor.targetVideoBitrate,
                          "BWE poor threshold must be < poor targetVideoBitrate")
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

// MARK: - VideoQualityLevel factory: TWCC GCC bandwidth estimate

/// Covers `VideoQualityLevel.from(availableOutgoingBitrateBps:)`.
/// The BWE classifier is independent of the RTT/loss heuristic and drives
/// encoder caps when Transport-CC GCC probing is active.
@MainActor
final class VideoQualityLevelFromBWETests: XCTestCase {

    func test_excellent_atExcellentThreshold() {
        XCTAssertEqual(
            VideoQualityLevel.from(availableOutgoingBitrateBps: QualityThresholds.bweExcellentBps),
            .excellent,
            "Exactly at bweExcellentBps must map to .excellent")
    }

    func test_excellent_aboveExcellentThreshold() {
        XCTAssertEqual(
            VideoQualityLevel.from(availableOutgoingBitrateBps: 3_000_000),
            .excellent)
    }

    func test_good_belowExcellent_atGoodThreshold() {
        XCTAssertEqual(
            VideoQualityLevel.from(availableOutgoingBitrateBps: QualityThresholds.bweGoodBps),
            .good,
            "Between good and excellent thresholds must map to .good")
    }

    func test_good_betweenExcellentAndGood() {
        let mid = (QualityThresholds.bweExcellentBps + QualityThresholds.bweGoodBps) / 2
        XCTAssertEqual(VideoQualityLevel.from(availableOutgoingBitrateBps: mid), .good)
    }

    func test_fair_atFairThreshold() {
        XCTAssertEqual(
            VideoQualityLevel.from(availableOutgoingBitrateBps: QualityThresholds.bweFairBps),
            .fair,
            "Exactly at bweFairBps must map to .fair")
    }

    func test_fair_betweenGoodAndFair() {
        let mid = (QualityThresholds.bweGoodBps + QualityThresholds.bweFairBps) / 2
        XCTAssertEqual(VideoQualityLevel.from(availableOutgoingBitrateBps: mid), .fair)
    }

    func test_poor_atPoorThreshold() {
        XCTAssertEqual(
            VideoQualityLevel.from(availableOutgoingBitrateBps: QualityThresholds.bwePoorBps),
            .poor,
            "Exactly at bwePoorBps must map to .poor")
    }

    func test_poor_betweenFairAndPoor() {
        let mid = (QualityThresholds.bweFairBps + QualityThresholds.bwePoorBps) / 2
        XCTAssertEqual(VideoQualityLevel.from(availableOutgoingBitrateBps: mid), .poor)
    }

    func test_critical_belowPoorThreshold() {
        XCTAssertEqual(
            VideoQualityLevel.from(availableOutgoingBitrateBps: QualityThresholds.bwePoorBps - 1),
            .critical,
            "One bps below bwePoorBps must map to .critical")
    }

    func test_critical_zeroOrNearZeroBitrate() {
        XCTAssertEqual(VideoQualityLevel.from(availableOutgoingBitrateBps: 0), .critical,
            "Zero bps (TWCC not yet active) must map to .critical (not nil — function always returns a level)")
        XCTAssertEqual(VideoQualityLevel.from(availableOutgoingBitrateBps: 1), .critical)
    }

    func test_thresholdBoundaries_areStrictlyMonotonic() {
        // Walking through: 1 → poor → fair → good → excellent must not skip or reverse.
        XCTAssertLessThan(
            VideoQualityLevel.from(availableOutgoingBitrateBps: 1),
            VideoQualityLevel.from(availableOutgoingBitrateBps: QualityThresholds.bwePoorBps))
        XCTAssertLessThan(
            VideoQualityLevel.from(availableOutgoingBitrateBps: QualityThresholds.bwePoorBps),
            VideoQualityLevel.from(availableOutgoingBitrateBps: QualityThresholds.bweFairBps))
        XCTAssertLessThan(
            VideoQualityLevel.from(availableOutgoingBitrateBps: QualityThresholds.bweFairBps),
            VideoQualityLevel.from(availableOutgoingBitrateBps: QualityThresholds.bweGoodBps))
        XCTAssertLessThan(
            VideoQualityLevel.from(availableOutgoingBitrateBps: QualityThresholds.bweGoodBps),
            VideoQualityLevel.from(availableOutgoingBitrateBps: QualityThresholds.bweExcellentBps))
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

// MARK: - QualityThresholds video constants

@MainActor
final class QualityThresholdsVideoTests: XCTestCase {

    func test_minVideoBitrate_is100kbps() {
        XCTAssertEqual(QualityThresholds.minVideoBitrate, 100_000,
                       "Floor bitrate passed to the encoder when targetVideoBitrate is zero (critical tier)")
    }

    func test_poorPacketLoss_boundary_is10percent() {
        XCTAssertEqual(QualityThresholds.poorPacketLoss, 0.10, accuracy: 0.0001,
                       "Packet-loss threshold separating 'poor' from 'critical' quality tier")
    }

    func test_maxReconnectAttempts_is3() {
        XCTAssertEqual(QualityThresholds.maxReconnectAttempts, 3,
                       "ICE restart limit before declaring the call unrecoverable")
    }

    func test_disconnectDebounceSeconds_is3point5() {
        XCTAssertEqual(QualityThresholds.disconnectDebounceSeconds, 3.5, accuracy: 0.001,
                       "Window for transient ICE disconnects before escalating to reconnect/end")
    }

    func test_outgoingRingTimeoutSeconds_is45() {
        XCTAssertEqual(QualityThresholds.outgoingRingTimeoutSeconds, 45.0, accuracy: 0.001,
                       "Maximum time to wait for callee to answer before auto-cancelling the call")
    }

    func test_criticalVideoFloorFPS_is15() {
        // `.critical` VideoQualityLevel returns 0 for targetFPS — applyVideoQuality
        // falls back to this constant so the encoder never receives 0 fps (which stalls it).
        // 15 fps mirrors the `.poor` tier and is the lowest FaceTime-comparable rate.
        XCTAssertEqual(QualityThresholds.criticalVideoFloorFPS, 15,
                       "Critical tier video floor must be 15 fps (matches .poor tier, avoids encoder stall)")
    }

    func test_criticalVideoFloorHeight_is360() {
        // `.critical` VideoQualityLevel returns 0 for targetResolutionHeight —
        // applyVideoQuality falls back to this constant. Together with
        // criticalVideoFloorFPS and minVideoBitrate this defines the 360p15 @ 100 kbps floor.
        XCTAssertEqual(QualityThresholds.criticalVideoFloorHeight, 360,
                       "Critical tier video floor must be 360p (360p15 @ 100kbps floor)")
    }

    func test_criticalVideoFloor_tripleConsistent() {
        // The 360p15 @ 100 kbps floor must be internally consistent:
        // height 360 + fps 15 + bitrate minVideoBitrate are the three values
        // documented in applyVideoQuality's comment. A change to one must trigger
        // review of the others.
        XCTAssertEqual(QualityThresholds.criticalVideoFloorHeight, 360)
        XCTAssertEqual(QualityThresholds.criticalVideoFloorFPS, 15)
        XCTAssertEqual(QualityThresholds.minVideoBitrate, 100_000)
    }

    func test_turnDefaultCredentialTTLSeconds_matchesGatewayDefault() {
        // Mirrors TURNCredentialService.credentialTTL's default (86400s / 24h,
        // services/gateway/src/services/TURNCredentialService.ts) — the gateway raised
        // it from 600s (CALL-FIX 2026-06-25) after the short value silently killed
        // TURN-relayed calls once credentials expired mid-call. This client-side
        // fallback (used only when a signalling path carries no explicit ttl, e.g. a
        // VoIP push) must not drift back to a value that misrepresents the real TTL.
        XCTAssertEqual(QualityThresholds.turnDefaultCredentialTTLSeconds, 86400, accuracy: 0.001)
    }

    func test_turnRefreshFires_at80PercentOfDefaultTTL() {
        // scheduleTURNCredentialRefresh applies an 80% factor: refreshDelay = ttl * 0.8.
        // With the default TTL the refresh should fire at 69120 s.
        let refreshAt = QualityThresholds.turnDefaultCredentialTTLSeconds * 0.8
        XCTAssertEqual(refreshAt, 69120.0, accuracy: 0.001,
                       "TURN credential refresh must fire at 80% of the 86400 s default TTL.")
    }
}

// MARK: - Signalling & Call-Lifecycle Timer Constants

/// Guards the five new timing constants extracted from hardcoded literals in
/// CallManager and P2PWebRTCClient. Each test pins the expected value and
/// confirms it sits within a plausible range — a large-value typo (e.g. 300
/// instead of 30) would both fail the exact-value assertion and the range guard.
@MainActor
final class QualityThresholdsSignalingTests: XCTestCase {

    func test_sdpOfferTimeoutSeconds_is30() {
        XCTAssertEqual(QualityThresholds.sdpOfferTimeoutSeconds, 30.0, accuracy: 0.001,
                       "SDP offer timeout must be 30 s — matches the gateway's offer-expiry window")
    }

    func test_sdpOfferTimeoutSeconds_inPlausibleRange() {
        XCTAssertGreaterThan(QualityThresholds.sdpOfferTimeoutSeconds, 10,
                             "Below 10 s is too aggressive on slow cellular")
        XCTAssertLessThan(QualityThresholds.sdpOfferTimeoutSeconds, 60,
                          "Above 60 s exceeds the gateway hard cap — call would appear hung to the user")
    }

    func test_callEndSettleSeconds_is1point5() {
        XCTAssertEqual(QualityThresholds.callEndSettleSeconds, 1.5, accuracy: 0.001,
                       "Call-end settle window must be 1.5 s so the UI can read final stats")
    }

    func test_callEndSettleSeconds_inPlausibleRange() {
        XCTAssertGreaterThan(QualityThresholds.callEndSettleSeconds, 0.5,
                             "Below 0.5 s is too short for final stats to be delivered via socket")
        XCTAssertLessThan(QualityThresholds.callEndSettleSeconds, 5.0,
                          "Above 5 s makes the post-call screen feel slow")
    }

    func test_voipFreshnessTimeoutSeconds_is4() {
        XCTAssertEqual(QualityThresholds.voipFreshnessTimeoutSeconds, 4.0, accuracy: 0.001,
                       "VoIP push freshness HTTP timeout must be 4 s")
    }

    func test_voipFreshnessTimeoutSeconds_inPlausibleRange() {
        XCTAssertGreaterThan(QualityThresholds.voipFreshnessTimeoutSeconds, 1.0,
                             "Below 1 s will time-out on DNS-heavy cellular handoffs")
        XCTAssertLessThan(QualityThresholds.voipFreshnessTimeoutSeconds, 10.0,
                          "Above 10 s risks blocking CallKit and triggering a watchdog kill")
    }

    func test_dataChannelPingIntervalSeconds_is15() {
        XCTAssertEqual(QualityThresholds.dataChannelPingIntervalSeconds, 15.0, accuracy: 0.001,
                       "Data-channel ping must fire every 15 s (TURN server minimum activity)")
    }

    func test_remoteQualityResetSeconds_is15() {
        XCTAssertEqual(QualityThresholds.remoteQualityResetSeconds, 15.0, accuracy: 0.001,
                       "Remote-quality-degraded badge auto-resets after 15 s")
    }

    func test_dataChannelPing_lessThanOrEqualToRemoteQualityReset() {
        // If the ping fires less frequently than the quality-reset timer, a brief
        // outage is detected but the badge may reset before the next ping confirms
        // recovery. Keeping ping ≤ reset ensures at least one heartbeat has fired.
        XCTAssertLessThanOrEqual(
            QualityThresholds.dataChannelPingIntervalSeconds,
            QualityThresholds.remoteQualityResetSeconds,
            "Ping interval must be ≤ quality-reset window so recovery is confirmed before the badge clears"
        )
    }

    func test_maxPendingIceCandidates_exceedsDocumentedGatheringRoundSize() {
        // The cap's own doc comment says a single gathering round can produce
        // "50+" candidates. A cap sitting exactly at 50 would drop legitimate
        // candidates from a busy round while the socket is down — the cap must
        // leave headroom above that documented figure.
        XCTAssertGreaterThan(QualityThresholds.maxPendingIceCandidates, 50,
                              "Cap must exceed the documented 50+ candidates a single gathering round can produce")
    }
}

// MARK: - PiP Thermal Frame-Rate Ladder

@MainActor
final class QualityThresholdsPiPTests: XCTestCase {

    func test_pipFrameRateDefault_is15() {
        XCTAssertEqual(QualityThresholds.pipFrameRateDefault, 15,
                       "PiP default FPS must be 15 — smooth enough for a small thumbnail")
    }

    func test_pipFrameRateSerious_is10() {
        XCTAssertEqual(QualityThresholds.pipFrameRateSerious, 10,
                       "Under .serious thermal pressure PiP drops to 10 FPS")
    }

    func test_pipFrameRateCritical_is8() {
        XCTAssertEqual(QualityThresholds.pipFrameRateCritical, 8,
                       "Under .critical thermal pressure PiP drops to 8 FPS (near-slideshow, saves heat)")
    }

    func test_pipFrameRateLadder_isStrictlyDecreasing() {
        XCTAssertGreaterThan(
            QualityThresholds.pipFrameRateDefault,
            QualityThresholds.pipFrameRateSerious,
            "default FPS must exceed serious FPS"
        )
        XCTAssertGreaterThan(
            QualityThresholds.pipFrameRateSerious,
            QualityThresholds.pipFrameRateCritical,
            "serious FPS must exceed critical FPS"
        )
    }

    func test_pipFrameRateCritical_isAboveZero() {
        XCTAssertGreaterThan(
            QualityThresholds.pipFrameRateCritical, 0,
            "Even under critical thermal pressure the encoder must deliver at least 1 FPS"
        )
    }
}

// MARK: - PiP layout clearance constants

/// Guards the two fixed clearances added on top of safe-area insets when
/// computing the PiP thumbnail resting position in landscape/portrait.
@MainActor
final class QualityThresholdsPiPLayoutTests: XCTestCase {

    func test_pipTopClearance_is60() {
        XCTAssertEqual(QualityThresholds.pipTopClearance, 60,
                       "Fixed clearance above safe area top — full chrome row (8 pt top padding + 44 pt chevron/badge + 8 pt breathing room): the duration badge now lives top-trailing, exactly where the PiP rests by default")
    }

    func test_pipBottomClearance_is130() {
        XCTAssertEqual(QualityThresholds.pipBottomClearance, 130,
                       "Fixed clearance above safe area bottom — call control bar room (~120 pt)")
    }

    func test_pipTopClearance_isPositive() {
        XCTAssertGreaterThan(QualityThresholds.pipTopClearance, 0,
                             "PiP must always sit below the top safe area edge")
    }

    func test_pipBottomClearance_isPositive() {
        XCTAssertGreaterThan(QualityThresholds.pipBottomClearance, 0,
                             "PiP must always sit above the bottom safe area edge")
    }

    func test_pipBottomClearance_exceedsTopClearance() {
        XCTAssertGreaterThan(QualityThresholds.pipBottomClearance,
                             QualityThresholds.pipTopClearance,
                             "Control bar clearance must exceed chevron clearance — control bar is taller")
    }
}

// MARK: - Codec hint constants (Opus fmtp + SDP x-google-bitrate)

@MainActor
final class QualityThresholdsCodecHintsTests: XCTestCase {

    // MARK: Opus fmtp

    func test_opusFmtpMaxAverageBitrate_is64kbps() {
        XCTAssertEqual(QualityThresholds.opusFmtpMaxAverageBitrate, 64_000,
                       "maxaveragebitrate must equal defaultBitrate (64 kbps)")
    }

    func test_opusFmtpMaxAverageBitrate_equalsDefaultBitrate() {
        XCTAssertEqual(QualityThresholds.opusFmtpMaxAverageBitrate,
                       QualityThresholds.defaultBitrate,
                       "Opus fmtp ceiling must stay in sync with the adaptation defaultBitrate")
    }

    func test_opusFmtpMaxPlaybackRate_is48kHz() {
        XCTAssertEqual(QualityThresholds.opusFmtpMaxPlaybackRate, 48_000,
                       "maxplaybackrate must be 48 000 Hz — native Opus / WebRTC APM sample rate")
    }

    func test_opusFmtpMaxPlaybackRate_isAboveMaxAverageBitrate() {
        // Swap guard: maxplaybackrate (Hz) and maxaveragebitrate (bps) are
        // different units, so comparing them numerically is meaningless (48 000 Hz
        // is legitimately below a 64 000 bps cap). Instead pin maxaveragebitrate to
        // its expected value — an accidental swap with maxplaybackrate (48 000) would
        // move it off 64 kbps and fail here, without degrading real audio quality.
        XCTAssertEqual(
            QualityThresholds.opusFmtpMaxAverageBitrate, 64_000,
            "maxaveragebitrate must stay 64 kbps — guards against a value swap with maxplaybackrate"
        )
    }

    // MARK: SDP x-google-bitrate hints

    func test_sdpVideoMaxBitrateKbps_is2500() {
        XCTAssertEqual(QualityThresholds.sdpVideoMaxBitrateKbps, 2_500,
                       "x-google-max-bitrate must be 2 500 kbps (aligns with maxVideoBitrate)")
    }

    func test_sdpVideoMinBitrateKbps_is100() {
        XCTAssertEqual(QualityThresholds.sdpVideoMinBitrateKbps, 100,
                       "x-google-min-bitrate must be 100 kbps (aligns with minVideoBitrate)")
    }

    func test_sdpVideoHints_maxExceedsMin() {
        XCTAssertGreaterThan(
            QualityThresholds.sdpVideoMaxBitrateKbps,
            QualityThresholds.sdpVideoMinBitrateKbps,
            "x-google-max-bitrate must exceed x-google-min-bitrate"
        )
    }

    func test_sdpVideoMaxBitrateKbps_matchesMaxVideoBitrate_inKbps() {
        // maxVideoBitrate is in bps; sdpVideoMaxBitrateKbps is in kbps.
        // The SDP hint must equal maxVideoBitrate / 1000 so GCC's starting
        // encoder ceiling matches the open-loop cap.
        XCTAssertEqual(
            QualityThresholds.sdpVideoMaxBitrateKbps,
            QualityThresholds.maxVideoBitrate / 1000,
            "sdpVideoMaxBitrateKbps must equal maxVideoBitrate / 1000"
        )
    }

    func test_sdpVideoMinBitrateKbps_matchesMinVideoBitrate_inKbps() {
        XCTAssertEqual(
            QualityThresholds.sdpVideoMinBitrateKbps,
            QualityThresholds.minVideoBitrate / 1000,
            "sdpVideoMinBitrateKbps must equal minVideoBitrate / 1000"
        )
    }

    // MARK: Quality-level debounce

    func test_qualityLevelDebounceSeconds_is5() {
        XCTAssertEqual(QualityThresholds.qualityLevelDebounceSeconds, 5.0, accuracy: 0.001,
                       "Quality-level debounce must be 5 s to prevent encoder thrashing on boundary oscillation")
    }

    func test_qualityLevelDebounceSeconds_inPlausibleRange() {
        XCTAssertGreaterThan(QualityThresholds.qualityLevelDebounceSeconds, 1.0,
                             "Below 1 s the debounce becomes ineffective against RTT oscillation")
        XCTAssertLessThan(QualityThresholds.qualityLevelDebounceSeconds, 30.0,
                          "Above 30 s quality transitions would lag too far behind actual network changes")
    }
}

// MARK: - ICE pool + Video Survival hysteresis

@MainActor
final class QualityThresholdsVideoSurvivalTests: XCTestCase {

    func test_iceCandidatePoolSize_is4() {
        XCTAssertEqual(QualityThresholds.iceCandidatePoolSize, 4,
                       "ICE pool of 4 covers host+srflx+2×relay without over-provisioning")
    }

    func test_iceCandidatePoolSize_isPositive() {
        XCTAssertGreaterThan(QualityThresholds.iceCandidatePoolSize, 0,
                             "ICE pool must be non-zero or pre-warming is disabled")
    }

    func test_videoSurvivalSuspendAfterSeconds_is6() {
        XCTAssertEqual(QualityThresholds.videoSurvivalSuspendAfterSeconds, 6.0, accuracy: 0.001,
                       "Suspend trigger must be 6 s to absorb cellular handoff spikes")
    }

    func test_videoSurvivalResumeAfterSeconds_is10() {
        XCTAssertEqual(QualityThresholds.videoSurvivalResumeAfterSeconds, 10.0, accuracy: 0.001,
                       "Resume trigger must be 10 s — longer than suspend to dampen oscillation")
    }

    func test_videoSurvivalResumeAfter_exceedsSuspendAfter() {
        // Resume requires a longer settled-good window than suspend requires a
        // settled-degraded window. This avoids camera-renegotiation churn when the
        // link oscillates around the tier boundary.
        XCTAssertGreaterThan(
            QualityThresholds.videoSurvivalResumeAfterSeconds,
            QualityThresholds.videoSurvivalSuspendAfterSeconds,
            "resumeAfter must exceed suspendAfter to prevent camera-renegotiation thrashing"
        )
    }

    func test_videoSurvivalSuspendAfter_inPlausibleRange() {
        XCTAssertGreaterThan(QualityThresholds.videoSurvivalSuspendAfterSeconds, 2.0,
                             "Below 2 s the controller reacts to transient spikes — too aggressive")
        XCTAssertLessThan(QualityThresholds.videoSurvivalSuspendAfterSeconds, 30.0,
                          "Above 30 s the user waits too long for audio-only relief on a dead link")
    }
}

// MARK: - Signalling retry constants

@MainActor
final class QualityThresholdsSignalRetryTests: XCTestCase {

    func test_signalRetryInitialDelaySeconds_isHalfSecond() {
        XCTAssertEqual(QualityThresholds.signalRetryInitialDelaySeconds, 0.5, accuracy: 0.001,
                       "Initial retry delay must be 500 ms — absorbs transient socket jitter without blocking CallKit")
    }

    func test_signalOfferMaxAttempts_is3() {
        XCTAssertEqual(QualityThresholds.signalOfferMaxAttempts, 3,
                       "Offer retry cap must be 3 attempts (500ms + 1s + 2s backoff = 3.5s window)")
    }

    func test_signalAnswerTotalAttempts_is4() {
        XCTAssertEqual(QualityThresholds.signalAnswerTotalAttempts, 4,
                       "Answer total must be 4 (1 inline + 3 background retries to match offer budget)")
    }

    func test_signalAnswerTotalAttempts_exceedsOffer() {
        // Answer gets one extra attempt (the inline attempt before CXAnswerCallAction.fulfill)
        // which does NOT count against the retry budget. So total = offer + 1 to match call budget.
        XCTAssertEqual(
            QualityThresholds.signalAnswerTotalAttempts,
            QualityThresholds.signalOfferMaxAttempts + 1,
            "signalAnswerTotalAttempts must be signalOfferMaxAttempts + 1 (inline attempt + same retry budget)"
        )
    }

    func test_signalRetryInitialDelay_inPlausibleRange() {
        XCTAssertGreaterThan(QualityThresholds.signalRetryInitialDelaySeconds, 0.1,
                             "Below 100 ms retries would spam the server on slow links")
        XCTAssertLessThan(QualityThresholds.signalRetryInitialDelaySeconds, 5.0,
                          "Above 5 s a 3-attempt window would block the call setup for > 15 s")
    }

    func test_signalOfferMaxAttempts_isAtLeast2() {
        XCTAssertGreaterThanOrEqual(QualityThresholds.signalOfferMaxAttempts, 2,
                                    "At least 2 offer attempts needed for gateway retry semantics to apply")
    }
}

// MARK: - SDP extmap ID allocation (RFC 5285 §4.2)

@MainActor
final class QualityThresholdsExtmapTests: XCTestCase {

    func test_extmapStartId_is5() {
        XCTAssertEqual(QualityThresholds.extmapStartId, 5,
                       "extmap allocation starts at 5 (IDs 1–4 reserved for libwebrtc built-ins)")
    }

    func test_extmapMaxId_is14() {
        XCTAssertEqual(QualityThresholds.extmapMaxId, 14,
                       "RFC 5285 §4.2: 1-byte extmap header IDs are limited to 1..14")
    }

    func test_extmapMaxId_exceedsStartId() {
        XCTAssertGreaterThan(
            QualityThresholds.extmapMaxId,
            QualityThresholds.extmapStartId,
            "maxId must exceed startId to have a valid search range"
        )
    }

    func test_extmapCapacity_isAtLeast4Slots() {
        // Ensure there are enough IDs between startId and maxId for typical WebRTC
        // use (Transport-CC, ABS-send-time, video orientation, dependency-desc).
        let capacity = QualityThresholds.extmapMaxId - QualityThresholds.extmapStartId + 1
        XCTAssertGreaterThanOrEqual(capacity, 4,
                                    "Must have at least 4 extmap slots available for standard WebRTC extensions")
    }
}

// MARK: - addTransportCC exhaustion guard (functional)

@MainActor
final class AddTransportCCTests: XCTestCase {

    func test_addTransportCC_isNoop_whenAlreadyPresent() {
        let sdpWithCC = "a=extmap:5 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\n"
        let result = P2PWebRTCClient.addTransportCC(sdpWithCC)
        XCTAssertEqual(result, sdpWithCC, "addTransportCC must not inject a duplicate when the URI is already present")
    }

    func test_addTransportCC_skipsInjection_whenAllIDsExhausted() {
        // Build an SDP that has all IDs from extmapStartId through extmapMaxId occupied.
        let start = QualityThresholds.extmapStartId
        let max = QualityThresholds.extmapMaxId
        let occupiedLines = (start...max).map { id in
            "a=extmap:\(id) urn:ietf:params:rtp-hdrext:dummy-\(id)"
        }.joined(separator: "\r\n")
        let sdp = "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n\(occupiedLines)\r\na=rtpmap:111 opus/48000/2\r\n"
        let result = P2PWebRTCClient.addTransportCC(sdp)
        let ccURI = "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"
        XCTAssertFalse(
            result.contains(ccURI),
            "When all 1-byte extmap IDs (\(start)–\(max)) are exhausted, addTransportCC must not inject (no 2-byte header)"
        )
    }

    func test_addTransportCC_picksFirstAvailableID() {
        // ID 5 is taken; Transport-CC must land on ID 6.
        let sdp = "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=extmap:5 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\na=rtpmap:111 opus/48000/2\r\n"
        let result = P2PWebRTCClient.addTransportCC(sdp)
        XCTAssertTrue(
            result.contains("a=extmap:6 http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"),
            "When extmapStartId (5) is taken, Transport-CC must be assigned ID 6"
        )
    }

    func test_addTransportCC_appliesToBothMLines_whenVideoIsTheLastLine() {
        // Regression for a forward-walking-index bug: a fixed `0..<lines.count`
        // range computed before any insertion desyncs once the audio insertion
        // shifts every later line by +1. With no attribute lines trailing the
        // video m-line (and no terminating \r\n to leave a buffering empty
        // element), the shifted video m-line index used to fall outside the
        // original loop bound and never received its own extmap.
        let sdp = "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\nm=video 9 UDP/TLS/RTP/SAVPF 96"
        let result = P2PWebRTCClient.addTransportCC(sdp)
        let ccURI = "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"
        let lines = result.components(separatedBy: "\r\n")

        guard let audioIdx = lines.firstIndex(where: { $0.hasPrefix("m=audio ") }),
              let videoIdx = lines.firstIndex(where: { $0.hasPrefix("m=video ") }) else {
            return XCTFail("expected both m-lines to survive munging")
        }
        let audioSection = lines[audioIdx..<videoIdx]
        let videoSection = lines[videoIdx...]
        XCTAssertTrue(audioSection.contains(where: { $0.contains(ccURI) }),
                      "audio m-section must contain its own Transport-CC extmap")
        XCTAssertTrue(videoSection.contains(where: { $0.contains(ccURI) }),
                      "video m-section must also contain a Transport-CC extmap, not just audio")
    }
}

// MARK: - IceServer TURN URL validation tests

/// Covers the `IceServer.hasTURNURL` property that guards the fault-log
/// in `P2PWebRTCClient.configure` / `updateIceServers`.
@MainActor
final class IceServerTURNValidationTests: XCTestCase {

    func test_hasTURNURL_falseForSTUNOnly() {
        let server = IceServer(urls: ["stun:stun.l.google.com:19302"], username: nil, credential: nil)
        XCTAssertFalse(server.hasTURNURL)
    }

    func test_hasTURNURL_trueForTURN() {
        let server = IceServer(urls: ["turn:turn.meeshy.me:3478"], username: "user", credential: "pass")
        XCTAssertTrue(server.hasTURNURL)
    }

    func test_hasTURNURL_trueForTURNS() {
        let server = IceServer(urls: ["turns:turn.meeshy.me:5349?transport=tcp"], username: "u", credential: "p")
        XCTAssertTrue(server.hasTURNURL)
    }

    func test_hasTURNURL_falseForEmptyURLs() {
        let server = IceServer(urls: [], username: nil, credential: nil)
        XCTAssertFalse(server.hasTURNURL)
    }

    func test_hasTURNURL_trueWhenMixedSTUNAndTURN() {
        let server = IceServer(
            urls: ["stun:stun.l.google.com:19302", "turn:turn.meeshy.me:3478"],
            username: "user",
            credential: "pass"
        )
        XCTAssertTrue(server.hasTURNURL)
    }

    func test_defaultServers_containsNoTURN() {
        let hasTURN = IceServer.defaultServers.contains(where: \.hasTURNURL)
        XCTAssertFalse(hasTURN, "defaultServers are STUN-only fallbacks — the fault-log fires when TURN is absent")
    }

    func test_defaultServers_containsCloudflareSTUN() {
        let cfStun = "stun:stun.cloudflare.com:3478"
        let has = IceServer.defaultServers.contains { $0.urls.contains(cfStun) }
        XCTAssertTrue(has, "defaultServers must include Cloudflare STUN for multi-provider resilience against Google STUN outages")
    }
}

// MARK: - CallStats.reduce() unit tests

/// Pure function coverage for `CallStats.reduce(entries:)`.
/// The reducer is the canonical path from an `RTCStatisticsReport` to the
/// structured `CallStats` consumed by `VideoSurvivalPolicy` and the in-call
/// HUD. Tests run without a live `RTCPeerConnection` — the whole point of
/// `RawEntry`.
@MainActor
final class CallStatsReducerTests: XCTestCase {

    // MARK: - Helpers

    private func candidatePair(rtt: Double = 0, bitrate: Double = 0) -> CallStats.RawEntry {
        CallStats.RawEntry(
            id: "CP01",
            type: "candidate-pair",
            kind: nil,
            codecId: nil,
            mimeType: nil,
            values: [
                "currentRoundTripTime": rtt,
                "availableOutgoingBitrate": bitrate
            ]
        )
    }

    private func inboundRTP(id: String = "I01", kind: String = "audio", packets: Double = 10,
                            lost: Double = 0, bytes: Double = 0, codecId: String? = nil,
                            jitter: Double? = nil) -> CallStats.RawEntry {
        var values: [String: Double] = [
            "packetsReceived": packets,
            "packetsLost": lost,
            "bytesReceived": bytes
        ]
        if let j = jitter { values["jitter"] = j }
        return CallStats.RawEntry(
            id: id,
            type: "inbound-rtp",
            kind: kind,
            codecId: codecId,
            mimeType: nil,
            values: values
        )
    }

    private func outboundRTP(packets: Double = 20, bytes: Double = 0) -> CallStats.RawEntry {
        CallStats.RawEntry(
            id: "O01",
            type: "outbound-rtp",
            kind: nil,
            codecId: nil,
            mimeType: nil,
            values: ["packetsSent": packets, "bytesSent": bytes]
        )
    }

    private func codec(id: String, mimeType: String) -> CallStats.RawEntry {
        CallStats.RawEntry(
            id: id,
            type: "codec",
            kind: nil,
            codecId: nil,
            mimeType: mimeType,
            values: [:]
        )
    }

    // MARK: - Empty / zero baseline

    func test_reduce_emptyEntries_returnsZeroStats() {
        let result = CallStats.reduce(entries: [])
        XCTAssertEqual(result.roundTripTimeMs, 0)
        XCTAssertEqual(result.packetsLost, 0)
        XCTAssertEqual(result.bandwidth, 0)
        XCTAssertEqual(result.bytesReceived, 0)
        XCTAssertNil(result.codec)
        XCTAssertEqual(result.inboundPacketsReceived, 0)
        XCTAssertEqual(result.inboundAudioPackets, 0)
        XCTAssertEqual(result.inboundVideoPackets, 0)
        XCTAssertEqual(result.outboundPacketsSent, 0)
        XCTAssertEqual(result.availableOutgoingBitrateBps, 0)
        XCTAssertEqual(result.jitterMs, 0, accuracy: 0.0001)
    }

    // MARK: - candidate-pair

    func test_reduce_candidatePair_rttConvertedFromSecondsToMilliseconds() {
        let stats = CallStats.reduce(entries: [candidatePair(rtt: 0.05)])
        XCTAssertEqual(stats.roundTripTimeMs, 50, accuracy: 0.001,
            "RTT in stats is seconds; reducer must multiply × 1000 → ms")
    }

    func test_reduce_candidatePair_availableOutgoingBitrateCaptured() {
        let stats = CallStats.reduce(entries: [candidatePair(bitrate: 500_000)])
        XCTAssertEqual(stats.availableOutgoingBitrateBps, 500_000)
    }

    func test_reduce_candidatePair_zeroRTT_whenKeyAbsent() {
        let entry = CallStats.RawEntry(id: "CP", type: "candidate-pair", kind: nil,
                                      codecId: nil, mimeType: nil, values: [:])
        let stats = CallStats.reduce(entries: [entry])
        XCTAssertEqual(stats.roundTripTimeMs, 0)
    }

    // MARK: - inbound-rtp per kind

    func test_reduce_inboundRTP_audioKind_incrementsAudioPackets() {
        let stats = CallStats.reduce(entries: [inboundRTP(kind: "audio", packets: 42)])
        XCTAssertEqual(stats.inboundAudioPackets, 42)
        XCTAssertEqual(stats.inboundVideoPackets, 0)
        XCTAssertEqual(stats.inboundPacketsReceived, 42)
    }

    func test_reduce_inboundRTP_videoKind_incrementsVideoPackets() {
        let stats = CallStats.reduce(entries: [inboundRTP(kind: "video", packets: 30)])
        XCTAssertEqual(stats.inboundVideoPackets, 30)
        XCTAssertEqual(stats.inboundAudioPackets, 0)
        XCTAssertEqual(stats.inboundPacketsReceived, 30)
    }

    func test_reduce_inboundRTP_nilKind_countsAsAudio() {
        let entry = CallStats.RawEntry(
            id: "I01", type: "inbound-rtp", kind: nil,
            codecId: nil, mimeType: nil,
            values: ["packetsReceived": 15]
        )
        let stats = CallStats.reduce(entries: [entry])
        XCTAssertEqual(stats.inboundAudioPackets, 15,
            "nil kind must fall through to the audio bucket (else branch in kind == 'video')")
        XCTAssertEqual(stats.inboundVideoPackets, 0)
    }

    func test_reduce_multipleInboundRTP_packetsAreSummed() {
        let entries: [CallStats.RawEntry] = [
            inboundRTP(id: "I01", kind: "audio", packets: 10),
            inboundRTP(id: "I02", kind: "audio", packets: 5),
            inboundRTP(id: "I03", kind: "video", packets: 20),
        ]
        let stats = CallStats.reduce(entries: entries)
        XCTAssertEqual(stats.inboundAudioPackets, 15)
        XCTAssertEqual(stats.inboundVideoPackets, 20)
        XCTAssertEqual(stats.inboundPacketsReceived, 35)
    }

    func test_reduce_inboundRTP_packetsLostSummed() {
        let entries: [CallStats.RawEntry] = [
            inboundRTP(id: "I01", kind: "audio", lost: 3),
            inboundRTP(id: "I02", kind: "video", lost: 7),
        ]
        let stats = CallStats.reduce(entries: entries)
        XCTAssertEqual(stats.packetsLost, 10)
    }

    func test_reduce_inboundRTP_bytesReceivedSummed() {
        let entries: [CallStats.RawEntry] = [
            inboundRTP(id: "I01", kind: "audio", bytes: 1000),
            inboundRTP(id: "I02", kind: "video", bytes: 4000),
        ]
        let stats = CallStats.reduce(entries: entries)
        XCTAssertEqual(stats.bytesReceived, 5000)
    }

    // MARK: - jitterMs

    func test_reduce_jitter_audioEntry_convertedToMs() {
        // libwebrtc reports jitter in seconds; reduce must multiply by 1000
        let stats = CallStats.reduce(entries: [inboundRTP(kind: "audio", jitter: 0.015)])
        XCTAssertEqual(stats.jitterMs, 15, accuracy: 0.001,
            "jitter 0.015 s must be converted to 15 ms")
    }

    func test_reduce_jitter_averagedAcrossMultipleAudioStreams() {
        let entries: [CallStats.RawEntry] = [
            inboundRTP(id: "I01", kind: "audio", packets: 10, jitter: 0.010),
            inboundRTP(id: "I02", kind: "audio", packets: 10, jitter: 0.030),
        ]
        let stats = CallStats.reduce(entries: entries)
        XCTAssertEqual(stats.jitterMs, 20, accuracy: 0.001,
            "(10ms + 30ms) / 2 = 20ms mean audio jitter")
    }

    func test_reduce_jitter_videoStreamExcludedFromMean() {
        // Video jitter must not affect jitterMs — only Opus PLC is sensitive to audio jitter
        let entries: [CallStats.RawEntry] = [
            inboundRTP(id: "I01", kind: "audio", packets: 10, jitter: 0.020),
            inboundRTP(id: "I02", kind: "video", packets: 30, jitter: 0.100),
        ]
        let stats = CallStats.reduce(entries: entries)
        XCTAssertEqual(stats.jitterMs, 20, accuracy: 0.001,
            "Video jitter (100 ms) must be excluded; only the audio jitter (20 ms) counts")
    }

    func test_reduce_jitter_zeroWhenNoAudioInbound() {
        let stats = CallStats.reduce(entries: [inboundRTP(kind: "video", packets: 30, jitter: 0.050)])
        XCTAssertEqual(stats.jitterMs, 0, accuracy: 0.0001,
            "jitterMs must be 0 when there are no audio inbound-rtp entries")
    }

    func test_reduce_jitter_zeroWhenKeyAbsent() {
        // Audio entry present but no 'jitter' key in values
        let stats = CallStats.reduce(entries: [inboundRTP(kind: "audio", packets: 10)])
        XCTAssertEqual(stats.jitterMs, 0, accuracy: 0.0001,
            "jitterMs must be 0 when the 'jitter' key is absent from the stats entry")
    }

    // MARK: - outbound-rtp

    func test_reduce_outboundRTP_packetsSentExtracted() {
        let stats = CallStats.reduce(entries: [outboundRTP(packets: 99)])
        XCTAssertEqual(stats.outboundPacketsSent, 99)
    }

    func test_reduce_outboundRTP_bytesSentStoredInBandwidth() {
        let stats = CallStats.reduce(entries: [outboundRTP(bytes: 8000)])
        XCTAssertEqual(stats.bandwidth, 8000,
            "bandwidth stores bytesSent from outbound-rtp entries")
    }

    // MARK: - Codec resolution

    func test_reduce_codec_resolvedFromCodecId_audioOpus() {
        let entries: [CallStats.RawEntry] = [
            inboundRTP(kind: "audio", codecId: "COT01_111"),
            codec(id: "COT01_111", mimeType: "audio/opus"),
        ]
        let stats = CallStats.reduce(entries: entries)
        XCTAssertEqual(stats.codec, "opus",
            "Codec name is the last path component after '/' in mimeType")
    }

    func test_reduce_codec_resolvedFromCodecId_videoH264() {
        let entries: [CallStats.RawEntry] = [
            inboundRTP(kind: "video", codecId: "COT02_102"),
            codec(id: "COT02_102", mimeType: "video/H264"),
        ]
        let stats = CallStats.reduce(entries: entries)
        XCTAssertEqual(stats.codec, "H264")
    }

    func test_reduce_codec_nilWhenCodecIdAbsent() {
        let stats = CallStats.reduce(entries: [inboundRTP(kind: "audio")])
        XCTAssertNil(stats.codec,
            "No codecId on inbound-rtp entry → codec must be nil, not the mimeType")
    }

    func test_reduce_codec_nilWhenCodecIdNotInTable() {
        let entries: [CallStats.RawEntry] = [
            inboundRTP(kind: "audio", codecId: "MISSING"),
            codec(id: "COT01_111", mimeType: "audio/opus"),
        ]
        let stats = CallStats.reduce(entries: entries)
        XCTAssertNil(stats.codec,
            "codecId that has no matching 'codec' entry in the same report → nil")
    }

    func test_reduce_codec_usesFirstInboundRTPCodecId() {
        // When multiple inbound-rtp entries have different codecIds, the first wins.
        let entries: [CallStats.RawEntry] = [
            inboundRTP(id: "I01", kind: "audio", codecId: "C_opus"),
            inboundRTP(id: "I02", kind: "video", codecId: "C_h264"),
            codec(id: "C_opus", mimeType: "audio/opus"),
            codec(id: "C_h264", mimeType: "video/H264"),
        ]
        let stats = CallStats.reduce(entries: entries)
        XCTAssertEqual(stats.codec, "opus",
            "primaryCodecId is set by the first inbound-rtp entry that has a non-nil codecId")
    }

    // MARK: - Combined scenario

    func test_reduce_fullReport_allFieldsCorrect() {
        let entries: [CallStats.RawEntry] = [
            candidatePair(rtt: 0.08, bitrate: 250_000),
            inboundRTP(id: "IA", kind: "audio", packets: 50, lost: 2, bytes: 10_000, codecId: "C1", jitter: 0.012),
            inboundRTP(id: "IV", kind: "video", packets: 100, lost: 5, bytes: 80_000),
            outboundRTP(packets: 120, bytes: 95_000),
            codec(id: "C1", mimeType: "audio/opus"),
        ]
        let stats = CallStats.reduce(entries: entries)
        XCTAssertEqual(stats.roundTripTimeMs, 80, accuracy: 0.001)
        XCTAssertEqual(stats.availableOutgoingBitrateBps, 250_000)
        XCTAssertEqual(stats.inboundAudioPackets, 50)
        XCTAssertEqual(stats.inboundVideoPackets, 100)
        XCTAssertEqual(stats.inboundPacketsReceived, 150)
        XCTAssertEqual(stats.packetsLost, 7)
        XCTAssertEqual(stats.bytesReceived, 90_000)
        XCTAssertEqual(stats.outboundPacketsSent, 120)
        XCTAssertEqual(stats.bandwidth, 95_000)
        XCTAssertEqual(stats.codec, "opus")
        XCTAssertEqual(stats.jitterMs, 12, accuracy: 0.001,
            "Single audio stream jitter 0.012 s → 12 ms")
    }
}

// MARK: - CallStats Codable backward-compatibility tests

/// Guards that `CallStats.Codable` handles old persisted snapshots (UserDefaults)
/// that were encoded before `jitterMs` was added. Decoding must succeed with
/// `jitterMs == 0` instead of throwing `DecodingError.keyNotFound`.
@MainActor
final class CallStatsCodableTests: XCTestCase {

    private func makeStats(jitterMs: Double = 12.5) -> CallStats {
        CallStats(
            roundTripTimeMs: 80, packetsLost: 3, bandwidth: 95_000,
            bytesReceived: 90_000, codec: "opus",
            inboundPacketsReceived: 150, inboundAudioPackets: 50,
            inboundVideoPackets: 100, outboundPacketsSent: 120,
            availableOutgoingBitrateBps: 250_000, jitterMs: jitterMs
        )
    }

    func test_encode_decode_roundTrip_preservesAllFields() throws {
        let original = makeStats(jitterMs: 18.3)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(CallStats.self, from: data)
        XCTAssertEqual(decoded.roundTripTimeMs, original.roundTripTimeMs, accuracy: 0.001)
        XCTAssertEqual(decoded.packetsLost, original.packetsLost)
        XCTAssertEqual(decoded.bandwidth, original.bandwidth)
        XCTAssertEqual(decoded.bytesReceived, original.bytesReceived)
        XCTAssertEqual(decoded.codec, original.codec)
        XCTAssertEqual(decoded.inboundPacketsReceived, original.inboundPacketsReceived)
        XCTAssertEqual(decoded.inboundAudioPackets, original.inboundAudioPackets)
        XCTAssertEqual(decoded.inboundVideoPackets, original.inboundVideoPackets)
        XCTAssertEqual(decoded.outboundPacketsSent, original.outboundPacketsSent)
        XCTAssertEqual(decoded.availableOutgoingBitrateBps, original.availableOutgoingBitrateBps)
        XCTAssertEqual(decoded.jitterMs, original.jitterMs, accuracy: 0.001)
    }

    func test_decode_legacyPayload_withoutJitterMs_succeedsWithZero() throws {
        // Simulate a UserDefaults snapshot encoded before jitterMs was added.
        // The JSON has all fields except "jitterMs" — decoding must not throw.
        let json = """
        {
          "roundTripTimeMs": 80,
          "packetsLost": 3,
          "bandwidth": 95000,
          "bytesReceived": 90000,
          "codec": "opus",
          "inboundPacketsReceived": 150,
          "inboundAudioPackets": 50,
          "inboundVideoPackets": 100,
          "outboundPacketsSent": 120,
          "availableOutgoingBitrateBps": 250000
        }
        """
        let data = Data(json.utf8)
        let stats = try JSONDecoder().decode(CallStats.self, from: data)
        XCTAssertEqual(stats.jitterMs, 0, accuracy: 0.0001,
            "Legacy snapshot without jitterMs must decode to jitterMs == 0")
        XCTAssertEqual(stats.roundTripTimeMs, 80, accuracy: 0.001)
        XCTAssertEqual(stats.codec, "opus")
    }

    func test_decode_nilCodec_decodesSuccessfully() throws {
        let json = """
        {
          "roundTripTimeMs": 0, "packetsLost": 0, "bandwidth": 0,
          "bytesReceived": 0, "inboundPacketsReceived": 0,
          "inboundAudioPackets": 0, "inboundVideoPackets": 0,
          "outboundPacketsSent": 0, "availableOutgoingBitrateBps": 0
        }
        """
        let stats = try JSONDecoder().decode(CallStats.self, from: Data(json.utf8))
        XCTAssertNil(stats.codec)
        XCTAssertEqual(stats.jitterMs, 0, accuracy: 0.0001)
    }

    func test_encode_zeroJitter_notTruncated() throws {
        // Encoding must always include jitterMs (even when 0) so future decoders
        // can rely on the field being present in new-format snapshots.
        let data = try JSONEncoder().encode(makeStats(jitterMs: 0))
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))
        XCTAssertTrue(json.contains("jitterMs"),
            "jitterMs must be encoded even when 0 so new decoders can read it")
    }
}

// MARK: - CallReliabilityPolicy Tests

final class CallReliabilityPolicyTests: XCTestCase {

    // MARK: evaluateHalfOpen

    func test_evaluateHalfOpen_sufficientInbound_returnsHealthy() {
        // requiredInboundPackets = 5; exactly at threshold → healthy
        let outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets: 5,
            outboundPackets: 10,
            secondsInConnected: 10,
            requiredInboundPackets: 5,
            graceSeconds: 4
        )
        XCTAssertEqual(outcome, .healthy)
    }

    func test_evaluateHalfOpen_aboveThreshold_returnsHealthy() {
        let outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets: 100,
            outboundPackets: 100,
            secondsInConnected: 30,
            requiredInboundPackets: 5,
            graceSeconds: 4
        )
        XCTAssertEqual(outcome, .healthy)
    }

    func test_evaluateHalfOpen_belowThreshold_withinGrace_returnsWaiting() {
        // 0 inbound, 10 outbound, but still inside grace window → waiting
        let outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets: 0,
            outboundPackets: 10,
            secondsInConnected: 2,
            requiredInboundPackets: 5,
            graceSeconds: 4
        )
        XCTAssertEqual(outcome, .waiting)
    }

    func test_evaluateHalfOpen_belowThreshold_pastGrace_withOutbound_returnsHealHalfOpen() {
        // Classic half-open: we're sending, peer isn't responding → ICE restart
        let outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets: 0,
            outboundPackets: 50,
            secondsInConnected: 5,
            requiredInboundPackets: 5,
            graceSeconds: 4
        )
        XCTAssertEqual(outcome, .healHalfOpen)
    }

    func test_evaluateHalfOpen_belowThreshold_pastGrace_noOutbound_returnsWaiting() {
        // Both sides silent (mute/mic-off) — transport is fine, keep waiting
        let outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets: 0,
            outboundPackets: 0,
            secondsInConnected: 5,
            requiredInboundPackets: 5,
            graceSeconds: 4
        )
        XCTAssertEqual(outcome, .waiting)
    }

    func test_evaluateHalfOpen_exactlyAtGraceBoundary_noOutbound_returnsWaiting() {
        // At exactly graceSeconds boundary with no outbound → still waiting (mute case)
        let outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets: 0,
            outboundPackets: 0,
            secondsInConnected: 4.0,
            requiredInboundPackets: 5,
            graceSeconds: 4
        )
        XCTAssertEqual(outcome, .waiting)
    }

    func test_evaluateHalfOpen_exactlyAtGraceBoundary_withOutbound_returnsHealHalfOpen() {
        let outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets: 0,
            outboundPackets: 1,
            secondsInConnected: 4.0,
            requiredInboundPackets: 5,
            graceSeconds: 4
        )
        XCTAssertEqual(outcome, .healHalfOpen)
    }

    // MARK: evaluateConnecting

    func test_evaluateConnecting_belowRestartThreshold_returnsWaiting() {
        let outcome = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting: 5,
            didAttemptRestart: false,
            restartAfterSeconds: 12,
            failAfterSeconds: 25
        )
        XCTAssertEqual(outcome, .waiting)
    }

    func test_evaluateConnecting_atRestartThreshold_noRestart_returnsRestartICE() {
        let outcome = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting: 12,
            didAttemptRestart: false,
            restartAfterSeconds: 12,
            failAfterSeconds: 25
        )
        XCTAssertEqual(outcome, .restartICE)
    }

    func test_evaluateConnecting_pastRestartThreshold_alreadyRestarted_returnsWaiting() {
        // Already tried ICE restart once — keep waiting until fail threshold
        let outcome = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting: 15,
            didAttemptRestart: true,
            restartAfterSeconds: 12,
            failAfterSeconds: 25
        )
        XCTAssertEqual(outcome, .waiting)
    }

    func test_evaluateConnecting_atFailThreshold_returnsFailRegardlessOfRestart() {
        let outcomeNotRestarted = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting: 25,
            didAttemptRestart: false,
            restartAfterSeconds: 12,
            failAfterSeconds: 25
        )
        XCTAssertEqual(outcomeNotRestarted, .fail)

        let outcomeAlreadyRestarted = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting: 25,
            didAttemptRestart: true,
            restartAfterSeconds: 12,
            failAfterSeconds: 25
        )
        XCTAssertEqual(outcomeAlreadyRestarted, .fail)
    }

    func test_evaluateConnecting_pastFailThreshold_returnsFail() {
        let outcome = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting: 60,
            didAttemptRestart: true,
            restartAfterSeconds: 12,
            failAfterSeconds: 25
        )
        XCTAssertEqual(outcome, .fail)
    }

    func test_evaluateConnecting_failThresholdTakesPriorityOverRestartThreshold() {
        // If both conditions hold (>= failAfterSeconds), fail wins over restartICE
        let outcome = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting: 30,
            didAttemptRestart: false,
            restartAfterSeconds: 12,
            failAfterSeconds: 25
        )
        XCTAssertEqual(outcome, .fail)
    }

    // MARK: evaluateReconnecting

    func test_evaluateReconnecting_belowBudget_returnsWaiting() {
        let outcome = CallReliabilityPolicy.evaluateReconnecting(
            secondsInAttempt: 5,
            budgetSeconds: 10
        )
        XCTAssertEqual(outcome, .waiting)
    }

    func test_evaluateReconnecting_atBudget_returnsRetry() {
        let outcome = CallReliabilityPolicy.evaluateReconnecting(
            secondsInAttempt: 10,
            budgetSeconds: 10
        )
        XCTAssertEqual(outcome, .retry)
    }

    func test_evaluateReconnecting_pastBudget_returnsRetry() {
        let outcome = CallReliabilityPolicy.evaluateReconnecting(
            secondsInAttempt: 30,
            budgetSeconds: 10
        )
        XCTAssertEqual(outcome, .retry)
    }

    func test_evaluateReconnecting_justBelowBudget_returnsWaiting() {
        let outcome = CallReliabilityPolicy.evaluateReconnecting(
            secondsInAttempt: 9.99,
            budgetSeconds: 10
        )
        XCTAssertEqual(outcome, .waiting)
    }

    // MARK: Default thresholds smoke test

    func test_evaluateHalfOpen_defaultThresholds_healthyAfterSufficientPackets() {
        let outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets: QualityThresholds.rtpGateRequiredPackets,
            outboundPackets: 10,
            secondsInConnected: 10
        )
        XCTAssertEqual(outcome, .healthy)
    }

    func test_evaluateConnecting_defaultThresholds_restartBeforeFail() {
        let restartOutcome = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting: QualityThresholds.connectingRestartSeconds,
            didAttemptRestart: false
        )
        XCTAssertEqual(restartOutcome, .restartICE)

        let failOutcome = CallReliabilityPolicy.evaluateConnecting(
            secondsInConnecting: QualityThresholds.connectingFailSeconds,
            didAttemptRestart: true
        )
        XCTAssertEqual(failOutcome, .fail)
    }

    func test_evaluateReconnecting_defaultThreshold_retryAtBudget() {
        let outcome = CallReliabilityPolicy.evaluateReconnecting(
            secondsInAttempt: QualityThresholds.reconnectAttemptBudgetSeconds
        )
        XCTAssertEqual(outcome, .retry)
    }
}
