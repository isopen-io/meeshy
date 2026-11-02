import XCTest
import GRDB
@testable import MeeshySDK

final class MessageRepositoryTranslationTests: XCTestCase {

    private func makeRepository() throws -> (MessageRepository, DatabaseQueue) {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return (MessageRepository(persistence: MessagePersistenceActor(dbWriter: queue, currentUserId: "user_me")), queue)
    }

    private func translation(_ id: String, message: String, language: String) -> TranslationRecord {
        TranslationRecord(id: id, messageLocalId: message, messageServerId: nil, targetLanguage: language,
                          translatedContent: "\(language)-\(message)", translationModel: "nllb",
                          confidenceScore: nil, sourceLanguage: "fr", receivedAt: Date(timeIntervalSince1970: 0))
    }

    private func insertMessage(_ queue: DatabaseQueue, localId: String, serverId: String?,
                               conversationId: String, at seconds: TimeInterval) throws {
        var record = MessageRecordFactory.make(localId: localId, conversationId: conversationId, state: .sent,
                                               createdAt: Date(timeIntervalSince1970: seconds))
        record.serverId = serverId
        try queue.write { db in try record.insert(db) }
    }

    private func insertTranslations(_ queue: DatabaseQueue, _ records: [TranslationRecord]) throws {
        try queue.write { db in try records.forEach { try $0.insert(db) } }
    }

    func test_translationsForMessageIds_groupsOnlyTheRequestedMessages() async throws {
        let (repository, queue) = try makeRepository()
        try insertTranslations(queue, [
            translation("t1", message: "m1", language: "en"),
            translation("t2", message: "m1", language: "es"),
            translation("t3", message: "m2", language: "en"),
            translation("t4", message: "m3", language: "en")
        ])

        let grouped = try await repository.translations(forMessageIds: ["m1", "m2"])

        XCTAssertEqual(Set(grouped.keys), ["m1", "m2"])
        XCTAssertEqual(Set(grouped["m1"]?.map(\.targetLanguage) ?? []), ["en", "es"])
        XCTAssertEqual(grouped["m2"]?.map(\.id), ["t3"])
    }

    func test_translationsForMessageIds_emptyRequest_returnsNothing() async throws {
        let (repository, queue) = try makeRepository()
        try insertTranslations(queue, [translation("t1", message: "m1", language: "en")])

        let grouped = try await repository.translations(forMessageIds: [])

        XCTAssertTrue(grouped.isEmpty)
    }

    func test_recentTranslations_readsTheNewestMessagesOfTheConversation_byLocalOrServerId() async throws {
        let (repository, queue) = try makeRepository()
        try insertMessage(queue, localId: "old", serverId: nil, conversationId: "c1", at: 10)
        try insertMessage(queue, localId: "temp_new", serverId: "srv_new", conversationId: "c1", at: 30)
        try insertMessage(queue, localId: "mid", serverId: nil, conversationId: "c1", at: 20)
        try insertMessage(queue, localId: "other", serverId: nil, conversationId: "c2", at: 40)
        try insertTranslations(queue, [
            translation("t-old", message: "old", language: "en"),
            translation("t-srv", message: "srv_new", language: "en"),
            translation("t-mid", message: "mid", language: "en"),
            translation("t-other", message: "other", language: "en")
        ])

        let grouped = try await repository.recentTranslations(conversationId: "c1", limit: 2)

        XCTAssertEqual(Set(grouped.keys), ["srv_new", "mid"])
    }

    func test_recentTranslations_conversationWithoutMessages_returnsNothing() async throws {
        let (repository, _) = try makeRepository()

        let grouped = try await repository.recentTranslations(conversationId: "empty", limit: 50)

        XCTAssertTrue(grouped.isEmpty)
    }
}
