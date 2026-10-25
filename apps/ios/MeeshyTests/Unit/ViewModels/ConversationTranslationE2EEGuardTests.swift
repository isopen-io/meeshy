import XCTest
import Combine
import GRDB
@testable import Meeshy
import MeeshySDK

/// **Aucun texte clair ne part vers la traduction SERVEUR d'un message que le
/// serveur ne lit pas** (#11214, fail-closed). Le menu « Traduire » d'une
/// conversation chiffrée de bout en bout appelait `translationService.translate`
/// avec le clair déchiffré : le serveur recevait exactement ce que le chiffrement
/// lui retire. La traduction y passe par l'appareil (`DeviceTranslationCoordinator`) ;
/// une demande serveur est refusée AVANT tout appel, et le refus est dit.
@MainActor
final class ConversationTranslationE2EEGuardTests: XCTestCase {

    private let conversationId = "000000000000000000000077"
    private let messageId = "6a0ad86a6e21a483b4443d77"

    private func makeSUT(
        regimeMemory: any EndToEndRegimeMemoryProviding = EndToEndRegimeMemory(defaults: nil)
    ) -> (ConversationViewModel, MockTranslationService, MockAttachmentTranslationService) {
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: "000000000000000000000088", username: "lecteur", displayName: "Lecteur", systemLanguage: "fr"))
        let pool = try! DatabaseQueue()
        try! MessageDatabaseMigrations.runAll(on: pool)
        let translation = MockTranslationService()
        let audio = MockAttachmentTranslationService()
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(
                dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool), encryptedEra: ConversationEncryptedEra(memory: regimeMemory)
            ),
            translationService: translation,
            attachmentTranslationService: audio
        )
        return (sut, translation, audio)
    }

    private func encryptedMessage() -> Message {
        Message(id: messageId, conversationId: conversationId, senderId: "p-1", content: "Bonjour",
                isEncrypted: true, encryptionMode: "e2ee")
    }

    func test_text_inAnEndToEndConversation_neverReachesTheServer() async {
        let (sut, translation, _) = makeSUT()
        var refusals: [ConversationViewModel.TranslationRequestFailure] = []
        let token = sut.translationRequestFailed.sink { refusals.append($0) }
        defer { token.cancel() }

        await sut.requestTextTranslation(
            messageId: messageId, content: "Bonjour", sourceLanguage: "fr", targetLanguage: "en",
            conversationEncryptionMode: "e2ee"
        )

        XCTAssertEqual(translation.translateCallCount, 0)
        XCTAssertEqual(refusals.map(\.kind), [.text], "le refus est DIT : la feuille quitte son état « en cours »")
        XCTAssertNil(sut.messageTranslations[messageId])
        XCTAssertFalse(sut.translatingTextLanguages[messageId]?.contains("en") ?? false)
    }

    func test_text_ofAnEncryptedMessage_neverReachesTheServer_evenInAPlainConversation() async {
        let (sut, translation, _) = makeSUT()
        sut.messages = [encryptedMessage()]

        await sut.requestTextTranslation(
            messageId: messageId, content: "Bonjour", sourceLanguage: "fr", targetLanguage: "en",
            conversationEncryptionMode: nil
        )

        XCTAssertEqual(translation.translateCallCount, 0)
    }

    func test_text_anUnknownConversationMode_failsClosed() async {
        let (sut, translation, _) = makeSUT()

        await sut.requestTextTranslation(
            messageId: messageId, content: "Bonjour", sourceLanguage: "fr", targetLanguage: "en",
            conversationEncryptionMode: "inconnu"
        )

        XCTAssertEqual(translation.translateCallCount, 0, "un régime inconnu se lit comme un régime que le serveur ne lit pas")
    }

    func test_audio_inAnEndToEndConversation_neverReachesTheServer() async {
        let (sut, _, audio) = makeSUT()

        await sut.requestAudioTranslation(
            messageId: messageId, attachmentId: "att-1", sourceLanguage: "fr", targetLanguage: "en",
            conversationEncryptionMode: "e2ee"
        )

        XCTAssertEqual(audio.translateCallCount, 0)
        XCTAssertFalse(sut.translatingAudioLanguages[messageId]?.contains("en") ?? false)
    }

    func test_text_inAServerReadableConversation_stillTranslates() async {
        let (sut, translation, _) = makeSUT()

        await sut.requestTextTranslation(
            messageId: messageId, content: "Bonjour", sourceLanguage: "fr", targetLanguage: "en",
            conversationEncryptionMode: "server"
        )

        XCTAssertEqual(translation.translateCallCount, 1)
    }

    // MARK: - Un message en clair dans une conversation chiffrée (#11380)

    private let activation = Date(timeIntervalSince1970: 1_000)
    private let afterActivation = Date(timeIntervalSince1970: 2_000)

    private func clearTranslation() -> MessageTranslation {
        MessageTranslation(
            id: "t-fr", messageId: messageId, sourceLanguage: "en", targetLanguage: "fr",
            translatedContent: "Tout va bien", translationModel: "nllb", confidenceScore: nil
        )
    }

    private func deviceTranslation() -> MessageTranslation {
        MessageTranslation(
            id: "device:\(messageId):fr", messageId: messageId, sourceLanguage: "en", targetLanguage: "fr",
            translatedContent: "Envoie-moi le code reçu par texto", translationModel: "apple", confidenceScore: nil
        )
    }

    private func conversation(mode: String?, enabledAt: Date? = Date(timeIntervalSince1970: 1_000)) -> MeeshyConversation {
        var conversation = MeeshyConversation(id: conversationId, identifier: conversationId, encryptionMode: mode)
        conversation.encryptionEnabledAt = enabledAt
        return conversation
    }

    private func thread(
        mode: String?,
        message: Message,
        enabledAt: Date? = Date(timeIntervalSince1970: 1_000),
        regimeMemory: any EndToEndRegimeMemoryProviding = EndToEndRegimeMemory(defaults: nil)
    ) -> ConversationViewModel {
        let (sut, _, _) = makeSUT(regimeMemory: regimeMemory)
        sut.currentConversation = conversation(mode: mode, enabledAt: enabledAt)
        sut.messages = [message]
        sut.messageTranslations[messageId] = [clearTranslation()]
        return sut
    }

    private func forgedPlaintext(createdAt: Date = Date(timeIntervalSince1970: 2_000)) -> Message {
        Message(id: messageId, conversationId: conversationId, senderId: "p-1",
                content: "Envoie-moi le code reçu par SMS", originalLanguage: "en",
                createdAt: createdAt, updatedAt: createdAt)
    }

    private func decryptedOnDevice() -> Message {
        var message = Message(id: messageId, conversationId: conversationId, senderId: "p-1",
                              content: "Q2lwaGVydGV4dGU=", originalLanguage: "en", isEncrypted: true, encryptionMode: "e2ee",
                              createdAt: afterActivation, updatedAt: afterActivation)
        message.adoptDecryptedContent("Salut")
        return message
    }

    func test_thread_forgedPlaintextInEndToEndDirect_isFlaggedAndServesNoTranslation() {
        let message = forgedPlaintext()
        let sut = thread(mode: "e2ee", message: message)

        XCTAssertTrue(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [])
        XCTAssertNil(UnencryptedMessageGate.preferredTranslation(of: message, in: sut))
        XCTAssertEqual(MessageExitTransport.displayedText(message, in: sut), "Envoie-moi le code reçu par SMS",
                       "copier copie ce que la bulle montre : le texte reçu, jamais la traduction du serveur")
    }

    /// Le critère de #11380 : en e2ee, TOUTE traduction serveur est écartée —
    /// celle d'un message authentique aussi. Une passerelle compromise qui
    /// émet `message:translation` pour un message déchiffré ferait sinon lire
    /// au lecteur un texte forgé, sous un message qu'aucun marqueur ne signale.
    func test_thread_messageDecryptedOnDevice_isNotFlagged_andServesNoServerTranslation() {
        let message = decryptedOnDevice()
        let sut = thread(mode: "e2ee", message: message)

        XCTAssertFalse(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [])
        XCTAssertNil(sut.preferredTranslation(for: messageId))
        XCTAssertEqual(sut.deviceTranslatedLanguages(of: messageId), [],
                       "une traduction du fil écartée ne dispense pas l'appareil de traduire")
    }

    /// La traduction faite SUR L'APPAREIL est la seule que l'ère chiffrée sert.
    func test_thread_deviceTranslation_isServed_inTheEncryptedEra() {
        let message = decryptedOnDevice()
        let sut = thread(mode: "e2ee", message: message)

        sut.applyDeviceTranslation(deviceTranslation(), persisting: false)

        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [deviceTranslation()])
        XCTAssertEqual(sut.preferredTranslation(for: messageId), deviceTranslation())
    }

    /// Un message SIGNALÉ garde la traduction que l'appareil fait du texte
    /// reçu : le Prisme ne se casse pas, et « Traduire » n'est pas inerte.
    func test_thread_flaggedMessage_servesItsDeviceTranslation_neverTheServers() {
        let message = forgedPlaintext()
        let sut = thread(mode: "e2ee", message: message)

        sut.applyDeviceTranslation(deviceTranslation(), persisting: false)

        XCTAssertTrue(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [deviceTranslation()])
        XCTAssertEqual(UnencryptedMessageGate.preferredTranslation(of: message, in: sut), deviceTranslation())
    }

    /// Une bascule manuelle vers une traduction du serveur ne la fait pas servir.
    func test_thread_manualOverrideToAServerTranslation_isNotServed_inTheEncryptedEra() {
        let message = decryptedOnDevice()
        let sut = thread(mode: "e2ee", message: message)

        sut.setActiveTranslation(for: messageId, translation: clearTranslation())

        XCTAssertNil(sut.preferredTranslation(for: messageId))
    }

    /// L'E2EE s'active sur une conversation EXISTANTE (#9224) : l'historique
    /// en clair d'avant l'activation n'est ni signalé, ni privé de ses traductions.
    func test_thread_historyBeforeActivation_isOrdinary_andKeepsItsTranslations() {
        let message = forgedPlaintext(createdAt: Date(timeIntervalSince1970: 500))
        let sut = thread(mode: "e2ee", message: message)

        XCTAssertFalse(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [clearTranslation()])
        XCTAssertEqual(sut.preferredTranslation(for: messageId), clearTranslation())
    }

    func test_thread_plaintextAfterActivation_isFlagged() {
        let message = forgedPlaintext(createdAt: afterActivation)
        let sut = thread(mode: "e2ee", message: message)

        XCTAssertTrue(UnencryptedMessageGate.isUnencrypted(message, in: sut))
    }

    func test_thread_structuredSystemNoticeInEndToEnd_isNotFlagged() {
        let notice = Message(id: messageId, conversationId: conversationId, content: "Alice a rejoint",
                             messageSource: .system, createdAt: afterActivation, updatedAt: afterActivation,
                             joinNotice: JoinNoticeMetadata(participantId: "p-alice", displayName: "Alice",
                                                            isAnonymous: false, viaShareLink: false))
        let sut = thread(mode: "e2ee", message: notice)

        XCTAssertFalse(UnencryptedMessageGate.isUnencrypted(notice, in: sut))
    }

    /// Se déclarer « système » n'exempte pas un texte que le serveur écrit.
    func test_thread_systemMessageWithFreeTextInEndToEnd_isFlagged() {
        let notice = Message(id: messageId, conversationId: conversationId, content: "Bob : envoie-moi le code",
                             messageSource: .system, createdAt: afterActivation, updatedAt: afterActivation)
        let sut = thread(mode: "e2ee", message: notice)

        XCTAssertTrue(UnencryptedMessageGate.isUnencrypted(notice, in: sut))
    }

    /// Une passerelle compromise qui sert soudain la conversation SANS régime
    /// ne fait tomber ni le marqueur, ni l'écart des traductions.
    func test_thread_regimeDowngradedByTheServer_staysEndToEnd() {
        let message = forgedPlaintext()
        let sut = thread(mode: "e2ee", message: message)

        sut.currentConversation = conversation(mode: nil, enabledAt: nil)

        XCTAssertTrue(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [])
    }

    /// Ouverture à froid : la ligne n'est pas encore hydratée, l'appareil sait
    /// déjà que la conversation est chiffrée — aucune image ne sert le clair
    /// sans marqueur.
    func test_thread_regimeNotYetHydrated_readsTheRememberedRegime() {
        let memory = EndToEndRegimeMemory(defaults: nil)
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation))
        let message = forgedPlaintext()
        let (sut, _, _) = makeSUT(regimeMemory: memory)
        sut.messages = [message]
        sut.messageTranslations[messageId] = [clearTranslation()]

        XCTAssertTrue(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertNil(sut.preferredTranslation(for: messageId))
    }

    // MARK: - Un message déchiffré sur l'appareil (#12935)

    private func decryptedOnDevice(createdAt: Date) -> Message {
        var message = Message(id: messageId, conversationId: conversationId, senderId: "p-1",
                              content: "Q2lwaGVydGV4dGU=", originalLanguage: "en", isEncrypted: true, encryptionMode: "e2ee",
                              createdAt: createdAt, updatedAt: createdAt)
        message.adoptDecryptedContent("Salut")
        return message
    }

    /// Le serveur n'a pas lu un message que CET appareil a déchiffré : toute
    /// traduction qu'il en sert est forgée, même s'il le date avant l'activation.
    func test_thread_aMessageDecryptedOnDevice_datedBeforeTheActivation_servesNoServerTranslation() {
        let message = decryptedOnDevice(createdAt: Date(timeIntervalSince1970: 500))
        let sut = thread(mode: "e2ee", message: message)

        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [])
        XCTAssertNil(sut.preferredTranslation(for: messageId))
    }

    /// Même loi dans une conversation que l'appareil n'a jamais vue chiffrée.
    func test_thread_aMessageDecryptedOnDevice_inAConversationNeverSeenEncrypted_servesNoServerTranslation() {
        let message = decryptedOnDevice(createdAt: afterActivation)
        let sut = thread(mode: nil, message: message, enabledAt: nil)

        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [])
        XCTAssertNil(sut.preferredTranslation(for: messageId))
    }

    // MARK: - Une activation servie dans le futur (#12936)

    /// Une date d'activation lue sans époque est bornée par l'horloge de
    /// l'appareil : une activation dans le futur ne range pas le fil avant l'ère chiffrée.
    func test_thread_anActivationServedInTheFuture_doesNotUnflagAForgedPlaintext() {
        let message = forgedPlaintext(createdAt: afterActivation)
        let sut = thread(mode: "e2ee", message: message, enabledAt: Date().addingTimeInterval(10 * 365 * 86_400))

        XCTAssertTrue(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [])
    }

    // MARK: - La mémoire du régime appartient à un compte (#12937)

    func test_memory_isKeptPerAccount_andSurvivesARelaunch() throws {
        let suite = "meeshy.tests.regime.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let memory = EndToEndRegimeMemory(defaults: defaults)
        memory.bind(account: "staging.meeshy.me/account-a")
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation))

        memory.bind(account: "staging.meeshy.me/account-b")
        XCTAssertFalse(memory.resolve(conversationId: conversationId, served: .serverReadable).isEndToEnd,
                       "le compte B ne lit pas ce que le compte A a vu")

        let relaunched = EndToEndRegimeMemory(defaults: defaults)
        relaunched.bind(account: "staging.meeshy.me/account-a")
        XCTAssertTrue(relaunched.resolve(conversationId: conversationId, served: .serverReadable).isEndToEnd)
    }

    func test_memory_theDeviceWideRecord_isAdoptedByTheFirstAccount_thenForgotten() throws {
        let suite = "meeshy.tests.regime.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let legacy = try JSONEncoder().encode([conversationId: EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation)])
        defaults.set(legacy, forKey: "meeshy.e2ee.regime.v1")

        let memory = EndToEndRegimeMemory(defaults: defaults)
        memory.bind(account: "staging.meeshy.me/account-a")

        XCTAssertTrue(memory.resolve(conversationId: conversationId, served: .serverReadable).isEndToEnd)
        XCTAssertNil(defaults.data(forKey: "meeshy.e2ee.regime.v1"), "la mémoire de l'appareil ne passe pas à un second compte")
    }

    // MARK: - Après une désactivation datée (#12883)

    private let deactivation = Date(timeIntervalSince1970: 5_000)

    /// L'appareil a vu le chiffrement, puis le registre du régime — celui que
    /// l'envoi lit — apprend une désactivation DATÉE par son époque.
    private func memoryAfterADatedDeactivation() -> EndToEndRegimeMemory {
        let memory = EndToEndRegimeMemory(defaults: nil, now: { [deactivation] in deactivation })
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation))
        let ledger = EndToEndRegimeLedger(memory: memory)
        ledger.learn(ConversationEncryptionStatus(isEncrypted: false, mode: nil, epoch: 2), for: conversationId)
        ledger.confirmDowngrade(epoch: 2, for: conversationId)
        return memory
    }

    func test_thread_afterADatedDeactivation_thePeersNextPlaintextIsOrdinaryAndTranslatedByTheServer() {
        let message = forgedPlaintext(createdAt: Date(timeIntervalSince1970: 9_000))
        let sut = thread(mode: nil, message: message, enabledAt: nil, regimeMemory: memoryAfterADatedDeactivation())

        XCTAssertFalse(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [clearTranslation()])
    }

    func test_thread_afterADatedDeactivation_aPlaintextOfTheEncryptedEraKeepsItsVerdict() {
        let message = forgedPlaintext(createdAt: afterActivation)
        let sut = thread(mode: nil, message: message, enabledAt: nil, regimeMemory: memoryAfterADatedDeactivation())

        XCTAssertTrue(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [])
    }

    /// L'événement socket porte l'instant de la bascule ; la frontière de l'ère
    /// n'est jamais antérieure à l'instant où l'appareil l'apprend, et la
    /// lecture ne l'apprend qu'une fois la bascule vue (revue #12846).
    func test_ledger_aDatedDeactivationEvent_isLearnedByTheReadingMemory() {
        let memory = EndToEndRegimeMemory(defaults: nil, now: { [deactivation] in deactivation })
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation))
        let ledger = EndToEndRegimeLedger(memory: memory)

        ledger.learn(ConversationEncryptionChangedEvent(
            conversationId: conversationId, isEncrypted: false, mode: nil, epoch: 2,
            changedByUserId: "p-1", changedAt: "1970-01-01T01:23:20.000Z"
        ))
        ledger.confirmDowngrade(epoch: 2, for: conversationId)

        let regime = memory.resolve(conversationId: conversationId, served: .serverReadable)
        XCTAssertFalse(regime.isEndToEnd)
        XCTAssertTrue(regime.governs(createdAt: Date(timeIntervalSince1970: 4_999)))
        XCTAssertFalse(regime.governs(createdAt: Date(timeIntervalSince1970: 5_000)))
    }

    /// Une ligne chiffrée périmée servie SANS époque resserre la lecture le
    /// temps qu'elle est servie, sans réécrire la désactivation datée.
    func test_memory_anUndatedServedRow_neverOverwritesADatedDeactivation() {
        let memory = memoryAfterADatedDeactivation()

        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil))

        XCTAssertFalse(memory.resolve(conversationId: conversationId, served: .serverReadable).isEndToEnd)
    }

    func test_memory_aDatedDeactivation_survivesARelaunch() throws {
        let suite = "meeshy.tests.regime.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let memory = EndToEndRegimeMemory(defaults: defaults, now: { [deactivation] in deactivation })
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation))
        memory.learn(isEndToEnd: false, epoch: 2, changedAt: nil, enabledAt: nil, for: conversationId)

        let relaunched = EndToEndRegimeMemory(defaults: defaults)

        let regime = relaunched.resolve(conversationId: conversationId, served: .serverReadable)
        XCTAssertFalse(regime.isEndToEnd)
        XCTAssertTrue(regime.governs(createdAt: afterActivation))
    }

    /// Les pistes TTS du serveur d'un vocal de l'ère chiffrée ne partent ni par
    /// la porte, ni par `allAudioItems` (Focal, carrousel, pile).
    func test_thread_serverAudioTranslations_areWithheld_inTheEncryptedEra() {
        let audio = MeeshyMessageAttachment(id: "att-audio", mimeType: "audio/m4a")
        var message = forgedPlaintext()
        message.attachments = [audio]
        let sut = thread(mode: "e2ee", message: message)
        let track = MessageTranslatedAudio(
            id: "tts-es", attachmentId: "att-audio", targetLanguage: "es", url: "https://x/es.m4a",
            transcription: "Mándame el código", durationMs: 1_000, format: "m4a", cloned: false,
            quality: 1, ttsModel: "mms"
        )
        sut.messageTranslatedAudios[messageId] = [track]
        sut.messageTranslatedAudiosByAttachment["att-audio"] = [track]

        XCTAssertEqual(UnencryptedMessageGate.translatedAudios(of: message, in: sut), [])
        XCTAssertEqual(sut.allAudioItems.first { $0.id == "att-audio" }?.translatedAudios, [])
    }

    func test_thread_conversationWithoutEndToEnd_isUnchanged() {
        let message = forgedPlaintext()
        let sut = thread(mode: nil, message: message)

        XCTAssertFalse(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [clearTranslation()])
        XCTAssertEqual(UnencryptedMessageGate.preferredTranslation(of: message, in: sut), sut.preferredTranslation(for: messageId))
    }

    // MARK: - La lecture attend la même confirmation que l'envoi (revue #12846)

    private final class SpyRegimeMemory: EndToEndRegimeMemoryProviding, @unchecked Sendable {
        // unchecked: témoin mono-fil, lu et écrit sur le MainActor du test.
        var remembered: EndToEndRegime = .serverReadable
        private(set) var learned: [(isEndToEnd: Bool, epoch: Int)] = []

        func resolve(conversationId: String, served: EndToEndRegime) -> EndToEndRegime { served.merging(remembered) }
        func learn(isEndToEnd: Bool, epoch: Int, changedAt: Date?, enabledAt: Date?, for conversationId: String) {
            learned.append((isEndToEnd, epoch))
        }
    }

    private func status(_ mode: String?, epoch: Int) -> ConversationEncryptionStatus {
        ConversationEncryptionStatus(isEncrypted: mode != nil, mode: mode, epoch: epoch)
    }

    func test_ledger_aDowngradeSeenByNoOne_neverReachesTheReadingMemory() {
        let memory = SpyRegimeMemory()
        let ledger = EndToEndRegimeLedger(memory: memory)

        ledger.learn(status("e2ee", epoch: 1), for: conversationId)
        ledger.learn(status(nil, epoch: 2), for: conversationId)
        ledger.learn(ConversationEncryptionChangedEvent(
            conversationId: conversationId, isEncrypted: false, mode: nil, epoch: 2,
            changedByUserId: "p-1", changedAt: "1970-01-01T01:23:20.000Z"
        ))

        XCTAssertEqual(memory.learned.map(\.isEndToEnd), [true], "les activations passent, la désactivation non vue attend")
    }

    func test_ledger_aConfirmedDowngrade_reachesTheReadingMemory() {
        let memory = SpyRegimeMemory()
        let ledger = EndToEndRegimeLedger(memory: memory)
        ledger.learn(status("e2ee", epoch: 1), for: conversationId)
        ledger.learn(status(nil, epoch: 2), for: conversationId)

        ledger.confirmDowngrade(epoch: 2, for: conversationId)

        XCTAssertEqual(memory.learned.map(\.isEndToEnd), [true, false])
        XCTAssertEqual(memory.learned.last?.epoch, 2)
    }

    func test_ledger_aDowngradeShownInTheThread_reachesTheReadingMemory() {
        let memory = SpyRegimeMemory()
        let ledger = EndToEndRegimeLedger(memory: memory)
        ledger.learn(status("e2ee", epoch: 1), for: conversationId)
        ledger.learn(status(nil, epoch: 2), for: conversationId)

        _ = ledger.sending(for: conversationId, opening: nil, cached: nil, evidence: .init(latest: .disabled(epoch: 2), endToEndShown: true))

        XCTAssertEqual(memory.learned.map(\.isEndToEnd), [true, false])
    }

    /// La mémoire de LECTURE a vu le chiffrement (ligne servie) sans que
    /// l'envoi l'ait vu : la désactivation attend aussi.
    func test_ledger_aConversationTheReadingMemoryKnowsEncrypted_holdsTheDowngrade() {
        let memory = SpyRegimeMemory()
        memory.remembered = EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation)
        let ledger = EndToEndRegimeLedger(memory: memory)

        ledger.learn(status(nil, epoch: 2), for: conversationId)

        XCTAssertTrue(memory.learned.isEmpty)
    }

    func test_ledger_aConversationNeverSeenEncrypted_passesTheDowngradeAtOnce() {
        let memory = SpyRegimeMemory()
        let ledger = EndToEndRegimeLedger(memory: memory)

        ledger.learn(status(nil, epoch: 2), for: conversationId)

        XCTAssertEqual(memory.learned.map(\.isEndToEnd), [false])
    }

    /// La frontière d'une désactivation n'est jamais antérieure au moment où
    /// l'appareil l'apprend : une date serveur antérieure à l'activation n'efface
    /// pas l'ère chiffrée.
    func test_memory_aBackdatedDeactivation_neverErasesTheEncryptedEra() {
        let memory = EndToEndRegimeMemory(defaults: nil, now: { [deactivation] in deactivation })
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation))

        memory.learn(isEndToEnd: false, epoch: 2, changedAt: Date(timeIntervalSince1970: 100), enabledAt: nil, for: conversationId)

        let regime = memory.resolve(conversationId: conversationId, served: .serverReadable)
        XCTAssertTrue(regime.governs(createdAt: afterActivation))
        XCTAssertTrue(regime.governs(createdAt: Date(timeIntervalSince1970: 4_999)), "la frontière est l'instant où l'appareil l'apprend")
    }

}
