import Foundation
import GRDB

/// Un message qu'un signalement peut joindre (#19609) : son identifiant SERVEUR, sa conversation, son texte en clair
/// et sa date. Rien d'autre ne voyage : ni pièce jointe, ni traduction, ni auteur (c'est la personne signalée).
public struct ReportableMessageExcerpt: Sendable, Equatable {
    public let messageId: String
    public let conversationId: String
    public let text: String
    public let sentAt: Date

    public init(messageId: String, conversationId: String, text: String, sentAt: Date) {
        self.messageId = messageId
        self.conversationId = conversationId
        self.text = text
        self.sentAt = sentAt
    }
}

/// La lecture des messages qu'un signalement peut joindre, à côté de l'acteur de persistance (dont elle ne lit que
/// la base) plutôt que dans lui.
public enum ReportableMessageExcerpts {
    /// Les messages que `senderId` a écrits dans nos conversations, les plus récents d'abord, lus de la base locale.
    /// Ne sert jamais ce qu'un message protège : supprimé, éphémère, vue unique, flouté, chiffré de bout en bout, ou
    /// sans texte. Au plus `limit × 4` lignes sont relues, pour qu'une rafale de messages protégés ne vide pas la
    /// liste sans faire de la lecture une table entière.
    public static func read(in persistence: MessagePersistenceActor, fromSender senderId: String,
                            limit: Int = 30) throws -> [ReportableMessageExcerpt] {
        guard limit > 0, !senderId.isEmpty else { return [] }
        let rows = try persistence.reader.read { db in
            try MessageRecord
                .filter(Column("senderId") == senderId)
                .filter(Column("deletedAt") == nil)
                .filter(Column("serverId") != nil)
                .filter(Column("isEncrypted") == false)
                .order(Column("createdAt").desc)
                .limit(limit * 4)
                .fetchAll(db)
        }
        return Array(rows.compactMap { $0.reportableExcerpt }.prefix(limit))
    }
}

extension MessageRecord {
    /// L'extrait qu'un signalement peut joindre, ou `nil` quand la ligne protège son contenu.
    nonisolated var reportableExcerpt: ReportableMessageExcerpt? {
        guard deletedAt == nil, !isEncrypted, encryptionMode != E2EEWire.mode,
              let serverId, !serverId.isEmpty,
              messageType != "system",
              MessageEffectFlags(rawValue: effectFlags).isDisjoint(with: .lifecycleMask),
              maxViewOnceCount == nil, viewOnceOpenedAt == nil,
              expiresAt == nil, ephemeralDuration == nil else { return nil }
        let text = (content ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        return ReportableMessageExcerpt(messageId: serverId, conversationId: conversationId, text: text,
                                        sentAt: sentAt ?? createdAt)
    }
}
