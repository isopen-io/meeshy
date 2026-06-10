import Foundation

/// Pure state machine — no side effects, no dependencies, fully testable
public struct MessageStateMachine: Sendable {
    public private(set) var state: MessageState
    public private(set) var retryCount: Int
    public private(set) var serverId: String?
    public private(set) var lastError: String?
    public private(set) var deliveredAt: Date?
    public private(set) var readAt: Date?

    public static let maxRetries = 3

    public init(
        state: MessageState,
        retryCount: Int = 0,
        serverId: String? = nil,
        lastError: String? = nil,
        deliveredAt: Date? = nil,
        readAt: Date? = nil
    ) {
        self.state = state
        self.retryCount = retryCount
        self.serverId = serverId
        self.lastError = lastError
        self.deliveredAt = deliveredAt
        self.readAt = readAt
    }

    /// Apply an event — returns the new state, or nil if the transition is invalid
    public mutating func apply(_ event: MessageEvent) -> MessageState? {
        switch (state, event) {
        case (.draft, .enqueue), (.draft, .startSending):
            state = .queued

        case (.queued, .startSending):
            state = .sending

        case (.sending, .serverAck(let id, _)),
             (.queued, .serverAck(let id, _)),
             (.failed, .serverAck(let id, _)):
            // `.queued` accepts the ack too: a send that failed once sits in `.queued`
            // (retry budget intact) and is replayed by the OutboxFlusher. When that
            // replay succeeds, reconciliation delivers `serverAck` while the record is
            // still `.queued` — without this case the ack is rejected and the bubble
            // stays stuck on the "sending" clock for a message the server received.
            // `.failed` accepts it as well: the ack is authoritative — the server HAS
            // the message. A row can sit in `.failed` from the orphan reconciler's
            // grace-window guess (a legitimately slow in-flight send, e.g. a long
            // attachment upload) or from an exhausted outbox whose final attempt's
            // ack raced the exhaustion. Rejecting the ack would keep a delivered
            // message displayed as failed until the next REST refresh heals it via
            // the upsert's max(state) merge; accepting it heals immediately and
            // removes the misleading manual-retry affordance (a retry would be
            // deduped by clientMessageId anyway, but the UI shouldn't invite it).
            serverId = id
            state = .sent

        case (.sent, .delivered(let count, let at)) where count > 0:
            deliveredAt = at
            state = .delivered

        case (.delivered, .readBy(_, let at)):
            readAt = at
            state = .read

        case (.sent, .readBy(_, let at)):
            readAt = at
            state = .read

        case (.sending, .sendFailed(let error)):
            lastError = error.localizedDescription
            if retryCount < Self.maxRetries {
                retryCount += 1
                state = .queued
            } else {
                state = .failed
            }

        case (.failed, .retry):
            retryCount = 0
            state = .queued

        case (.queued, .retryExhausted):
            state = .failed

        default:
            return nil
        }
        return state
    }
}
