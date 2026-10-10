import XCTest
import GRDB
@testable import MeeshySDK

/// #9929 — un envoi refusé pour de bon (403 `GLOBAL_ADULTS_ONLY`) retire sa
/// bulle optimiste. L'aperçu de la ligne, posé avant le refus, doit revenir au
/// dernier message réel au lieu de garder « Vous : … ».
final class ConversationSyncEngineWithdrawTests: XCTestCase {

    private func makeEngine() throws -> (ConversationSyncEngine, CacheCoordinator) {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let cache = CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
        let engine = ConversationSyncEngine(
            cache: cache,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet(),
            currentUserId: { "me" }
        )
        return (engine, cache)
    }

    func test_withdrawLocalMessage_rowShowingTheWithdrawnMessage_fallsBackToTheLastRealMessage() async throws {
        let (engine, cache) = try makeEngine()
        var row = TestFactories.makeConversation(id: "global", identifier: "meeshy", type: .global)
        row.lastMessageId = "cid_refused"
        row.lastMessagePreview = "Salut Global"
        try await cache.conversations.save([row], for: "list")
        let earlier = TestFactories.makeMessage(id: "m1", conversationId: "global", content: "Bienvenue",
                                                createdAt: Date(timeIntervalSince1970: 1_700_000_000))
        try await cache.messages.save([earlier], for: "global")

        await engine.withdrawLocalMessage(conversationId: "global", messageId: "cid_refused")

        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(list.first?.lastMessageId, "m1")
        XCTAssertEqual(list.first?.lastMessagePreview, "Bienvenue")
    }

    func test_withdrawLocalMessage_rowShowingAnotherMessage_isLeftUntouched() async throws {
        let (engine, cache) = try makeEngine()
        var row = TestFactories.makeConversation(id: "global", identifier: "meeshy", type: .global)
        row.lastMessageId = "m9"
        row.lastMessagePreview = "Dernier"
        try await cache.conversations.save([row], for: "list")

        await engine.withdrawLocalMessage(conversationId: "global", messageId: "cid_refused")

        let list = await cache.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(list.first?.lastMessageId, "m9")
        XCTAssertEqual(list.first?.lastMessagePreview, "Dernier")
    }
}
