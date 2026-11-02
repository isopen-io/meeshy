import XCTest
import Combine
import GRDB
@testable import MeeshySDK

/// Le message précédent qui reprend la ligne de liste (dernier message supprimé ou vidé) la reprend avec ses
/// traductions : le lecteur le lit dans sa langue, jamais dans celle de l'expéditeur.
///
/// Le témoin de rang vit sur un rang AUTRE que le premier : prisme ['de','fr'], message anglais traduit en français.
/// XCTest et non Swift Testing : la suite mute `AuthManager.shared.currentUser`, un singleton de processus.
final class ConversationSyncEngineSurvivorPrismTests: XCTestCase {

    private var originalUser: MeeshyUser?

    override func setUp() async throws {
        try await super.setUp()
        originalUser = await MainActor.run { AuthManager.shared.currentUser }
        await MainActor.run {
            AuthManager.shared.currentUser = MeeshyUser(
                id: "u-me", username: "me", systemLanguage: "de", regionalLanguage: "fr")
        }
    }

    override func tearDown() async throws {
        let restored = originalUser
        await MainActor.run { AuthManager.shared.currentUser = restored }
        try await super.tearDown()
    }

    private func makeEngine() throws -> (engine: ConversationSyncEngine, socket: MockMessageSocket, cache: CacheCoordinator) {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let socket = MockMessageSocket()
        let cache = CacheCoordinator(messageSocket: socket, socialSocket: MockSocialSocket(), db: db)
        let engine = ConversationSyncEngine(
            cache: cache, conversationService: MockConversationService(), messageService: MockMessageService(),
            messageSocket: socket, socialSocket: MockSocialSocket(), api: MockAPIClient(), syncDelta: MockSyncDeltaMuet())
        return (engine, socket, cache)
    }

    private func record(_ messageId: String, _ language: String, _ text: String) -> TranslationRecord {
        TranslationRecord(
            id: "\(messageId)-\(language)", messageLocalId: messageId, messageServerId: messageId,
            targetLanguage: language, translatedContent: text, translationModel: "nllb",
            confidenceScore: nil, sourceLanguage: "en", receivedAt: Date())
    }

    private func predecessor(configure: (inout MeeshyMessage) -> Void = { _ in }) -> MeeshyMessage {
        var message = MeeshyMessage(
            id: "m0", conversationId: "c1", content: "Hello",
            createdAt: Date(timeIntervalSince1970: 1_700_000_000))
        message.originalLanguage = "en"
        configure(&message)
        return message
    }

    private func lastRow() -> MeeshyConversation {
        var row = TestFactories.makeConversation(id: "c1")
        row.applyLastMessage(LastMessageFacet(id: "m1", preview: "dernier", senderName: "Zoé", at: Date()))
        return row
    }

    private func fallBack(
        on message: MeeshyMessage, translations: [TranslationRecord]
    ) async throws -> MeeshyConversation? {
        let (engine, socket, cache) = try makeEngine()
        engine.messageTranslationsReader = { _ in translations }
        let last = MeeshyMessage(id: "m1", conversationId: "c1", content: "dernier", createdAt: Date())
        try await cache.messages.save([message, last], for: "c1")
        try await cache.conversations.save([lastRow()], for: "list")
        await engine.startSocketRelay()

        socket.messageDeleted.send(MessageDeletedEvent(messageId: "m1", conversationId: "c1"))

        for _ in 0..<150 {
            if await cache.conversations.load(for: "list").snapshot()?.first?.lastMessageId == "m0" { break }
            try await Task.sleep(nanoseconds: 15_000_000)
        }
        return await cache.conversations.load(for: "list").snapshot()?.first
    }

    func test_thePredecessorTakingTheRowIsServedInTheReadersSecondRank() async throws {
        let row = try await fallBack(
            on: predecessor(), translations: [record("m0", "fr", "Bonjour"), record("m0", "es", "Hola")])

        XCTAssertEqual(row?.lastMessageId, "m0")
        XCTAssertEqual(row?.resolvedLastMessagePreview(preferredLanguages: ["de", "fr"]), "Bonjour")
        XCTAssertEqual(row?.lastMessageOriginalLanguage, "en")
    }

    func test_theOriginalLanguageCompetesAtItsRankNotAsAShortcut() async throws {
        let row = try await fallBack(on: predecessor(), translations: [record("m0", "fr", "Bonjour")])

        XCTAssertEqual(row?.resolvedLastMessagePreview(preferredLanguages: ["en", "fr"]), "Hello")
    }

    func test_theRowWithoutAnyTranslationServesTheOriginal() async throws {
        let row = try await fallBack(on: predecessor(), translations: [])

        XCTAssertEqual(row?.resolvedLastMessagePreview(preferredLanguages: ["de", "fr"]), "Hello")
    }

    func test_aViewOncePredecessorCarriesNoTranslation() async throws {
        let row = try await fallBack(
            on: predecessor { $0.isViewOnce = true }, translations: [record("m0", "fr", "Bonjour")])

        XCTAssertEqual(row?.lastMessageIsViewOnce, true)
        XCTAssertNil(row?.lastMessageTranslations)
    }

    func test_aBlurredPredecessorCarriesNoTranslation() async throws {
        let row = try await fallBack(
            on: predecessor { $0.isBlurred = true }, translations: [record("m0", "fr", "Bonjour")])

        XCTAssertEqual(row?.lastMessageIsBlurred, true)
        XCTAssertNil(row?.lastMessageTranslations)
    }

    func test_anEncryptedPredecessorIsSealedWithoutTranslationNorClearText() async throws {
        let row = try await fallBack(
            on: predecessor { $0.isEncrypted = true }, translations: [record("m0", "fr", "cryptogramme")])

        XCTAssertNil(row?.lastMessageTranslations)
        XCTAssertNil(row?.lastMessagePreview)
        XCTAssertEqual(row?.lastMessageNature?.isEncrypted, true)
    }

    func test_translationsKeepOnlyTheReadersLanguages() async throws {
        let row = try await fallBack(
            on: predecessor(), translations: [record("m0", "fr", "Bonjour"), record("m0", "es", "Hola")])

        XCTAssertEqual(row?.lastMessageTranslations, ["fr": "Bonjour"])
    }
}
