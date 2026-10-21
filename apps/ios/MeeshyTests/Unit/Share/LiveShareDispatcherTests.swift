import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **L'envoi réel de l'écran de partage** (#10947, revue du lot iOS) — le corps
/// MIS SUR LE FIL, jamais un drapeau posé à côté :
/// - le chiffrement se décide sur la conversation RENDUE, pas sur la ligne
///   choisie (une personne dont la directe existante est chiffrée) ;
/// - rien ne part vers une conversation chiffrée tant que le partage ne sait
///   pas y écrire un chiffré que la passerelle accepte (`encryptedContent`) ;
/// - la copie sur l'appareil ne recopie qu'un texte dont le déchiffrement est
///   PROUVÉ, et jamais un message dont les pièces se perdraient en silence.
@MainActor
final class LiveShareDispatcherTests: XCTestCase {

    private static let source = "6a0000000000000000000099"

    private final class SpyForward: MessageForwardServiceProviding {
        private(set) var calls = 0
        func forward(message: Message, sourceConversationId: String?, to targetConversationId: String, chosenDurationSeconds: Int?, forwardedAttachmentIds: [String]?) async -> ForwardOutcome {
            calls += 1
            return .sent(conversationId: targetConversationId)
        }
        func forward(message: Message, sourceConversationId: String?, to target: ShareRecipient, chosenDurationSeconds: Int?, forwardedAttachmentIds: [String]?) async -> ForwardOutcome {
            calls += 1
            return .sent(conversationId: target.conversationId ?? "created")
        }
    }

    private struct SUT {
        let dispatcher: LiveShareDispatcher
        let api: MockAPIClientForApp
        let queue: FakeOfflineMessageQueue
        let creator: MockConversationCreator
        let forward: SpyForward
    }

    private func makeSUT(online: Bool = true, decrypted: Set<String> = []) -> SUT {
        let api = MockAPIClientForApp()
        let queue = FakeOfflineMessageQueue()
        let creator = MockConversationCreator()
        let forward = SpyForward()
        let dispatcher = LiveShareDispatcher(
            forwardService: forward, api: api, queue: queue, isOnline: { online },
            conversationCreator: creator, postService: MockPostService(),
            currentUserId: { "me" }, isDecryptedOnDevice: { decrypted.contains($0) }
        )
        return SUT(dispatcher: dispatcher, api: api, queue: queue, creator: creator, forward: forward)
    }

    private func stubSend(_ api: MockAPIClientForApp, to conversationId: String) {
        let data = SendMessageResponseData(
            id: "new-1", clientMessageId: nil, conversationId: conversationId,
            senderId: nil, content: nil, messageType: nil, createdAt: Date()
        )
        api.stub("/conversations/\(conversationId)/messages",
                 result: APIResponse<SendMessageResponseData>(success: true, data: data, error: nil))
    }

    private func body(_ api: MockAPIClientForApp, at index: Int = 0) throws -> [String: Any] {
        let bodies = api.lastPostBodies
        guard bodies.indices.contains(index) else {
            XCTFail("aucun corps POST capturé à l'index \(index) (\(bodies.count) capturé(s))")
            return [:]
        }
        return try XCTUnwrap(JSONSerialization.jsonObject(with: bodies[index]) as? [String: Any])
    }

    private func person(_ id: String) -> ShareRecipient {
        ShareRecipient(id: "user:\(id)", kind: .person, conversationId: nil, userId: id, title: id,
                       detail: .friendWithoutConversation, avatarURL: nil)
    }

    private func conversation(_ id: String, encrypted: Bool = false) -> ShareRecipient {
        ShareRecipient(id: "conv:\(id)", kind: .conversation, conversationId: id, userId: "peer",
                       title: id, detail: .direct, avatarURL: nil, isEncrypted: encrypted)
    }

    private func text(_ value: String, caption: String = "") -> ShareSendRequest {
        ShareSendRequest(subject: .text(value), keptMessageIds: [], caption: caption, captionPlacement: nil,
                         grouping: .together, chosenDurationSeconds: nil, copyOnDevice: false)
    }

    private func encryptedMessage(_ id: String, content: String, attachments: [MessageAttachment] = []) -> Message {
        var message = Message(id: id, conversationId: Self.source, senderId: "peer", content: content,
                              isEncrypted: true, encryptionMode: "e2ee", createdAt: Date(), updatedAt: Date())
        message.attachments = attachments
        return message
    }

    private func copy(_ messages: [Message], caption: String = "", chosenDurationSeconds: Int? = nil) -> ShareSendRequest {
        ShareSendRequest(
            subject: .messages(messages, sourceConversationId: Self.source, conversationIsEncrypted: true),
            keptMessageIds: messages.map(\.id), caption: caption, captionPlacement: caption.isEmpty ? nil : .separateMessage,
            grouping: .together, chosenDurationSeconds: chosenDurationSeconds, copyOnDevice: true
        )
    }

    private func protected(_ id: String, flags: MessageEffectFlags, duration: Int? = nil) -> Message {
        var message = encryptedMessage(id, content: "Bientôt parti")
        message.effects = MessageEffects(flags: flags, ephemeralDuration: duration)
        return message
    }

    // MARK: - La conversation RENDUE décide du chiffrement

    func test_aPersonWhoseDirectComesBackEncrypted_receivesNoPlaintext() async {
        let sut = makeSUT()
        sut.creator.result = .success(MeeshyConversation(id: "dm-1", identifier: "dm-1", type: .direct, encryptionMode: "e2ee"))
        stubSend(sut.api, to: "dm-1")

        let outcome = await sut.dispatcher.deliver(text("Le code est 4521"), to: person("bob"))

        guard case .failed = outcome else { return XCTFail("une directe chiffrée retrouvée à l'envoi ne reçoit rien en clair, reçu \(outcome)") }
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty, "aucun POST ne doit partir")
        let queued = await sut.queue.enqueuedItems
        XCTAssertTrue(queued.isEmpty, "la file hors ligne rejoue en clair : rien n'y entre non plus")
    }

    func test_aPersonWhoseDirectIsClear_receivesThePlainText() async throws {
        let sut = makeSUT()
        sut.creator.result = .success(MeeshyConversation(id: "dm-2", identifier: "dm-2", type: .direct))
        stubSend(sut.api, to: "dm-2")

        let outcome = await sut.dispatcher.deliver(text("Salut"), to: person("ann"))

        XCTAssertEqual(outcome, .sent(conversationId: "dm-2"))
        let sent = try body(sut.api)
        XCTAssertEqual(sent["content"] as? String, "Salut")
        XCTAssertNil(sent["isEncrypted"], "une conversation sans chiffrement de bout en bout reçoit le clair (#9224)")
    }

    func test_aForwardToAPersonWhoseDirectIsEncrypted_sendsNoPlainCaption() async {
        let sut = makeSUT()
        sut.creator.result = .success(MeeshyConversation(id: "dm-6", identifier: "dm-6", type: .direct, encryptionMode: "e2ee"))
        stubSend(sut.api, to: "dm-6")
        let message = Message(id: "m6", conversationId: Self.source, senderId: "peer", content: "Regarde", createdAt: Date(), updatedAt: Date())
        let request = ShareSendRequest(
            subject: .messages([message], sourceConversationId: Self.source, conversationIsEncrypted: false),
            keptMessageIds: ["m6"], caption: "Mon code : 4521", captionPlacement: .separateMessage,
            grouping: .together, chosenDurationSeconds: nil, copyOnDevice: false
        )

        _ = await sut.dispatcher.deliver(request, to: person("bob"))

        XCTAssertEqual(sut.forward.calls, 1)
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty, "la légende ne part pas en clair dans la directe chiffrée")
    }

    // MARK: - Rien vers une conversation chiffrée (D7, fail-closed)

    func test_anEncryptedConversation_receivesNothing_noBodyDeclaredEncryptedWithoutItsCipher() async {
        let sut = makeSUT()
        stubSend(sut.api, to: "dm-3")

        let outcome = await sut.dispatcher.deliver(text("Secret", caption: "pour toi"), to: conversation("dm-3", encrypted: true))

        guard case .failed(let reason) = outcome else { return XCTFail("reçu \(outcome)") }
        XCTAssertFalse(reason.isEmpty, "le refus dit son motif à la ligne")
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty,
                      "`isEncrypted: true` sans `encryptedContent` est refusé en 400 par la passerelle : rien ne doit partir")
    }

    func test_anEncryptedConversation_offline_queuesNothing() async {
        let sut = makeSUT(online: false)

        let outcome = await sut.dispatcher.deliver(text("Secret"), to: conversation("dm-4", encrypted: true))

        guard case .failed = outcome else { return XCTFail("reçu \(outcome)") }
        let queued = await sut.queue.enqueuedItems
        XCTAssertTrue(queued.isEmpty)
    }

    // MARK: - La copie sur l'appareil ne recopie que du clair PROUVÉ

    func test_copyOnDevice_refusesAMessageWhoseDecryptionIsNotProven() async {
        let sut = makeSUT(decrypted: [])
        stubSend(sut.api, to: "c-clear")
        let cipher = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9w"

        let outcome = await sut.dispatcher.deliver(copy([encryptedMessage("m1", content: cipher)]), to: conversation("c-clear"))

        guard case .failed = outcome else { return XCTFail("un chiffré non déchiffré ne sort jamais comme texte, reçu \(outcome)") }
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty)
    }

    func test_copyOnDevice_refusesAMessageWithPieces_ratherThanDroppingThemSilently() async {
        let sut = makeSUT(decrypted: ["m2"])
        stubSend(sut.api, to: "c-clear")
        let photo = MeeshyMessageAttachment(id: "att-1", mimeType: "image/jpeg", fileUrl: "https://x/a.jpg", uploadedBy: "peer")

        let outcome = await sut.dispatcher.deliver(copy([encryptedMessage("m2", content: "Regarde", attachments: [photo])]), to: conversation("c-clear"))

        guard case .failed = outcome else { return XCTFail("un envoi partiel n'est jamais annoncé « Envoyé », reçu \(outcome)") }
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty)
    }

    func test_copyOnDevice_postsTheProvenPlaintext_withItsProvenance() async throws {
        let sut = makeSUT(decrypted: ["m3"])
        stubSend(sut.api, to: "c-clear")

        let outcome = await sut.dispatcher.deliver(copy([encryptedMessage("m3", content: "Bonjour")]), to: conversation("c-clear"))

        XCTAssertEqual(outcome, .sent(conversationId: "c-clear"))
        let sent = try body(sut.api)
        XCTAssertEqual(sent["content"] as? String, "Bonjour")
        XCTAssertEqual(sent["forwardedFromId"] as? String, "m3")
        XCTAssertNil(sent["isEncrypted"])
        XCTAssertEqual(sut.forward.calls, 0, "la passerelle ne recopie rien d'une source chiffrée")
    }

    // MARK: - La copie sur l'appareil garde la protection de la source (#10958)

    func test_copyOnDevice_ofATimedFlame_carriesTheSourceDuration() async throws {
        let sut = makeSUT(decrypted: ["f1"])
        stubSend(sut.api, to: "c-clear")

        _ = await sut.dispatcher.deliver(copy([protected("f1", flags: .ephemeral, duration: 30)]), to: conversation("c-clear"))

        XCTAssertEqual(try body(sut.api)["ephemeralDuration"] as? Int, 30, "une flamme copiée sur l'appareil reste une flamme")
    }

    func test_copyOnDevice_ofATimedFlame_neverOutlivesItsSource() async throws {
        let sut = makeSUT(decrypted: ["f2", "f3"])
        stubSend(sut.api, to: "c-clear")

        _ = await sut.dispatcher.deliver(copy([protected("f2", flags: .ephemeral, duration: 30)], chosenDurationSeconds: 3_600), to: conversation("c-clear"))
        _ = await sut.dispatcher.deliver(copy([protected("f3", flags: .ephemeral, duration: 30)], chosenDurationSeconds: 10), to: conversation("c-clear"))

        XCTAssertEqual(try body(sut.api, at: 0)["ephemeralDuration"] as? Int, 30, "une durée choisie plus longue est ramenée à la source")
        XCTAssertEqual(try body(sut.api, at: 1)["ephemeralDuration"] as? Int, 10, "une durée choisie plus courte est gardée")
    }

    func test_copyOnDevice_ofABlurredMessage_staysBlurred() async throws {
        let sut = makeSUT(decrypted: ["b1"])
        stubSend(sut.api, to: "c-clear")

        _ = await sut.dispatcher.deliver(copy([protected("b1", flags: .blurred)]), to: conversation("c-clear"))

        XCTAssertEqual(try body(sut.api)["isBlurred"] as? Bool, true, "un flouté copié sur l'appareil reste flouté")
    }

    func test_copyOnDevice_ofAnOrdinaryMessage_carriesNoProtection() async throws {
        let sut = makeSUT(decrypted: ["o1"])
        stubSend(sut.api, to: "c-clear")

        _ = await sut.dispatcher.deliver(copy([encryptedMessage("o1", content: "Bonjour")]), to: conversation("c-clear"))

        let sent = try body(sut.api)
        XCTAssertNil(sent["ephemeralDuration"])
        XCTAssertNil(sent["isBlurred"])
    }

    func test_copyOnDevice_refusesAViewOnceOrAfterReadMessage() async {
        let sut = makeSUT(decrypted: ["v1", "r1"])
        stubSend(sut.api, to: "c-clear")

        let viewOnce = await sut.dispatcher.deliver(copy([protected("v1", flags: .viewOnce)]), to: conversation("c-clear"))
        let afterRead = await sut.dispatcher.deliver(copy([protected("r1", flags: .ephemeralAfterRead)]), to: conversation("c-clear"))

        guard case .failed = viewOnce, case .failed = afterRead else {
            return XCTFail("un contenu qui ne se transfère pas ne se copie pas davantage, reçu \(viewOnce) / \(afterRead)")
        }
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty)
    }

    func test_copyOnDevice_offline_queuesTheFlameWithItsProtection() async throws {
        let sut = makeSUT(online: false, decrypted: ["q1"])

        let outcome = await sut.dispatcher.deliver(copy([protected("q1", flags: [.ephemeral, .blurred], duration: 30)]), to: conversation("c-clear"))

        XCTAssertEqual(outcome, .queued(conversationId: "c-clear"))
        let queued = await sut.queue.enqueuedItems
        let item = try XCTUnwrap(queued.first)
        XCTAssertEqual(item.replayProtection.ephemeralDurationSeconds, 30, "le rejeu hors ligne garde la durée")
        XCTAssertTrue(item.replayProtection.isBlurred, "le rejeu hors ligne garde le flou")
        XCTAssertEqual(item.forwardedFromId, "q1")
    }

    func test_theCaptionOfACopiedFlame_carriesTheSameProtection() async throws {
        let sut = makeSUT(decrypted: ["c1"])
        stubSend(sut.api, to: "c-clear")

        _ = await sut.dispatcher.deliver(copy([protected("c1", flags: [.ephemeral, .blurred], duration: 30)], caption: "Regarde vite"),
                                         to: conversation("c-clear"))

        let caption = try body(sut.api, at: 1)
        XCTAssertEqual(caption["content"] as? String, "Regarde vite")
        XCTAssertEqual(caption["ephemeralDuration"] as? Int, 30, "la légende ne survit pas à ce qu'elle légende")
        XCTAssertEqual(caption["isBlurred"] as? Bool, true, "la légende d'un flouté est floutée")
    }

    func test_theCaptionOfACopy_neverGoesInClearToAnEncryptedConversation() async {
        let sut = makeSUT(decrypted: ["e1"])
        sut.creator.result = .success(MeeshyConversation(id: "dm-7", identifier: "dm-7", type: .direct, encryptionMode: "e2ee"))
        stubSend(sut.api, to: "dm-7")
        stubSend(sut.api, to: "dm-8")

        _ = await sut.dispatcher.deliver(copy([encryptedMessage("e1", content: "Bonjour")], caption: "Mon code : 4521"), to: person("bob"))
        _ = await sut.dispatcher.deliver(copy([encryptedMessage("e1", content: "Bonjour")], caption: "Mon code : 4521"),
                                         to: conversation("dm-8", encrypted: true))

        XCTAssertTrue(sut.api.lastPostBodies.isEmpty, "ni la copie ni sa légende ne partent en clair vers une conversation chiffrée")
        let queued = await sut.queue.enqueuedItems
        XCTAssertTrue(queued.isEmpty)
    }

    func test_copyOnDevice_towardAnEncryptedConversation_sendsNothing() async {
        let sut = makeSUT(decrypted: ["m4"])
        stubSend(sut.api, to: "dm-5")

        let outcome = await sut.dispatcher.deliver(copy([encryptedMessage("m4", content: "Bonjour")]), to: conversation("dm-5", encrypted: true))

        guard case .failed = outcome else { return XCTFail("reçu \(outcome)") }
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty)
    }
}

/// Le registre des messages DÉCHIFFRÉS sur l'appareil — la preuve que la copie
/// sur l'appareil exige, borné.
@MainActor
final class DecryptedMessageLedgerTests: XCTestCase {

    func test_aRecordedMessage_isProven_anOtherIsNot() {
        let ledger = DecryptedMessageLedger(capacity: 10)
        ledger.record(["a", "b"])
        XCTAssertTrue(ledger.contains("a"))
        XCTAssertFalse(ledger.contains("z"))
    }

    func test_theLedgerIsBounded_theOldestProofIsForgottenFirst() {
        let ledger = DecryptedMessageLedger(capacity: 2)
        ledger.record(["a"])
        ledger.record(["b"])
        ledger.record(["c"])
        XCTAssertFalse(ledger.contains("a"))
        XCTAssertTrue(ledger.contains("b"))
        XCTAssertTrue(ledger.contains("c"))
    }

    func test_removeAll_forgetsEveryProof() {
        let ledger = DecryptedMessageLedger(capacity: 10)
        ledger.record(["a"])
        ledger.removeAll()
        XCTAssertFalse(ledger.contains("a"))
    }
}
