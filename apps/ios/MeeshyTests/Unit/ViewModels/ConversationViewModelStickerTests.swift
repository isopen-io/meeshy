import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// **Un sticker envoyé voyage AVEC son image, sur chaque transport, et vit
/// dans la bulle optimiste avant tout écho serveur** (#4823, moitié ENVOI).
///
/// Le PNG est une pièce jointe ordinaire ; `MessageSticker` dit ce qu'elle
/// représente. Les quatre chemins que `sendMessage` emprunte — REST, repli
/// socket, file hors-ligne, file de re-tentative — doivent tous le porter,
/// et la ligne GRDB optimiste doit l'encoder (`stickerJson`, même mécanique
/// que `locationJson`) : une bulle sticker envoyée hors ligne relue au
/// relaunch sans cette colonne serait muette jusqu'à l'écho serveur.
@MainActor
final class ConversationViewModelStickerTests: XCTestCase {

    private let conversationId = "00000000000000000000ab01"
    private let userId = "00000000000000000000ab99"

    private struct Fixture {
        let sut: ConversationViewModel
        let messageService: MockMessageService
        let messageSocket: MockMessageSocket
        let offlineQueue: FakeOfflineMessageQueue
    }

    override func setUp() async throws {
        try await super.setUp()
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        APIClient.shared.anonymousSessionToken = nil
        try await super.tearDown()
    }

    // MARK: - Factory

    private func makeFixture(isOnline: Bool = true, restSendFailure: Error? = nil) async throws -> Fixture {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "sticker", displayName: "Sticker User"))
        let messageService = MockMessageService()
        if let restSendFailure {
            messageService.sendResult = .failure(restSendFailure)
        }
        let messageSocket = MockMessageSocket()
        let offlineQueue = FakeOfflineMessageQueue()
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        // Le chemin d'envoi en ligne consulte le singleton : l'aligner sur
        // le moniteur injecté garde le test déterministe.
        MessageSocketManager.shared.isConnected = isOnline
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: messageSocket,
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: isOnline),
            offlineQueue: offlineQueue
        )
        sut.start()
        return Fixture(sut: sut, messageService: messageService, messageSocket: messageSocket, offlineQueue: offlineQueue)
    }

    /// Un sticker GABARIT du catalogue réel — id, emplacements figés, mouvement
    /// et repli emoji — pour que le tour GRDB éprouve chaque clé du contrat.
    private func makeSticker() -> MessageSticker {
        let gabarit = StickerTemplateCatalog.love[0]
        return .template(gabarit, slots: ["caption": "Toi"])
    }

    private func makeLocalAttachment() -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: "att-local", fileName: "sticker.png", originalName: "sticker.png",
            mimeType: "image/png", fileSize: 1_234, fileUrl: "file:///tmp/sticker.png",
            uploadedBy: userId
        )
    }

    /// La ligne optimiste remonte par l'observation GRDB — quelques tours de
    /// runloop après l'insert ; on attend la PROPRIÉTÉ, jamais un délai fixe.
    private func awaitFirstMessageSticker(in sut: ConversationViewModel) async -> MessageSticker? {
        _ = await MessageStoreObservationHelper.awaitCondition {
            sut.messages.first?.sticker != nil
        }
        return sut.messages.first?.sticker
    }

    // MARK: - REST

    func test_sendMessage_withSticker_restRequestCarriesSticker() async throws {
        let fx = try await makeFixture()
        let sticker = makeSticker()

        let ok = await fx.sut.sendMessage(
            content: "", attachmentIds: ["att-1"], localAttachments: [makeLocalAttachment()], sticker: sticker
        )

        XCTAssertTrue(ok)
        XCTAssertEqual(fx.messageService.sendCallCount, 1)
        XCTAssertEqual(fx.messageService.lastSendRequest?.attachmentIds, ["att-1"])
        XCTAssertEqual(fx.messageService.lastSendRequest?.sticker, sticker,
                       "le corps REST doit porter `sticker` à côté des ids de pièces jointes")
    }

    func test_sendMessage_withoutSticker_restRequestOmitsSticker() async throws {
        let fx = try await makeFixture()

        _ = await fx.sut.sendMessage(content: "", attachmentIds: ["att-1"], localAttachments: [makeLocalAttachment()])

        XCTAssertNil(fx.messageService.lastSendRequest?.sticker)
    }

    // MARK: - Bulle optimiste (colonne `stickerJson`)

    func test_sendMessage_online_optimisticBubbleCarriesSticker() async throws {
        let fx = try await makeFixture()
        let sticker = makeSticker()

        _ = await fx.sut.sendMessage(
            content: "", attachmentIds: ["att-1"], localAttachments: [makeLocalAttachment()], sticker: sticker
        )

        let surfaced = await awaitFirstMessageSticker(in: fx.sut)
        XCTAssertEqual(surfaced, sticker,
                       "la ligne GRDB optimiste doit encoder `stickerJson` — le message relu la porte")
    }

    func test_sendMessage_offline_optimisticBubbleAndQueueItemCarrySticker() async throws {
        let fx = try await makeFixture(isOnline: false)
        let sticker = makeSticker()

        let ok = await fx.sut.sendMessage(
            content: "", attachmentIds: ["att-1"], localAttachments: [makeLocalAttachment()], sticker: sticker
        )

        XCTAssertTrue(ok)
        let items = await fx.offlineQueue.enqueuedItems
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items.first?.sticker, sticker, "l'item hors-ligne rejoue le sticker avec le PNG")
        let surfaced = await awaitFirstMessageSticker(in: fx.sut)
        XCTAssertEqual(surfaced, sticker,
                       "hors ligne aussi, la ligne optimiste encode `stickerJson` — sinon la bulle est muette au relaunch")
    }

    func test_insertOptimisticMediaMessage_withSticker_bubbleCarriesSticker() async throws {
        let fx = try await makeFixture()
        let sticker = makeSticker()

        fx.sut.insertOptimisticMediaMessage(
            tempId: ClientMessageId.generate(), content: "", attachments: [makeLocalAttachment()],
            messageType: .image, replyToId: nil, sticker: sticker
        )

        let surfaced = await awaitFirstMessageSticker(in: fx.sut)
        XCTAssertEqual(surfaced, sticker,
                       "la bulle posée AVANT l'upload (chemin de la palette) porte déjà son sticker")
    }

    // MARK: - Repli socket et re-tentative

    func test_sendMessage_restFails_socketFallbackCarriesSticker() async throws {
        let fx = try await makeFixture(restSendFailure: NSError(domain: "test", code: 500))
        fx.messageSocket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "server-id-from-socket", clientMessageId: nil, createdAt: Date()
        )
        let sticker = makeSticker()

        let ok = await fx.sut.sendMessage(
            content: "", attachmentIds: ["att-1"], localAttachments: [makeLocalAttachment()], sticker: sticker
        )

        XCTAssertTrue(ok)
        XCTAssertEqual(fx.messageSocket.sendViaSocketFallbackCallCount, 1)
        XCTAssertEqual(fx.messageSocket.lastSendViaSocketFallbackAttachmentIds, ["att-1"])
        XCTAssertEqual(fx.messageSocket.lastSendViaSocketFallbackSticker, sticker,
                       "le repli socket transmet `sticker` sur `message:send-with-attachments`")
    }

    func test_sendMessage_restAndSocketFail_retryItemCarriesSticker() async throws {
        let fx = try await makeFixture(restSendFailure: NSError(domain: "test", code: 500))
        fx.messageSocket.sendViaSocketFallbackResult = nil
        let sticker = makeSticker()

        let ok = await fx.sut.sendMessage(
            content: "", attachmentIds: ["att-1"], localAttachments: [makeLocalAttachment()], sticker: sticker
        )

        XCTAssertFalse(ok)
        let items = await fx.offlineQueue.enqueuedItems
        XCTAssertEqual(items.first?.sticker, sticker,
                       "la re-tentative durable rejoue le sticker — l'outbox ne doit pas le perdre en route")
        XCTAssertEqual(items.first?.attachmentIds, ["att-1"])
    }
}
