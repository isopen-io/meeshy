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

    private func makeSUT(online: Bool = true) -> SUT {
        let api = MockAPIClientForApp()
        let queue = FakeOfflineMessageQueue()
        let creator = MockConversationCreator()
        let forward = SpyForward()
        let dispatcher = LiveShareDispatcher(
            forwardService: forward, api: api, queue: queue, isOnline: { online },
            conversationCreator: creator, postService: MockPostService(),
            currentUserId: { "me" }, destinationGuard: .isolated()
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

    /// Un message de la source chiffrée ; `decryptedOnDevice` passe son texte
    /// par l'UNIQUE porte du clair déchiffré (`adoptDecryptedContent`).
    private func encryptedMessage(_ id: String, content: String, attachments: [MessageAttachment] = [],
                                  decryptedOnDevice: Bool = true) -> Message {
        var message = Message(id: id, conversationId: Self.source, senderId: "peer", content: content,
                              isEncrypted: true, encryptionMode: "e2ee", createdAt: Date(), updatedAt: Date())
        message.attachments = attachments
        if decryptedOnDevice { message.adoptDecryptedContent(content) }
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

    // MARK: - Un fichier venu d'une autre app garde son nom (#11531)

    /// Le partage relayé par l'extension rouvre l'écran sur des copies nommées
    /// `0.jpg` : la file reçoit le nom d'origine, aligné sur chaque fichier.
    func test_incomingMedia_queuesTheOriginalNamesAlignedWithTheFiles() async {
        let sut = makeSUT()
        let incoming = ShareIncoming(media: [
            ShareIncomingMedia(id: "s/0.jpg", mimeType: "image/jpeg", bytes: 4,
                               fileURL: URL(fileURLWithPath: "/tmp/s/0.jpg"), originalName: "IMG_0111.jpg"),
            ShareIncomingMedia(id: "s/1.mp4", mimeType: "video/mp4", bytes: 4,
                               fileURL: URL(fileURLWithPath: "/tmp/s/1.mp4")),
        ])
        let request = ShareSendRequest(subject: .incoming(incoming), keptMessageIds: [], caption: "", captionPlacement: nil,
                                       grouping: .together, chosenDurationSeconds: nil, copyOnDevice: false)

        _ = await sut.dispatcher.deliver(request, to: conversation("c1"))

        let calls = await sut.queue.enqueuedMediaCalls
        XCTAssertEqual(calls.first?.originalNames, ["IMG_0111.jpg", nil])
    }

    // MARK: - Chiffrée sur le serveur ≠ chiffrée de bout en bout (#12978)

    private func incomingPhoto() -> ShareSendRequest {
        let incoming = ShareIncoming(media: [
            ShareIncomingMedia(id: "s/0.jpg", mimeType: "image/jpeg", bytes: 4,
                               fileURL: URL(fileURLWithPath: "/tmp/s/0.jpg"), originalName: "IMG_0112.jpg"),
        ])
        return ShareSendRequest(subject: .incoming(incoming), keptMessageIds: [], caption: "", captionPlacement: nil,
                                grouping: .together, chosenDurationSeconds: nil, copyOnDevice: false)
    }

    private func served(_ id: String, mode: String?) -> ShareRecipient {
        ShareRecipient(conversation: MeeshyConversation(id: id, identifier: id, type: .group, encryptionMode: mode))
    }

    /// Le serveur reçoit le clair en `server` et en `hybrid`, et le chiffre lui-même :
    /// une photo venue d'une autre app y part.
    func test_incomingMedia_toAConversationEncryptedOnTheServer_leaves() async {
        for mode in ["server", "hybrid", "SERVER"] {
            let sut = makeSUT()

            let outcome = await sut.dispatcher.deliver(incomingPhoto(), to: served("c-\(mode)", mode: mode))

            XCTAssertEqual(outcome, .queued(conversationId: "c-\(mode)"), "mode \(mode)")
            let calls = await sut.queue.enqueuedMediaCalls
            XCTAssertEqual(calls.count, 1, "mode \(mode) : la photo entre dans la file d'envoi")
        }
    }

    func test_text_toAConversationEncryptedOnTheServer_leavesInClear() async throws {
        let sut = makeSUT()
        stubSend(sut.api, to: "c-srv")

        let outcome = await sut.dispatcher.deliver(text("Salut"), to: served("c-srv", mode: "server"))

        XCTAssertEqual(outcome, .sent(conversationId: "c-srv"))
        XCTAssertEqual(try body(sut.api)["content"] as? String, "Salut")
    }

    /// Le bout en bout, et un mode que l'appareil ne connaît pas, restent fermés.
    func test_incomingMedia_toAnEndToEndConversation_isRefusedAndSaysWhy() async {
        for mode in ["e2ee", "inconnu"] {
            let sut = makeSUT()

            let outcome = await sut.dispatcher.deliver(incomingPhoto(), to: served("c-\(mode)", mode: mode))

            guard case .failed(let reason) = outcome else { return XCTFail("mode \(mode) : reçu \(outcome)") }
            XCTAssertFalse(reason.isEmpty, "le refus se dit à la ligne")
            let calls = await sut.queue.enqueuedMediaCalls
            XCTAssertTrue(calls.isEmpty, "mode \(mode) : rien n'entre dans la file, qui enverrait le clair")
        }
    }

    func test_aPersonWhoseDirectIsEncryptedOnTheServer_receivesThePlainText() async throws {
        let sut = makeSUT()
        sut.creator.result = .success(MeeshyConversation(id: "dm-7", identifier: "dm-7", type: .direct, encryptionMode: "hybrid"))
        stubSend(sut.api, to: "dm-7")

        let outcome = await sut.dispatcher.deliver(text("Salut"), to: person("eve"))

        XCTAssertEqual(outcome, .sent(conversationId: "dm-7"))
    }

    func test_theRecipientLine_isMarkedEncryptedOnlyForEndToEnd() {
        XCTAssertFalse(served("a", mode: nil).isEncrypted)
        XCTAssertFalse(served("b", mode: "server").isEncrypted)
        XCTAssertFalse(served("c", mode: "hybrid").isEncrypted)
        XCTAssertTrue(served("d", mode: "e2ee").isEncrypted)
        XCTAssertTrue(served("e", mode: "E2EE").isEncrypted)
        XCTAssertTrue(served("f", mode: "inconnu").isEncrypted)
    }

    // MARK: - Un refus de transfert se dit dans la langue du lecteur (#12978)

    private final class RefusingForward: MessageForwardServiceProviding {
        let outcome: ForwardOutcome
        init(_ outcome: ForwardOutcome) { self.outcome = outcome }
        func forward(message: Message, sourceConversationId: String?, to targetConversationId: String, chosenDurationSeconds: Int?, forwardedAttachmentIds: [String]?) async -> ForwardOutcome { outcome }
        func forward(message: Message, sourceConversationId: String?, to target: ShareRecipient, chosenDurationSeconds: Int?, forwardedAttachmentIds: [String]?) async -> ForwardOutcome { outcome }
    }

    func test_aServerRefusalOfAText_isSaidByTheCatalog_whateverTheErrorType() async {
        let refusals: [any Error] = [
            MeeshyError.server(statusCode: 400, message: "Un message à vue unique ne peut pas être transféré"),
            MeeshyError.rejected(APIRejection(statusCode: 400, code: "E2EE_PLAINTEXT_REFUSED",
                                              message: "Cette conversation est chiffrée de bout en bout : le serveur n’accepte aucun message en clair")),
        ]
        let expected = [ForwardRefusalReason.viewOnce.explanation, ForwardRefusalReason.encryptedDestination.explanation]
        for (error, explanation) in zip(refusals, expected) {
            let sut = makeSUT()
            sut.api.errorToThrow = error

            let outcome = await sut.dispatcher.deliver(text("Salut"), to: conversation("c-9"))

            XCTAssertEqual(outcome, .failed(reason: explanation))
        }
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
        let sut = makeSUT()
        stubSend(sut.api, to: "c-clear")
        let cipher = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9w"

        let outcome = await sut.dispatcher.deliver(copy([encryptedMessage("m1", content: cipher, decryptedOnDevice: false)]),
                                                   to: conversation("c-clear"))

        guard case .failed = outcome else { return XCTFail("un chiffré non déchiffré ne sort jamais comme texte, reçu \(outcome)") }
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty)
    }

    // MARK: - Le clair se reconnaît par sa PROVENANCE, jamais par un registre (#11402)

    /// Un texte que la passerelle forge dans une conversation chiffrée n'a pas
    /// de provenance : il ne sort jamais de l'appareil comme un clair déchiffré.
    func test_copyOnDevice_refusesAForgedClearWithoutProvenance() async {
        let sut = makeSUT()
        stubSend(sut.api, to: "c-clear")

        let outcome = await sut.dispatcher.deliver(copy([encryptedMessage("g1", content: "Texte forgé", decryptedOnDevice: false)]),
                                                   to: conversation("c-clear"))

        guard case .failed = outcome else { return XCTFail("un texte sans provenance ne se recopie pas, reçu \(outcome)") }
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty)
    }

    /// Le registre en mémoire prouvait qu'un cryptogramme de CET id avait été
    /// déchiffré un jour, pas que le texte remis en était la sortie.
    func test_copyOnDevice_refusesAContentRewrittenAfterDecryption() async {
        let sut = makeSUT()
        stubSend(sut.api, to: "c-clear")
        var rewritten = encryptedMessage("w1", content: "Rendez-vous à midi")
        rewritten.content = "Rendez-vous à minuit"

        let outcome = await sut.dispatcher.deliver(copy([rewritten]), to: conversation("c-clear"))

        guard case .failed = outcome else { return XCTFail("un texte réécrit après déchiffrement ne se recopie pas, reçu \(outcome)") }
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty)
    }

    /// Un clair réel en base64 valide, déchiffré sur l'appareil, se recopie.
    func test_copyOnDevice_postsABase64LookingClear_decryptedOnTheDevice() async throws {
        let sut = makeSUT()
        stubSend(sut.api, to: "c-clear")
        let base64Clear = Data(repeating: 0x78, count: 40).base64EncodedString()

        let outcome = await sut.dispatcher.deliver(copy([encryptedMessage("b64", content: base64Clear)]), to: conversation("c-clear"))

        XCTAssertEqual(outcome, .sent(conversationId: "c-clear"))
        XCTAssertEqual(try body(sut.api)["content"] as? String, base64Clear)
    }

    func test_copyOnDevice_refusesAMessageWithPieces_ratherThanDroppingThemSilently() async {
        let sut = makeSUT()
        stubSend(sut.api, to: "c-clear")
        let photo = MeeshyMessageAttachment(id: "att-1", mimeType: "image/jpeg", fileUrl: "https://x/a.jpg", uploadedBy: "peer")

        let outcome = await sut.dispatcher.deliver(copy([encryptedMessage("m2", content: "Regarde", attachments: [photo])]), to: conversation("c-clear"))

        guard case .failed = outcome else { return XCTFail("un envoi partiel n'est jamais annoncé « Envoyé », reçu \(outcome)") }
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty)
    }

    func test_copyOnDevice_postsTheProvenPlaintext_withItsProvenance() async throws {
        let sut = makeSUT()
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
        let sut = makeSUT()
        stubSend(sut.api, to: "c-clear")

        _ = await sut.dispatcher.deliver(copy([protected("f1", flags: .ephemeral, duration: 30)]), to: conversation("c-clear"))

        XCTAssertEqual(try body(sut.api)["ephemeralDuration"] as? Int, 30, "une flamme copiée sur l'appareil reste une flamme")
    }

    func test_copyOnDevice_ofATimedFlame_neverOutlivesItsSource() async throws {
        let sut = makeSUT()
        stubSend(sut.api, to: "c-clear")

        _ = await sut.dispatcher.deliver(copy([protected("f2", flags: .ephemeral, duration: 30)], chosenDurationSeconds: 3_600), to: conversation("c-clear"))
        _ = await sut.dispatcher.deliver(copy([protected("f3", flags: .ephemeral, duration: 30)], chosenDurationSeconds: 10), to: conversation("c-clear"))

        XCTAssertEqual(try body(sut.api, at: 0)["ephemeralDuration"] as? Int, 30, "une durée choisie plus longue est ramenée à la source")
        XCTAssertEqual(try body(sut.api, at: 1)["ephemeralDuration"] as? Int, 10, "une durée choisie plus courte est gardée")
    }

    func test_copyOnDevice_ofABlurredMessage_staysBlurred() async throws {
        let sut = makeSUT()
        stubSend(sut.api, to: "c-clear")

        _ = await sut.dispatcher.deliver(copy([protected("b1", flags: .blurred)]), to: conversation("c-clear"))

        XCTAssertEqual(try body(sut.api)["isBlurred"] as? Bool, true, "un flouté copié sur l'appareil reste flouté")
    }

    func test_copyOnDevice_ofAnOrdinaryMessage_carriesNoProtection() async throws {
        let sut = makeSUT()
        stubSend(sut.api, to: "c-clear")

        _ = await sut.dispatcher.deliver(copy([encryptedMessage("o1", content: "Bonjour")]), to: conversation("c-clear"))

        let sent = try body(sut.api)
        XCTAssertNil(sent["ephemeralDuration"])
        XCTAssertNil(sent["isBlurred"])
    }

    func test_copyOnDevice_refusesAViewOnceOrAfterReadMessage() async {
        let sut = makeSUT()
        stubSend(sut.api, to: "c-clear")

        let viewOnce = await sut.dispatcher.deliver(copy([protected("v1", flags: .viewOnce)]), to: conversation("c-clear"))
        let afterRead = await sut.dispatcher.deliver(copy([protected("r1", flags: .ephemeralAfterRead)]), to: conversation("c-clear"))

        guard case .failed = viewOnce, case .failed = afterRead else {
            return XCTFail("un contenu qui ne se transfère pas ne se copie pas davantage, reçu \(viewOnce) / \(afterRead)")
        }
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty)
    }

    func test_copyOnDevice_offline_queuesTheFlameWithItsProtection() async throws {
        let sut = makeSUT(online: false)

        let outcome = await sut.dispatcher.deliver(copy([protected("q1", flags: [.ephemeral, .blurred], duration: 30)]), to: conversation("c-clear"))

        XCTAssertEqual(outcome, .queued(conversationId: "c-clear"))
        let queued = await sut.queue.enqueuedItems
        let item = try XCTUnwrap(queued.first)
        XCTAssertEqual(item.replayProtection.ephemeralDurationSeconds, 30, "le rejeu hors ligne garde la durée")
        XCTAssertTrue(item.replayProtection.isBlurred, "le rejeu hors ligne garde le flou")
        XCTAssertEqual(item.forwardedFromId, "q1")
    }

    func test_theCaptionOfACopiedFlame_carriesTheSameProtection() async throws {
        let sut = makeSUT()
        stubSend(sut.api, to: "c-clear")

        _ = await sut.dispatcher.deliver(copy([protected("c1", flags: [.ephemeral, .blurred], duration: 30)], caption: "Regarde vite"),
                                         to: conversation("c-clear"))

        let caption = try body(sut.api, at: 1)
        XCTAssertEqual(caption["content"] as? String, "Regarde vite")
        XCTAssertEqual(caption["ephemeralDuration"] as? Int, 30, "la légende ne survit pas à ce qu'elle légende")
        XCTAssertEqual(caption["isBlurred"] as? Bool, true, "la légende d'un flouté est floutée")
    }

    func test_theCaptionOfACopy_neverGoesInClearToAnEncryptedConversation() async {
        let sut = makeSUT()
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
        let sut = makeSUT()
        stubSend(sut.api, to: "dm-5")

        let outcome = await sut.dispatcher.deliver(copy([encryptedMessage("m4", content: "Bonjour")]), to: conversation("dm-5", encrypted: true))

        guard case .failed = outcome else { return XCTFail("reçu \(outcome)") }
        XCTAssertTrue(sut.api.lastPostBodies.isEmpty)
    }
}
