import Foundation
import GRDB

/// Ce qu'une étoile posée d'un AUTRE appareil (#7939) retrouve du message dans
/// GRDB, sans réseau : `message:starred` ne porte aucun contenu. L'hôte en
/// compose son instantané de favori.
///
/// `contentPreview` est le texte SERVI par le Prisme (la traduction du premier
/// rang servi, ou l'original) ; vide quand le message n'a pas de texte, l'hôte
/// nommant alors le média par `attachmentKind` (`AttachmentType.rawValue`).
public struct StarredMessageSource: Sendable, Equatable {
    public let messageId: String
    public let conversationId: String
    public let senderName: String?
    public let contentPreview: String
    public let attachmentKind: String?
    public let sentAt: Date
}

extension MessagePersistenceActor {

    /// `nil` quand le message n'est pas en cache, ou qu'il n'a plus le droit
    /// d'être servi en favori : supprimé, ou à vue unique (la passerelle refuse
    /// d'étoiler une vue unique — `MESSAGE_NOT_STARRABLE`).
    public nonisolated func starredSource(messageId: String, preferredLanguages: [String]) throws -> StarredMessageSource? {
        try reader.read { db in
            let record = try MessageRecord
                .filter(Column("serverId") == messageId || Column("localId") == messageId)
                .fetchOne(db)
            guard let record else { return nil }
            let translations = try TranslationRecord
                .filter(Column("messageLocalId") == record.localId)
                .fetchAll(db)
            return Self.starredSource(record: record, translations: translations, preferredLanguages: preferredLanguages)
        }
    }

    nonisolated static func starredSource(
        record: MessageRecord, translations: [TranslationRecord], preferredLanguages: [String]
    ) -> StarredMessageSource? {
        guard record.deletedAt == nil,
              !MessageEffectFlags(rawValue: record.effectFlags).contains(.viewOnce) else { return nil }
        let original = record.content ?? ""
        let served = PrismTranslationResolver.resolve(
            originalLanguage: record.originalLanguage,
            candidates: translations.map { PrismCandidate(language: $0.targetLanguage, value: $0.translatedContent) },
            preferredLanguages: preferredLanguages
        )
        let preview = original.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "" : (served?.text ?? original)
        let attachmentKind = record.attachmentsJson
            .flatMap { try? JSONDecoder().decode([MeeshyMessageAttachment].self, from: $0) }?
            .first?.type.rawValue
        return StarredMessageSource(
            messageId: record.serverId ?? record.localId,
            conversationId: record.conversationId,
            senderName: record.senderName ?? record.senderUsername,
            contentPreview: preview,
            attachmentKind: attachmentKind,
            sentAt: record.createdAt
        )
    }
}
