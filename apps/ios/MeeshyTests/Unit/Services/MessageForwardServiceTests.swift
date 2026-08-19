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
    ) -> (sut: MessageForwardService, api: MockAPIClientForApp, queue: FakeOfflineMessageQueue, creator: MockConversationCreator) {
        let api = MockAPIClientForApp()
        let queue = FakeOfflineMessageQueue()
        let creator = MockConversationCreator()
        let sut = MessageForwardService(api: api, queue: queue, isOnline: { online }, conversationCreator: creator)
        return (sut, api, queue, creator)
    }

    private func makeConversation(id: String) -> Conversation {
        MeeshyConversation(id: id, identifier: id, type: .direct)
    }

    private func makeContactTarget(userId: String = "u1", title: String = "Alice") -> ForwardTarget {
        ForwardTarget(id: "user:\(userId)", kind: .contact, conversationId: nil, userId: userId,
                      title: title, subtitle: nil, avatarURL: nil)
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
        let (sut, api, _, _) = makeSUT()
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
        let (sut, api, _, _) = makeSUT()
        stubSendSuccess(api, target: target)

        _ = await sut.forward(message: makeMessage(content: ""), sourceConversationId: sourceConvId, to: target)

        let body = try postedBody(api)
        XCTAssertNil(body["content"], "un forward de média n'a pas de texte — la clé doit être ABSENTE, pas vide")
        XCTAssertNotNil(body["forwardedFromId"])
    }

    func test_forward_emptySourceConversationId_omitsTheField() async throws {
        let (sut, api, _, _) = makeSUT()
        stubSendSuccess(api, target: target)

        _ = await sut.forward(message: makeMessage(), sourceConversationId: "", to: target)

        let body = try postedBody(api)
        XCTAssertNil(body["forwardedFromConversationId"],
                     "'' (conversation source inconnue) ne doit jamais partir sur le fil — Prisma @db.ObjectId refuse l'écriture")
    }

    // MARK: - Cycle de vie du clientMessageId

    /// Un ÉCHEC laisse la cible non servie : le retry doit rejouer le même cid
    /// pour que l'index unique `(conversationId, clientMessageId)` du gateway
    /// absorbe le cas où le premier POST avait en réalité abouti.
    func test_forward_retryAfterFailure_reusesClientMessageId() async throws {
        let (sut, api, _, _) = makeSUT()
        api.errorToThrow = APIError.serverError(500, "boom")

        let failure = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: target)

        api.errorToThrow = nil
        stubSendSuccess(api, target: target)
        let retry = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: target)

        XCTAssertEqual(failure, .failed(reason: "boom"))
        XCTAssertEqual(retry, .sent)
        let firstCid = try postedBody(api, at: 0)["clientMessageId"] as? String
        let retryCid = try postedBody(api, at: 1)["clientMessageId"] as? String
        XCTAssertNotNil(firstCid)
        XCTAssertEqual(firstCid, retryCid,
                       "un retry après échec rejoue le même cid — le gateway dédoublonne un POST peut-être déjà passé")
    }

    /// Un envoi CONFIRMÉ libère la clé. Le picker se réinitialise à chaque
    /// présentation : re-transférer délibérément le même message vers la même
    /// cible est une action légitime qui doit créer un SECOND message. Rejouer
    /// le cid confirmé le ferait avaler par le chemin idempotent du gateway
    /// (P2002 → la ligne EXISTANTE revient en succès), donnant une UI
    /// « Transféré » sans qu'aucun message ne soit créé.
    func test_forward_afterConfirmedSend_usesFreshClientMessageId() async throws {
        let (sut, api, _, _) = makeSUT()
        stubSendSuccess(api, target: target)

        let first = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: target)
        let second = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: target)

        XCTAssertEqual(first, .sent)
        XCTAssertEqual(second, .sent)
        let firstCid = try postedBody(api, at: 0)["clientMessageId"] as? String
        let secondCid = try postedBody(api, at: 1)["clientMessageId"] as? String
        XCTAssertNotNil(firstCid)
        XCTAssertNotNil(secondCid)
        XCTAssertNotEqual(firstCid, secondCid,
                          "un second transfert VOULU vers la même cible doit porter un cid neuf — sinon le gateway le dédoublonne et rien n'est créé")
    }

    func test_forward_distinctTargets_useDistinctClientMessageIds() async throws {
        let (sut, api, _, _) = makeSUT()
        api.errorToThrow = APIError.serverError(500, "boom")

        _ = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: target)
        _ = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: otherTarget)

        let first = try postedBody(api, at: 0)["clientMessageId"] as? String
        let other = try postedBody(api, at: 1)["clientMessageId"] as? String
        XCTAssertNotNil(first)
        XCTAssertNotEqual(first, other, "une autre cible est un envoi distinct — cid distinct")
    }

    // MARK: - Offline

    func test_forward_offline_enqueuesDurably() async throws {
        let (sut, api, queue, _) = makeSUT(online: false)

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

        let enqueued = await queue.enqueuedItems
        let item = try XCTUnwrap(enqueued.first)
        let body = try postedBody(api)
        XCTAssertEqual(item.clientMessageId, body["clientMessageId"] as? String,
                       "le rejeu en ligne reprend le cid de l'enfilage hors ligne — jamais de doublon")
    }

    // MARK: - Échec

    func test_forward_serverRefusal_surfacesReason() async {
        let (sut, api, _, _) = makeSUT()
        api.errorToThrow = APIError.serverError(400, "Un message à vue unique ne peut pas être transféré")

        let outcome = await sut.forward(message: makeMessage(content: "x"), sourceConversationId: nil, to: target)

        guard case .failed(let reason) = outcome else {
            return XCTFail("expected .failed, got \(outcome)")
        }
        XCTAssertTrue(reason.contains("vue unique"),
                      "la raison serveur doit survivre jusqu'à l'affichage — reçu : \(reason)")
    }

    // MARK: - Résolution de cible (ForwardTarget)

    /// Une cible déjà rattachée à une conversation part directement : la
    /// résolution ne doit jamais appeler `createDirectConversation` quand
    /// `conversationId` est déjà connu.
    func test_forward_toExistingConversationTarget_skipsCreationAndSends() async throws {
        let (sut, api, _, creator) = makeSUT()
        stubSendSuccess(api, target: target)
        let existing = ForwardTarget(id: "conv:\(target)", kind: .conversation, conversationId: target,
                                      userId: nil, title: "Équipe", subtitle: nil, avatarURL: nil)

        let outcome = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: existing)

        XCTAssertEqual(outcome, .sent)
        XCTAssertEqual(creator.createCallCount, 0, "une conversation déjà connue ne doit jamais déclencher de création")
        XCTAssertEqual(api.requestEndpoints, ["/conversations/\(target)/messages"])
    }

    /// Invariant produit : la conversation directe n'est créée QU'À L'ENVOI —
    /// jamais à la sélection. Cette preuve tient parce que `forward(...)` est
    /// le SEUL point d'entrée qui touche `createDirectConversation` ; la
    /// sélection d'une cible dans le picker n'appelle jamais ce service.
    func test_forward_toContactWithoutConversation_createsItOnceThenSends() async throws {
        let (sut, api, _, creator) = makeSUT()
        creator.result = .success(makeConversation(id: "new-conv"))
        stubSendSuccess(api, target: "new-conv")
        let contactTarget = makeContactTarget()

        XCTAssertEqual(creator.createCallCount, 0, "aucune création avant l'envoi")
        let outcome = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: contactTarget)

        XCTAssertEqual(outcome, .sent)
        XCTAssertEqual(creator.createCallCount, 1)
        XCTAssertEqual(creator.lastUserId, "u1")
        XCTAssertEqual(api.requestEndpoints, ["/conversations/new-conv/messages"])
    }

    func test_forward_toContact_whenCreationFails_doesNotSend() async {
        let (sut, api, _, creator) = makeSUT()
        creator.result = .failure(APIError.serverError(403, "USER_BLOCKED"))
        let contactTarget = makeContactTarget()

        let outcome = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: contactTarget)

        guard case .failed(let reason) = outcome else {
            return XCTFail("expected .failed, got \(outcome)")
        }
        XCTAssertTrue(reason.contains("USER_BLOCKED"))
        XCTAssertEqual(api.postCount, 0, "la création a échoué — aucun POST de message ne doit partir")
    }

    /// Un contact ABSOLUMENT sans `userId` ni `conversationId` (cas défensif,
    /// non produit par `ForwardPickerViewModel` en pratique) échoue proprement
    /// plutôt que de forcer un unwrap.
    func test_forward_targetWithNeitherConversationNorUser_failsWithoutCreatingOrSending() async {
        let (sut, api, _, creator) = makeSUT()
        let emptyTarget = ForwardTarget(id: "user:orphan", kind: .contact, conversationId: nil,
                                         userId: nil, title: "?", subtitle: nil, avatarURL: nil)

        let outcome = await sut.forward(message: makeMessage(), sourceConversationId: nil, to: emptyTarget)

        guard case .failed = outcome else { return XCTFail("expected .failed, got \(outcome)") }
        XCTAssertEqual(creator.createCallCount, 0)
        XCTAssertEqual(api.postCount, 0)
    }
}
