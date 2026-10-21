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
}
