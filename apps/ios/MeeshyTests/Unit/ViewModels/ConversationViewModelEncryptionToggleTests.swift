import XCTest
import GRDB
import Combine
@testable import Meeshy
import MeeshyE2EE
import MeeshySDK

/// **Le chiffrement de bout en bout s'active, il ne se désactive jamais**
/// (#12522, #12949, spec 2026-10-23 § 5) : le fil OUVERT apprend l'activation —
/// de la fiche, du socket ou d'un refus serveur — et l'envoi suivant se scelle,
/// sans recharger. Aucune rétrogradation servie ne rouvre le clair. Un envoi
/// scellé déclare l'époque sous laquelle il l'a été.
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

    // MARK: - Le registre n'apprend que le bout en bout

    func test_ledger_uneDesactivationServie_nEstJamaisApprise() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(status("e2ee", epoch: 1), for: conversationId)
        ledger.learn(status(nil, epoch: 2), for: conversationId)
        ledger.learn(ConversationEncryptionChangedEvent(
            conversationId: conversationId, isEncrypted: false, mode: nil, epoch: 7,
            changedByUserId: peerId, changedAt: "2026-10-25T10:00:00.000Z"
        ))

        XCTAssertTrue(ledger.remembersEndToEnd(conversationId))
        XCTAssertEqual(ledger.epoch(for: conversationId), 1)
        XCTAssertTrue(ledger.seals(for: conversationId, opening: nil, cached: nil))
    }

    /// Audit #12950 — un statut chiffré sans mode se lit comme le bout en bout.
    func test_ledger_unStatutChiffreSansMode_estAppris_commeLeBoutEnBout() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(ConversationEncryptionStatus(isEncrypted: true, mode: nil, epoch: 3), for: conversationId)

        XCTAssertTrue(ledger.remembersEndToEnd(conversationId))
        XCTAssertEqual(ledger.epoch(for: conversationId), 3)
    }

    func test_ledger_unRefusDuClairParLaPasserelle_rendLeBoutEnBout() {
        let ledger = EndToEndRegimeLedger()

        ledger.learnEndToEnd(for: conversationId)

        XCTAssertTrue(ledger.seals(for: conversationId, opening: nil, cached: nil))
    }

    func test_ledger_seuleUneEpoquePlusRecenteDuBoutEnBoutEstDeclaree() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(status("e2ee", epoch: 3), for: conversationId)
        ledger.learn(status("e2ee", epoch: 2), for: conversationId)

        XCTAssertEqual(ledger.epoch(for: conversationId), 3)
    }

    func test_ledger_ecouteLeCanalDesBascules_etApprendChaqueActivation() {
        let ledger = EndToEndRegimeLedger()
        let channel = PassthroughSubject<ConversationEncryptionChangedEvent, Never>()
        let subscription = ledger.listen(to: channel.eraseToAnyPublisher())

        channel.send(ConversationEncryptionChangedEvent(
            conversationId: conversationId, isEncrypted: true, mode: "e2ee", epoch: 9,
            changedByUserId: peerId, changedAt: "2026-10-25T10:00:00.000Z"
        ))

        XCTAssertTrue(ledger.remembersEndToEnd(conversationId))
        XCTAssertEqual(ledger.epoch(for: conversationId), 9)
        subscription.cancel()
    }

    func test_ledger_uneConversationJamaisChiffree_partEnClair() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(status(nil, epoch: 2), for: conversationId)

        XCTAssertFalse(ledger.seals(for: conversationId, opening: nil, cached: "server"))
        XCTAssertFalse(ledger.remembersEndToEnd(conversationId))
    }

    func test_ledger_unModeLuALOuvertureOuAuCache_scelle() {
        XCTAssertTrue(EndToEndRegimeLedger().seals(for: conversationId, opening: "e2ee", cached: nil))
        XCTAssertTrue(EndToEndRegimeLedger().seals(for: conversationId, opening: nil, cached: "e2ee"))
    }

    func test_ledger_unAvisDActivationAffiche_scelle_etSeRetient() {
        let ledger = EndToEndRegimeLedger()

        XCTAssertTrue(ledger.seals(for: conversationId, opening: nil, cached: nil, activationShownAt: Date(timeIntervalSince1970: 100)))
        XCTAssertTrue(ledger.seals(for: conversationId, opening: nil, cached: nil))
    }

    /// La session se ferme : l'époque apprise tombe ; la mémoire, rangée par
    /// compte, garde ce que ce compte a vu.
    func test_ledger_laFermetureDeSession_oublieLEpoque() {
        let ledger = EndToEndRegimeLedger()
        ledger.learn(status("e2ee", epoch: 1), for: conversationId)

        ledger.reset()

        XCTAssertNil(ledger.epoch(for: conversationId))
        XCTAssertTrue(ledger.remembersEndToEnd(conversationId))
    }

    // MARK: - Le fil

    func test_avisDuFil_seuleUneActivationSystemeDuBoutEnBoutCompte_laPremiere() {
        var forged = activationNotice(at: 10)
        forged.messageSource = .user

        XCTAssertNil(EncryptionSwitchNoticeTrail.activationShownAt(in: [
            forged, activationNotice(mode: "server", at: 20), downgradeNotice(epoch: 2, at: 30), endToEndMessage(at: 40)
        ]))
        XCTAssertEqual(
            EncryptionSwitchNoticeTrail.activationShownAt(in: [activationNotice(at: 300), downgradeNotice(epoch: 2, at: 400), activationNotice(at: 200)]),
            Date(timeIntervalSince1970: 200)
        )
    }

    /// Un message chiffré isolé, dans une conversation que rien d'autre ne dit
    /// chiffrée, n'est pas un régime (même loi que le web, #12949).
    func test_send_unMessageChiffreIsole_sansRegime_partEnClair() async throws {
        let sut = try await makeSUT(encryptionMode: nil, ledger: EndToEndRegimeLedger())
        sut.viewModel.messages = [endToEndMessage(at: 100)]

        _ = await sut.viewModel.send(outgoingMessage(content: "Bonjour", conversationId: conversationId))

        XCTAssertEqual(sut.messageService.lastSendRequest?.content, "Bonjour")
    }

    func test_send_unAvisDActivationDansLeFil_scelle_memeServieSansMode() async throws {
        let sut = try await makeSUT(encryptionMode: nil, ledger: EndToEndRegimeLedger())
        sut.viewModel.messages = [activationNotice(at: 100), downgradeNotice(epoch: 2, at: 200)]

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        XCTAssertEqual(sut.messageService.lastSendRequest?.isEncrypted, true)
        XCTAssertNotEqual(sut.messageService.lastSendRequest?.content, secret)
    }

    /// Audit #12846 (B) — le fil AFFICHE l'avis depuis sa métadonnée : un
    /// texte serveur trompeur (« Ana a rejoint ») ne le cache pas. Un avis de
    /// désactivation déjà en base reste lisible comme un historique (#12949).
    func test_avisAffiche_seComposeDepuisLaMetadonnee_jamaisDepuisLeTexteDuServeur() {
        var notice = downgradeNotice(epoch: 2)
        notice.content = "Ana a rejoint la conversation"
        let strings = ConversationPreviewStrings(language: "fr") { key in
            key == .systemEncryptionDisabled ? "{actor} a désactivé le chiffrement de bout en bout" : key.rawValue
        }

        XCTAssertEqual(
            BubbleContent.encryptionSwitchNoticeText(for: notice, strings: strings),
            "? a désactivé le chiffrement de bout en bout"
        )
    }

    // MARK: - Une conversation vue chiffrée le reste (#12949)

    private func rememberedEndToEnd() -> EndToEndRegimeMemory {
        let memory = EndToEndRegimeMemory(defaults: nil)
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: Date(timeIntervalSince1970: 10)))
        return memory
    }

    /// Un avis de désactivation déjà en base (staging) s'affiche comme un
    /// historique : il ne rouvre ni l'envoi en clair, ni la lecture.
    func test_irreversible_aDisabledNoticeShownInTheThread_neverReopensPlaintext() async throws {
        let memory = rememberedEndToEnd()
        let ledger = EndToEndRegimeLedger(memory: memory)
        let sut = try await makeSUT(encryptionMode: "e2ee", ledger: ledger)
        ledger.learn(status(nil, epoch: 2), for: conversationId)
        sut.viewModel.messages = [downgradeNotice(epoch: 2, at: 200)]

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        let request = try XCTUnwrap(sut.messageService.lastSendRequest)
        XCTAssertEqual(request.isEncrypted, true)
        XCTAssertNotEqual(request.content, secret)
        XCTAssertTrue(memory.resolve(conversationId: conversationId, served: .serverReadable).isEndToEnd)
    }

    /// Après un redémarrage, l'appareil se souvient : une conversation servie
    /// sans mode, sans époque ni avis dans le fil, reste scellée.
    func test_irreversible_aConversationRememberedEncrypted_staysSealed_whenServedWithoutMode() async throws {
        let sut = try await makeSUT(encryptionMode: nil, ledger: EndToEndRegimeLedger(memory: rememberedEndToEnd()))

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        let request = try XCTUnwrap(sut.messageService.lastSendRequest)
        XCTAssertEqual(request.isEncrypted, true)
        XCTAssertNotEqual(request.content, secret)
    }

    /// Un 409 E2EE_REGIME_CHANGED suivi d'un statut « non chiffré » ne mène
    /// jamais au clair : l'envoi suivant repart scellé.
    func test_irreversible_aRegimeChangedRefusal_thenAServedDowngrade_staysSealed() async throws {
        let encryption = MockConversationEncryptionService()
        encryption.statusResult = .success(status(nil, epoch: 5))
        let sut = try await makeSUT(encryptionMode: "e2ee", ledger: EndToEndRegimeLedger(), encryption: encryption)
        sut.messageService.sendResult = .failure(MeeshyError.rejected(APIRejection(statusCode: 409, code: E2EEErrorCode.regimeChanged, message: "changé")))
        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))
        await sut.viewModel.collaborators.regimeRefresher.settle()

        _ = await sut.viewModel.send(outgoingMessage(content: "Bonjour", conversationId: conversationId))

        XCTAssertEqual(sut.messageService.sendCallCount, 2)
        XCTAssertEqual(sut.messageService.lastSendRequest?.isEncrypted, true)
        XCTAssertNotEqual(sut.messageService.lastSendRequest?.content, "Bonjour")
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
        encryption.statusResult = .success(status("e2ee", epoch: 5))
        let ledger = EndToEndRegimeLedger()
        let sut = try await makeSUT(encryptionMode: "e2ee", ledger: ledger, encryption: encryption)
        sut.messageService.sendResult = .failure(MeeshyError.rejected(APIRejection(statusCode: 409, code: E2EEErrorCode.regimeChanged, message: "changé")))

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.regimeChanged)) = result else {
            return XCTFail("refus « régime changé » attendu, reçu \(result)")
        }
        await sut.viewModel.collaborators.regimeRefresher.settle()
        XCTAssertEqual(encryption.fetchStatusCallCount, 1)
        XCTAssertEqual(ledger.epoch(for: conversationId), 5, "le renvoi se scelle sous l'époque relue")
        XCTAssertEqual(sut.messageService.sendCallCount, 1, "rien n'est renvoyé sans le geste de l'utilisateur")
    }

    private func endToEndMessage(at seconds: TimeInterval) -> Message {
        Message(
            conversationId: conversationId, senderId: peerId, content: "", messageSource: .user,
            isEncrypted: true, encryptionMode: "e2ee", createdAt: Date(timeIntervalSince1970: seconds)
        )
    }

    private func downgradeNotice(epoch: Int, at seconds: TimeInterval = 50) -> Message {
        Message(
            conversationId: conversationId, content: "Chiffrement désactivé", messageSource: .system,
            createdAt: Date(timeIntervalSince1970: seconds),
            encryptionSwitchNotice: EncryptionSwitchNoticeMetadata(kind: EncryptionSwitchNoticeMetadata.disabledKind, epoch: epoch, previousMode: "e2ee")
        )
    }

    private func activationNotice(mode: String = "e2ee", at seconds: TimeInterval) -> Message {
        Message(
            conversationId: conversationId, content: "Chiffrement activé", messageSource: .system,
            createdAt: Date(timeIntervalSince1970: seconds),
            encryptionSwitchNotice: EncryptionSwitchNoticeMetadata(kind: EncryptionSwitchNoticeMetadata.enabledKind, epoch: 1, mode: mode)
        )
    }
}
