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

    /// #12846 (b) — apprendre le bout en bout sans date (refus du clair) garde
    /// l'époque connue : une observation plus ancienne « non chiffré » ne
    /// rouvre jamais le clair.
    func test_ledger_unBoutEnBoutNonDate_gardeLEpoqueConnue() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(status(nil, epoch: 4), for: conversationId)
        ledger.learnEndToEnd(for: conversationId)
        ledger.learn(status(nil, epoch: 3), for: conversationId)

        XCTAssertEqual(ledger.regime(for: conversationId), EndToEndRegimeLedger.Regime(isEndToEnd: true, epoch: 4))
    }

    /// #12846 (b) — une époque ÉGALE ne réécrit pas le régime vers le clair.
    func test_ledger_uneEpoqueEgale_neRendPasLeClair() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(status("e2ee", epoch: 5), for: conversationId)
        ledger.learn(status(nil, epoch: 5), for: conversationId)

        XCTAssertEqual(ledger.regime(for: conversationId), EndToEndRegimeLedger.Regime(isEndToEnd: true, epoch: 5))
    }

    // MARK: - L'envoi suit le régime appris

    /// #12846 (a) — le fil OUVERT en bout en bout apprend du SEUL serveur une
    /// époque plus récente « non chiffré » : rien ne part en clair tant que
    /// l'utilisateur n'a pas vu la bascule.
    func test_send_desactivationAnnonceeParLeSeulServeur_rienNePartEnClair() async throws {
        let ledger = EndToEndRegimeLedger()
        let sut = try await makeSUT(encryptionMode: "e2ee", ledger: ledger)
        ledger.learn(status(nil, epoch: 2), for: conversationId)

        _ = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        XCTAssertNotEqual(sut.messageService.lastSendRequest?.content, secret, "aucun clair ne part sans que l'utilisateur ait vu la bascule")
    }

    func test_send_desactivationNonVue_refusLisible_rienNEstEmis() async throws {
        let ledger = EndToEndRegimeLedger()
        let sut = try await makeSUT(encryptionMode: "e2ee", ledger: ledger)
        ledger.learn(status(nil, epoch: 2), for: conversationId)

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.regimeDowngradeUnconfirmed)) = result else {
            return XCTFail("envoi suspendu attendu, reçu \(result)")
        }
        XCTAssertEqual(sut.messageService.sendCallCount, 0)
    }

    func test_send_avisDeDesactivationAfficheDansLeFil_lEnvoiPartEnClair() async throws {
        let ledger = EndToEndRegimeLedger()
        let sut = try await makeSUT(encryptionMode: "e2ee", ledger: ledger)
        ledger.learn(status(nil, epoch: 2), for: conversationId)
        sut.viewModel.messages = [downgradeNotice(epoch: 2)]

        _ = await sut.viewModel.send(outgoingMessage(content: "Bonjour", conversationId: conversationId))

        let request = try XCTUnwrap(sut.messageService.lastSendRequest)
        XCTAssertNotEqual(request.isEncrypted, true, "la bascule est affichée : la conversation n'est plus chiffrée")
        XCTAssertNil(request.envelopes)
        XCTAssertEqual(request.content, "Bonjour")
    }

    func test_send_avisDuneDesactivationPlusAncienne_neConfirmePasLaNouvelle() async throws {
        let ledger = EndToEndRegimeLedger()
        let sut = try await makeSUT(encryptionMode: "e2ee", ledger: ledger)
        ledger.learn(status(nil, epoch: 3), for: conversationId)
        sut.viewModel.messages = [downgradeNotice(epoch: 1)]

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.regimeDowngradeUnconfirmed)) = result else {
            return XCTFail("envoi suspendu attendu, reçu \(result)")
        }
        XCTAssertEqual(sut.messageService.sendCallCount, 0)
    }

    func test_send_desactivationConfirmeeDansLaFiche_lEnvoiPartEnClair() async throws {
        let ledger = EndToEndRegimeLedger()
        let sut = try await makeSUT(encryptionMode: "e2ee", ledger: ledger)
        ledger.learn(status(nil, epoch: 2), for: conversationId)
        ledger.confirmDowngrade(epoch: 2, for: conversationId)

        _ = await sut.viewModel.send(outgoingMessage(content: "Bonjour", conversationId: conversationId))

        XCTAssertEqual(sut.messageService.lastSendRequest?.content, "Bonjour")
    }

    // MARK: - La désactivation vue (#12846)

    func test_ledger_filJamaisChiffre_uneDesactivationNeDemandeRien() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(status(nil, epoch: 2), for: conversationId)

        XCTAssertEqual(ledger.sending(for: conversationId, opening: nil, cached: nil, evidence: .none), .plaintext)
        XCTAssertNil(ledger.pendingDowngrade(for: conversationId))
    }

    func test_ledger_boutEnBoutAppris_puisDesactiveParLeServeur_attendLaConfirmation() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(status("e2ee", epoch: 1), for: conversationId)
        ledger.learn(status(nil, epoch: 2), for: conversationId)

        XCTAssertEqual(ledger.sending(for: conversationId, opening: nil, cached: nil, evidence: .none), .downgradeUnconfirmed(epoch: 2))
        XCTAssertEqual(ledger.pendingDowngrade(for: conversationId), .epoch(2))
        ledger.confirmDowngrade(epoch: 2, for: conversationId)
        XCTAssertEqual(ledger.sending(for: conversationId, opening: nil, cached: nil, evidence: .none), .plaintext)
        XCTAssertNil(ledger.pendingDowngrade(for: conversationId))
    }

    func test_ledger_ouvertureEnBoutEnBout_laFicheDemandeLaConfirmation() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(status(nil, epoch: 2), for: conversationId)
        _ = ledger.sending(for: conversationId, opening: "e2ee", cached: nil)

        XCTAssertEqual(ledger.pendingDowngrade(for: conversationId), .epoch(2))
    }

    func test_ledger_uneConfirmationAncienne_neValePasPourUneDesactivationPlusRecente() {
        let ledger = EndToEndRegimeLedger()

        ledger.learn(status("e2ee", epoch: 1), for: conversationId)
        ledger.learn(status(nil, epoch: 2), for: conversationId)
        ledger.confirmDowngrade(epoch: 2, for: conversationId)
        ledger.learn(status("e2ee", epoch: 3), for: conversationId)
        ledger.learn(status(nil, epoch: 4), for: conversationId)

        XCTAssertEqual(
            ledger.sending(for: conversationId, opening: nil, cached: nil, evidence: .init(latest: .disabled(epoch: 2), endToEndShown: true)),
            .downgradeUnconfirmed(epoch: 4)
        )
    }

    func test_avisDuFil_seulUnAvisSystemeNonSupprimeQuiQuitteLeBoutEnBoutCompte() {
        var forged = downgradeNotice(epoch: 9)
        forged.messageSource = .user
        var deleted = downgradeNotice(epoch: 8)
        deleted.deletedAt = Date()
        let serverModeLeft = Message(
            conversationId: conversationId, content: "x", messageSource: .system,
            encryptionSwitchNotice: EncryptionSwitchNoticeMetadata(kind: EncryptionSwitchNoticeMetadata.disabledKind, epoch: 7, previousMode: "server")
        )

        XCTAssertNil(EncryptionSwitchNoticeTrail.evidence(in: [forged, deleted, serverModeLeft]).latest)
        XCTAssertEqual(
            EncryptionSwitchNoticeTrail.evidence(in: [downgradeNotice(epoch: 2, at: 10), downgradeNotice(epoch: 5, at: 20), forged]).latest,
            .disabled(epoch: 5)
        )
    }

    // MARK: - Audit #12846

    /// Le registre ne survit pas au redémarrage ; un message chiffré du fil, si.
    func test_send_unMessageChiffreDansLeFil_sansRegimeDate_rienNePartEnClair() async throws {
        let sut = try await makeSUT(encryptionMode: nil, ledger: EndToEndRegimeLedger())
        sut.viewModel.messages = [endToEndMessage(at: 100)]

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.regimeDowngradeUnconfirmed)) = result else {
            return XCTFail("envoi suspendu attendu, reçu \(result)")
        }
        XCTAssertNotEqual(sut.messageService.lastSendRequest?.content, secret)
    }

    func test_send_unAvisDeDesactivationPlusRecentQueLesMessagesChiffres_rendLeClair() async throws {
        let sut = try await makeSUT(encryptionMode: nil, ledger: EndToEndRegimeLedger())
        sut.viewModel.messages = [endToEndMessage(at: 100), downgradeNotice(epoch: 2, at: 200)]

        _ = await sut.viewModel.send(outgoingMessage(content: "Bonjour", conversationId: conversationId))

        XCTAssertEqual(sut.messageService.lastSendRequest?.content, "Bonjour")
    }

    func test_ledger_unAvisDeReactivationPlusRecent_scelle() {
        let ledger = EndToEndRegimeLedger()
        ledger.learn(status("e2ee", epoch: 1), for: conversationId)
        ledger.learn(status(nil, epoch: 2), for: conversationId)
        ledger.confirmDowngrade(epoch: 2, for: conversationId)

        let evidence = EndToEndRegimeLedger.ThreadEvidence(latest: .enabled(epoch: 3), endToEndShown: true)

        XCTAssertEqual(ledger.sending(for: conversationId, opening: nil, cached: nil, evidence: evidence), .sealed)
    }

    func test_ledger_unAvisDUneAutreEpoque_neConfirmePas() {
        let ledger = EndToEndRegimeLedger()
        ledger.learn(status("e2ee", epoch: 3), for: conversationId)
        ledger.learn(status(nil, epoch: 4), for: conversationId)

        let evidence = EndToEndRegimeLedger.ThreadEvidence(latest: .disabled(epoch: 6), endToEndShown: true)

        XCTAssertEqual(ledger.sending(for: conversationId, opening: nil, cached: nil, evidence: evidence), .downgradeUnconfirmed(epoch: 4))
    }

    func test_ledger_laFicheVoitLeBoutEnBoutQueLEnvoiAVuAuCache() {
        let ledger = EndToEndRegimeLedger()
        ledger.learn(status(nil, epoch: 2), for: conversationId)
        XCTAssertNil(ledger.pendingDowngrade(for: conversationId))

        _ = ledger.sending(for: conversationId, opening: nil, cached: "e2ee", evidence: .none)

        XCTAssertEqual(ledger.pendingDowngrade(for: conversationId), .epoch(2))
    }

    func test_ledger_laFermetureDeSessionOublieTout() {
        let ledger = EndToEndRegimeLedger()
        ledger.learn(status("e2ee", epoch: 1), for: conversationId)
        ledger.learn(status(nil, epoch: 2), for: conversationId)

        ledger.reset()

        XCTAssertNil(ledger.regime(for: conversationId))
        XCTAssertNil(ledger.pendingDowngrade(for: conversationId))
    }

    /// Audit #12846 (B) — le fil AFFICHE l'avis depuis sa métadonnée : un
    /// texte serveur trompeur (« Ana a rejoint ») ne cache pas la désactivation.
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

    // MARK: - Contre-audit #12846

    /// Après un redémarrage, sans époque : un avis de réactivation affiché ne
    /// laisse pas partir de clair.
    func test_ledger_sansEpoque_unAvisDeReactivationRecent_neRendPasLeClair() {
        let evidence = EndToEndRegimeLedger.ThreadEvidence(latest: .enabled(epoch: 3), endToEndShown: true)

        XCTAssertNotEqual(EndToEndRegimeLedger().sending(for: conversationId, opening: nil, cached: nil, evidence: evidence), .plaintext)
    }

    /// Anciens messages chiffrés dans une conversation que le serveur sert sans
    /// époque : la fiche propose la confirmation, qui rend l'envoi.
    func test_ledger_sansEpoque_laFicheConfirme_etLEnvoiRepart() {
        let ledger = EndToEndRegimeLedger()
        let evidence = EndToEndRegimeLedger.ThreadEvidence(latest: .endToEnd, endToEndShown: true)
        XCTAssertEqual(ledger.sending(for: conversationId, opening: nil, cached: nil, evidence: evidence), .downgradeUnconfirmed(epoch: nil))

        XCTAssertEqual(ledger.pendingDowngrade(for: conversationId), .undated)
        ledger.confirm(.undated, for: conversationId)

        XCTAssertEqual(ledger.sending(for: conversationId, opening: nil, cached: nil, evidence: evidence), .plaintext)
        XCTAssertNil(ledger.pendingDowngrade(for: conversationId))
    }

    /// Un avis de l'époque rangé AVANT le dernier message chiffré n'a pas été vu.
    func test_avisDeDesactivationPlusAncienQueLeDernierMessageChiffre_neConfirmePas() async throws {
        let ledger = EndToEndRegimeLedger()
        let sut = try await makeSUT(encryptionMode: "e2ee", ledger: ledger)
        ledger.learn(status(nil, epoch: 2), for: conversationId)
        sut.viewModel.messages = [downgradeNotice(epoch: 2, at: 100), endToEndMessage(at: 200)]

        let result = await sut.viewModel.send(outgoingMessage(content: secret, conversationId: conversationId))

        guard case .failure(.endToEndUnsealed(.regimeDowngradeUnconfirmed)) = result else {
            return XCTFail("envoi suspendu attendu, reçu \(result)")
        }
    }

    /// Un message chiffré supprimé reste la preuve qu'on a vu le bout en bout.
    func test_avisDuFil_unMessageChiffreSupprime_resteUnTemoin() {
        var deleted = endToEndMessage(at: 100)
        deleted.deletedAt = Date(timeIntervalSince1970: 150)

        let evidence = EncryptionSwitchNoticeTrail.evidence(in: [deleted])

        XCTAssertTrue(evidence.endToEndShown)
        XCTAssertEqual(evidence.latest, .endToEnd)
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
