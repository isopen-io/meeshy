import Foundation

/// Pourquoi le serveur a fermé CETTE session — le `reason` de l'événement
/// `auth:session-revoked` (`AuthSessionRevokedEventData`,
/// `packages/shared/types/socketio-events/auth.ts`).
///
/// Décodage TOLÉRANT : un motif que ce binaire ne connaît pas devient
/// `.unknown` et la session se ferme quand même. L'ajout d'un motif côté
/// serveur ne casse jamais un ancien client (#9223).
public enum SessionRevocationReason: String, Sendable, Equatable, CaseIterable {
    /// L'équipe Meeshy a fermé la session — l'administrateur n'est JAMAIS nommé.
    case adminRevoke = "admin_revoke"
    /// Le membre l'a fermée depuis un autre de ses appareils.
    case userRevoke = "user_revoke"
    case passwordChanged = "password_changed"
    case logout
    case logoutAllDevices = "logout_all_devices"
    case sessionExpired = "session_expired"
    case activationRequired = "activation_required"
    case unknown

    public init(wireValue: String?) {
        self = wireValue.flatMap(Self.init(rawValue:)) ?? .unknown
    }

    /// Le motif porté par la charge Socket.IO (`[ { code, message, reason } ]`).
    public static func fromSocketPayload(_ data: [Any]) -> SessionRevocationReason {
        let reason = (data.first as? [String: Any])?["reason"] as? String
        return SessionRevocationReason(wireValue: reason)
    }
}

/// La fermeture qu'on doit EXPLIQUER à l'utilisateur avant qu'il se
/// reconnecte. Identifiable : deux fermetures successives sont deux avis.
public struct SessionRevocationNotice: Identifiable, Sendable, Equatable {
    public let id: UUID
    public let reason: SessionRevocationReason
    public let receivedAt: Date

    public init(id: UUID = UUID(), reason: SessionRevocationReason, receivedAt: Date = Date()) {
        self.id = id
        self.reason = reason
        self.receivedAt = receivedAt
    }
}
