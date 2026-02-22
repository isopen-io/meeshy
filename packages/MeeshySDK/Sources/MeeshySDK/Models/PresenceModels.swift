import Foundation

// MARK: - Presence State

public enum PresenceState: Equatable, Sendable {
    case online   // green — lastActive < 5min
    case away     // orange — lastActive > 5min but isOnline
    case offline  // no dot
}

// MARK: - User Presence

public struct UserPresence: Sendable {
    public let isOnline: Bool
    public let lastActiveAt: Date?

    public init(isOnline: Bool, lastActiveAt: Date? = nil) {
        self.isOnline = isOnline
        self.lastActiveAt = lastActiveAt
    }

    public var state: PresenceState {
        guard isOnline else { return .offline }
        guard let last = lastActiveAt else { return .online }
        return Date().timeIntervalSince(last) > 300 ? .away : .online
    }
}
