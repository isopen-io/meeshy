import XCTest
import GRDB
@testable import MeeshySDK

/// La vitrine (#8855) range sa liste par le point d'écriture RÉCONCILIÉ `saveSorted`, jamais par
/// une écriture en bloc de plus (`ConversationListCacheWriterGuardTests`).
final class ConversationSyncEngineVitrineTests: XCTestCase {
    func test_debugVitrineSaveList_writesTheListThroughTheReconciledChokepoint() async throws {
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
            syncDelta: MockSyncDeltaMuet()
        )
        let liste = [
            TestFactories.makeConversation(id: "c1", unreadCount: 2),
            TestFactories.makeConversation(id: "c2"),
        ]

        let ecrit = await engine.debugVitrineSaveList(liste)

        XCTAssertTrue(ecrit)
        let lue = await cache.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(Set(lue.map(\.id)), ["c1", "c2"])
        XCTAssertEqual(lue.first { $0.id == "c1" }?.userState.unreadCount, 2, "Le non-lu servi par la fixture survit à la réconciliation.")
    }
}
