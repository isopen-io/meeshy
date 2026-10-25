import XCTest
import GRDB
import CryptoKit
import Combine
@testable import Meeshy
import MeeshyE2EE
import MeeshySDK

/// **Un message d'une conversation chiffrée ne part jamais en clair** (#11379,
/// directives #9224 et #9229).
///
/// Jusqu'ici (#8221), une session E2EE indisponible faisait partir le texte EN
/// CLAIR dans une conversation `e2ee` : la passerelle le refuse désormais
/// (#11216), mais le clair avait déjà traversé le réseau. Le client échoue
/// fermé : aucun transport n'est appelé, rien n'entre dans la file hors ligne,
/// et la bulle reste en échec, renvoyable.
///
/// Hors E2EE, le texte part en clair — même vers un pair qui a une session :
/// le chiffrement suit le RÉGIME de la conversation, jamais l'opportunité.
///
/// En E2EE, il part sous libsignal (#3707) : des enveloppes par appareil, ni
/// `content` ni langue sur le fil, REST seulement, et un 409 Sesame rechiffre.
@MainActor
final class ConversationViewModelDirectEncryptionSendTests: XCTestCase {

    private let conversationId = "00000000000000000000cd01"
    private let userId = "00000000000000000000cd98"
    private let peerId = "00000000000000000000cd77"
    private let secret = "Le code du coffre est 4512"

    override func setUp() async throws {
        try await super.setUp()
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        APIClient.shared.anonymousSessionToken = nil
        try await super.tearDown()
    }

    private struct SUT {
        let viewModel: ConversationViewModel
        let messageService: MockMessageService
        let socket: MockMessageSocket
        let queue: FakeOfflineMessageQueue
        let pool: DatabaseQueue
    }

    private func makeSUT(
        endToEnd: MockEndToEndMessaging,
        encryptionMode: String? = "e2ee",
        isDirect: Bool = true,
        online: Bool = true,
        ledger: EndToEndRegimeLedger = EndToEndRegimeLedger()
    ) async throws -> SUT {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "direct", displayName: "Direct"))
        let messageService = MockMessageService()
        let socket = MockMessageSocket()
        socket.isConnected = true
        let queue = FakeOfflineMessageQueue()
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let viewModel = ConversationViewModel(
            conversationId: conversationId,
            isDirect: isDirect,
            participantUserId: peerId,
            encryptionMode: encryptionMode,
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: socket,
            dependencies: ConversationDependencies(
                dbPool: pool, persistence: persistence,
                collaborators: ConversationCollaborators(
                    persistence: persistence, syncEngine: ConversationSyncEngine.shared,
                    messageService: messageService, regimeLedger: ledger
                )
            ),
            networkMonitor: FakeNetworkMonitor(isOnline: online),
            offlineQueue: queue,
            endToEnd: endToEnd
        )
        viewModel.start()
        return SUT(viewModel: viewModel, messageService: messageService, socket: socket, queue: queue, pool: pool)
    }

    private func onlyRecord(in pool: DatabaseQueue) throws -> MessageRecord? {
        try pool.read { db in try MessageRecord.fetchAll(db) }.first
    }

    /// Le témoin à deux bouts : aucun octet du clair n'a atteint un transport
    /// (REST, socket-first, repli socket) ni la file hors ligne.
    private func assertNothingLeftInClear(_ sut: SUT, file: StaticString = #filePath, line: UInt = #line) async {
        XCTAssertEqual(sut.messageService.sendCallCount, 0, "aucun POST REST", file: file, line: line)
        XCTAssertEqual(sut.socket.sendViaSocketFallbackCallCount, 0, "aucune émission socket", file: file, line: line)
        XCTAssertEqual(sut.socket.sendWithAttachmentsCallCount, 0, "aucun envoi socket avec pièces", file: file, line: line)
        let queued = await sut.queue.enqueuedItems
        XCTAssertTrue(queued.isEmpty, "rien dans la file hors ligne", file: file, line: line)
    }

    // MARK: - E2EE sans session

    func test_send_e2eeSansSession_neToucheAucunTransport() async throws {
        let sut = try await makeSUT(endToEnd: failingEndToEnd())

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.sessionUnavailable)) = result else {
            return XCTFail("refus de chiffrement attendu, reçu \(result)")
        }
        await assertNothingLeftInClear(sut)
    }

    func test_send_e2eeSansSession_laBulleResteEnEchecAvecSonMotif() async throws {
        let sut = try await makeSUT(endToEnd: failingEndToEnd())

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        let record = try XCTUnwrap(try onlyRecord(in: sut.pool), "la bulle optimiste reste au fil")
        XCTAssertEqual(record.state, .failed)
        XCTAssertEqual(record.lastError, EndToEndSendRefusal.sessionUnavailable.userMessage)
    }

    func test_send_e2eeHorsLigne_rienNeVaDansLaFile() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd(), online: false)

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.outboxUnsealable)) = result else {
            return XCTFail("la file hors ligne ne garde que du clair : refus attendu, reçu \(result)")
        }
        await assertNothingLeftInClear(sut)
        XCTAssertEqual(try onlyRecord(in: sut.pool)?.state, .failed)
    }

    func test_send_e2eeGroupe_refuseFaute_deChiffrementDeGroupe() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd(), isDirect: false)

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.recipientUnsealable)) = result else {
            return XCTFail("refus attendu, reçu \(result)")
        }
        await assertNothingLeftInClear(sut)
    }

    func test_send_e2eeLieuPartage_refuse() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd())
        let place = SharedPlace(latitude: 48.85, longitude: 2.35, name: "Paris")

        let result = await sut.viewModel.send(outgoingMessage(content: "", conversationId: conversationId, location: place))

        guard case .failure(.endToEndUnsealed(.contentUnsealable)) = result else {
            return XCTFail("un lieu partirait en clair : refus attendu, reçu \(result)")
        }
        await assertNothingLeftInClear(sut)
    }

    func test_send_e2eePiecesJointes_refusees() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd())

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId, attachmentIds: ["a1"]))

        guard case .failure(.endToEndUnsealed(.contentUnsealable)) = result else {
            return XCTFail("refus attendu, reçu \(result)")
        }
        await assertNothingLeftInClear(sut)
    }

    func test_send_e2eeModeInconnu_echoueFerme() async throws {
        let sut = try await makeSUT(endToEnd: failingEndToEnd(), encryptionMode: "signal-v2")

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        await assertNothingLeftInClear(sut)
    }

    // MARK: - E2EE avec session

    func test_send_e2eeAvecSession_partChiffreParREST() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd())

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        XCTAssertEqual(sut.socket.sendViaSocketFallbackCallCount, 0,
                       "un message chiffré ne part jamais par le socket-first")
        let request = try XCTUnwrap(sut.messageService.lastSendRequest)
        XCTAssertEqual(request.isEncrypted, true)
        XCTAssertEqual(request.encryptionMode, "e2ee")
        XCTAssertEqual(request.encryptionProtocol, "libsignal-v1")
        XCTAssertEqual(request.envelopes?.count, 1)
        XCTAssertNil(request.content, "le texte ne voyage que dans les enveloppes")
        XCTAssertNil(request.originalLanguage, "la langue détectée non plus")
        try assertNoPlaintext(in: request)
    }

    /// Le corps encodé, tel qu'il part : aucun octet du secret.
    private func assertNoPlaintext(in request: SendMessageRequest, file: StaticString = #filePath, line: UInt = #line) throws {
        let body = String(decoding: try JSONEncoder().encode(request), as: UTF8.self)
        XCTAssertFalse(body.contains(secret), "le clair n'est nulle part dans le corps", file: file, line: line)
    }

    func test_send_e2ee_scelleLeTexteSaLangueEtSaPlace() async throws {
        let e2ee = MockEndToEndMessaging()
        let sut = try await makeSUT(endToEnd: e2ee)

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        let content = try XCTUnwrap(e2ee.deliveredContents.first)
        XCTAssertEqual(content.text, secret)
        XCTAssertEqual(content.conversationId, conversationId)
        XCTAssertEqual(content.clientMessageId, sut.messageService.lastSendRequest?.clientMessageId)
    }

    func test_send_e2ee_unRefusSesame_rechiffreEtRenvoie() async throws {
        let e2ee = MockEndToEndMessaging()
        let sut = try await makeSUT(endToEnd: e2ee)
        let mismatch = E2EEDevicesMismatch(missing: [E2EEDeviceRef(userId: peerId, deviceId: 2)])
        sut.messageService.sendResults = [.failure(MeeshyError.rejected(APIRejection(
            statusCode: 409, code: E2EEErrorCode.devicesMismatch, message: "Appareils", e2eeMismatch: mismatch
        )))]

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        XCTAssertTrue(result.isAccepted, "\(result)")
        XCTAssertEqual(e2ee.deliverAttempts, 2)
        XCTAssertEqual(sut.messageService.sendCallCount, 2)
        XCTAssertEqual(Set(sut.messageService.sentRequests.map(\.clientMessageId)).count, 1, "le même message, rechiffré")
    }

    func test_send_e2ee_leClairDeMonMessageResteSurLAppareil_sousSesDeuxIdentifiants() async throws {
        let e2ee = MockEndToEndMessaging()
        let sut = try await makeSUT(endToEnd: e2ee)

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        let cid = try XCTUnwrap(sut.messageService.lastSendRequest?.clientMessageId)
        guard case .readable(let mine, let author)? = e2ee.remembered[cid],
              case .readable? = e2ee.remembered["000000000000000000000001"] else {
            return XCTFail("le clair est rangé sous l'identifiant client et l'identifiant serveur")
        }
        XCTAssertEqual(mine.text, secret)
        XCTAssertEqual(author, userId)
    }

    func test_send_e2ee_correspondantSansAppareil_refuseLisiblement() async throws {
        let e2ee = MockEndToEndMessaging()
        e2ee.sealError = E2EESealError.recipientHasNoDevice(userId: peerId)
        let sut = try await makeSUT(endToEnd: e2ee)

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.recipientWithoutEncryptedDevice)) = result else {
            return XCTFail("refus lisible attendu, reçu \(result)")
        }
        await assertNothingLeftInClear(sut)
        XCTAssertEqual(try onlyRecord(in: sut.pool)?.lastError, EndToEndSendRefusal.recipientWithoutEncryptedDevice.userMessage)
    }

    func test_send_e2ee_compteAuMaximumDAppareils_ouvreLEcranDeRetrait() async throws {
        let e2ee = MockEndToEndMessaging()
        e2ee.sealError = E2EEEnrollmentError.deviceLimitReached
        let sut = try await makeSUT(endToEnd: e2ee)
        let screen = expectation(forNotification: .endToEndDeviceLimitReached, object: nil)

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.deviceLimitReached)) = result else {
            return XCTFail("refus attendu, reçu \(result)")
        }
        await fulfillment(of: [screen], timeout: 1)
        await assertNothingLeftInClear(sut)
    }

    func test_send_e2eeReponse_partChiffree() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd())
        let reply = outgoingMessage(content: secret, conversationId: conversationId, relation: .reply(to: MessageID("m1"), citing: nil))

        _ = await sut.viewModel.send(reply)

        XCTAssertEqual(sut.messageService.lastSendRequest?.isEncrypted, true)
        XCTAssertEqual(sut.messageService.lastSendRequest?.replyToId, "m1")
        try assertNoPlaintext(in: try XCTUnwrap(sut.messageService.lastSendRequest))
    }

    func test_send_e2eeRESTEchoue_leClairNEntreJamaisDansLaFile() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd())
        sut.messageService.sendResult = .failure(URLError(.timedOut))

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.outboxUnsealable)) = result else {
            return XCTFail("un chiffré raté ne se rejoue pas en clair : refus attendu, reçu \(result)")
        }
        let queued = await sut.queue.enqueuedItems
        XCTAssertTrue(queued.isEmpty, "la file de relance porterait le texte en clair")
        XCTAssertEqual(sut.socket.sendViaSocketFallbackCallCount, 0, "le socket ne porte pas d'enveloppes : aucun repli")
        XCTAssertEqual(try onlyRecord(in: sut.pool)?.state, .failed)
    }

    // MARK: - Le régime appris en cours de fil

    private var serverPlaintextRefusal: MeeshyError {
        .rejected(APIRejection(statusCode: 400, code: EndToEndSendGate.serverPlaintextRefusalCode, message: "Conversation chiffrée"))
    }

    /// Le fil ignorait le régime (ligne d'ouverture et cache muets) : le refus
    /// serveur l'arrête net — ni repli socket, ni outbox —, et l'envoi suivant
    /// ne part plus en clair.
    func test_send_regimeInconnu_refusServeur_neRejoueRien_etLEnvoiSuivantNePartPlusEnClair() async throws {
        let sut = try await makeSUT(endToEnd: failingEndToEnd(), encryptionMode: nil)
        sut.socket.isConnected = false
        sut.messageService.sendResult = .failure(serverPlaintextRefusal)

        let first = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.plaintextRefusedByServer)) = first else {
            return XCTFail("refus définitif attendu, reçu \(first)")
        }
        XCTAssertEqual(sut.messageService.sendCallCount, 1)
        XCTAssertEqual(sut.socket.sendViaSocketFallbackCallCount, 0, "le clair refusé ne repart pas par le socket")
        let queued = await sut.queue.enqueuedItems
        XCTAssertTrue(queued.isEmpty, "le clair refusé n'entre pas dans l'outbox")

        let second = await sut.viewModel.send(outgoingMessage(content: "Et le second", conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.sessionUnavailable)) = second else {
            return XCTFail("le fil a appris le régime : refus de scellement attendu, reçu \(second)")
        }
        XCTAssertEqual(sut.messageService.sendCallCount, 1, "plus aucun clair ne part")
        XCTAssertEqual(sut.socket.sendViaSocketFallbackCallCount, 0)
    }

    /// Activer le chiffrement depuis la fiche du fil OUVERT : le registre du
    /// régime le dit au fil, et l'envoi suivant est scellé.
    func test_send_chiffrementActiveDansLeFilOuvert_lEnvoiSuivantEstScelle() async throws {
        let ledger = EndToEndRegimeLedger()
        let sut = try await makeSUT(endToEnd: workingEndToEnd(), encryptionMode: nil, ledger: ledger)
        ledger.learn(mode: "e2ee", for: conversationId)

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        XCTAssertEqual(sut.socket.sendViaSocketFallbackCallCount, 0, "aucun socket-first en clair")
        XCTAssertEqual(sut.messageService.lastSendRequest?.isEncrypted, true)
        try assertNoPlaintext(in: try XCTUnwrap(sut.messageService.lastSendRequest))
    }

    func test_regimeLedger_unModeLisibleParLeServeur_neScelleRien() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(mode: "server", for: conversationId)

        XCTAssertNil(ledger.mode(for: conversationId))
        ledger.learn(mode: "e2ee", for: conversationId)
        ledger.learn(mode: "server", for: conversationId)
        XCTAssertEqual(ledger.mode(for: conversationId), "e2ee", "l'activation ne se défait pas")
    }

    /// Le geste du jour et la flamme ne se posent que pour un message qui PART.
    func test_send_e2eeRefuse_neRejouePasLaFlamme() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd(), isDirect: false)
        var replays: [String] = []
        let subscription = HeaderFlameReplay.sent.sink { replays.append($0) }
        defer { subscription.cancel() }

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        XCTAssertFalse(replays.contains(conversationId), "rien n'est parti : la flamme ne se rejoue pas")
    }

    func test_send_sansE2EE_rejoueLaFlamme() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd(), encryptionMode: nil)
        sut.socket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "00000000000000000000cd57", clientMessageId: nil
        )
        var replays: [String] = []
        let subscription = HeaderFlameReplay.sent.sink { replays.append($0) }
        defer { subscription.cancel() }

        _ = await sut.viewModel.send(outgoingMessage(content: "Salut", conversationId: conversationId))

        XCTAssertTrue(replays.contains(conversationId))
    }

    // MARK: - La réponse dans un fil (ThreadView)

    private final class SealedSendLog {
        var outgoing: [OutgoingMessage] = []
    }

    private func makeThreadDispatcher(
        sut: SUT,
        online: Bool = true,
        log: SealedSendLog
    ) -> ThreadReplyDispatcher {
        ThreadReplyDispatcher(
            conversationId: conversationId,
            parentMessageId: "00000000000000000000cd33",
            requiresSeal: { sut.viewModel.endToEndSealer.requiresSeal },
            sendThroughConversation: { outgoing in
                log.outgoing.append(outgoing)
                return await sut.viewModel.send(outgoing)
            },
            messageService: sut.messageService,
            offlineQueue: sut.queue,
            isOnline: { online }
        )
    }

    /// Le fil de réponses passait À CÔTÉ du scelleur : POST en clair en ligne,
    /// clair dans l'outbox hors ligne. En E2EE, il passe par l'envoi de la
    /// conversation — scellé ou refusé, jamais en clair.
    func test_threadReply_e2ee_passeParLEnvoiDeLaConversation_aucunClair() async throws {
        let sut = try await makeSUT(endToEnd: failingEndToEnd())
        let log = SealedSendLog()

        let outcome = try await makeThreadDispatcher(sut: sut, log: log).dispatch(text: secret, clientMessageId: "cid_thread")

        XCTAssertEqual(outcome, .refused(EndToEndSendRefusal.sessionUnavailable.userMessage))
        XCTAssertEqual(log.outgoing.first?.relation, .reply(to: MessageID("00000000000000000000cd33"), citing: nil))
        XCTAssertNil(log.outgoing.first?.reusedClientMessageId, "la conversation pose sa propre bulle")
        await assertNothingLeftInClear(sut)
    }

    func test_threadReply_e2eeHorsLigne_rienNeVaDansLaFile() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd(), online: false)
        let log = SealedSendLog()

        let outcome = try await makeThreadDispatcher(sut: sut, online: false, log: log).dispatch(text: secret, clientMessageId: "cid_thread")

        XCTAssertEqual(outcome, .refused(EndToEndSendRefusal.outboxUnsealable.userMessage))
        await assertNothingLeftInClear(sut)
    }

    func test_threadReply_e2eeAvecSession_partChiffree() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd())
        let log = SealedSendLog()

        _ = try await makeThreadDispatcher(sut: sut, log: log).dispatch(text: secret, clientMessageId: "cid_thread")

        XCTAssertEqual(sut.messageService.lastSendRequest?.isEncrypted, true)
        XCTAssertEqual(sut.messageService.lastSendRequest?.replyToId, "00000000000000000000cd33")
        try assertNoPlaintext(in: try XCTUnwrap(sut.messageService.lastSendRequest))
    }

    func test_threadReply_sansE2EE_gardeSonChemin_RESTenLigne_fileHorsLigne() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd(), encryptionMode: nil)
        let log = SealedSendLog()

        let sent = try await makeThreadDispatcher(sut: sut, log: log).dispatch(text: "Salut", clientMessageId: "cid_on")
        let queued = try await makeThreadDispatcher(sut: sut, online: false, log: log).dispatch(text: "Hors ligne", clientMessageId: "cid_off")

        XCTAssertEqual(sent, .sent)
        XCTAssertEqual(queued, .queued)
        XCTAssertTrue(log.outgoing.isEmpty)
        XCTAssertEqual(sut.messageService.lastSendRequest?.content, "Salut")
        XCTAssertEqual(sut.messageService.lastSendRequest?.replyToId, "00000000000000000000cd33")
        let items = await sut.queue.enqueuedItems
        XCTAssertEqual(items.map(\.content), ["Hors ligne"])
    }

    // MARK: - Sans E2EE

    func test_send_sansE2EE_partEnClairMemeAvecUneSession() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd(), encryptionMode: nil)
        sut.socket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "00000000000000000000cd56", clientMessageId: nil
        )

        let sent = await sut.viewModel.send(outgoingMessage(content: "Salut", conversationId: conversationId)).isAccepted

        XCTAssertTrue(sent)
        XCTAssertEqual(sut.socket.lastSendViaSocketFallbackIsEncrypted, false)
        XCTAssertEqual(sut.socket.sendViaSocketFallbackCalls.first?.content, "Salut")
    }

    func test_send_sansE2EE_sessionIndisponible_neMarqueJamaisLaBulleEnEchec() async throws {
        let sut = try await makeSUT(endToEnd: failingEndToEnd(), encryptionMode: "server")
        sut.socket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "00000000000000000000cd55", clientMessageId: nil
        )

        let sent = await sut.viewModel.send(outgoingMessage(content: "Salut", conversationId: conversationId)).isAccepted

        XCTAssertTrue(sent)
        let cid = try XCTUnwrap(sut.socket.lastSendViaSocketFallbackClientMessageId)
        let record = try await sut.pool.read { db in try MessageRecord.fetchOne(db, key: cid) }
        XCTAssertEqual(record?.state, .sent)
        XCTAssertNil(record?.lastError)
    }

    // MARK: - Édition

    func test_editMessage_e2ee_refuseeSansAppelReseau() async throws {
        let sut = try await makeSUT(endToEnd: failingEndToEnd())

        await sut.viewModel.editMessage(messageId: "00000000000000000000cd44", newContent: secret)

        XCTAssertEqual(sut.messageService.editCallCount, 0, "l'édition partirait en clair")
        let edits = await sut.queue.enqueuedEdits
        XCTAssertTrue(edits.isEmpty)
        XCTAssertEqual(sut.viewModel.error, EndToEndSendRefusal.editUnsealable.userMessage)
    }

    /// #12881 — un message scellé sous e2ee reste chiffré à jamais (spec § 5.2) :
    /// même après une désactivation que l'utilisateur a VUE (#12846), son clair
    /// déchiffré sur l'appareil ne part pas.
    func test_editMessage_messageScelleApresDesactivation_refuseSansAppelReseau() async throws {
        let ledger = EndToEndRegimeLedger()
        ledger.learn(ConversationEncryptionStatus(isEncrypted: false, mode: nil, epoch: 2), for: conversationId)
        ledger.confirmDowngrade(epoch: 2, for: conversationId)
        let sut = try await makeSUT(endToEnd: failingEndToEnd(), encryptionMode: nil, ledger: ledger)
        var sealed = Message(
            id: "00000000000000000000cd44", conversationId: conversationId, senderId: userId,
            content: "", isEncrypted: true, encryptionMode: "e2ee"
        )
        sealed.adoptDecryptedContent(secret)
        sut.viewModel.messages = [sealed]

        await sut.viewModel.editMessage(messageId: sealed.id, newContent: secret + " (corrigé)")

        XCTAssertEqual(sut.messageService.editCallCount, 0, "le clair d'un message scellé partirait au serveur")
        let edits = await sut.queue.enqueuedEdits
        XCTAssertTrue(edits.isEmpty)
        XCTAssertEqual(sut.viewModel.error, EndToEndSendRefusal.sealedMessageUneditable.userMessage)
    }

    func test_editMessage_messageEnClairApresDesactivation_partAuServeur() async throws {
        let sut = try await makeSUT(endToEnd: failingEndToEnd(), encryptionMode: nil)
        sut.viewModel.messages = [Message(
            id: "00000000000000000000cd44", conversationId: conversationId, senderId: userId, content: "Salut"
        )]

        await sut.viewModel.editMessage(messageId: "00000000000000000000cd44", newContent: "Salut !")

        XCTAssertEqual(sut.messageService.editCallCount, 1)
    }

    func test_editMessage_sansE2EE_partAuServeur() async throws {
        let sut = try await makeSUT(endToEnd: failingEndToEnd(), encryptionMode: nil)

        await sut.viewModel.editMessage(messageId: "00000000000000000000cd44", newContent: "Salut")

        XCTAssertEqual(sut.messageService.editCallCount, 1)
    }

    // MARK: - prepareUpload

    private func makeOutgoing(_ content: String = "Salut") -> OutgoingMessage {
        OutgoingMessage(
            conversationId: ConversationID(conversationId),
            content: content,
            relation: .none,
            attachments: OutgoingAttachments(ids: nil, previews: nil)
        )
    }

    private func makeContext() -> SendAttemptContext {
        SendAttemptContext(
            clientMessageId: MessageID("cid_prepare"),
            startedAt: Date(),
            intent: .none,
            language: "fr",
            reusesExistingRow: false
        )
    }

    func test_prepareUpload_sansE2EE_keepsPlaintext() async throws {
        let sut = try await makeSUT(endToEnd: workingEndToEnd(), encryptionMode: nil)

        let payload = sut.viewModel.prepareUpload(makeOutgoing(), context: makeContext())

        XCTAssertFalse(payload.isEncrypted)
        XCTAssertEqual(payload.content, "Salut")
        XCTAssertNil(payload.request.isEncrypted)
        XCTAssertNil(payload.request.encryptionMode)
    }
}

private func failingEndToEnd() -> MockEndToEndMessaging {
    let failing = MockEndToEndMessaging()
    failing.sealError = E2EESessionCipherError.malformedBundle
    return failing
}

private func workingEndToEnd() -> MockEndToEndMessaging { MockEndToEndMessaging() }
