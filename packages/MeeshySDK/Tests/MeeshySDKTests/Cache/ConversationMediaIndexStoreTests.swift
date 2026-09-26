import XCTest
import GRDB
@testable import MeeshySDK

/// #8095 — **l'INDEX des messages porteurs de médias d'une conversation**.
///
/// Il n'est pas la fenêtre de messages (`messages`, plafonnée à 600 et vidée
/// par le fil) : il ne tient QUE les porteurs d'image ou de vidéo, sans
/// plafond, pour que la galerie feuillette la conversation ENTIÈRE sur une
/// installation neuve comme hors ligne. Ces témoins gardent ce qui en fait un
/// index : il garde tout, il se purge avec le compte, et il suit les
/// suppressions du fil.
final class ConversationMediaIndexStoreTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeCoordinator(db: DatabaseQueue) -> CacheCoordinator {
        CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
    }

    private func carrier(_ index: Int) -> MeeshyMessage {
        MeeshyMessage(
            id: "msg-\(index)",
            conversationId: "conv-1",
            content: "",
            messageType: .image,
            createdAt: Date(timeIntervalSince1970: TimeInterval(1_750_000_000 + index)),
            attachments: [MeeshyMessageAttachment(id: "att-\(index)", mimeType: "image/jpeg")]
        )
    }

    func test_conversationMediaPolicy_hasNoItemCeiling_soTheWholeConversationFits() {
        XCTAssertNil(CachePolicy.conversationMedia.maxItemCount)
        XCTAssertNotNil(CachePolicy.conversationMedia.staleTTL)
        XCTAssertGreaterThanOrEqual(CachePolicy.conversationMedia.ttl, CachePolicy.messages.ttl)
    }

    func test_save_moreThanTheMessageWindow_keepsEveryCarrier() async throws {
        let coordinator = makeCoordinator(db: try makeDB())
        let carriers = (0..<(CachePolicy.messages.maxItemCount ?? 600) + 50).map(carrier)

        try await coordinator.conversationMedia.save(carriers, for: "conv-1")

        let reloaded = await coordinator.conversationMedia.load(for: "conv-1").snapshot()
        XCTAssertEqual(reloaded?.count, carriers.count)
    }

    func test_reset_purgesTheMediaIndex_soTheNextAccountNeverInheritsIt() async throws {
        let coordinator = makeCoordinator(db: try makeDB())
        try await coordinator.conversationMedia.save([carrier(1)], for: "conv-1")

        await coordinator.reset()

        let remaining = await coordinator.conversationMedia.load(for: "conv-1")
        guard case .empty = remaining else {
            return XCTFail("L'index des médias du compte sortant survit à reset(). Reçu : \(remaining)")
        }
    }

    // MARK: - Un index par genre (#8103)

    func test_invalidateConversationMedia_purgesEveryKindOfTheConversation() async throws {
        let coordinator = makeCoordinator(db: try makeDB())
        for kind in ConversationMediaKind.allCases {
            try await coordinator.conversationMedia.save([carrier(1)], for: kind.indexKey(conversationId: "conv-1"))
        }
        try await coordinator.conversationMedia.save([carrier(2)], for: "conv-2")

        await coordinator.invalidateConversationMedia(conversationId: "conv-1")

        for kind in ConversationMediaKind.allCases {
            let left = await coordinator.conversationMedia.load(for: kind.indexKey(conversationId: "conv-1"))
            guard case .empty = left else { return XCTFail("\(kind) survit à la purge : \(left)") }
        }
        let other = await coordinator.conversationMedia.load(for: "conv-2").snapshot()
        XCTAssertEqual(other?.map(\.id), ["msg-2"], "une autre conversation n'est pas touchée")
    }

    func test_dropFromConversationMedia_removesTheMessageFromEveryKind() async throws {
        let coordinator = makeCoordinator(db: try makeDB())
        let documentKey = ConversationMediaKind.document.indexKey(conversationId: "conv-1")
        try await coordinator.conversationMedia.save([carrier(1), carrier(2)], for: "conv-1")
        try await coordinator.conversationMedia.save([carrier(1)], for: documentKey)

        await coordinator.dropFromConversationMedia(conversationId: "conv-1", messageId: "msg-1")

        let visual = await coordinator.conversationMedia.load(for: "conv-1").snapshot()
        let documents = await coordinator.conversationMedia.load(for: documentKey).snapshot()
        XCTAssertEqual(visual?.map(\.id), ["msg-2"])
        XCTAssertEqual(documents?.map(\.id), [])
    }
}
