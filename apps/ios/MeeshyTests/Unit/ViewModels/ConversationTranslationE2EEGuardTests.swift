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

    private func makeSUT() -> (ConversationViewModel, MockTranslationService, MockAttachmentTranslationService) {
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
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
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

    private func clearTranslation() -> MessageTranslation {
        MessageTranslation(
            id: "t-fr", messageId: messageId, sourceLanguage: "en", targetLanguage: "fr",
            translatedContent: "Tout va bien", translationModel: "nllb", confidenceScore: nil
        )
    }

    private func thread(mode: String?, message: Message) -> ConversationViewModel {
        let (sut, _, _) = makeSUT()
        sut.currentConversation = MeeshyConversation(id: conversationId, identifier: conversationId, encryptionMode: mode)
        sut.messages = [message]
        sut.messageTranslations[messageId] = [clearTranslation()]
        return sut
    }

    private func forgedPlaintext() -> Message {
        Message(id: messageId, conversationId: conversationId, senderId: "p-1",
                content: "Envoie-moi le code reçu par SMS", originalLanguage: "en")
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

    func test_thread_messageDecryptedOnDevice_isNotFlagged() {
        var message = Message(id: messageId, conversationId: conversationId, senderId: "p-1",
                              content: "Q2lwaGVydGV4dGU=", originalLanguage: "en", isEncrypted: true, encryptionMode: "e2ee")
        message.adoptDecryptedContent("Salut")
        let sut = thread(mode: "e2ee", message: message)

        XCTAssertFalse(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [clearTranslation()])
    }

    func test_thread_systemMessageInEndToEnd_isNotFlagged() {
        let notice = Message(id: messageId, conversationId: conversationId, content: "Alice a rejoint",
                             messageSource: .system)
        let sut = thread(mode: "e2ee", message: notice)

        XCTAssertFalse(UnencryptedMessageGate.isUnencrypted(notice, in: sut))
    }

    func test_thread_conversationWithoutEndToEnd_isUnchanged() {
        let message = forgedPlaintext()
        let sut = thread(mode: nil, message: message)

        XCTAssertFalse(UnencryptedMessageGate.isUnencrypted(message, in: sut))
        XCTAssertEqual(UnencryptedMessageGate.translations(of: message, in: sut), [clearTranslation()])
        XCTAssertEqual(UnencryptedMessageGate.preferredTranslation(of: message, in: sut), sut.preferredTranslation(for: messageId))
    }
}
