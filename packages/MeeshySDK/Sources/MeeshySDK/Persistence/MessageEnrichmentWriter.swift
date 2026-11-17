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
/// Ce qui s'écrit suit `MessageEnrichmentLaw` : un enrichissement se garde
/// tant que le contenu qu'il double se garde en clair — jamais sous un message
/// chiffré de bout en bout, une vue unique ouverte, un message supprimé ou un
/// éphémère échu. Le REST suit la même loi (`APIMessageUpsert.persistTranslations`).
public enum MessageEnrichmentWriter {

    public static func apply(_ enrichment: AttachmentEnrichment, into persistence: MessagePersistenceActor) async throws {
        guard try await keepsEnrichments(of: enrichment.messageId, on: persistence) else { return }
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
            guard try await keepsEnrichments(of: translation.messageId, on: persistence) else { continue }
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

    static func keepsEnrichments(of messageId: String, on persistence: isolated MessagePersistenceActor) throws -> Bool {
        try persistence.dbWriter.read { db in
            try MessageEnrichmentLaw.row(of: messageId, in: db).map { MessageEnrichmentLaw.keepsEnrichments(of: $0) } ?? true
        }
    }
}
