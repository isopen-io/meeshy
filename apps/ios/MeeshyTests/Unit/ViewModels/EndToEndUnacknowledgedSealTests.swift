import XCTest
import GRDB
@testable import Meeshy
import MeeshyE2EE
import MeeshySDK

/// **Une réponse scellée restée en échec ne bloque pas une conversation
/// réellement en clair** (#13182, règles #12986 option 2 et #12987).
///
/// Ma ligne scellée jamais acquittée porte le régime qu'un envoi a CHOISI, pas
/// une preuve : au réveil à froid, une garde sans compte lié scelle par
/// fail-closed. Décision : elle scelle l'envoi suivant tant que la passerelle
/// n'a rien dit du régime pendant la session, et ne scelle plus rien une fois
/// la conversation servie en clair. L'envoi relit le statut quand mes seules
/// lignes non acquittées scelleraient. Ce que la passerelle a ADMIS (un message
/// `e2ee` servi, un avis d'activation) et la mémoire du compte scellent comme
/// avant. Le web ne compte que ce que la passerelle a admis.
@MainActor
final class EndToEndUnacknowledgedSealTests: XCTestCase {

    private let conversationId = "00000000000000000000d101"
    private let userId = "00000000000000000000d198"
    private let peerId = "00000000000000000000d177"
    private let text = "On se retrouve à 18 h"

    private func status(_ mode: String?) -> ConversationEncryptionStatus {
        ConversationEncryptionStatus(isEncrypted: mode != nil, mode: mode, epoch: mode == nil ? 0 : 1, canToggleEncryption: true)
    }

    private func mySealedFailedReply(at seconds: TimeInterval = 100) -> Message {
        var line = Message(
            id: "cid_\(UUID().uuidString.lowercased())", conversationId: conversationId, senderId: userId,
            content: E2EEWire.contentPlaceholder, messageSource: .user,
            isEncrypted: true, encryptionMode: E2EEWire.mode, createdAt: Date(timeIntervalSince1970: seconds)
        )
        line.isMe = true
        line.deliveryStatus = .failed
        return line
    }

    private func peerEndToEndMessage() -> Message {
        Message(
            conversationId: conversationId, senderId: peerId, content: "", messageSource: .user,
            isEncrypted: true, encryptionMode: E2EEWire.mode, createdAt: Date(timeIntervalSince1970: 50)
        )
    }

    private struct SUT {
        let viewModel: ConversationViewModel
        let messageService: MockMessageService
        let encryption: MockConversationEncryptionService
    }

    private func makeSUT(ledger: EndToEndRegimeLedger, encryption: MockConversationEncryptionService) async throws -> SUT {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "unacked", displayName: "Unacked"))
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
            encryptionMode: nil,
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

    // MARK: - Le registre

    func test_ledger_maLigneNonAcquittee_neScellePlus_uneFoisLaConversationServieEnClair() {
        let ledger = EndToEndRegimeLedger()
        ledger.learn(status(nil), for: conversationId)

        XCTAssertFalse(ledger.seals(for: conversationId, opening: nil, cached: nil, trail: [mySealedFailedReply()], isDirect: true))
    }

    func test_ledger_maLigneNonAcquittee_scelleEncore_tantQueLaPasserelleNaRienDit() {
        let ledger = EndToEndRegimeLedger()

        XCTAssertTrue(ledger.seals(for: conversationId, opening: nil, cached: nil, trail: [mySealedFailedReply()], isDirect: true),
                      "fail-closed : sans statut servi, la ligne scelle")
    }

    func test_ledger_unMessageAdmisParLaPasserelle_scelleToujours_memeServiEnClair() {
        let ledger = EndToEndRegimeLedger()
        ledger.learn(status(nil), for: conversationId)

        XCTAssertTrue(ledger.seals(for: conversationId, opening: nil, cached: nil, trail: [peerEndToEndMessage(), mySealedFailedReply()], isDirect: true),
                      "option 2 de #12986 : un message e2ee servi scelle")
    }

    // MARK: - L'envoi

    func test_send_maSeuleLigneScelleeEnEchec_relitLeStatut_etUneConversationEnClairEnvoieEnClair() async throws {
        let encryption = MockConversationEncryptionService()
        encryption.statusResult = .success(status(nil))
        let sut = try await makeSUT(ledger: EndToEndRegimeLedger(), encryption: encryption)
        sut.viewModel.messages = [mySealedFailedReply()]

        let result = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertTrue(result.isAccepted, "\(result)")
        XCTAssertEqual(encryption.fetchStatusCallCount, 1, "le régime est relu avant l'envoi")
        XCTAssertEqual(sut.messageService.lastSendRequest?.isEncrypted, false)
        XCTAssertEqual(sut.messageService.lastSendRequest?.content, text, "la conversation est en clair : elle n'est plus bloquée")
    }

    func test_send_maSeuleLigneScelleeEnEchec_statutIllisible_resteScelle() async throws {
        let encryption = MockConversationEncryptionService()
        encryption.statusResult = .failure(URLError(.notConnectedToInternet))
        let sut = try await makeSUT(ledger: EndToEndRegimeLedger(), encryption: encryption)
        sut.viewModel.messages = [mySealedFailedReply()]

        _ = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertNotEqual(sut.messageService.lastSendRequest?.content, text, "relecture impossible : jamais de clair")
        if let request = sut.messageService.lastSendRequest {
            XCTAssertEqual(request.isEncrypted, true)
        }
    }

    func test_send_uneConversationServieChiffree_resteScellee() async throws {
        let encryption = MockConversationEncryptionService()
        encryption.statusResult = .success(status(E2EEWire.mode))
        let ledger = EndToEndRegimeLedger()
        let sut = try await makeSUT(ledger: ledger, encryption: encryption)
        sut.viewModel.messages = [mySealedFailedReply()]

        _ = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertTrue(ledger.remembersEndToEnd(conversationId), "le statut e2ee servi s'apprend")
        XCTAssertNotEqual(sut.messageService.lastSendRequest?.content, text)
    }

    func test_send_unFilScelleParUneAutreSource_neRelitPasLeStatut() async throws {
        let encryption = MockConversationEncryptionService()
        let sut = try await makeSUT(ledger: EndToEndRegimeLedger(), encryption: encryption)
        sut.viewModel.messages = [peerEndToEndMessage(), mySealedFailedReply()]

        _ = await sut.viewModel.send(outgoingMessage(content: text, conversationId: conversationId))

        XCTAssertEqual(encryption.fetchStatusCallCount, 0, "le fil est prouvé chiffré : rien à relire")
        XCTAssertNotEqual(sut.messageService.lastSendRequest?.content, text)
    }
}
