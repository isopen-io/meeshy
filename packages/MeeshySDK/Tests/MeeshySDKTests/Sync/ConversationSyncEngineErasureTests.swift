import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// #19305 — le cache de fil (`cache.messages`, L2 sur disque) et le cache des traductions (`translation_cache`, 24 h)
/// suivent la même loi que la base (`MessageEnrichmentLaw`) : une vue unique ouverte (ici ou ailleurs), un message
/// supprimé ou un éphémère échu n'y laisse que son enveloppe, et aucune traduction n'y arrive après coup.
final class ConversationSyncEngineErasureTests: XCTestCase {

    private let conversationId = "c-effacement"

    private func makeEngine(reader: String = "me") throws -> (engine: ConversationSyncEngine, socket: MockMessageSocket, cache: CacheCoordinator) {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let socket = MockMessageSocket()
        let cache = CacheCoordinator(messageSocket: socket, socialSocket: MockSocialSocket(), db: db)
        let engine = ConversationSyncEngine(
            cache: cache,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: socket,
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet(),
            currentUserId: { reader }
        )
        return (engine, socket, cache)
    }

    private func waitUntil(timeout: TimeInterval = 2, _ condition: () async -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if await condition() { return true }
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        return await condition()
    }

    private func richMessage(id: String) -> MeeshyMessage {
        var message = TestFactories.makeMessage(id: id, conversationId: conversationId, content: "SECRET-texte")
        var attachment = MeeshyMessageAttachment(id: "att-\(id)")
        attachment.caption = "SECRET-légende"
        message.attachments = [attachment]
        return message
    }

    private func translation(of id: String) -> TranslationEvent {
        TranslationEvent(messageId: id, translations: [TranslationData(
            id: "tr-\(id)", messageId: id, sourceLanguage: "fr", targetLanguage: "en",
            translatedContent: "SECRET translated", translationModel: "nllb"
        )])
    }

    private func cachedMessage(_ id: String, in cache: CacheCoordinator) async -> MeeshyMessage? {
        await cache.messages.load(for: conversationId).snapshot()?.first { $0.id == id }
    }

    private func seed(_ id: String, in cache: CacheCoordinator) async throws {
        try await cache.messages.save([richMessage(id: id)], for: conversationId)
        await cache.cacheTranslation(translation(of: id))
        let seeded = await cache.cachedTranslations(for: id)
        XCTAssertEqual(seeded?.count, 1, "précondition : le cache des traductions tient le message")
    }

    // MARK: - Suppression et échéance

    func test_messageDeleted_leavesOnlyTheEnvelopeInTheThreadCacheAndDropsItsTranslations() async throws {
        let (engine, socket, cache) = try makeEngine()
        try await seed("m-del", in: cache)
        await engine.startSocketRelay()

        socket.messageDeleted.send(MessageDeletedEvent(messageId: "m-del", conversationId: conversationId))

        let erased = await waitUntil { await self.cachedMessage("m-del", in: cache)?.isDeleted == true }
        XCTAssertTrue(erased)
        let tombstone = await cachedMessage("m-del", in: cache)
        XCTAssertEqual(tombstone?.content, "")
        XCTAssertEqual(tombstone?.attachments.isEmpty, true, "ni nom de fichier, ni légende, ni transcription")
        let remaining = await cache.cachedTranslations(for: "m-del")
        XCTAssertNil(remaining, "la traduction ne survit pas 24 h au message supprimé")
    }

    func test_messageExpired_leavesOnlyTheEnvelopeInTheThreadCacheAndDropsItsTranslations() async throws {
        let (engine, _, cache) = try makeEngine()
        try await seed("m-exp", in: cache)

        await engine.expireLocally(conversationId: conversationId, messageIds: ["m-exp"])

        let tombstone = await cachedMessage("m-exp", in: cache)
        XCTAssertEqual(tombstone?.isDeleted, true)
        XCTAssertEqual(tombstone?.attachments.isEmpty, true)
        let remaining = await cache.cachedTranslations(for: "m-exp")
        XCTAssertNil(remaining)
    }

    // MARK: - Vue unique ouverte ici ou ailleurs

    func test_viewOnceOpenedByTheReaderOnAnotherDevice_sealsTheThreadCacheOfAClosedConversation() async throws {
        let (engine, socket, cache) = try makeEngine(reader: "me")
        try await seed("m-vu", in: cache)
        await engine.startSocketRelay()

        socket.messageConsumed.send(MessageConsumedEvent(
            messageId: "m-vu", conversationId: conversationId, userId: "me",
            viewOnceCount: 1, maxViewOnceCount: 1, isFullyConsumed: true
        ))

        let sealed = await waitUntil { await self.cachedMessage("m-vu", in: cache)?.viewOnceOpenedAt != nil }
        XCTAssertTrue(sealed, "le cache de fil garde l'état « déjà ouvert »")
        let message = await cachedMessage("m-vu", in: cache)
        XCTAssertEqual(message?.content, "")
        XCTAssertEqual(message?.attachments.isEmpty, true)
        let remaining = await cache.cachedTranslations(for: "m-vu")
        XCTAssertNil(remaining)
    }

    func test_viewOnceOpenedBySomeoneElse_changesNothingHere() async throws {
        let (engine, socket, cache) = try makeEngine(reader: "me")
        try await seed("m-autre", in: cache)
        await engine.startSocketRelay()

        socket.messageConsumed.send(MessageConsumedEvent(
            messageId: "m-autre", conversationId: conversationId, userId: "someone-else",
            viewOnceCount: 1, maxViewOnceCount: 3, isFullyConsumed: false
        ))
        try? await Task.sleep(nanoseconds: 200_000_000)

        let message = await cachedMessage("m-autre", in: cache)
        XCTAssertEqual(message?.content, "SECRET-texte", "ce qu'un autre ouvre ne retire rien chez moi")
        let kept = await cache.cachedTranslations(for: "m-autre")
        XCTAssertEqual(kept?.count, 1)
    }

    func test_applyErasure_viewOnceOpenedHere_sealsTheThreadCacheAndDropsItsTranslations() async throws {
        let (_, _, cache) = try makeEngine()
        try await seed("m-local", in: cache)

        await cache.applyErasure(MessageContentErasure(
            messageId: "m-local", conversationId: conversationId, viewOnceOpenedAt: Date()))

        let message = await cachedMessage("m-local", in: cache)
        XCTAssertNotNil(message?.viewOnceOpenedAt)
        XCTAssertEqual(message?.attachments.isEmpty, true)
        let remaining = await cache.cachedTranslations(for: "m-local")
        XCTAssertNil(remaining)
    }

    // MARK: - Une traduction n'arrive pas sous une ligne scellée

    func test_translationReceived_forAMessageThatKeepsNothing_isNotWrittenToTheTranslationCache() async throws {
        let (engine, socket, cache) = try makeEngine()
        cache.setTranslationAdmission { _ in false }
        await engine.startSocketRelay()

        socket.translationReceived.send(translation(of: "m-scelle"))
        try? await Task.sleep(nanoseconds: 200_000_000)

        let cached = await cache.cachedTranslations(for: "m-scelle")
        XCTAssertNil(cached, "une vue unique ouverte ne regagne pas sa traduction par un événement tardif")
    }

    func test_translationReceived_forAnOrdinaryMessage_isCachedAsBefore() async throws {
        let (engine, socket, cache) = try makeEngine()
        cache.setTranslationAdmission { _ in true }
        await engine.startSocketRelay()

        socket.translationReceived.send(translation(of: "m-ordinaire"))

        let cached = await waitUntil { await cache.cachedTranslations(for: "m-ordinaire")?.count == 1 }
        XCTAssertTrue(cached, "le Prisme hors ligne : un message ordinaire garde ses traductions")
    }
}
