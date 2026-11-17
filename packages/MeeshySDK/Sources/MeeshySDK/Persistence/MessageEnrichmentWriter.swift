import Foundation
import GRDB

/// Un enrichissement de pièce jointe reçu par `message:attachment-updated` — la
/// transcription Whisper, les pistes traduites (NLLB + TTS) —, tel qu'il
/// voyage du moteur de synchro vers la base du compte (#18934).
public struct AttachmentEnrichment: Sendable, Equatable {
    public let messageId: String
    public let attachmentId: String
    public let transcription: APIAttachmentTranscription?
    public let translations: [String: APIAttachmentTranslation]?

    public init(
        messageId: String,
        attachmentId: String,
        transcription: APIAttachmentTranscription?,
        translations: [String: APIAttachmentTranslation]?
    ) {
        self.messageId = messageId
        self.attachmentId = attachmentId
        self.transcription = transcription
        self.translations = translations
    }

    public init(_ event: AttachmentUpdatedEvent) {
        self.init(
            messageId: event.messageId,
            attachmentId: event.attachment.id,
            transcription: event.attachment.transcription,
            translations: event.attachment.translations
        )
    }

    /// La même pièce, le même texte transcrit, les mêmes pistes : les charges
    /// de l'API ne sont pas `Equatable`, leur identité l'est.
    public static func == (lhs: AttachmentEnrichment, rhs: AttachmentEnrichment) -> Bool {
        lhs.messageId == rhs.messageId
            && lhs.attachmentId == rhs.attachmentId
            && lhs.transcription?.resolvedText == rhs.transcription?.resolvedText
            && lhs.translations?.mapValues(\.url) == rhs.translations?.mapValues(\.url)
    }
}

/// **Ce qu'un enrichissement reçu par le socket écrit dans la base du compte —
/// UN site, conversation OUVERTE ou FERMÉE** (#18934).
///
/// La conversation ouverte écrivait déjà transcription, pistes et traductions
/// dans la table canonique ; une conversation fermée ne les gardait qu'en
/// mémoire (pistes et transcriptions jamais relues, traductions purgées à
/// 24 h). Le vocal reçu groupe fermé s'ouvrait donc dans le métro sans sa
/// transcription ni sa piste dans la langue du lecteur.
///
/// Un message PROTÉGÉ n'en garde rien en clair — éphémère, vue unique, flouté,
/// chiffré de bout en bout, ou déjà retiré : son contenu se lit à l'écran,
/// jamais depuis un enrichissement gravé après coup sur le disque.
public enum MessageEnrichmentWriter {

    public static func apply(_ enrichment: AttachmentEnrichment, into persistence: MessagePersistenceActor) async throws {
        let protected = try await isProtected(messageId: enrichment.messageId, on: persistence)
        guard !protected else { return }
        try await persistence.applyAttachmentEnrichment(
            messageId: enrichment.messageId,
            attachmentId: enrichment.attachmentId,
            transcription: enrichment.transcription,
            translations: enrichment.translations
        )
    }

    public static func save(_ translations: [TranslationData], into persistence: MessagePersistenceActor) async throws {
        let receivedAt = Date()
        for translation in translations {
            let protected = try await isProtected(messageId: translation.messageId, on: persistence)
            guard !protected else { continue }
            try await persistence.saveTranslation(record(of: translation, receivedAt: receivedAt))
        }
    }

    static func record(of translation: TranslationData, receivedAt: Date) -> TranslationRecord {
        TranslationRecord(
            id: translation.id,
            messageLocalId: translation.messageId,
            messageServerId: translation.messageId,
            targetLanguage: translation.targetLanguage,
            translatedContent: translation.translatedContent,
            translationModel: translation.translationModel,
            confidenceScore: translation.confidenceScore,
            sourceLanguage: translation.sourceLanguage,
            receivedAt: receivedAt
        )
    }

    static func isProtected(messageId: String, on persistence: isolated MessagePersistenceActor) throws -> Bool {
        try persistence.dbWriter.read { db in
            try MessageRecord
                .filter(Column("localId") == messageId || Column("serverId") == messageId)
                .fetchOne(db)
                .map { MessageEnrichmentWriter.protects($0) } ?? false
        }
    }

    /// Les protections d'une ligne, au niveau du MESSAGE comme de ses PIÈCES.
    static func protects(_ record: MessageRecord) -> Bool {
        let lifecycle = MessageEffectFlags(rawValue: record.effectFlags).intersection(.lifecycleMask)
        guard lifecycle.isEmpty, record.expiresAt == nil, record.ephemeralDuration == nil,
              record.viewOnceOpenedAt == nil, record.deletedAt == nil,
              !EndToEndDiskPlaintextLaw.sealsContent(isEncrypted: record.isEncrypted, encryptionMode: record.encryptionMode)
        else { return true }
        let attachments = record.attachmentsJson
            .flatMap { try? JSONDecoder().decode([MeeshyMessageAttachment].self, from: $0) } ?? []
        return attachments.contains { $0.declaresViewOnce || $0.declaresBlur }
    }
}
