import Foundation

// MARK: - Presence State

public enum PresenceState: Equatable, Sendable {
    case online   // green — isOnline && lastActive < 5min
    case away     // orange — isOnline && inactive >= 5min, or disconnected < 30min
    case offline  // no dot — disconnected >= 30min (or no lastActiveAt)
}

// MARK: - User Presence

public struct UserPresence: Codable, Sendable {
    public let isOnline: Bool
    public let lastActiveAt: Date?

    public init(isOnline: Bool, lastActiveAt: Date? = nil) {
        self.isOnline = isOnline
        self.lastActiveAt = lastActiveAt
    }

    public var state: PresenceState {
        guard let last = lastActiveAt else { return isOnline ? .online : .offline }
        let elapsed = Date().timeIntervalSince(last)
        if isOnline { return elapsed < 300 ? .online : .away }
        return elapsed < 1800 ? .away : .offline
    }
}
