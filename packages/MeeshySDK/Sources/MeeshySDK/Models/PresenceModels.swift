import Foundation

// MARK: - Presence State

/// Les valeurs brutes sont un CONTRAT DE TRANSPORT, pas un détail d'affichage.
///
/// Elles franchissent l'App Group (`favorite_contacts`), où l'extension widget
/// — qui ne peut pas lier le SDK — les reconstruit par un miroir de mêmes
/// symboles. Un état de présence traverse donc les processus sous une forme
/// stable et non traduite : ce que la surface d'arrivée en fait (couleur du
/// dot, libellé, rien du tout) reste sa décision.
///
/// Ne JAMAIS faire voyager un libellé humain à leur place. C'est le défaut que
/// le widget Favoris a porté jusqu'au cycle 108 : l'app publiait
/// `lastSeenText` (français codé en dur), le widget testait `== "Online"`, et
/// la pastille verte était donc littéralement inatteignable.
public enum PresenceState: String, Equatable, Sendable {
    case online   // vert + pulse — connecté (isOnline backend, garde <= 5min) ou actif <= 60s
    case away     // orange — actif <= 3min
    case idle     // gris AFFICHÉ — actif <= 5min
    case offline  // > 5min (ou pas de donnée) — aucun dot rendu sur les avatars
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

    /// Regle produit 1/3/5 (source de verite partagee :
    /// `packages/shared/utils/user-presence.ts`, miroir Android `Presence.kt`) :
    ///   isOnline == true -> online (vert, pulse) — le flag backend est
    ///                       autoritatif (maintenu par le gateway pour toute
    ///                       session active), garde anti-stale : ignore si
    ///                       lastActiveAt > 5min
    ///   <= 60s  -> online  (vert, pulse)
    ///   <= 3min -> away    (orange)
    ///   <= 5min -> idle    (gris, AFFICHE)
    ///   > 5min  -> offline (aucun dot)
    /// lastActiveAt est gele par le gateway a la deconnexion, donc la
    /// decroissance vert -> orange -> gris -> rien demarre au dernier instant
    /// d'activite reelle.
    public func state(now: Date) -> PresenceState {
        let elapsed = lastActiveAt.map { now.timeIntervalSince($0) }
        if isOnline, elapsed.map({ $0 <= 300 }) ?? true { return .online }
        guard let elapsed else { return .offline }
        if elapsed <= 60 { return .online }
        if elapsed <= 180 { return .away }
        if elapsed <= 300 { return .idle }
        return .offline
    }
}
