import XCTest
import GRDB
@testable import Meeshy
import MeeshyE2EE
import MeeshySDK

/// **Un envoi scellé écrit sa ligne scellée, même si la trace qui le scellait
/// quitte le fil pendant l'envoi** (#13181, modèle de menace : appareil volé).
///
/// L'envoi lit le régime UNE fois (`EndToEndSendSealer`), range le clair au
/// coffre, puis pose sa ligne optimiste. Une trace qui ne s'apprend pas (un
/// message chiffré sans mode) peut quitter `messages` pendant le rangement :
/// rechargement de fenêtre, suppression. La ligne, l'aperçu de liste et
/// l'acquittement suivent le scelleur CAPTURÉ, jamais un régime relu.
@MainActor
final class EndToEndCapturedSealTests: XCTestCase {

    private let conversationId = "00000000000000000000cf01"
    private let userId = "00000000000000000000cf98"
    private let peerId = "00000000000000000000cf77"
    private let serverId = "00000000000000000000cf51"

    private struct SUT {
        let viewModel: ConversationViewModel
        let messageService: MockMessageService
        let endToEnd: MockEndToEndMessaging
        let pool: DatabaseQueue
    }

    private func makeSUT(online: Bool) async throws -> SUT {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "captured", displayName: "Captured"))
        let messageService = MockMessageService()
        let socket = MockMessageSocket()
        socket.isConnected = false
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let endToEnd = MockEndToEndMessaging()
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
                    messageService: messageService, regimeLedger: EndToEndRegimeLedger()
                )
            ),
            networkMonitor: FakeNetworkMonitor(isOnline: online),
            offlineQueue: FakeOfflineMessageQueue(),
            endToEnd: endToEnd
        )
        viewModel.start()
        let row = Conversation(id: conversationId, identifier: conversationId, type: .direct, title: "Pair",
                               lastMessageAt: Date(timeIntervalSince1970: 1))
        try await CacheCoordinator.shared.conversations.save([row], for: "list")
        return SUT(viewModel: viewModel, messageService: messageService, endToEnd: endToEnd, pool: pool)
    }

    /// Un message chiffré SANS mode : il scelle l'envoi en cours, sans jamais
    /// s'apprendre dans la mémoire du compte (#12985).
    private func modelessTrace() -> Message {
        Message(
            conversationId: conversationId, senderId: peerId, content: "", messageSource: .user,
            isEncrypted: true, encryptionMode: nil, createdAt: Date(timeIntervalSince1970: 100)
        )
    }

    /// La trace quitte le fil PENDANT que le clair se range au coffre.
    private func traceLeavesDuringKeep(_ sut: SUT) {
        sut.viewModel.messages = [modelessTrace()]
        sut.endToEnd.onRemember = { [weak viewModel = sut.viewModel] in
            viewModel?.messages = []
        }
    }

    private func sentinel() -> String { "sentinelle-\(UUID().uuidString)" }

    /// Les octets de la table des messages, colonnes de texte comprises.
    private func storedTexts(in pool: DatabaseQueue) throws -> String {
        try pool.read { db in
            try String.fetchAll(db, sql: "SELECT COALESCE(content, '') || ' ' || COALESCE(CAST(replyToJson AS TEXT), '') FROM messages")
        }.joined(separator: "\n")
    }

    private func diskList() async throws -> String {
        let caches = CacheCoordinator.shared
        await caches.conversations.flushDirtyKeys()
        await caches.conversations.evictL1()
        let list = await caches.conversations.loadIgnoringExpiry(for: "list")?.items ?? []
        return String(decoding: try JSONEncoder().encode(list), as: UTF8.self)
    }

    private func settleListWrites() async {
        for _ in 0..<20 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 200_000_000)
    }

    func test_enLigne_laTraceScellanteQuitteLeFilPendantLeRangement_laLigneNaitScellee() async throws {
        let sut = try await makeSUT(online: true)
        traceLeavesDuringKeep(sut)
        sut.messageService.sendResult = .success(JSONStub.decode("""
        {"id":"\(serverId)","conversationId":"\(conversationId)","senderId":"\(userId)","content":"\(E2EEWire.contentPlaceholder)","isEncrypted":true,"encryptionMode":"\(E2EEWire.mode)","messageType":"text","createdAt":"2026-10-26T12:00:00.000Z"}
        """))
        let secret = sentinel()

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))
        await settleListWrites()

        XCTAssertEqual(sut.messageService.lastSendRequest?.isEncrypted, true, "l'envoi part scellé")
        XCTAssertNotEqual(sut.messageService.lastSendRequest?.content, secret)
        XCTAssertFalse(try storedTexts(in: sut.pool).contains(secret), "la ligne optimiste ne porte pas le clair")
        let list = try await diskList()
        XCTAssertFalse(list.contains(secret), "ni l'aperçu optimiste ni l'aperçu acquitté ne portent le clair")
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
    }

    func test_horsLigne_laTraceScellanteQuitteLeFilPendantLeRangement_laLigneNaitScellee() async throws {
        let sut = try await makeSUT(online: false)
        traceLeavesDuringKeep(sut)
        let secret = sentinel()

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))
        await settleListWrites()

        guard case .failure(.endToEndUnsealed) = result else { return XCTFail("hors ligne, un envoi scellé est refusé : \(result)") }
        XCTAssertFalse(try storedTexts(in: sut.pool).contains(secret), "la ligne hors ligne ne porte pas le clair")
        let list = try await diskList()
        XCTAssertFalse(list.contains(secret), "l'aperçu hors ligne ne porte pas le clair")
        await CacheCoordinator.shared.conversations.invalidate(for: "list")
    }
}
