import XCTest
import GRDB
@testable import MeeshySDK

/// #7939 — une étoile posée d'un AUTRE appareil (`message:starred`) ne porte
/// aucun contenu : l'instantané du favori se compose depuis la ligne GRDB du
/// message, sans réseau. Ce que la ligne n'a pas le droit de servir (supprimé,
/// vue unique) ne compose rien.
final class MessagePersistenceStarredSourceTests: XCTestCase {

    private func makeActor() throws -> MessagePersistenceActor {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return MessagePersistenceActor(dbWriter: queue, currentUserId: "user_me")
    }

    private func insert(
        _ actor: MessagePersistenceActor, id: String, content: String? = "Hello",
        language: String = "en", configure: (inout MessageRecord) -> Void = { _ in }
    ) async throws {
        var record = MessageRecordFactory.make(localId: id, conversationId: "conv_star", content: content, state: .sent)
        record.serverId = id
        record.originalLanguage = language
        record.senderName = "Bob"
        configure(&record)
        try await actor.insertOptimistic(record)
    }

    private func translation(of id: String, to language: String, _ text: String) -> TranslationRecord {
        TranslationRecord(
            id: "\(id)-\(language)", messageLocalId: id, messageServerId: id,
            targetLanguage: language, translatedContent: text, translationModel: "nllb",
            confidenceScore: nil, sourceLanguage: "en", receivedAt: Date()
        )
    }

    func test_starredSource_cachedMessage_servesThePrismTranslation() async throws {
        let actor = try makeActor()
        try await insert(actor, id: "m1")
        try await actor.saveTranslation(translation(of: "m1", to: "fr", "Bonjour"))

        let source = try actor.starredSource(messageId: "m1", preferredLanguages: ["fr", "en"])

        XCTAssertEqual(source?.messageId, "m1")
        XCTAssertEqual(source?.conversationId, "conv_star")
        XCTAssertEqual(source?.senderName, "Bob")
        XCTAssertEqual(source?.contentPreview, "Bonjour")
    }

    func test_starredSource_originalAtAHigherRank_servesTheOriginal() async throws {
        let actor = try makeActor()
        try await insert(actor, id: "m2")
        try await actor.saveTranslation(translation(of: "m2", to: "fr", "Bonjour"))

        let source = try actor.starredSource(messageId: "m2", preferredLanguages: ["en", "fr"])

        XCTAssertEqual(source?.contentPreview, "Hello")
    }

    func test_starredSource_attachmentOnly_carriesItsKindAndAnEmptyPreview() async throws {
        let actor = try makeActor()
        let attachment = MeeshyMessageAttachment(id: "a1", fileName: "p.jpg", mimeType: "image/jpeg",
                                                 fileUrl: "https://cdn/p.jpg")
        let json = try JSONEncoder().encode([attachment])
        try await insert(actor, id: "m3", content: "") { $0.attachmentsJson = json }

        let source = try actor.starredSource(messageId: "m3", preferredLanguages: ["fr"])

        XCTAssertEqual(source?.contentPreview, "")
        XCTAssertEqual(source?.attachmentKind, "image")
    }

    func test_starredSource_unknownMessage_isNil() throws {
        let actor = try makeActor()
        XCTAssertNil(try actor.starredSource(messageId: "ghost", preferredLanguages: ["fr"]))
    }

    func test_starredSource_deletedMessage_isNil() async throws {
        let actor = try makeActor()
        try await insert(actor, id: "m4") { $0.deletedAt = Date() }
        XCTAssertNil(try actor.starredSource(messageId: "m4", preferredLanguages: ["fr"]))
    }

    func test_starredSource_viewOnceMessage_isNil() async throws {
        let actor = try makeActor()
        try await insert(actor, id: "m5") { $0.effectFlags = MessageEffectFlags.viewOnce.rawValue }
        XCTAssertNil(try actor.starredSource(messageId: "m5", preferredLanguages: ["fr"]))
    }
}
