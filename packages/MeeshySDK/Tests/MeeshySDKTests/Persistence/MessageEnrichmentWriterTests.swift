import XCTest
import GRDB
@testable import MeeshySDK

/// #18934 — un enrichissement reçu (transcription, pistes traduites, traductions
/// du texte) atteint la base du compte au MÊME site, conversation ouverte ou
/// fermée ; un message protégé n'en garde rien en clair.
final class MessageEnrichmentWriterTests: XCTestCase {

    private static let conversationId = "conv_enrich"
    private static let messageId = "msg_vocal"

    private func makeActor() throws -> MessagePersistenceActor {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return MessagePersistenceActor(dbWriter: db)
    }

    private func insertVocal(into actor: MessagePersistenceActor, protect: (inout MessageRecord) -> Void = { _ in }) async throws {
        var record = MessageRecordFactory.make(localId: Self.messageId, conversationId: Self.conversationId, content: "")
        record.attachmentsJson = try JSONEncoder().encode([
            MeeshyMessageAttachment(id: "att_vocal", fileName: "v.m4a", originalName: "v.m4a", mimeType: "audio/mp4",
                                    fileSize: 4_096, fileUrl: "https://cdn/v.m4a", uploadedBy: "user-x")
        ])
        protect(&record)
        try await actor.insertOptimistic(record)
    }

    private static let enrichment = AttachmentEnrichment(
        messageId: messageId,
        attachmentId: "att_vocal",
        transcription: APIAttachmentTranscription(
            text: "On se retrouve à la gare", transcribedText: nil, language: "fr",
            confidence: 0.9, durationMs: 3_000, segments: nil, speakerCount: 1
        ),
        translations: [
            "en": APIAttachmentTranslation(
                type: "audio", transcription: "Meet you at the station", url: "https://cdn/v_en.m4a",
                durationMs: 3_100, format: "mp3", cloned: false, quality: 0.9,
                voiceModelId: nil, ttsModel: "chatterbox", segments: nil
            )
        ]
    )

    private static let translation = TranslationData(
        id: "tr-en", messageId: messageId, sourceLanguage: "fr", targetLanguage: "en",
        translatedContent: "Meet you at the station", translationModel: "nllb"
    )

    private func storedAttachment(in actor: MessagePersistenceActor) throws -> MeeshyMessageAttachment? {
        let rows = try actor.messages(for: Self.conversationId, limit: 10)
        let json = try XCTUnwrap(rows.first?.attachmentsJson)
        return try JSONDecoder().decode([MeeshyMessageAttachment].self, from: json).first
    }

    func test_apply_ordinaryMessage_writesTranscriptionAndTrackIntoTheCanonicalRow() async throws {
        let actor = try makeActor()
        try await insertVocal(into: actor)

        try await MessageEnrichmentWriter.apply(Self.enrichment, into: actor)

        let attachment = try storedAttachment(in: actor)
        XCTAssertEqual(attachment?.transcription?.text, "On se retrouve à la gare")
        XCTAssertEqual(attachment?.audioTranslations?["en"]?.url, "https://cdn/v_en.m4a")
    }

    func test_save_ordinaryMessage_writesTheTranslation() async throws {
        let actor = try makeActor()
        try await insertVocal(into: actor)

        try await MessageEnrichmentWriter.save([Self.translation], into: actor)

        XCTAssertEqual(try actor.translations(for: Self.messageId).map(\.translatedContent), ["Meet you at the station"])
    }

    func test_apply_protectedMessages_keepNothingInClear() async throws {
        let protections: [(String, (inout MessageRecord) -> Void)] = [
            ("éphémère", { $0.expiresAt = Date().addingTimeInterval(3_600) }),
            ("vue unique", { $0.effectFlags = MessageEffectFlags.viewOnce.rawValue }),
            ("flouté", { $0.effectFlags = MessageEffectFlags.blurred.rawValue }),
            ("chiffré de bout en bout", { $0.isEncrypted = true; $0.encryptionMode = E2EEWire.mode }),
            ("vue unique déjà ouverte", { $0.viewOnceOpenedAt = Date() }),
        ]
        for (label, protect) in protections {
            let actor = try makeActor()
            try await insertVocal(into: actor, protect: protect)

            try await MessageEnrichmentWriter.apply(Self.enrichment, into: actor)
            try await MessageEnrichmentWriter.save([Self.translation], into: actor)

            let attachment = try storedAttachment(in: actor)
            XCTAssertNil(attachment?.transcription, "\(label) : aucune transcription en clair sur le disque")
            XCTAssertNil(attachment?.audioTranslations, "\(label) : aucune piste traduite sur le disque")
            XCTAssertTrue(try actor.translations(for: Self.messageId).isEmpty, "\(label) : aucune traduction sur le disque")
        }
    }

    func test_apply_viewOncePiece_keepsNothingInClear() async throws {
        let actor = try makeActor()
        try await insertVocal(into: actor) { record in
            var piece = MeeshyMessageAttachment(id: "att_vocal", fileName: "v.m4a", originalName: "v.m4a",
                                                mimeType: "audio/mp4", fileSize: 4_096, fileUrl: "https://cdn/v.m4a",
                                                uploadedBy: "user-x")
            piece.isViewOnce = true
            record.attachmentsJson = try? JSONEncoder().encode([piece])
        }

        try await MessageEnrichmentWriter.apply(Self.enrichment, into: actor)

        XCTAssertNil(try storedAttachment(in: actor)?.transcription, "une pièce à vue unique protège son message")
    }
}
