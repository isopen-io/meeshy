import Foundation

/// Décrit comment résumer le dernier message d'une conversation dans une ligne de liste.
/// La décision est centralisée ici pour être partagée entre la liste des conversations
/// et les résultats de recherche, et testable indépendamment de la couche UI.
public enum LastMessageSummaryKind: Sendable, Equatable {
    /// Contenu affichable normalement (texte / pièces jointes).
    case standard
    /// Message flouté — le contenu ne doit pas être exposé.
    case hidden
    /// Message vue-unique — le contenu ne doit pas être exposé.
    case viewOnce
    /// Message éphémère dont la date d'expiration est dépassée.
    case expired
    /// Message éphémère encore lisible (expiration future).
    case ephemeralActive
}

extension MeeshyConversation {
    /// Résout le type de résumé à afficher pour le dernier message de la conversation.
    /// - Parameter now: instant de référence (injectable pour les tests).
    public func lastMessageSummaryKind(now: Date = Date()) -> LastMessageSummaryKind {
        if let expiresAt = lastMessageExpiresAt, expiresAt <= now {
            return .expired
        }
        if lastMessageIsBlurred {
            return .hidden
        }
        if lastMessageIsViewOnce {
            return .viewOnce
        }
        if let expiresAt = lastMessageExpiresAt, expiresAt > now {
            return .ephemeralActive
        }
        return .standard
    }
}
