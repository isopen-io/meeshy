import XCTest
import GRDB
import CryptoKit
@testable import Meeshy
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
        encryptor: DirectMessageEncrypting,
        encryptionMode: String? = "e2ee",
        isDirect: Bool = true,
        online: Bool = true
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
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: online),
            offlineQueue: queue,
            messageEncryptor: encryptor
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
        let sut = try await makeSUT(encryptor: FailingEncryptor())

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.sessionUnavailable)) = result else {
            return XCTFail("refus de chiffrement attendu, reçu \(result)")
        }
        await assertNothingLeftInClear(sut)
    }

    func test_send_e2eeSansSession_laBulleResteEnEchecAvecSonMotif() async throws {
        let sut = try await makeSUT(encryptor: FailingEncryptor())

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        let record = try XCTUnwrap(try onlyRecord(in: sut.pool), "la bulle optimiste reste au fil")
        XCTAssertEqual(record.state, .failed)
        XCTAssertEqual(record.lastError, EndToEndSendRefusal.sessionUnavailable.userMessage)
    }

    func test_send_e2eeHorsLigne_rienNeVaDansLaFile() async throws {
        let sut = try await makeSUT(encryptor: SucceedingEncryptor(), online: false)

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.outboxUnsealable)) = result else {
            return XCTFail("la file hors ligne ne garde que du clair : refus attendu, reçu \(result)")
        }
        await assertNothingLeftInClear(sut)
        XCTAssertEqual(try onlyRecord(in: sut.pool)?.state, .failed)
    }

    func test_send_e2eeGroupe_refuseFaute_deChiffrementDeGroupe() async throws {
        let sut = try await makeSUT(encryptor: SucceedingEncryptor(), isDirect: false)

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.recipientUnsealable)) = result else {
            return XCTFail("refus attendu, reçu \(result)")
        }
        await assertNothingLeftInClear(sut)
    }

    func test_send_e2eeLieuPartage_refuse() async throws {
        let sut = try await makeSUT(encryptor: SucceedingEncryptor())
        let place = SharedPlace(latitude: 48.85, longitude: 2.35, name: "Paris")

        let result = await sut.viewModel.send(outgoingMessage(content: "", conversationId: conversationId, location: place))

        guard case .failure(.endToEndUnsealed(.contentUnsealable)) = result else {
            return XCTFail("un lieu partirait en clair : refus attendu, reçu \(result)")
        }
        await assertNothingLeftInClear(sut)
    }

    func test_send_e2eePiecesJointes_refusees() async throws {
        let sut = try await makeSUT(encryptor: SucceedingEncryptor())

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId, attachmentIds: ["a1"]))

        guard case .failure(.endToEndUnsealed(.contentUnsealable)) = result else {
            return XCTFail("refus attendu, reçu \(result)")
        }
        await assertNothingLeftInClear(sut)
    }

    func test_send_e2eeModeInconnu_echoueFerme() async throws {
        let sut = try await makeSUT(encryptor: FailingEncryptor(), encryptionMode: "signal-v2")

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        await assertNothingLeftInClear(sut)
    }

    // MARK: - E2EE avec session

    func test_send_e2eeAvecSession_partChiffreParREST() async throws {
        let sut = try await makeSUT(encryptor: SucceedingEncryptor())

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        XCTAssertEqual(sut.socket.sendViaSocketFallbackCallCount, 0,
                       "un message chiffré ne part jamais par le socket-first")
        XCTAssertEqual(sut.messageService.lastSendRequest?.isEncrypted, true)
        XCTAssertEqual(sut.messageService.lastSendRequest?.encryptionMode, "E2EE")
        XCTAssertNotEqual(sut.messageService.lastSendRequest?.content, secret)
    }

    func test_send_e2eeReponse_partChiffree() async throws {
        let sut = try await makeSUT(encryptor: SucceedingEncryptor())
        let reply = outgoingMessage(content: secret, conversationId: conversationId, relation: .reply(to: MessageID("m1"), citing: nil))

        _ = await sut.viewModel.send(reply)

        XCTAssertEqual(sut.messageService.lastSendRequest?.isEncrypted, true)
        XCTAssertEqual(sut.messageService.lastSendRequest?.replyToId, "m1")
        XCTAssertNotEqual(sut.messageService.lastSendRequest?.content, secret)
    }

    func test_send_e2eeRESTEchoue_leClairNEntreJamaisDansLaFile() async throws {
        let sut = try await makeSUT(encryptor: SucceedingEncryptor())
        sut.messageService.sendResult = .failure(URLError(.timedOut))

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.outboxUnsealable)) = result else {
            return XCTFail("un chiffré raté ne se rejoue pas en clair : refus attendu, reçu \(result)")
        }
        let queued = await sut.queue.enqueuedItems
        XCTAssertTrue(queued.isEmpty, "la file de relance porterait le texte en clair")
        XCTAssertTrue(sut.socket.sendViaSocketFallbackCalls.allSatisfy { $0.content != secret && $0.isEncrypted },
                      "le repli socket ne porte que le chiffré")
        XCTAssertEqual(try onlyRecord(in: sut.pool)?.state, .failed)
    }

    // MARK: - Sans E2EE

    func test_send_sansE2EE_partEnClairMemeAvecUneSession() async throws {
        let sut = try await makeSUT(encryptor: SucceedingEncryptor(), encryptionMode: nil)
        sut.socket.sendViaSocketFallbackResult = MessageSocketManager.SendMessageAck(
            messageId: "00000000000000000000cd56", clientMessageId: nil
        )

        let sent = await sut.viewModel.send(outgoingMessage(content: "Salut", conversationId: conversationId)).isAccepted

        XCTAssertTrue(sent)
        XCTAssertEqual(sut.socket.lastSendViaSocketFallbackIsEncrypted, false)
        XCTAssertEqual(sut.socket.sendViaSocketFallbackCalls.first?.content, "Salut")
    }

    func test_send_sansE2EE_sessionIndisponible_neMarqueJamaisLaBulleEnEchec() async throws {
        let sut = try await makeSUT(encryptor: FailingEncryptor(), encryptionMode: "server")
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
        let sut = try await makeSUT(encryptor: FailingEncryptor())

        await sut.viewModel.editMessage(messageId: "00000000000000000000cd44", newContent: secret)

        XCTAssertEqual(sut.messageService.editCallCount, 0, "l'édition partirait en clair")
        let edits = await sut.queue.enqueuedEdits
        XCTAssertTrue(edits.isEmpty)
        XCTAssertEqual(sut.viewModel.error, EndToEndSendRefusal.editUnsealable.userMessage)
    }

    func test_editMessage_sansE2EE_partAuServeur() async throws {
        let sut = try await makeSUT(encryptor: FailingEncryptor(), encryptionMode: nil)

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

    func test_prepareUpload_e2ee_sealsContent_setsE2EEMode() async throws {
        let sut = try await makeSUT(encryptor: SucceedingEncryptor())

        let payload = try await sut.viewModel.prepareUpload(makeOutgoing(), context: makeContext()).get()

        XCTAssertTrue(payload.isEncrypted)
        XCTAssertEqual(payload.request.isEncrypted, true)
        XCTAssertEqual(payload.request.encryptionMode, "E2EE")
        XCTAssertEqual(payload.request.content, payload.content)
        XCTAssertNotEqual(payload.content, "Salut")
        XCTAssertEqual(payload.request.clientMessageId, "cid_prepare")
    }

    func test_prepareUpload_e2eeEncryptorThrows_refusesSessionUnavailable() async throws {
        let sut = try await makeSUT(encryptor: FailingEncryptor())

        let sealed = await sut.viewModel.prepareUpload(makeOutgoing(), context: makeContext())

        guard case .failure(.sessionUnavailable) = sealed else {
            return XCTFail("aucun repli en clair : refus attendu, reçu \(sealed)")
        }
    }

    func test_prepareUpload_sansE2EE_keepsPlaintext() async throws {
        let sut = try await makeSUT(encryptor: SucceedingEncryptor(), encryptionMode: nil)

        let payload = try await sut.viewModel.prepareUpload(makeOutgoing(), context: makeContext()).get()

        XCTAssertFalse(payload.isEncrypted)
        XCTAssertEqual(payload.content, "Salut")
        XCTAssertNil(payload.request.isEncrypted)
        XCTAssertNil(payload.request.encryptionMode)
    }
}

private struct FailingEncryptor: DirectMessageEncrypting {
    func encryptMessage(_ payload: Data, for userId: String, conversationId: String) async throws -> Data {
        throw SessionManager.SessionError.sessionUnavailable
    }
}

private struct SucceedingEncryptor: DirectMessageEncrypting {
    func encryptMessage(_ payload: Data, for userId: String, conversationId: String) async throws -> Data {
        Data(payload.reversed())
    }
}
