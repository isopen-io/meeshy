import MeeshySDK

nonisolated enum CallStateMachine {
    enum Event: Equatable, Sendable {
        case ring(CallDirection)
        case offerSent
        case answered
        case rejoined
        case mediaConnected
        case linkLost(attempt: Int)
        case ended(CallEndReason)
        case settled
    }

    static func next(from state: CallState, on event: Event) -> CallState? {
        switch event {
        case .ring(let direction):
            return ring(direction, from: state)
        case .offerSent:
            return state == .ringing(isOutgoing: true) ? .offering : nil
        case .answered:
            return isAnswerable(state) ? .connecting : nil
        case .rejoined:
            return state == .idle ? .connecting : nil
        case .mediaConnected:
            return isNegotiating(state) ? .connected : nil
        case .linkLost(let attempt):
            return linkLost(attempt: attempt, from: state)
        case .ended(let reason):
            return .ended(reason: reason)
        case .settled:
            return state.isEnded ? .idle : nil
        }
    }

    static func event(from old: CallState, to new: CallState) -> Event {
        switch new {
        case .idle: return .settled
        case .ringing(let isOutgoing): return .ring(isOutgoing ? .outgoing : .incoming)
        case .offering: return .offerSent
        case .connecting: return old == .idle ? .rejoined : .answered
        case .connected: return .mediaConnected
        case .reconnecting(let attempt): return .linkLost(attempt: attempt)
        case .ended(let reason): return .ended(reason)
        }
    }

    static func isLegal(from old: CallState, to new: CallState) -> Bool {
        if old == new { return true }
        return next(from: old, on: event(from: old, to: new)) == new
    }

    static func status(of state: CallState) -> CallStatus? {
        switch state {
        case .idle: return nil
        case .ringing, .offering: return .ringing
        case .connecting: return .connecting
        case .connected: return .active
        case .reconnecting: return .reconnecting
        case .ended(let reason): return status(ofEnd: reason)
        }
    }

    private static func status(ofEnd reason: CallEndReason) -> CallStatus {
        switch reason {
        case .rejected: return .rejected
        case .missed: return .missed
        case .failed: return .failed
        case .local, .remote, .connectionLost: return .ended
        }
    }

    private static func ring(_ direction: CallDirection, from state: CallState) -> CallState? {
        guard state == .idle else { return nil }
        switch direction {
        case .incoming: return .ringing(isOutgoing: false)
        case .outgoing: return .ringing(isOutgoing: true)
        case .missed, .unknown: return nil
        }
    }

    private static func isAnswerable(_ state: CallState) -> Bool {
        state == .ringing(isOutgoing: false) || state == .offering
    }

    private static func isNegotiating(_ state: CallState) -> Bool {
        switch state {
        case .connecting, .reconnecting: return true
        case .idle, .ringing, .offering, .connected, .ended: return false
        }
    }

    private static func linkLost(attempt: Int, from state: CallState) -> CallState? {
        guard attempt >= 1, CallReliabilityPolicy.reconnectingAllowed(from: state) else { return nil }
        return .reconnecting(attempt: attempt)
    }
}
