import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Video Quality Level (§4.8)

// `nonisolated` — pure value ladder consumed from nonisolated policy code
// (CallReliabilityPolicy.effectiveQualityLevel needs the Comparable
// conformance outside the MainActor) and libwebrtc stats callbacks.
nonisolated enum VideoQualityLevel: String, Comparable, Sendable {
    case excellent
    case good
    case fair
    case poor
    case critical

    private var rank: Int {
        switch self {
        case .excellent: 4
        case .good: 3
        case .fair: 2
        case .poor: 1
        case .critical: 0
        }
    }

    static func < (lhs: VideoQualityLevel, rhs: VideoQualityLevel) -> Bool {
        lhs.rank < rhs.rank
    }

    var targetResolutionHeight: Int {
        switch self {
        case .excellent: 720
        case .good: 720
        case .fair: 480
        case .poor: 360
        case .critical: 0
        }
    }

    var targetFPS: Int {
        switch self {
        case .excellent: 30
        case .good: 24
        case .fair: 20
        case .poor: 15
        case .critical: 0
        }
    }

    var targetVideoBitrate: Int {
        switch self {
        case .excellent: 2_500_000
        case .good: 1_500_000
        case .fair: 800_000
        case .poor: 400_000
        case .critical: 0
        }
    }

    static func from(rtt: Double, packetLoss: Double) -> VideoQualityLevel {
        if rtt > QualityThresholds.poorRTT || packetLoss > QualityThresholds.poorPacketLoss { return .critical }
        if rtt > QualityThresholds.videoPoorRTT || packetLoss > QualityThresholds.goodPacketLoss { return .poor }
        if rtt > QualityThresholds.videoFairRTT || packetLoss > QualityThresholds.videoFairPacketLoss { return .fair }
        if rtt > QualityThresholds.excellentRTT || packetLoss > QualityThresholds.excellentPacketLoss { return .good }
        return .excellent
    }

    /// Map TWCC GCC `availableOutgoingBitrate` (bps) to a quality level. Thresholds
    /// are set conservatively below each tier's `targetVideoBitrate` to leave headroom
    /// for audio + RTCP overhead. Returns `.critical` when `bps == 0` (TWCC not yet active).
    static func from(availableOutgoingBitrateBps bps: Int) -> VideoQualityLevel {
        if bps >= QualityThresholds.bweExcellentBps { return .excellent }
        if bps >= QualityThresholds.bweGoodBps      { return .good }
        if bps >= QualityThresholds.bweFairBps       { return .fair }
        if bps >= QualityThresholds.bwePoorBps       { return .poor }
        return .critical
    }
}
