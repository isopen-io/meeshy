import Foundation

// MARK: - Presence State

public enum PresenceState: Equatable, Sendable {
    case online   // vert + pulse — connecté (isOnline backend) ou actif <= 60s
    case recent   // vert — actif <= 5min
    case away     // orange — actif <= 30min
    case offline  // gris — > 30min (ou pas de donnée & deconnecté)
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

    /// Regle produit (source de verite partagee : `packages/shared/utils/user-presence.ts`,
    /// miroir Android `Presence.kt`) :
    ///   isOnline == true -> online (vert, pulse) — le flag backend est autoritatif
    ///                       (maintenu par le gateway pour toute session active),
    ///                       garde anti-stale : ignore si lastActiveAt > 30min
    ///   <= 60s   -> online  (vert, pulse)
    ///   <= 5min  -> recent  (vert)
    ///   <= 30min -> away    (orange)
    ///   > 30min  -> offline (gris)
    /// lastActiveAt est gele par le gateway a la deconnexion, donc la
    /// decroissance vert -> orange -> gris demarre au dernier instant
    /// d'activite reelle.
    public func state(now: Date) -> PresenceState {
        let elapsed = lastActiveAt.map { now.timeIntervalSince($0) }
        if isOnline, elapsed.map({ $0 <= 1800 }) ?? true { return .online }
        guard let elapsed else { return .offline }
        if elapsed <= 60 { return .online }
        if elapsed <= 300 { return .recent }
        if elapsed <= 1800 { return .away }
        return .offline
    }
}
