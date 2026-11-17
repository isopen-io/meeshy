import XCTest
import GRDB
@testable import MeeshySDK

/// #18934 — un enrichissement (traduction, transcription, piste traduite) se garde
/// sur l'appareil exactement tant que le contenu qu'il double s'y garde en clair :
/// la parité que la passerelle tient déjà en servant (#7578, #18556).
final class MessageEnrichmentLawTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func keeps(
        sealedEndToEnd: Bool = false, viewOnceOpenedAt: Date? = nil, deletedAt: Date? = nil, expiresAt: Date? = nil
    ) -> Bool {
        MessageEnrichmentLaw.keepsEnrichments(
            sealedEndToEnd: sealedEndToEnd, viewOnceOpenedAt: viewOnceOpenedAt,
            deletedAt: deletedAt, expiresAt: expiresAt, now: now
        )
    }

    // MARK: - La loi

    func test_contentKeptInClear_keepsItsEnrichments() {
        XCTAssertTrue(keeps(), "un message ordinaire")
        XCTAssertTrue(keeps(expiresAt: now.addingTimeInterval(60)), "un éphémère vivant : son texte est dans la base")
    }

    func test_contentNoLongerKeptInClear_keepsNone() {
        XCTAssertFalse(keeps(sealedEndToEnd: true), "chiffré de bout en bout : le clair ne vit que dans le coffre")
        XCTAssertFalse(keeps(viewOnceOpenedAt: now), "vue unique ouverte : son contenu est purgé")
        XCTAssertFalse(keeps(deletedAt: now), "supprimé : son texte est effacé")
        XCTAssertFalse(keeps(expiresAt: now), "échu à l'instant même")
        XCTAssertFalse(keeps(expiresAt: now.addingTimeInterval(-60)), "éphémère échu")
    }

    /// Un message chiffré par un autre mode que le bout-en-bout garde son texte en
    /// clair dans la base (`EndToEndDiskPlaintextLaw`) : ses enrichissements aussi.
    func test_record_onlyTheEndToEndModeSealsTheContent() {
        var record = MessageRecordFactory.make(localId: "m-law")
        record.isEncrypted = true
        record.encryptionMode = "server"
        XCTAssertTrue(MessageEnrichmentLaw.keepsEnrichments(of: record, now: now))

        record.encryptionMode = E2EEWire.mode
        XCTAssertFalse(MessageEnrichmentLaw.keepsEnrichments(of: record, now: now))
    }

    // MARK: - Le REST suit la même loi

    private func makeActor() throws -> MessagePersistenceActor {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return MessagePersistenceActor(dbWriter: db)
    }

    private func served(id: String, extra: String) throws -> APIMessage {
        let json = """
        {"id":"\(id)","conversationId":"conv_law","senderId":"user_other","content":"Bonjour",
         "messageType":"text","messageSource":"user"\(extra),
         "translations":[{"id":"\(id)-en","messageId":"\(id)","sourceLanguage":"fr","targetLanguage":"en","translatedContent":"Hello"}],
         "createdAt":"2026-11-17T10:00:00.000Z","updatedAt":"2026-11-17T10:00:00.000Z"}
        """
        return try MeeshyCoders.decoder(.api).decode(APIMessage.self, from: Data(json.utf8))
    }

    func test_upsertFromAPIMessages_endToEndMessage_keepsNoServedTranslation() async throws {
        let actor = try makeActor()

        try await actor.upsertFromAPIMessages([try served(id: "m-e2ee", extra: #","isEncrypted":true,"encryptionMode":"e2ee""#)])

        XCTAssertTrue(try actor.translations(for: "m-e2ee").isEmpty, "le clair d'un message chiffré ne s'écrit nulle part hors du coffre")
    }

    func test_upsertFromAPIMessages_liveEphemeral_keepsItsTranslation() async throws {
        let actor = try makeActor()

        try await actor.upsertFromAPIMessages([try served(id: "m-eph", extra: #","expiresAt":"2999-01-01T00:00:00.000Z""#)])

        XCTAssertEqual(try actor.translations(for: "m-eph").map(\.translatedContent), ["Hello"], "le Prisme d'un éphémère vivant tient hors ligne")
    }
}
