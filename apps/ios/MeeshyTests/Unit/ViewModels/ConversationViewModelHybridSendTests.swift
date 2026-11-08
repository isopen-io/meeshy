import XCTest
import GRDB
@testable import Meeshy
import MeeshyE2EE
import MeeshySDK

/// **Le mode hybride chiffre deux fois** (#14369).
///
/// Dans un tête-à-tête hybride, le texte part en clair vers la passerelle
/// (couche serveur) ET scellé pour chaque appareil (couche appareil), dans la
/// même requête REST. Sans couche appareil possible, l'envoi part quand même,
/// en couche serveur seule : l'hybride ne bloque jamais l'utilisateur.
@MainActor
final class ConversationViewModelHybridSendTests: XCTestCase {

    private let conversationId = "00000000000000000000cd01"
    private let userId = "00000000000000000000cd98"
    private let peerId = "00000000000000000000cd77"
    private let text = "Rendez-vous à 18 h"

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
    }

    private func makeSUT(endToEnd: MockEndToEndMessaging, encryptionMode: String? = "hybrid", isDirect: Bool = true) async throws -> SUT {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "hybride", displayName: "Hybride"))
        let messageService = MockMessageService()
        let socket = MockMessageSocket()
        socket.isConnected = false
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
                persistence: persistence,
                collaborators: ConversationCollaborators(
                    persistence: persistence, syncEngine: ConversationSyncEngine.shared,
                    messageService: messageService, regimeLedger: EndToEndRegimeLedger()
                )
            ),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: FakeOfflineMessageQueue(),
            endToEnd: endToEnd
        )
        viewModel.start()
        return SUT(viewModel: viewModel, messageService: messageService, socket: socket)
    }

    func test_send_hybridDirect_postsTheTextAndTheDeviceLayer_inOneRequest() async throws {
        let e2ee = MockEndToEndMessaging()
        let sut = try await makeSUT(endToEnd: e2ee)

        let result = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertTrue(result.isAccepted, "\(result)")
        let request = try XCTUnwrap(sut.messageService.lastSendRequest)
        XCTAssertEqual(request.content, text, "la couche serveur porte le clair")
        XCTAssertEqual(request.encryptionMode, "hybrid")
        XCTAssertEqual(request.encryptionProtocol, "libsignal-v1")
        XCTAssertEqual(request.envelopes?.count, 1, "la couche appareil : une enveloppe par appareil")
        XCTAssertNil(request.encryptedContent, "aucun marqueur de chiffré : la passerelle scelle la couche serveur")
        XCTAssertNil(request.isEncrypted)
        XCTAssertEqual(e2ee.deliveredContents.first?.text, text, "la couche appareil scelle le même texte")
        XCTAssertEqual(e2ee.deliveredContents.first?.clientMessageId, request.clientMessageId)
    }

    func test_send_hybridWithoutSession_stillSendsTheServerLayer() async throws {
        let e2ee = MockEndToEndMessaging()
        e2ee.sealError = E2EESessionCipherError.malformedBundle
        let sut = try await makeSUT(endToEnd: e2ee)

        let result = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertTrue(result.isAccepted, "l'hybride ne bloque jamais l'utilisateur : \(result)")
        let request = try XCTUnwrap(sut.messageService.lastSendRequest)
        XCTAssertEqual(request.content, text)
        XCTAssertNil(request.envelopes, "sans couche appareil, aucune enveloppe ne prétend la porter")
        XCTAssertNil(request.encryptionProtocol)
    }

    func test_send_hybridPeerWithoutEncryptedDevice_stillSendsTheServerLayer() async throws {
        let e2ee = MockEndToEndMessaging()
        e2ee.sealError = E2EESealError.recipientHasNoDevice(userId: peerId)
        let sut = try await makeSUT(endToEnd: e2ee)

        let result = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertTrue(result.isAccepted, "\(result)")
        XCTAssertNil(sut.messageService.lastSendRequest?.envelopes)
    }

    func test_send_hybridDeviceLayerRefused_resendsTheServerLayerOnly_underTheSameIdentifier() async throws {
        let sut = try await makeSUT(endToEnd: MockEndToEndMessaging())
        sut.messageService.sendResults = [.failure(MeeshyError.rejected(APIRejection(
            statusCode: 409, code: E2EEErrorCode.regimeChanged, message: "Régime"
        )))]

        let result = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertTrue(result.isAccepted, "\(result)")
        XCTAssertEqual(sut.messageService.sendCallCount, 2)
        XCTAssertNotNil(sut.messageService.sentRequests.first?.envelopes)
        XCTAssertNil(sut.messageService.sentRequests.last?.envelopes)
        XCTAssertEqual(Set(sut.messageService.sentRequests.map(\.clientMessageId)).count, 1, "le même message, sans doublon")
    }

    func test_send_hybridGroup_sendsTheServerLayerOnly() async throws {
        let e2ee = MockEndToEndMessaging()
        let sut = try await makeSUT(endToEnd: e2ee, isDirect: false)

        _ = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertEqual(e2ee.deliverCallCount, 0, "l'appareil ne scelle pas encore pour un groupe")
        XCTAssertNil(sut.messageService.lastSendRequest?.envelopes)
        XCTAssertEqual(sut.messageService.lastSendRequest?.content, text)
    }

    func test_send_hybridWithAttachment_sendsTheServerLayerOnly() async throws {
        let e2ee = MockEndToEndMessaging()
        let sut = try await makeSUT(endToEnd: e2ee)

        _ = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId, attachmentIds: ["a1"]))

        XCTAssertEqual(e2ee.deliverCallCount, 0)
        XCTAssertNil(sut.messageService.lastSendRequest?.envelopes)
    }

    func test_send_serverMode_neverSealsADeviceLayer() async throws {
        let e2ee = MockEndToEndMessaging()
        let sut = try await makeSUT(endToEnd: e2ee, encryptionMode: "server")

        _ = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertEqual(e2ee.deliverCallCount, 0)
        XCTAssertNil(sut.messageService.lastSendRequest?.envelopes)
    }

    func test_degradesToServerLayer_keepsTransportFailuresAndPlaintextRefusalsForTheRecovery() {
        let plaintextRefused = MeeshyError.rejected(APIRejection(statusCode: 400, code: EndToEndSendGate.serverPlaintextRefusalCode, message: "e2ee"))
        let mismatch = MeeshyError.rejected(APIRejection(statusCode: 409, code: E2EEErrorCode.devicesMismatch, message: "Sesame"))

        XCTAssertFalse(EndToEndSendSealer.degradesToServerLayer(URLError(.timedOut)))
        XCTAssertFalse(EndToEndSendSealer.degradesToServerLayer(CancellationError()))
        XCTAssertFalse(EndToEndSendSealer.degradesToServerLayer(plaintextRefused), "le clair ne retraverse pas une conversation devenue e2ee")
        XCTAssertTrue(EndToEndSendSealer.degradesToServerLayer(mismatch))
        XCTAssertTrue(EndToEndSendSealer.degradesToServerLayer(E2EESealError.recipientHasNoDevice(userId: "p")))
    }
}
