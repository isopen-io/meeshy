import Foundation

// MARK: - Presence State

public enum PresenceState: Equatable, Sendable {
    case online   // orange + pulse — actif dans les 60 dernieres secondes
    case recent   // orange — actif <= 5min
    case away     // gris — actif <= 30min
    case offline  // aucun dot — > 30min (ou pas de lastActiveAt & deconnecte)
}

// MARK: - User Presence

public struct UserPresence: Codable, Sendable {
    public let isOnline: Bool
    public let lastActiveAt: Date?

    public init(isOnline: Bool, lastActiveAt: Date? = nil) {
        self.isOnline = isOnline
        self.lastActiveAt = lastActiveAt
    }

    public var state: PresenceState { state(now: Date()) }

    /// Regle produit (identique web / Android), decroissance temporelle pure sur
    /// lastActiveAt (gele par le gateway a la deconnexion) :
    ///   <= 60s   -> online  (orange, pulse)
    ///   <= 5min  -> recent  (orange)
    ///   <= 30min -> away    (gris)
    ///   > 30min  -> offline (aucun dot)
    /// isOnline ne sert que de fallback quand lastActiveAt est absent.
    public func state(now: Date) -> PresenceState {
        guard let last = lastActiveAt else { return isOnline ? .online : .offline }
        let elapsed = now.timeIntervalSince(last)
        if elapsed <= 60 { return .online }
        if elapsed <= 300 { return .recent }
        if elapsed <= 1800 { return .away }
        return .offline
    }
}
