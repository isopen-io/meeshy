import XCTest
import GRDB
import Combine
@testable import Meeshy
import MeeshyE2EE
import MeeshySDK

/// **Le chiffrement d'une conversation est commutable** (#12522, spec
/// 2026-10-23 § 5) : le fil OUVERT apprend la bascule — de la fiche, du socket
/// ou d'un refus serveur — et l'envoi suivant suit le nouveau régime, sans
/// recharger. Le régime appris porte son ÉPOQUE : une observation plus
/// ancienne n'efface jamais une plus récente, et un envoi scellé déclare
/// l'époque sous laquelle il l'a été.
@MainActor
final class ConversationViewModelEncryptionToggleTests: XCTestCase {

    private let conversationId = "00000000000000000000ce01"
    private let userId = "00000000000000000000ce98"
    private let peerId = "00000000000000000000cd77"
    private let secret = "Le code du coffre est 4512"

    private struct SUT {
        let viewModel: ConversationViewModel
        let messageService: MockMessageService
        let encryption: MockConversationEncryptionService
    }

    private func makeSUT(
        encryptionMode: String? = "e2ee",
        ledger: EndToEndRegimeLedger = EndToEndRegimeLedger(),
        encryption: MockConversationEncryptionService = MockConversationEncryptionService()
    ) async throws -> SUT {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "toggle", displayName: "Toggle"))
        let messageService = MockMessageService()
        let socket = MockMessageSocket()
        socket.isConnected = false
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let viewModel = ConversationViewModel(
            conversationId: conversationId,
            isDirect: true,
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
                    messageService: messageService, regimeLedger: ledger, encryptionService: encryption
                )
            ),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: FakeOfflineMessageQueue(),
            endToEnd: MockEndToEndMessaging()
        )
        viewModel.start()
        return SUT(viewModel: viewModel, messageService: messageService, encryption: encryption)
    }

    private func status(_ mode: String?, epoch: Int?) -> ConversationEncryptionStatus {
        ConversationEncryptionStatus(isEncrypted: mode != nil, mode: mode, epoch: epoch, canToggleEncryption: true)
    }

    // MARK: - Le registre du régime

    func test_ledger_uneDesactivationPlusRecente_rendLeClair() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(status("e2ee", epoch: 1), for: conversationId)
        ledger.learn(status(nil, epoch: 2), for: conversationId)

        XCTAssertNil(ledger.mode(for: conversationId))
        XCTAssertEqual(ledger.regime(for: conversationId), EndToEndRegimeLedger.Regime(isEndToEnd: false, epoch: 2))
    }

    func test_ledger_uneObservationPlusAncienne_nEffaceJamaisLaPlusRecente() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(status(nil, epoch: 4), for: conversationId)
        ledger.learn(status("e2ee", epoch: 3), for: conversationId)

        XCTAssertNil(ledger.mode(for: conversationId))
        XCTAssertEqual(ledger.regime(for: conversationId)?.epoch, 4)
    }

    func test_ledger_unRefusDuClairParLaPasserelle_rendLeBoutEnBout() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(status(nil, epoch: 2), for: conversationId)
        ledger.learnEndToEnd(for: conversationId)

        XCTAssertEqual(ledger.mode(for: conversationId), "e2ee")
    }

    func test_ledger_unEvenementSocket_basculeLeRegime() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(ConversationEncryptionChangedEvent(
            conversationId: conversationId, isEncrypted: false, mode: nil, epoch: 7,
            changedByUserId: peerId, changedAt: "2026-10-25T10:00:00.000Z"
        ))

        XCTAssertEqual(ledger.regime(for: conversationId), EndToEndRegimeLedger.Regime(isEndToEnd: false, epoch: 7))
    }

    func test_ledger_ecouteLeCanalDesBascules_etApprendChaqueAnnonce() {
        let ledger = EndToEndRegimeLedger()
        let channel = PassthroughSubject<ConversationEncryptionChangedEvent, Never>()
        let subscription = ledger.listen(to: channel.eraseToAnyPublisher())

        channel.send(ConversationEncryptionChangedEvent(
            conversationId: conversationId, isEncrypted: true, mode: "e2ee", epoch: 9,
            changedByUserId: peerId, changedAt: "2026-10-25T10:00:00.000Z"
        ))

        XCTAssertEqual(ledger.regime(for: conversationId), EndToEndRegimeLedger.Regime(isEndToEnd: true, epoch: 9))
        subscription.cancel()
    }

    // MARK: - L'envoi suit le régime appris

    func test_send_chiffrementDesactiveDansLeFilOuvert_lEnvoiSuivantPartEnClair() async throws {
        let ledger = EndToEndRegimeLedger()
        let sut = try await makeSUT(encryptionMode: "e2ee", ledger: ledger)
        ledger.learn(status(nil, epoch: 2), for: conversationId)

        _ = await sut.viewModel.send(outgoingMessage(content: "Bonjour", conversationId: conversationId))

        let request = try XCTUnwrap(sut.messageService.lastSendRequest)
        XCTAssertNotEqual(request.isEncrypted, true, "la conversation n'est plus chiffrée")
        XCTAssertNil(request.envelopes)
        XCTAssertEqual(request.content, "Bonjour")
    }

    func test_send_e2ee_declareLEpoqueSousLaquelleIlEstScelle() async throws {
        let ledger = EndToEndRegimeLedger()
        let sut = try await makeSUT(encryptionMode: nil, ledger: ledger)
        ledger.learn(status("e2ee", epoch: 3), for: conversationId)

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        let request = try XCTUnwrap(sut.messageService.lastSendRequest)
        XCTAssertEqual(request.encryptionMetadata?.regimeEpoch, 3)
        XCTAssertEqual(request.isEncrypted, true)
    }

    func test_send_regimeChangeCoteServeur_refusLisible_etLeRegimeEstRelu() async throws {
        let encryption = MockConversationEncryptionService()
        encryption.statusResult = .success(status(nil, epoch: 5))
        let ledger = EndToEndRegimeLedger()
        let sut = try await makeSUT(encryptionMode: "e2ee", ledger: ledger, encryption: encryption)
        sut.messageService.sendResult = .failure(MeeshyError.rejected(APIRejection(statusCode: 409, code: E2EEErrorCode.regimeChanged, message: "changé")))

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.regimeChanged)) = result else {
            return XCTFail("refus « régime changé » attendu, reçu \(result)")
        }
        await sut.viewModel.collaborators.regimeRefresher.settle()
        XCTAssertEqual(encryption.fetchStatusCallCount, 1)
        XCTAssertEqual(ledger.regime(for: conversationId), EndToEndRegimeLedger.Regime(isEndToEnd: false, epoch: 5))
        XCTAssertEqual(sut.messageService.sendCallCount, 1, "rien n'est renvoyé en clair sans le geste de l'utilisateur")
    }
}
