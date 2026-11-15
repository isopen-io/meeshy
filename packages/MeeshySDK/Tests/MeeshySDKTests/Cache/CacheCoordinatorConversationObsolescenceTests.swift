import Combine
import XCTest
import GRDB
@testable import MeeshySDK

final class CacheCoordinatorConversationObsolescenceTests: XCTestCase {

    private func makeSUT() throws -> (CacheCoordinator, MockMessageSocket) {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        let socket = MockMessageSocket()
        return (CacheCoordinator(messageSocket: socket, socialSocket: MockSocialSocket(), db: db), socket)
    }

    private func makeEvent(conversationId: String) -> ConversationObsoletedEvent {
        ConversationObsoletedEvent(
            conversationId: conversationId, obsoletedBy: "admin-1",
            obsoletedAt: "2026-11-02T10:00:00.000Z", purgeAfter: "2026-11-04T10:00:00.000Z"
        )
    }

    private func waitUntil(timeout: TimeInterval = 2, _ condition: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        return await condition()
    }

    func test_conversationObsoleted_removesTheRowAndItsMessagesFromTheCache() async throws {
        let (cache, socket) = try makeSUT()
        await cache.start()
        try await cache.conversations.save(
            [TestFactories.makeConversation(id: "c-obsolete"), TestFactories.makeConversation(id: "c-stays")],
            for: "list"
        )
        try await cache.messages.save([TestFactories.makeMessage(conversationId: "c-obsolete")], for: "c-obsolete")

        socket.conversationObsoleted.send(makeEvent(conversationId: "c-obsolete"))

        let removed = await waitUntil {
            await cache.conversations.load(for: "list").snapshot()?.map(\.id) == ["c-stays"]
        }
        XCTAssertTrue(removed, "une conversation obsolète quitte la liste PERSISTÉE")
        let messagesGone = await waitUntil { await cache.messages.load(for: "c-obsolete").snapshot() == nil }
        XCTAssertTrue(messagesGone, "son contenu, effacé pour tous, ne reste pas sur l'appareil")
    }

    func test_conversationObsoleted_unknownConversation_leavesTheListIntact() async throws {
        let (cache, _) = try makeSUT()
        try await cache.conversations.save([TestFactories.makeConversation(id: "c-stays")], for: "list")

        await cache.forgetObsoletedConversation("ghost")

        let ids = await cache.conversations.load(for: "list").snapshot()?.map(\.id)
        XCTAssertEqual(ids, ["c-stays"])
    }
}
