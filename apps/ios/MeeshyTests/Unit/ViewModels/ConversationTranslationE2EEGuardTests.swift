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
                persistence: MessagePersistenceActor(dbWriter: pool), encryptedEra: ConversationEncryptedEra(memory: regimeMemory)
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
    /// l'appareil : une activation dans le futur ne range pas avant l'ère
    /// chiffrée un message arrivé après que l'appareil l'a lue.
    func test_thread_anActivationServedInTheFuture_doesNotUnflagAForgedPlaintext() {
        let message = forgedPlaintext(createdAt: Date().addingTimeInterval(60))
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

    /// La mémoire d'avant le rangement par compte valait pour tout l'appareil :
    /// chaque compte la reprend (elle ne peut que fermer), aucun ne la perd
    /// parce qu'un autre s'est lié avant lui (audit #12950, B2).
    func test_memory_theDeviceWideRecord_isAdoptedByEveryAccount() throws {
        let suite = "meeshy.tests.regime.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let legacy = try JSONEncoder().encode([conversationId: EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation)])
        defaults.set(legacy, forKey: "meeshy.e2ee.regime.v1")
        let memory = EndToEndRegimeMemory(defaults: defaults)

        memory.bind(account: "staging.meeshy.me/account-a")
        XCTAssertTrue(memory.resolve(conversationId: conversationId, served: .serverReadable).isEndToEnd)
        memory.bind(account: nil)
        memory.bind(account: "staging.meeshy.me/account-b")

        XCTAssertTrue(memory.resolve(conversationId: conversationId, served: .serverReadable).isEndToEnd)
    }

    /// Une date d'activation retenue avant la borne (#12936) l'est à la relecture.
    func test_memory_aFutureActivationRecordedBeforeTheBound_isBoundedWhenRead() throws {
        let suite = "meeshy.tests.regime.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let future = Date().addingTimeInterval(10 * 365 * 86_400).timeIntervalSinceReferenceDate
        let legacy: [String: Any] = [conversationId: ["isEndToEnd": true, "enabledAt": future], "illisible": 42]
        defaults.set(try JSONSerialization.data(withJSONObject: legacy), forKey: EndToEndRegimeMemory.legacyStorageKey)
        let memory = EndToEndRegimeMemory(defaults: defaults)

        memory.bind(account: "staging.meeshy.me/account-a")

        XCTAssertTrue(memory.resolve(conversationId: conversationId, served: .serverReadable)
            .governs(createdAt: Date().addingTimeInterval(60)))
    }

    // MARK: - Aucune traduction serveur demandée dans une conversation vue chiffrée (audit #12950, B1)

    private func rememberedEndToEnd() -> EndToEndRegimeMemory {
        let memory = EndToEndRegimeMemory(defaults: nil)
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation))
        return memory
    }

    /// Le serveur ressert un message déchiffré sur l'appareil étiqueté
    /// « server » : son clair ne part pas à la traduction du serveur.
    func test_text_ofAMessageDecryptedOnDevice_relabeledServerReadable_neverReachesTheServer() async {
        let (sut, translation, _) = makeSUT(regimeMemory: rememberedEndToEnd())
        var message = Message(id: messageId, conversationId: conversationId, senderId: "p-1", content: "Q2lwaGVy",
                              isEncrypted: true, encryptionMode: "server")
        message.adoptDecryptedContent("Salut")
        sut.messages = [message]

        await sut.requestTextTranslation(
            messageId: messageId, content: "Salut", sourceLanguage: "fr", targetLanguage: "en",
            conversationEncryptionMode: nil
        )

        XCTAssertEqual(translation.translateCallCount, 0)
    }

    /// Une conversation vue chiffrée, servie sans mode : la traduction se fait sur l'appareil.
    func test_text_inAConversationRememberedEncrypted_servedWithoutMode_neverReachesTheServer() async {
        let (sut, translation, audio) = makeSUT(regimeMemory: rememberedEndToEnd())

        await sut.requestTextTranslation(
            messageId: messageId, content: "Bonjour", sourceLanguage: "fr", targetLanguage: "en",
            conversationEncryptionMode: nil
        )
        await sut.requestAudioTranslation(
            messageId: messageId, attachmentId: "att-1", sourceLanguage: "fr", targetLanguage: "en",
            conversationEncryptionMode: "server"
        )

        XCTAssertEqual(translation.translateCallCount, 0)
        XCTAssertEqual(audio.translateCallCount, 0)
    }

    // MARK: - Une conversation vue chiffrée le reste (#12949)

    /// Statut et événement socket servis sans mode n'ouvrent rien : la lecture
    /// reste dans l'ère chiffrée, comme l'envoi reste scellé.
    func test_memory_aServedDowngrade_neverClosesTheEncryptedEra() {
        let memory = EndToEndRegimeMemory(defaults: nil)
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation))
        let ledger = EndToEndRegimeLedger(memory: memory)
        ledger.learn(ConversationEncryptionStatus(isEncrypted: false, mode: nil, epoch: 2), for: conversationId)
        ledger.learn(ConversationEncryptionChangedEvent(
            conversationId: conversationId, isEncrypted: false, mode: nil, epoch: 2,
            changedByUserId: "p-1", changedAt: "1970-01-01T01:23:20.000Z"
        ))
        let message = forgedPlaintext(createdAt: Date(timeIntervalSince1970: 9_000))
        let sut = thread(mode: nil, message: message, enabledAt: nil, regimeMemory: memory)

        XCTAssertTrue(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [])
    }

    /// Une activation servie plus tard, ou sans date, ne fait pas reculer la
    /// frontière connue vers le présent : seule une date plus ANCIENNE la déplace.
    func test_memory_theActivationBoundary_onlyMovesEarlier() {
        let memory = EndToEndRegimeMemory(defaults: nil)
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation))

        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: afterActivation))
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: nil))
        XCTAssertEqual(memory.resolve(conversationId: conversationId, served: .serverReadable).enabledAt, activation)

        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: Date(timeIntervalSince1970: 400)))
        XCTAssertEqual(memory.resolve(conversationId: conversationId, served: .serverReadable).enabledAt, Date(timeIntervalSince1970: 400))
    }

    /// La mémoire d'une version où le chiffrement se désactivait (#12883) : une
    /// ère chiffrée CLOSE redevient une conversation chiffrée de bout en bout,
    /// depuis le début de sa première ère.
    func test_memory_aClosedEraRecordedBeforeTheDecision_staysEndToEnd() throws {
        let suite = "meeshy.tests.regime.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let reference = { (seconds: TimeInterval) in Date(timeIntervalSince1970: seconds).timeIntervalSinceReferenceDate }
        let legacy: [String: Any] = [conversationId: [
            "isEndToEnd": false, "epoch": 2, "disabledAt": reference(5_000),
            "closedEras": [["start": reference(1_000), "end": reference(5_000)]],
        ]]
        defaults.set(try JSONSerialization.data(withJSONObject: legacy), forKey: EndToEndRegimeMemory.legacyStorageKey)
        let memory = EndToEndRegimeMemory(defaults: defaults)

        memory.bind(account: "staging.meeshy.me/account-a")

        let regime = memory.resolve(conversationId: conversationId, served: .serverReadable)
        XCTAssertTrue(regime.isEndToEnd)
        XCTAssertEqual(regime.enabledAt, activation)
        XCTAssertTrue(regime.governs(createdAt: Date(timeIntervalSince1970: 9_000)))
    }

    /// Sans compte (déconnexion), la mémoire ne lit plus rien de l'ancien compte.
    func test_memory_unbinding_forgetsTheAccount() {
        let memory = EndToEndRegimeMemory(defaults: nil)
        memory.bind(account: "staging.meeshy.me/account-a")
        _ = memory.resolve(conversationId: conversationId, served: EndToEndRegime(encryptionMode: "e2ee", enabledAt: activation))

        memory.bind(account: nil)

        XCTAssertFalse(memory.resolve(conversationId: conversationId, served: .serverReadable).isEndToEnd)
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

}
