import XCTest
import GRDB
@testable import MeeshySDK

/// #18934 — un enrichissement reçu (transcription, pistes traduites, traductions
/// du texte) atteint la base du compte au MÊME site, conversation ouverte ou
/// fermée, et s'y garde tant que le contenu qu'il double s'y garde en clair
/// (`MessageEnrichmentLaw`).
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

    /// Le contenu de ces messages est dans la même base, en clair : les priver de
    /// leurs enrichissements ne protégerait rien, et priverait le lecteur de son
    /// Prisme hors ligne — et de la traduction d'une vue unique au moment de l'ouvrir.
    func test_contentStillKeptInClear_keepsItsEnrichments() async throws {
        let stillInClear: [(String, (inout MessageRecord) -> Void)] = [
            ("éphémère vivant", { $0.expiresAt = Date().addingTimeInterval(3_600) }),
            ("vue unique pas encore ouverte", { $0.effectFlags = MessageEffectFlags.viewOnce.rawValue }),
            ("flouté", { $0.effectFlags = MessageEffectFlags.blurred.rawValue }),
            ("pièce à vue unique pas encore ouverte", { record in
                var piece = MeeshyMessageAttachment(id: "att_vocal", fileName: "v.m4a", originalName: "v.m4a",
                                                    mimeType: "audio/mp4", fileSize: 4_096, fileUrl: "https://cdn/v.m4a",
                                                    uploadedBy: "user-x")
                piece.isViewOnce = true
                record.attachmentsJson = try? JSONEncoder().encode([piece])
            }),
        ]
        for (label, flag) in stillInClear {
            let actor = try makeActor()
            try await insertVocal(into: actor, protect: flag)

            try await MessageEnrichmentWriter.apply(Self.enrichment, into: actor)
            try await MessageEnrichmentWriter.save([Self.translation], into: actor)

            let attachment = try storedAttachment(in: actor)
            XCTAssertEqual(attachment?.transcription?.text, "On se retrouve à la gare", "\(label) : la transcription se garde")
            XCTAssertEqual(attachment?.audioTranslations?["en"]?.url, "https://cdn/v_en.m4a", "\(label) : la piste se garde")
            XCTAssertEqual(try actor.translations(for: Self.messageId).count, 1, "\(label) : la traduction se garde")
        }
    }

    func test_contentNoLongerKeptInClear_keepsNothing() async throws {
        let erasures: [(String, (inout MessageRecord) -> Void)] = [
            ("chiffré de bout en bout", { $0.isEncrypted = true; $0.encryptionMode = E2EEWire.mode }),
            ("vue unique déjà ouverte", { $0.viewOnceOpenedAt = Date() }),
            ("supprimé", { $0.deletedAt = Date() }),
            ("éphémère échu", { $0.expiresAt = Date().addingTimeInterval(-60) }),
        ]
        for (label, erase) in erasures {
            let actor = try makeActor()
            try await insertVocal(into: actor, protect: erase)

            try await MessageEnrichmentWriter.apply(Self.enrichment, into: actor)
            try await MessageEnrichmentWriter.save([Self.translation], into: actor)

            let attachment = try storedAttachment(in: actor)
            XCTAssertNil(attachment?.transcription, "\(label) : aucune transcription en clair sur le disque")
            XCTAssertNil(attachment?.audioTranslations, "\(label) : aucune piste traduite sur le disque")
            XCTAssertTrue(try actor.translations(for: Self.messageId).isEmpty, "\(label) : aucune traduction sur le disque")
        }
    }

    /// Effacer le contenu efface ce qui le doublait, et les pièces avec lui : supprimé pour tous, ou
    /// éphémère échu (même écriture, `expired: true`). Seule l'enveloppe reste.
    func test_markDeleted_erasesTheTranslationsAndThePiecesEnrichments() async throws {
        for expired in [false, true] {
            let actor = try makeActor()
            try await insertVocal(into: actor)
            try await MessageEnrichmentWriter.apply(Self.enrichment, into: actor)
            try await MessageEnrichmentWriter.save([Self.translation], into: actor)

            try await actor.markDeleted(localId: Self.messageId, deletedAt: Date(), expired: expired)

            let rows = try actor.messages(for: Self.conversationId, limit: 10)
            XCTAssertNil(rows.first?.attachmentsJson, "expired=\(expired) : la pierre tombale ne garde ni la pièce, ni son nom, ni sa transcription (#19305)")
            XCTAssertTrue(try actor.translations(for: Self.messageId).isEmpty, "expired=\(expired) : les traductions aussi")
        }
    }

    // MARK: - Une traduction arrivée AVANT sa ligne

    /// `message:new` passe par le flux d'écriture, `message:translation` s'écrit
    /// tout de suite : la traduction trouve la table sans sa ligne. Gravée
    /// orpheline, elle restait en clair sous une ligne qui arrivait déjà ouverte
    /// (sur un autre appareil du lecteur) ou chiffrée de bout en bout.
    func test_save_beforeItsRow_isNotKeptUnderARowThatArrivesWithoutClearContent() async throws {
        let arrivals: [(String, (inout MessageRecord) -> Void)] = [
            ("vue unique déjà ouverte", { $0.viewOnceOpenedAt = Date() }),
            ("chiffrée de bout en bout", { $0.isEncrypted = true; $0.encryptionMode = E2EEWire.mode }),
        ]
        for (label, arrival) in arrivals {
            let actor = try makeActor()

            try await MessageEnrichmentWriter.save([Self.translation], into: actor)
            try await insertVocal(into: actor, protect: arrival)
            await actor.replayPendingRowEvents(for: [Self.messageId])

            XCTAssertTrue(try actor.translations(for: Self.messageId).isEmpty, "\(label) : aucune traduction orpheline en clair")
        }
    }

    /// Le Prisme d'un message ordinaire n'y perd rien : la traduction attend sa
    /// ligne, puis s'y écrit.
    func test_save_beforeItsRow_waitsForAnOrdinaryRowThenIsWritten() async throws {
        let actor = try makeActor()

        try await MessageEnrichmentWriter.save([Self.translation], into: actor)
        let beforeTheRow = try actor.translations(for: Self.messageId)
        try await insertVocal(into: actor)
        await actor.replayPendingRowEvents(for: [Self.messageId])

        XCTAssertTrue(beforeTheRow.isEmpty, "rien ne se grave sans sa ligne")
        XCTAssertEqual(try actor.translations(for: Self.messageId).map(\.translatedContent), ["Meet you at the station"])
    }

    /// Une modification arrivée avant sa ligne rend caduques les traductions de
    /// l'ancien texte tamponnées avec elle : rejouées à l'arrivée de la ligne,
    /// la traduction du texte v1 s'écrivait sous le texte v2 (audit #19352).
    func test_markEdited_beforeItsRow_dropsTheTranslationsOfThePreviousText() async throws {
        let actor = try makeActor()

        try await MessageEnrichmentWriter.save([Self.translation], into: actor)
        try await actor.deleteTranslations(messageLocalId: Self.messageId)
        try await actor.markEdited(localId: Self.messageId, newContent: "texte corrigé", editedAt: Date())
        try await insertVocal(into: actor)
        await actor.replayPendingRowEvents(for: [Self.messageId])

        XCTAssertTrue(try actor.translations(for: Self.messageId).isEmpty)
    }

    /// Une suppression arrivée elle aussi avant la ligne se rejoue d'abord : la
    /// traduction se juge sur la pierre tombale.
    func test_save_beforeItsRow_isNotKeptWhenTheDeletionAlsoArrivedFirst() async throws {
        let actor = try makeActor()

        try await MessageEnrichmentWriter.save([Self.translation], into: actor)
        try await actor.markDeleted(localId: Self.messageId, deletedAt: Date())
        try await insertVocal(into: actor)
        await actor.replayPendingRowEvents(for: [Self.messageId])

        XCTAssertTrue(try actor.translations(for: Self.messageId).isEmpty)
    }
}
