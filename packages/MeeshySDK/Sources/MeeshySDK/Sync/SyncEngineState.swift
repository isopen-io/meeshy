import Foundation

struct SyncOwnership<Waiter: Sendable>: Sendable {
    private(set) var owner: String?
    private var waiters: [Waiter] = []

    mutating func claim(_ candidate: String) -> (claimed: Bool, released: [Waiter]) {
        guard owner != candidate else { return (false, []) }
        owner = candidate
        return (true, takeWaiters())
    }

    mutating func release(_ candidate: String) -> [Waiter] {
        guard owner == candidate else { return [] }
        owner = nil
        return takeWaiters()
    }

    mutating func admit(_ candidate: String, _ waiter: Waiter) -> Bool {
        guard owner == candidate else { return true }
        waiters.append(waiter)
        return false
    }

    private mutating func takeWaiters() -> [Waiter] {
        defer { waiters = [] }
        return waiters
    }
}

typealias APIMessagePersistor = @Sendable @concurrent ([APIMessage]) async -> Void
typealias RealtimeMessagePersistor = @Sendable @concurrent (RealtimeMessageMutation) async -> Void

struct SyncEngineState: Sendable {
    var ownership = SyncOwnership<CheckedContinuation<Void, Never>>()
    var apiMessagePersistor: APIMessagePersistor?
    var realtimeMessagePersistor: RealtimeMessagePersistor?
    var lastDeltaSyncAt: Date = .distantPast
    var reconnectCatchUpPending = false

    mutating func takeReconnectCatchUp() -> Bool {
        defer { reconnectCatchUpPending = false }
        return reconnectCatchUpPending
    }
}
