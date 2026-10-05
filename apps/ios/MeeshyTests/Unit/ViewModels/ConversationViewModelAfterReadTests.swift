import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// **La flamme-œil** (#8303, contrat #8302) — directive porteur 2026-09-27 :
/// « une flamme avec un œil qui permet de faire disparaître un message après
/// avoir été vu et quitté la conversation ».
///
/// Trois moitiés : ce qui PART (les bits, sans durée), ce qu'on a VU (les
/// flammes-œil reçues et affichées), ce que la SORTIE en fait (retrait local et
/// consommation serveur).
@MainActor
final class ConversationViewModelAfterReadTests: XCTestCase {

    private let conversationId = "00000000000000000000ab03"
    private let userId = "00000000000000000000ab97"

    override func setUp() async throws {
        try await super.setUp()
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        try await super.tearDown()
    }

    private func makeSUT(consumer: MockAfterReadConsumer = MockAfterReadConsumer()) async throws
        -> (sut: ConversationViewModel, messageService: MockMessageService) {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "flamme", displayName: "Flamme"))
        let messageService = MockMessageService()
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: true),
            offlineQueue: FakeOfflineMessageQueue(),
            afterReadConsumer: consumer
        )
        sut.start()
        return (sut, messageService)
    }

    private func message(_ id: String, afterRead: Bool, isMe: Bool = false) -> Message {
        var message = Message(id: id, conversationId: conversationId, senderId: isMe ? userId : "autre",
                              content: "secret \(id)", isMe: isMe)
        if afterRead { message.effects.flags = [.ephemeral, .ephemeralAfterRead] }
        return message
    }

    // MARK: - Ce qui part

    func test_sendMessage_flammeOeil_envoieLesDeuxBitsSansDurée() async throws {
        let (sut, messageService) = try await makeSUT()
        sut.ephemeralChoice = .afterRead

        _ = await sut.sendMessage(content: "à lire une fois")

        let request = try XCTUnwrap(messageService.lastSendRequest)
        XCTAssertEqual(request.effectFlags, MessageEffectFlags([.ephemeral, .ephemeralAfterRead]).rawValue)
        XCTAssertNil(request.ephemeralDuration)
        XCTAssertNil(request.expiresAt)
    }

    func test_sendMessage_quinzeSecondes_garderSaDuréeSansBitFlammeOeil() async throws {
        let (sut, messageService) = try await makeSUT()
        sut.ephemeralChoice = .duration(.fifteenSeconds)

        _ = await sut.sendMessage(content: "vite")

        let request = try XCTUnwrap(messageService.lastSendRequest)
        XCTAssertEqual(request.ephemeralDuration, 15)
        XCTAssertNil(request.effectFlags)
    }

    // MARK: - Ce que le fil montre : la flamme en filigrane, dans TOUS les modes

    /// Précision porteur du 2026-09-27 : ni décompte ni pastille, une flamme en
    /// filigrane. Chaque hôte de rangée la pose — Bulles, Focal/Script, Rivière
    /// — et le Résumé désigne la flamme-œil par son pictogramme.
    func test_everyReadingMode_mountsTheAfterReadFlame() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Meeshy/Features/Main")
        let hosts = ["Views/ThemedMessageBubble.swift", "Focal/Row/FocalRow.swift", "Riviere/View/RiverBubbleView.swift"]
        for host in hosts {
            let source = try String(contentsOf: root.appendingPathComponent(host), encoding: .utf8)
            XCTAssertTrue(source.contains(".afterReadWatermark(content.protection.isAfterRead"), host)
        }
        let summary = try String(contentsOf: root.appendingPathComponent("Focal/Summary/SummaryProtectionsView.swift"), encoding: .utf8)
        XCTAssertTrue(summary.contains("FlameEyeGlyph("), "le Résumé désigne la flamme-œil")
    }

    func test_afterReadMessage_hasNoCountdownBadge() {
        let descriptor = message("m1", afterRead: true).protection()
        XCTAssertTrue(descriptor.isAfterRead)
        XCTAssertTrue(descriptor.badges.isEmpty, "ni décompte ni pastille")
    }

    // MARK: - Ce qu'on a vu

    func test_visit_neRetientQueLesFlammesOeilReçuesEtAffichées() {
        let messages = [message("m1", afterRead: true), message("m2", afterRead: true, isMe: true),
                        message("m3", afterRead: false), message("m4", afterRead: true)]
        var visit = AfterReadVisit()

        visit.note(displayed: ["m1", "m2", "m3"], among: messages)

        XCTAssertEqual(visit.takeAll(), ["m1"], "m2 est à moi, m3 n'est pas une flamme-œil, m4 n'a pas été affiché")
        XCTAssertEqual(visit.takeAll(), [], "la seconde porte de sortie ne trouve plus rien")
    }

    func test_visit_noteAll_retientToutesLesFlammesOeilReçues_rivièreEtRésumé() {
        var visit = AfterReadVisit()
        visit.noteAll(among: [message("m1", afterRead: true), message("m2", afterRead: false)])
        XCTAssertEqual(visit.takeAll(), ["m1"])
    }

    // MARK: - Ce que la sortie en fait

    func test_consumeAfterReadOnExit_retireDuFilEtConsomme() async throws {
        let consumer = MockAfterReadConsumer()
        let (sut, _) = try await makeSUT(consumer: consumer)
        let lue = message("m1", afterRead: true)
        let autre = message("m2", afterRead: false)
        sut.messages = [lue, autre]
        sut.afterReadVisit.note(displayed: ["m1", "m2"], among: sut.messages)

        sut.consumeAfterReadOnExit()

        XCTAssertEqual(consumer.calls.map(\.messageIds), [["m1"]])
        XCTAssertEqual(consumer.calls.first?.conversationId, conversationId)
        XCTAssertFalse(sut.messages.contains { $0.id == "m1" })
        XCTAssertTrue(sut.messages.contains { $0.id == "m2" })
    }

    func test_consumeAfterReadOnExit_sansRienDeLu_neConsommeRien() async throws {
        let consumer = MockAfterReadConsumer()
        let (sut, _) = try await makeSUT(consumer: consumer)

        sut.consumeAfterReadOnExit()

        XCTAssertTrue(consumer.calls.isEmpty)
    }
}

@MainActor
final class MockAfterReadConsumer: AfterReadConsumptionProviding {
    private(set) var calls: [(conversationId: String, messageIds: [String])] = []

    func consume(conversationId: String, messageIds: [String]) {
        calls.append((conversationId, messageIds))
    }
}
