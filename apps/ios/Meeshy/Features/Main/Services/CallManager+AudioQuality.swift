import Foundation
import AVFoundation

extension CallManager {
    /// Map the 5-tier client quality ladder onto the gateway's 4-tier
    /// `ConnectionQualityLevel` (critical collapses into poor).
    nonisolated static func connectionQualityLabel(for level: VideoQualityLevel) -> String {
        switch level {
        case .excellent: return "excellent"
        case .good: return "good"
        case .fair: return "fair"
        case .poor, .critical: return "poor"
        }
    }

    static func speakerFlag(afterOverrideTo output: CallAudioPortKind?, current: Bool) -> Bool {
        switch output {
        case .receiver?: return false
        case let kind? where kind.isExternalOutput: return false
        default: return current
        }
    }

    func publishQualitySample(stats: CallStats, packetLossPercent: Double) {
        CallQualityStatsFeed.shared.record(CallQualitySample(
            stats: stats,
            packetLossPercent: packetLossPercent,
            at: Date(),
            profile: webRTCService.dataProfile
        ))
    }

    func currentOutputKind() -> CallAudioPortKind? {
        AVAudioSession.sharedInstance().currentRoute.outputs.first.map { CallAudioPortKind(portType: $0.portType) }
    }

    func reconcileSpeakerWithCurrentOutput() {
        let reconciled = Self.speakerFlag(afterOverrideTo: currentOutputKind(), current: isSpeaker)
        guard reconciled != isSpeaker else { return }
        isSpeaker = reconciled
    }
}
