import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// Chemin UNIQUE du transfert (spec 2026-08-19, Volet A.3) : payload minimal
/// (`forwardedFromId`, jamais d'`attachmentIds` — le serveur copie), dédup au
/// retry par réutilisation du `clientMessageId`, branche offline durable, et
/// raison d'échec conservée pour l'affichage.
@MainActor
final class MessageForwardServiceTests: XCTestCase {

    private let target = "6a0000000000000000000001"
    private let otherTarget = "6a0000000000000000000002"
    private let sourceConvId = "6a0ad86a6e21a483b4443d99"

    private func makeMessage(
        id: String = "6a0ad86a6e21a483b4443d11",
        content: String = ""
    ) -> Message {
        Message(
            id: id,
            conversationId: sourceConvId,
            senderId: "sender-1",
            content: content,
            createdAt: Date(),
            updatedAt: Date()
        )
    }

    private func makeSUT(
        online: Bool = true
    ) -> (sut: MessageForwardService, api: MockAPIClientForApp, queue: FakeOfflineMessageQueue) {
        let api = MockAPIClientForApp()
        let queue = FakeOfflineMessageQueue()
        let sut = MessageForwardService(api: api, queue: queue, isOnline: { online })
        return (sut, api, queue)
    }

    private func stubSendSuccess(_ api: MockAPIClientForApp, target: String) {
        let data = SendMessageResponseData(
            id: "new-1", clientMessageId: nil, conversationId: target,
            senderId: nil, content: nil, messageType: nil, createdAt: Date()
        )
        api.stub(
            "/conversations/\(target)/messages",
            result: APIResponse<SendMessageResponseData>(success: true, data: data, error: nil)
        )
    }

    private func postedBody(_ api: MockAPIClientForApp, at index: Int = 0) throws -> [String: Any] {
        let bodies = api.lastPostBodies
        guard bodies.indices.contains(index) else {
            XCTFail("no POST body captured at index \(index) (\(bodies.count) captured)")
            return [:]
        }
        return try XCTUnwrap(JSONSerialization.jsonObject(with: bodies[index]) as? [String: Any])
    }

    // MARK: - Payload

    func test_forward_online_postsForwardedFromId_withoutAttachmentIds() async throws {
        let (sut, api, _) = makeSUT()
        stubSendSuccess(api, target: target)

        let outcome = await sut.forward(
            message: makeMessage(content: "hello"),
            sourceConversationId: sourceConvId,
            to: target
        )

        XCTAssertEqual(outcome, .sent)
        XCTAssertEqual(api.requestEndpoints, ["/conversations/\(target)/messages"])
        let body = try postedBody(api)
        XCTAssertEqual(body["forwardedFromId"] as? String, "6a0ad86a6e21a483b4443d11")
        XCTAssertEqual(body["forwardedFromConversationId"] as? String, sourceConvId)
        XCTAssertEqual(body["content"] as? String, "hello")
        XCTAssertNil(body["attachmentIds"],
                     "un transfert ne ré-attache jamais côté client — le serveur copie les attachments de la source")
    }

    func test_forward_mediaOnly_omitsContent() async throws {
        let (sut, api, _) = makeSUT()
        stubSendSuccess(api, target: target)

        _ = await sut.forward(message: makeMessage(content: ""), sourceConversationId: sourceConvId, to: target)

        let body = try postedBody(api)
        XCTAssertNil(body["content"], "un forward de média n'a pas de texte — la clé doit être ABSENTE, pas vide")
        XCTAssertNotNil(body["forwardedFromId"])
    }

    func test_forward_emptySourceConversationId_omitsTheField() async throws {
        let (sut, api, _) = makeSUT()
        stubSendSuccess(api, target: target)

        _ = await sut.forward(message: makeMessage(), sourceConversationId: "", to: target)

        let body = try postedBody(api)
        XCTAssertNil(body["forwardedFromConversationId"],
                     "'' (conversation source inconnue) ne doit jamais partir sur le fil — Prisma @db.ObjectId refuse l'écriture")
    }

    // MARK: - Dédup au retry

    func test_forward_sameTarget_reusesClientMessageId() async throws {
        let (sut, api, _) = makeSUT()
        stubSendSuccess(api, target: target)
        stubSendSuccess(api, target: otherTarget)

        _ = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: target)
        _ = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: target)
        _ = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: otherTarget)

        let first = try postedBody(api, at: 0)["clientMessageId"] as? String
        let retry = try postedBody(api, at: 1)["clientMessageId"] as? String
        let other = try postedBody(api, at: 2)["clientMessageId"] as? String
        XCTAssertNotNil(first)
        XCTAssertEqual(first, retry, "même cible + même message = même cid — le gateway dédoublonne le retry")
        XCTAssertNotEqual(first, other, "une autre cible est un envoi distinct — cid distinct")
    }

    // MARK: - Offline

    func test_forward_offline_enqueuesDurably() async throws {
        let (sut, api, queue) = makeSUT(online: false)

        let outcome = await sut.forward(
            message: makeMessage(content: "x"),
            sourceConversationId: sourceConvId,
            to: target
        )

        XCTAssertEqual(outcome, .queuedOffline)
        XCTAssertEqual(api.postCount, 0, "hors ligne, aucun POST direct — l'outbox rejouera")
        let items = await queue.enqueuedItems
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items.first?.conversationId, target)
        XCTAssertEqual(items.first?.forwardedFromId, "6a0ad86a6e21a483b4443d11")
        XCTAssertEqual(items.first?.forwardedFromConversationId, sourceConvId)
    }

    func test_forward_offlineThenOnline_reusesClientMessageId() async throws {
        var online = false
        let api = MockAPIClientForApp()
        let queue = FakeOfflineMessageQueue()
        let sut = MessageForwardService(api: api, queue: queue, isOnline: { online })
        stubSendSuccess(api, target: target)

        _ = await sut.forward(message: makeMessage(content: "x"), sourceConversationId: nil, to: target)
        online = true
        _ = await sut.forward(message: makeMessage(content: "x"), sourceConversationId: nil, to: target)

        let item = try XCTUnwrap(await queue.enqueuedItems.first)
        let body = try postedBody(api)
        XCTAssertEqual(item.clientMessageId, body["clientMessageId"] as? String,
                       "le rejeu en ligne reprend le cid de l'enfilage hors ligne — jamais de doublon")
    }

    // MARK: - Échec

    func test_forward_serverRefusal_surfacesReason() async {
        let (sut, api, _) = makeSUT()
        api.errorToThrow = APIError.serverError(400, "Un message à vue unique ne peut pas être transféré")

        let outcome = await sut.forward(message: makeMessage(content: "x"), sourceConversationId: nil, to: target)

        guard case .failed(let reason) = outcome else {
            return XCTFail("expected .failed, got \(outcome)")
        }
        XCTAssertTrue(reason.contains("vue unique"),
                      "la raison serveur doit survivre jusqu'à l'affichage — reçu : \(reason)")
    }
}
