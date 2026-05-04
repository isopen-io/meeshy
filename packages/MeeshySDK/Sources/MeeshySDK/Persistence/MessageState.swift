import Foundation

/// Delivery state of a message — monotone progression for delivery, retry loop for failures
public enum MessageState: String, Codable, Sendable, Comparable {
    case draft
    case queued
    case sending
    case sent
    case delivered
    case read
    case failed

    private var ordinal: Int {
        switch self {
        case .draft: 0
        case .queued: 1
        case .sending: 2
        case .sent: 3
        case .delivered: 4
        case .read: 5
        case .failed: -1
        }
    }

    public static func < (lhs: Self, rhs: Self) -> Bool {
        lhs.ordinal < rhs.ordinal
    }
}

/// Events that trigger state transitions
public enum MessageEvent: Sendable {
    case enqueue
    case startSending
    case serverAck(serverId: String, at: Date)
    case delivered(count: Int, at: Date)
    case readBy(userId: String, at: Date)
    case sendFailed(Error)
    case retry
    case retryExhausted
}
