import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// **Un clair effacé n'emporte jamais son empreinte** (#11382, audit
/// adversarial du lot `ios-preview-provenance`).
///
/// La suppression, l'expiration et la flamme-œil vident `content` par
/// `upsertPatch`, qui garde le reste de la struct : l'empreinte du clair
/// déchiffré y survivait, puis se réécrivait dans la ligne du cache — un
/// « oui » éphémère se retrouvait par dictionnaire après son effacement.
final class ConversationSyncEngineErasedProvenanceTests: XCTestCase {

    private let conversationId = "c-erased-origin"

    private func makeCache() throws -> CacheCoordinator {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        return CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
    }

    private func makeEngine(cache: CacheCoordinator, socket: MockMessageSocket = MockMessageSocket()) -> ConversationSyncEngine {
        ConversationSyncEngine(
            cache: cache,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: socket,
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet()
        )
    }

    private func decrypted(id: String, plaintext: String) -> MeeshyMessage {
        var message = MeeshyMessage(
            id: id, conversationId: conversationId, senderId: "u-other", content: "Q2lwaGVydGV4dGU=",
            isEncrypted: true, createdAt: Date(timeIntervalSince1970: 1_000), updatedAt: Date(timeIntervalSince1970: 1_000)
        )
        message.adoptDecryptedContent(plaintext)
        return message
    }

    private func cached(_ id: String, in cache: CacheCoordinator) async -> MeeshyMessage? {
        await cache.messages.load(for: conversationId).snapshot()?.first { $0.id == id }
    }

    private func encodedOrigin(of message: MeeshyMessage) throws -> Any? {
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(message)) as? [String: Any]
        return object?["contentOrigin"]
    }

    func test_expireLocally_erasesTheClearAndItsProvenance() async throws {
        let cache = try makeCache()
        try await cache.messages.save([decrypted(id: "m-burn", plaintext: "oui")], for: conversationId)
        let engine = makeEngine(cache: cache)

        await engine.expireLocally(conversationId: conversationId, messageIds: ["m-burn"])

        let burned = await cached("m-burn", in: cache)
        let expired = try XCTUnwrap(burned)
        XCTAssertEqual(expired.content, "")
        XCTAssertEqual(expired.contentOrigin, .wire, "aucune empreinte du clair échu ne reste sur le message")
        XCTAssertNil(try encodedOrigin(of: expired), "ni dans la ligne du cache")
    }

    func test_messageDeleted_erasesTheClearAndItsProvenance() async throws {
        let cache = try makeCache()
        try await cache.messages.save([decrypted(id: "m-del", plaintext: "oui")], for: conversationId)
        let socket = MockMessageSocket()
        let engine = makeEngine(cache: cache, socket: socket)
        await engine.startSocketRelay()

        socket.messageDeleted.send(MessageDeletedEvent(messageId: "m-del", conversationId: conversationId))
        try await Task.sleep(nanoseconds: 300_000_000)

        let removed = await cached("m-del", in: cache)
        let deleted = try XCTUnwrap(removed)
        XCTAssertNotNil(deleted.deletedAt, "précondition : la suppression est appliquée")
        XCTAssertEqual(deleted.contentOrigin, .wire)
        XCTAssertNil(try encodedOrigin(of: deleted))
    }
}
