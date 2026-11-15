import Foundation
import MeeshySDK

/// What the call stack reports, as the journal recorder reads it (#8698).
enum CallNetworkJournalInput: Equatable {
    case call(id: String?)
    case state(CallState)
    case link(PeerConnectionState)
    case reading(CallQualityReading)
    case tier(VideoQualityLevel)
    case mediaFault(String)
}

/// Turns the call stack's live signals into the bounded events of a call's
/// network journal (#8698). Pure: `reducing` returns the next recorder and the
/// events to persist, so the whole vocabulary is testable without a call.
///
/// A reading is kept every `sampleInterval`, or at once when loss, latency or
/// jitter change grade — a stable link costs four samples a minute, a
/// degrading one is caught the moment it degrades.
struct CallNetworkJournalRecorder: Equatable {
    static let sampleInterval: TimeInterval = 15

    let callId: String?
    let startedAt: Date?
    let hasEnded: Bool
    let isReconnecting: Bool
    let lastLink: PeerConnectionState?
    let lastRelayed: Bool?
    let lastProfile: CallDataProfile?
    let lastTier: VideoQualityLevel?
    let lastSampleAt: Date?
    let lastSampleGrades: [CallQualityGrade?]

    static let idle = CallNetworkJournalRecorder(
        callId: nil, startedAt: nil, hasEnded: false, isReconnecting: false,
        lastLink: nil, lastRelayed: nil, lastProfile: nil, lastTier: nil,
        lastSampleAt: nil, lastSampleGrades: []
    )

    func reducing(_ input: CallNetworkJournalInput, at now: Date) -> (recorder: CallNetworkJournalRecorder, events: [CallNetworkEvent]) {
        if case let .call(id) = input { return startingCall(id, at: now) }
        guard callId != nil, !hasEnded else { return (self, []) }
        switch input {
        case .call:
            return (self, [])
        case let .state(state):
            return recordingState(state, at: now)
        case let .link(link):
            guard link != .new, link != lastLink else { return (self, []) }
            return (copy(lastLink: .some(link)), [CallNetworkEvent(at: now, kind: .link(state: link.rawValue))])
        case let .reading(reading):
            return recordingReading(reading, at: now)
        case let .tier(level):
            guard level != lastTier else { return (self, []) }
            return (copy(lastTier: .some(level)), [CallNetworkEvent(at: now, kind: .tier(level: level.rawValue))])
        case let .mediaFault(reason):
            return (self, [CallNetworkEvent(at: now, kind: .mediaFault(reason: reason))])
        }
    }

    // MARK: - Steps

    private func startingCall(_ id: String?, at now: Date) -> (recorder: CallNetworkJournalRecorder, events: [CallNetworkEvent]) {
        guard let id, id != callId else { return (self, []) }
        return (CallNetworkJournalRecorder.idle.copy(callId: .some(id), startedAt: .some(now)), [])
    }

    private func recordingState(_ state: CallState, at now: Date) -> (recorder: CallNetworkJournalRecorder, events: [CallNetworkEvent]) {
        switch state {
        case let .reconnecting(attempt):
            return (copy(isReconnecting: true), [CallNetworkEvent(at: now, kind: .reconnecting(attempt: attempt))])
        case .connected where isReconnecting:
            return (copy(isReconnecting: false), [CallNetworkEvent(at: now, kind: .reconnected)])
        case let .ended(reason):
            return (copy(hasEnded: true), [CallNetworkEvent(at: now, kind: .ended(reason: Self.label(of: reason)))])
        case .idle, .ringing, .offering, .connecting, .connected:
            return (self, [])
        }
    }

    private func recordingReading(_ reading: CallQualityReading, at now: Date) -> (recorder: CallNetworkJournalRecorder, events: [CallNetworkEvent]) {
        let routeEvent = reading.relayed.flatMap { relayed in
            relayed == lastRelayed ? nil : CallNetworkEvent(at: now, kind: .route(relayed: relayed))
        }
        let profileEvent = reading.profile.flatMap { profile in
            profile == lastProfile ? nil : CallNetworkEvent(at: now, kind: .profile(name: profile.rawValue))
        }
        let grades = Self.grades(of: reading)
        let isDue = lastSampleAt.map { now.timeIntervalSince($0) >= Self.sampleInterval } ?? true
        let sampleEvent = (isDue || grades != lastSampleGrades)
            ? CallNetworkEvent(at: now, kind: .sample(Self.sample(of: reading)))
            : nil
        let next = copy(
            lastRelayed: .some(reading.relayed ?? lastRelayed),
            lastProfile: .some(reading.profile ?? lastProfile),
            lastSampleAt: .some(sampleEvent == nil ? lastSampleAt : now),
            lastSampleGrades: sampleEvent == nil ? lastSampleGrades : grades
        )
        return (next, [routeEvent, profileEvent, sampleEvent].compactMap { $0 })
    }

    // MARK: - Vocabulary

    static func label(of reason: CallEndReason) -> String {
        switch reason {
        case .local: return "local"
        case .remote: return "remote"
        case .rejected: return "rejected"
        case .missed: return "missed"
        case .failed: return "failed"
        case .connectionLost: return "connectionLost"
        }
    }

    private static func grades(of reading: CallQualityReading) -> [CallQualityGrade?] {
        [
            CallQualityRows.grade(for: .packetLoss, value: reading.packetLossPercent),
            CallQualityRows.grade(for: .latency, value: reading.roundTripTimeMs),
            CallQualityRows.grade(for: .jitter, value: reading.jitterMs)
        ]
    }

    private static func sample(of reading: CallQualityReading) -> CallNetworkSample {
        CallNetworkSample(
            packetLossPercent: reading.packetLossPercent,
            roundTripTimeMs: reading.roundTripTimeMs,
            jitterMs: reading.jitterMs,
            audioKbps: reading.audioKbps,
            videoKbps: reading.videoKbps
        )
    }

    // MARK: - Copy

    private func copy(
        callId: String?? = nil,
        startedAt: Date?? = nil,
        hasEnded: Bool? = nil,
        isReconnecting: Bool? = nil,
        lastLink: PeerConnectionState?? = nil,
        lastRelayed: Bool?? = nil,
        lastProfile: CallDataProfile?? = nil,
        lastTier: VideoQualityLevel?? = nil,
        lastSampleAt: Date?? = nil,
        lastSampleGrades: [CallQualityGrade?]? = nil
    ) -> CallNetworkJournalRecorder {
        CallNetworkJournalRecorder(
            callId: callId ?? self.callId,
            startedAt: startedAt ?? self.startedAt,
            hasEnded: hasEnded ?? self.hasEnded,
            isReconnecting: isReconnecting ?? self.isReconnecting,
            lastLink: lastLink ?? self.lastLink,
            lastRelayed: lastRelayed ?? self.lastRelayed,
            lastProfile: lastProfile ?? self.lastProfile,
            lastTier: lastTier ?? self.lastTier,
            lastSampleAt: lastSampleAt ?? self.lastSampleAt,
            lastSampleGrades: lastSampleGrades ?? self.lastSampleGrades
        )
    }
}
