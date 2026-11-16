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

    private func makeSUT(
        consumer: MockAfterReadConsumer = MockAfterReadConsumer(),
        syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared
    ) async throws
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
            syncEngine: syncEngine,
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(persistence: MessagePersistenceActor(dbWriter: pool)),
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

        _ = await sut.send(outgoingMessage(content: "à lire une fois", conversationId: sut.conversationId)).isAccepted

        let request = try XCTUnwrap(messageService.lastSendRequest)
        XCTAssertEqual(request.effectFlags, MessageEffectFlags([.ephemeral, .ephemeralAfterRead]).rawValue)
        XCTAssertNil(request.ephemeralDuration)
        XCTAssertNil(request.expiresAt)
    }

    func test_sendMessage_quinzeSecondes_garderSaDuréeSansBitFlammeOeil() async throws {
        let (sut, messageService) = try await makeSUT()
        sut.ephemeralChoice = .duration(.fifteenSeconds)

        _ = await sut.send(outgoingMessage(content: "vite", conversationId: sut.conversationId)).isAccepted

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
        let hosts = ["Views/ThemedMessageBubble.swift", "../Focal/Row/FocalRow.swift", "../River/View/RiverBubbleView.swift"]
        for host in hosts {
            let source = try String(contentsOf: root.appendingPathComponent(host), encoding: .utf8)
            XCTAssertTrue(source.contains(".afterReadWatermark(content.protection.isAfterRead"), host)
        }
        let summary = try String(contentsOf: root.appendingPathComponent("../Focal/Summary/SummaryProtectionsView.swift"), encoding: .utf8)
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

    // MARK: - #18556 — toute sortie consomme ce qui a été affiché

    /// Ouverte en REGARD par la bannière tirée (#18721) : rien n'est marqué lu,
    /// mais la flamme a été AFFICHÉE — la sortie la consomme.
    func test_ouverteEnRegard_flammeAffichéePuisSortie_consomme() async throws {
        PeekOpeningRequests.request(conversationId)
        let consumer = MockAfterReadConsumer()
        let (sut, _) = try await makeSUT(consumer: consumer)
        sut.messages = [message("m1", afterRead: true)]

        sut.markAsRead(messageIds: ["m1"], visibleIds: ["m1"])
        sut.consumeAfterReadOnExit()

        XCTAssertEqual(consumer.calls.map(\.messageIds), [["m1"]])
    }

    /// Le fil vide ses lectures acquises AU DÉMONTAGE, après la porte de sortie.
    func test_lectureVidéeAprèsLaSortie_partAvecElle() async throws {
        let consumer = MockAfterReadConsumer()
        let (sut, _) = try await makeSUT(consumer: consumer)
        sut.messages = [message("m1", afterRead: true)]

        sut.consumeAfterReadOnExit()
        sut.markAsRead(messageIds: ["m1"], visibleIds: ["m1"])

        XCTAssertEqual(consumer.calls.map(\.messageIds), [["m1"]])
        XCTAssertFalse(sut.messages.contains { $0.id == "m1" })
    }

    /// Quitter depuis le Résumé rattrape APRÈS la porte (`leaveConversationByNavigation`).
    func test_sortieDuRésumé_rattrapageAprèsLaPorte_consomme() async throws {
        let consumer = MockAfterReadConsumer()
        let (sut, _) = try await makeSUT(consumer: consumer)
        sut.messages = [message("m1", afterRead: true)]

        sut.consumeAfterReadOnExit()
        sut.markCaughtUpFromSummaryOrRiver()

        XCTAssertEqual(consumer.calls.map(\.messageIds), [["m1"]])
    }

    /// Revenu à l'écran, une flamme lue reste sous les yeux jusqu'à la sortie suivante.
    func test_retourÀLÉcran_flammeLueEnsuite_attendLaSortieSuivante() async throws {
        let consumer = MockAfterReadConsumer()
        let (sut, _) = try await makeSUT(consumer: consumer)
        sut.messages = [message("m1", afterRead: true)]
        sut.consumeAfterReadOnExit()

        sut.start()
        sut.markAsRead(messageIds: ["m1"], visibleIds: ["m1"])

        XCTAssertTrue(consumer.calls.isEmpty)
        sut.consumeAfterReadOnExit()
        XCTAssertEqual(consumer.calls.map(\.messageIds), [["m1"]])
    }

    /// Quitter vers la liste rend la conversation aux bannières in-app, même
    /// si son modèle reste retenu : un message entrant s'y signale de nouveau.
    func test_écranQuitté_modèleRetenu_laConversationNEstPlusOuverte() async throws {
        let (sut, _) = try await makeSUT()
        XCTAssertTrue(NotificationToastManager.shared.isConversationOpen(conversationId))

        sut.noteScreenLeft()

        XCTAssertFalse(NotificationToastManager.shared.isConversationOpen(conversationId))
        XCTAssertNotEqual(NotificationToastManager.shared.activeConversationId, conversationId)
    }

    /// Le moteur de synchro aussi : la ligne de la liste recompte ses non-lus
    /// dès qu'on l'a quittée, pas quand le modèle meurt.
    func test_écranQuittéPuisRevenu_leMoteurFermeEtRouvre() async throws {
        let engine = MockConversationSyncEngine()
        let (sut, _) = try await makeSUT(syncEngine: engine)
        XCTAssertEqual(engine.openConversationIds, [conversationId])

        sut.noteScreenLeft()
        XCTAssertEqual(engine.openConversationIds, [])

        sut.start()
        XCTAssertEqual(engine.openConversationIds, [conversationId])
        sut.noteScreenLeft()
        sut.noteScreenLeft()
        XCTAssertEqual(engine.openConversationIds, [])
    }

    /// L'écran revenu (`.task` rejoué) se déclare de nouveau ouvert.
    func test_écranRevenu_laConversationEstDeNouveauOuverte() async throws {
        let (sut, _) = try await makeSUT()
        sut.noteScreenLeft()

        sut.start()

        XCTAssertTrue(NotificationToastManager.shared.isConversationOpen(conversationId))
        sut.noteScreenLeft()
    }

    func test_visit_lectureTardive_horsDeLaFenêtre_attendLaSortieSuivante() {
        let flame = message("m1", afterRead: true)
        let left = Date()
        var visit = AfterReadVisit()
        _ = visit.leave(at: left)

        visit.note(displayed: ["m1"], among: [flame])

        XCTAssertEqual(visit.takeLate(at: left.addingTimeInterval(AfterReadVisit.lateReadWindow + 1)), [])
        XCTAssertEqual(visit.takeLate(at: left.addingTimeInterval(1)), ["m1"])
    }

    /// L'accusé DURABLE part avant l'effet local : une app tuée pendant
    /// l'effet local ne perd plus la consommation.
    func test_consumption_enfileLAccuséAvantLEffetLocal() async {
        let journal = ConsumptionJournal()
        let consumption = AfterReadConsumption(
            enqueue: { journal.steps.append("enqueue:\($0.messageIds.joined())") },
            expireLocally: { _, _ in journal.steps.append("expire") },
            flush: { journal.steps.append("flush") }
        )

        await consumption.run(conversationId: conversationId, messageIds: ["m1"])

        XCTAssertEqual(journal.steps, ["enqueue:m1", "expire", "flush"])
    }

    /// Un échec d'écriture de l'outbox n'empêche pas l'effet local.
    func test_consumption_enfilementEnÉchec_effetLocalQuandMême() async {
        let journal = ConsumptionJournal()
        let consumption = AfterReadConsumption(
            enqueue: { _ in throw OfflineQueueError.poolNotConfigured },
            expireLocally: { _, _ in journal.steps.append("expire") },
            flush: { journal.steps.append("flush") }
        )

        await consumption.run(conversationId: conversationId, messageIds: ["m1"])

        XCTAssertEqual(journal.steps, ["expire", "flush"])
    }
}

@MainActor
private final class ConsumptionJournal {
    var steps: [String] = []
}

@MainActor
final class MockAfterReadConsumer: AfterReadConsumptionProviding {
    private(set) var calls: [(conversationId: String, messageIds: [String])] = []

    func consume(conversationId: String, messageIds: [String]) {
        calls.append((conversationId, messageIds))
    }
}
