import Foundation

/// One quality reading of a call's link, as the device measured it (#8698).
public struct CallNetworkSample: Codable, Sendable, Equatable {
    public let packetLossPercent: Double
    public let roundTripTimeMs: Double
    public let jitterMs: Double
    public let audioKbps: Double
    public let videoKbps: Double

    public init(packetLossPercent: Double, roundTripTimeMs: Double, jitterMs: Double, audioKbps: Double, videoKbps: Double) {
        self.packetLossPercent = packetLossPercent
        self.roundTripTimeMs = roundTripTimeMs
        self.jitterMs = jitterMs
        self.audioKbps = audioKbps
        self.videoKbps = videoKbps
    }
}

/// What happened on the link. Opaque labels (`state`, `level`, `name`,
/// `reason`) are written by the app, which owns their vocabulary.
public enum CallNetworkEventKind: Codable, Sendable, Equatable {
    case link(state: String)
    case reconnecting(attempt: Int)
    case reconnected
    case route(relayed: Bool)
    case sample(CallNetworkSample)
    case tier(level: String)
    case profile(name: String)
    case mediaFault(reason: String)
    case ended(reason: String)

    var isSample: Bool {
        if case .sample = self { return true }
        return false
    }
}

public struct CallNetworkEvent: Codable, Sendable, Equatable {
    public let at: Date
    public let kind: CallNetworkEventKind

    public init(at: Date, kind: CallNetworkEventKind) {
        self.at = at
        self.kind = kind
    }
}

/// A call's network and quality journal, kept on THIS device only (#8698).
/// Bounded: past `eventCeiling`, the oldest samples go first, so the
/// milestones (reconnections, route changes, faults) outlive the readings.
public struct CallNetworkJournal: Codable, Sendable, Equatable, CacheIdentifiable {
    public static let eventCeiling = 240

    public let callId: String
    public let startedAt: Date
    public let events: [CallNetworkEvent]
    public var id: String { callId }

    public init(callId: String, startedAt: Date, events: [CallNetworkEvent]) {
        self.callId = callId
        self.startedAt = startedAt
        self.events = events
    }

    public func appending(_ event: CallNetworkEvent) -> CallNetworkJournal {
        CallNetworkJournal(callId: callId, startedAt: startedAt, events: Self.bounded(events + [event]))
    }

    public func merging(_ newer: CallNetworkJournal) -> CallNetworkJournal {
        let interleaved = (events + newer.events).enumerated()
            .sorted { lhs, rhs in
                lhs.element.at == rhs.element.at ? lhs.offset < rhs.offset : lhs.element.at < rhs.element.at
            }
            .map(\.element)
        return CallNetworkJournal(
            callId: callId,
            startedAt: min(startedAt, newer.startedAt),
            events: Self.bounded(interleaved)
        )
    }

    public var summary: CallNetworkSummary {
        CallNetworkSummary(events: events)
    }

    static func bounded(_ events: [CallNetworkEvent]) -> [CallNetworkEvent] {
        guard events.count > eventCeiling else { return events }
        let overflow = events.count - eventCeiling
        let droppedSamples = Set(events.indices.filter { events[$0].kind.isSample }.prefix(overflow))
        let kept = events.enumerated()
            .filter { !droppedSamples.contains($0.offset) }
            .map(\.element)
        return Array(kept.suffix(eventCeiling))
    }
}

/// What the detail sheet says about a call's link in one glance.
public struct CallNetworkSummary: Sendable, Equatable {
    public let sampleCount: Int
    public let meanPacketLossPercent: Double
    public let peakPacketLossPercent: Double
    public let meanRoundTripTimeMs: Double
    public let peakRoundTripTimeMs: Double
    public let meanJitterMs: Double
    public let reconnectionCount: Int
    /// Last route observed — `nil` when no route was ever read.
    public let relayed: Bool?
    public let faultCount: Int
    /// Data profiles the call went through, first appearance order.
    public let profiles: [String]

    init(events: [CallNetworkEvent]) {
        let samples = events.compactMap { event -> CallNetworkSample? in
            guard case let .sample(sample) = event.kind else { return nil }
            return sample
        }
        let mean = { (value: (CallNetworkSample) -> Double) -> Double in
            samples.isEmpty ? 0 : samples.map(value).reduce(0, +) / Double(samples.count)
        }
        let profileNames = events.compactMap { event -> String? in
            guard case let .profile(name) = event.kind else { return nil }
            return name
        }
        sampleCount = samples.count
        meanPacketLossPercent = mean(\.packetLossPercent)
        peakPacketLossPercent = samples.map(\.packetLossPercent).max() ?? 0
        meanRoundTripTimeMs = mean(\.roundTripTimeMs)
        peakRoundTripTimeMs = samples.map(\.roundTripTimeMs).max() ?? 0
        meanJitterMs = mean(\.jitterMs)
        reconnectionCount = events.filter { $0.kind == .reconnected }.count
        relayed = events.compactMap { event -> Bool? in
            guard case let .route(relayed) = event.kind else { return nil }
            return relayed
        }.last
        faultCount = events.filter {
            if case .mediaFault = $0.kind { return true }
            return false
        }.count
        profiles = profileNames.reduce(into: [String]()) { ordered, name in
            if !ordered.contains(name) { ordered.append(name) }
        }
    }
}
