import Foundation
import Combine

// MARK: - Call Quality Sample

struct CallQualitySample: Equatable, Sendable {
    let at: Date
    let roundTripTimeMs: Double
    let packetLossPercent: Double
    let jitterMs: Double
    let inboundAudioBytes: Int
    let inboundVideoBytes: Int
    let relayed: Bool?
    let profile: CallDataProfile?

    init(
        at: Date,
        roundTripTimeMs: Double,
        packetLossPercent: Double,
        jitterMs: Double,
        inboundAudioBytes: Int,
        inboundVideoBytes: Int,
        relayed: Bool? = nil,
        profile: CallDataProfile? = nil
    ) {
        self.at = at
        self.roundTripTimeMs = roundTripTimeMs
        self.packetLossPercent = packetLossPercent
        self.jitterMs = jitterMs
        self.inboundAudioBytes = inboundAudioBytes
        self.inboundVideoBytes = inboundVideoBytes
        self.relayed = relayed
        self.profile = profile
    }
}

extension CallQualitySample {
    init(stats: CallStats, packetLossPercent: Double, at: Date, profile: CallDataProfile? = nil) {
        self.init(
            at: at,
            roundTripTimeMs: stats.roundTripTimeMs,
            packetLossPercent: packetLossPercent,
            jitterMs: stats.jitterMs,
            inboundAudioBytes: stats.inboundAudioBytes,
            inboundVideoBytes: stats.inboundVideoBytes,
            relayed: stats.relayed,
            profile: profile
        )
    }
}

// MARK: - Call Quality Reading

struct CallQualityReading: Equatable, Sendable {
    let packetLossPercent: Double
    let roundTripTimeMs: Double
    let jitterMs: Double
    let audioKbps: Double
    let videoKbps: Double
    let relayed: Bool?
    let profile: CallDataProfile?

    init(
        packetLossPercent: Double,
        roundTripTimeMs: Double,
        jitterMs: Double,
        audioKbps: Double,
        videoKbps: Double,
        relayed: Bool? = nil,
        profile: CallDataProfile? = nil
    ) {
        self.packetLossPercent = packetLossPercent
        self.roundTripTimeMs = roundTripTimeMs
        self.jitterMs = jitterMs
        self.audioKbps = audioKbps
        self.videoKbps = videoKbps
        self.relayed = relayed
        self.profile = profile
    }

    static func derive(current: CallQualitySample, previous: CallQualitySample?) -> CallQualityReading {
        let elapsedMs = previous.map { current.at.timeIntervalSince($0.at) * 1000 } ?? 0
        let rate = { (now: Int, before: Int?) -> Double in
            guard elapsedMs > 0, let before else { return 0 }
            return Double(max(0, now - before)) * 8 / elapsedMs
        }
        return CallQualityReading(
            packetLossPercent: current.packetLossPercent,
            roundTripTimeMs: current.roundTripTimeMs,
            jitterMs: current.jitterMs,
            audioKbps: rate(current.inboundAudioBytes, previous?.inboundAudioBytes),
            videoKbps: rate(current.inboundVideoBytes, previous?.inboundVideoBytes),
            relayed: current.relayed,
            profile: current.profile
        )
    }
}

// MARK: - Call Quality Stats Feed

protocol CallQualityStatsProviding: AnyObject {
    var readings: AnyPublisher<CallQualityReading?, Never> { get }
}

final class CallQualityStatsFeed: CallQualityStatsProviding {
    static let shared = CallQualityStatsFeed()

    private let latest = CurrentValueSubject<CallQualityReading?, Never>(nil)
    private var previousSample: CallQualitySample?

    nonisolated deinit {}

    var readings: AnyPublisher<CallQualityReading?, Never> {
        latest.eraseToAnyPublisher()
    }

    var currentReading: CallQualityReading? {
        latest.value
    }

    func record(_ sample: CallQualitySample) {
        let reading = CallQualityReading.derive(current: sample, previous: previousSample)
        previousSample = sample
        latest.send(reading)
    }

    func reset() {
        previousSample = nil
        latest.send(nil)
    }
}
