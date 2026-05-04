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

        case (.sending, .serverAck(let id, _)):
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
