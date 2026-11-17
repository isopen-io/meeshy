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

    /// Ce que la ligne d'un message permet d'un enrichissement : le garder, le retenir, ou, la ligne n'étant pas
    /// encore là, l'attendre.
    enum Verdict: Equatable {
        case kept
        case withheld
        case awaitingRow
    }

    /// Une pièce s'enrichit dans sa ligne : sans ligne, rien ne s'écrit, et le REST la rapportera enrichie.
    public static func apply(_ enrichment: AttachmentEnrichment, into persistence: MessagePersistenceActor) async throws {
        guard try await verdict(on: enrichment.messageId, in: persistence) == .kept else { return }
        try await persistence.applyAttachmentEnrichment(
            messageId: enrichment.messageId,
            attachmentId: enrichment.attachmentId,
            transcription: enrichment.transcription,
            translations: enrichment.translations
        )
    }

    public static func save(_ translations: [TranslationData], into persistence: MessagePersistenceActor) async throws {
        let receivedAt = Date()
        try await keep(translations.map { record(of: $0, receivedAt: receivedAt) }, on: persistence)
    }

    /// Une traduction se juge sur sa ligne. Arrivée AVANT elle — `message:new` encore dans le flux d'écriture —, elle
    /// l'attend et se juge à son arrivée (`replay`) : gravée orpheline, elle restait en clair sous une ligne qui
    /// naissait chiffrée de bout en bout, déjà ouverte ou supprimée, et qu'aucun effacement ne visait plus.
    static func keep(_ records: [TranslationRecord], on persistence: isolated MessagePersistenceActor) throws {
        for record in records {
            switch try verdict(on: record.messageLocalId, in: persistence) {
            case .kept:
                try persistence.saveTranslation(record)
            case .withheld:
                continue
            case .awaitingRow:
                persistence.rememberPendingRowEvent(record.messageLocalId) { $0.translations.append(record) }
            }
        }
    }

    /// La ligne vient d'arriver, et ce qui la visait avant elle s'y est appliqué : chaque traduction qui l'attendait
    /// se juge sur elle, une seule fois.
    static func replay(_ records: [TranslationRecord], on persistence: isolated MessagePersistenceActor) throws {
        for record in records {
            guard try verdict(on: record.messageLocalId, in: persistence) == .kept else { continue }
            try persistence.saveTranslation(record)
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

    static func verdict(on messageId: String, in persistence: isolated MessagePersistenceActor) throws -> Verdict {
        try persistence.dbWriter.read { db -> Verdict in
            guard let row = try MessageEnrichmentLaw.row(of: messageId, in: db) else { return .awaitingRow }
            return MessageEnrichmentLaw.keepsEnrichments(of: row) ? .kept : .withheld
        }
    }
}
