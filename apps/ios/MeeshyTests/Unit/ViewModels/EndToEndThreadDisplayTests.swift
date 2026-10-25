import XCTest
import GRDB
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **Un message libsignal reçu s'affiche en clair, jusqu'au PIXEL** (#12916).
///
/// La recette du 2026-10-25 a vu le destinataire n'afficher que « [Encrypted] »
/// alors que son appareil avait ouvert l'enveloppe et rangé le clair. Ces
/// témoins suivent le message de bout en bout, entre deux installations
/// libsignal RÉELLES (enrôlement, scelleur, ouvreur de production) sur une
/// fausse passerelle : enveloppe scellée par Alice → ouverte par l'appareil de
/// Bob → fil relu → ce que la CELLULE rend (`MessageStore` + l'état de la
/// visite), sur une ligne venue de la socket, du REST et du rattrapage par le
/// cache, et après un redémarrage à froid. Et aucun octet du clair n'atteint
/// la base des messages de l'app ni le fil de la passerelle.
@MainActor
final class EndToEndThreadDisplayTests: XCTestCase {

    private let conversationId = "00000000000000000000ab01"
    private let alice = "00000000000000000000aa11"
    private let bob = "00000000000000000000bb22"
    private let serverId = "00000000000000000000ab51"

    private struct Thread {
        let viewModel: ConversationViewModel
        let socket: MockMessageSocket
        let messageService: MockMessageService
        let persistence: MessagePersistenceActor
        let pool: DatabaseQueue
    }

    private func openThread(
        as userId: String,
        with peerId: String,
        endToEnd: any EndToEndMessagingProviding,
        pool existing: DatabaseQueue? = nil
    ) async throws -> Thread {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "u\(userId.suffix(2))", displayName: "U"))
        let messageService = MockMessageService()
        let socket = MockMessageSocket()
        socket.isConnected = true
        let pool = try existing ?? {
            let queue = try DatabaseQueue()
            try MessageDatabaseMigrations.runAll(on: queue)
            return queue
        }()
        let persistence = MessagePersistenceActor(dbWriter: pool)
        await persistence.start()
        let viewModel = ConversationViewModel(
            conversationId: conversationId,
            isDirect: true,
            participantUserId: peerId,
            encryptionMode: E2EEWire.mode,
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
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: FakeOfflineMessageQueue(),
            endToEnd: endToEnd
        )
        viewModel.start()
        return Thread(viewModel: viewModel, socket: socket, messageService: messageService, persistence: persistence, pool: pool)
    }

    private func installation(_ userId: String, on gateway: LibsignalTestGateway) async throws -> EndToEndMessagingRuntime {
        let runtime = EndToEndMessagingRuntime(provisioning: try LibsignalDeviceProvisioning.inMemory(on: gateway, userId: userId))
        _ = try await runtime.ready(for: userId)
        return runtime
    }

    /// Alice scelle pour les appareils de Bob ; la passerelle relaie sous l'identifiant serveur.
    private func seal(_ text: String, from runtime: EndToEndMessagingRuntime, on gateway: LibsignalTestGateway, clientMessageId: String = "cid_alice_1") async throws {
        let content = E2EEContent(
            text: text, language: "fr", replyTo: nil, conversationId: conversationId,
            clientMessageId: clientMessageId, sentAt: Date()
        )
        let (alice, conversationId, serverId) = (alice, conversationId, serverId)
        try await runtime.deliver(content, from: alice, to: bob) { sealed in
            gateway.relay(sealed, from: alice, conversationId: conversationId, messageId: serverId)
        }
    }

    /// Ce que la passerelle sert d'un message `e2ee` : le littéral, jamais le clair.
    private func served(from senderId: String, id: String? = nil, clientMessageId: String? = nil) -> APIMessage {
        let cid = clientMessageId.map { #","clientMessageId":"\#($0)""# } ?? ""
        return JSONStub.decode("""
        {"id":"\(id ?? serverId)","conversationId":"\(conversationId)","senderId":"\(senderId)",
         "content":"\(E2EEWire.contentPlaceholder)","isEncrypted":true,"encryptionMode":"\(E2EEWire.mode)",
         "messageType":"text","messageSource":"user","createdAt":"2026-10-25T12:00:00.000Z"\(cid),
         "sender":{"id":"\(senderId)","username":"u\(senderId.suffix(2))","displayName":"U"}}
        """)
    }

    private func deliverEnvelopes(of userId: String, to runtime: EndToEndMessagingRuntime, on gateway: LibsignalTestGateway) async {
        for envelope in gateway.pending(for: userId) {
            await runtime.receive(envelope, as: userId)
        }
    }

    /// Ce que la cellule RENDRAIT de ce message : la ligne du magasin, puis
    /// l'état de la visite — le chemin de `makeMessageRegistration`.
    private func rendered(_ id: String, in thread: Thread) -> MeeshyMessage? {
        let store = thread.viewModel.messageStore
        guard let record = store.messages.first(where: { $0.serverId == id || $0.localId == id }),
              var message = store.domainMessage(for: record.localId, currentUserId: thread.viewModel.currentUserId) else { return nil }
        ThreadVisitState.apply(to: &message, from: thread.viewModel)
        return message
    }

    private func eventually(
        _ what: String, timeout: TimeInterval = 5, file: StaticString = #filePath, line: UInt = #line,
        _ condition: () -> Bool
    ) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(), Date() < deadline {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertTrue(condition(), what, file: file, line: line)
    }

    /// Aucun octet du clair dans la base des messages de l'app (non scellée).
    private func assertNoPlaintextStored(_ text: String, in pool: DatabaseQueue, file: StaticString = #filePath, line: UInt = #line) throws {
        let contents = try pool.read { db in try MessageRecord.fetchAll(db) }.compactMap(\.content)
        XCTAssertFalse(contents.contains { $0.contains(text) }, "le clair ne s'écrit pas dans la base des messages", file: file, line: line)
    }

    private func sentinel() -> String { "sentinelle-\(UUID().uuidString)" }

    // MARK: - Destinataire

    func test_socket_laLigneArriveAvantLEnveloppe_laBulleRendLeClair() async throws {
        let gateway = LibsignalTestGateway()
        let aliceDevice = try await installation(alice, on: gateway)
        let bobDevice = try await installation(bob, on: gateway)
        let thread = try await openThread(as: bob, with: alice, endToEnd: bobDevice)
        let secret = sentinel()

        try await seal(secret, from: aliceDevice, on: gateway)
        thread.socket.messageReceived.send(served(from: alice))
        await eventually("la ligne servie atteint le fil") { rendered(serverId, in: thread) != nil }
        await deliverEnvelopes(of: bob, to: bobDevice, on: gateway)

        await eventually("la bulle rend le clair déchiffré sur l'appareil") { rendered(serverId, in: thread)?.content == secret }
        XCTAssertTrue(gateway.pending(for: bob).isEmpty, "l'enveloppe est acquittée une fois le clair rangé")
        try assertNoPlaintextStored(secret, in: thread.pool)
        XCTAssertNil(gateway.wire.reduce(Data(), +).range(of: Data(secret.utf8)), "aucun octet clair sur le fil")
    }

    func test_rest_lEnveloppeArriveAvantLaLigne_laBulleRendLeClair_etSurvitAuRedemarrage() async throws {
        let gateway = LibsignalTestGateway()
        let aliceDevice = try await installation(alice, on: gateway)
        let bobDevice = try await installation(bob, on: gateway)
        let thread = try await openThread(as: bob, with: alice, endToEnd: bobDevice)
        let secret = sentinel()

        try await seal(secret, from: aliceDevice, on: gateway)
        await deliverEnvelopes(of: bob, to: bobDevice, on: gateway)
        try await thread.persistence.upsertFromAPIMessages([served(from: alice)], preferredLanguages: ["fr"])

        await eventually("la bulle rend le clair") { rendered(serverId, in: thread)?.content == secret }
        try assertNoPlaintextStored(secret, in: thread.pool)

        let reopened = try await openThread(as: bob, with: alice, endToEnd: bobDevice, pool: thread.pool)
        await reopened.viewModel.loadMessages()
        await eventually("après un redémarrage à froid, le clair est relu de la base scellée") {
            rendered(serverId, in: reopened)?.content == secret
        }
    }

    func test_rattrapageParLeCache_laLigneNaitChiffree_etRendLeClair() async throws {
        let gateway = LibsignalTestGateway()
        let aliceDevice = try await installation(alice, on: gateway)
        let bobDevice = try await installation(bob, on: gateway)
        let thread = try await openThread(as: bob, with: alice, endToEnd: bobDevice)
        let secret = sentinel()
        try await seal(secret, from: aliceDevice, on: gateway)
        await deliverEnvelopes(of: bob, to: bobDevice, on: gateway)
        var cached = served(from: alice).toMessage(currentUserId: bob, currentUsername: "ubb", preferredLanguages: ["fr"])
        cached.adoptDecryptedContent(secret)

        await thread.persistence.bufferIncoming(CachedThreadSurfacing.rows([cached], present: []))

        await eventually("la ligne rattrapée par le cache rend le clair") { rendered(serverId, in: thread)?.content == secret }
        let key = serverId
        let stored = try await thread.pool.read { db in try MessageRecord.fetchOne(db, key: key) }
        let record = try XCTUnwrap(stored)
        XCTAssertTrue(record.isEncrypted, "une ligne rattrapée d'un message chiffré naît chiffrée")
        try assertNoPlaintextStored(secret, in: thread.pool)
    }

    // MARK: - Expéditeur

    func test_expediteur_garde_sonClair_aLEchoDuServeur() async throws {
        let gateway = LibsignalTestGateway()
        let aliceDevice = try await installation(alice, on: gateway)
        _ = try await installation(bob, on: gateway)
        let thread = try await openThread(as: alice, with: bob, endToEnd: aliceDevice)
        thread.messageService.sendResult = .success(JSONStub.decode("""
        {"id":"\(serverId)","conversationId":"\(conversationId)","senderId":"\(alice)","content":"\(E2EEWire.contentPlaceholder)","messageType":"text","createdAt":"2026-10-25T12:00:00.000Z"}
        """))
        let secret = sentinel()

        let result = await thread.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))
        XCTAssertTrue(result.isAccepted, "\(result)")
        let cid = try XCTUnwrap(thread.messageService.lastSendRequest?.clientMessageId)
        thread.socket.messageReceived.send(served(from: alice, clientMessageId: cid))
        let echoed = served(from: alice).toMessage(currentUserId: alice, currentUsername: "u11", preferredLanguages: ["fr"])
        await thread.persistence.bufferIncoming(CachedThreadSurfacing.rows([echoed], present: []))

        await eventually("ma bulle garde son clair après l'écho") {
            let mine = thread.viewModel.messageStore.messages.compactMap { record in
                thread.viewModel.messageStore.domainMessage(for: record.localId, currentUserId: alice)
            }.map { message -> MeeshyMessage in
                var visited = message
                ThreadVisitState.apply(to: &visited, from: thread.viewModel)
                return visited
            }
            return !mine.isEmpty && mine.allSatisfy { $0.content == secret }
        }
    }
}
