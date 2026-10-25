import XCTest
import Combine
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **La ligne de liste d'une conversation chiffrée montre le texte que
/// l'appareil sait lire** (#12968).
///
/// Le serveur ne sert que le scellé (« 🔒 Message chiffré ») ; le clair vit
/// dans le coffre local, que le fil lisait seul. La ligne le lit désormais par
/// le même coffre et le même socle de place, le tient en mémoire, et garde le
/// libellé pour ce que cet appareil n'a pas pu déchiffrer.
@MainActor
final class ConversationListEndToEndTextsTests: XCTestCase {

    private let conversationId = "00000000000000000000ab01"
    private let me = "00000000000000000000aa11"
    private let peer = "00000000000000000000bb22"
    private let messageId = "00000000000000000000ab51"

    private func sealedRow(
        id: String? = nil, lastMessageId: String? = nil, senderUserId: String? = nil
    ) -> Conversation {
        var row = Conversation(
            id: id ?? conversationId, identifier: id ?? conversationId, type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 1_790_000_000),
            encryptionMode: E2EEWire.mode, lastMessagePreview: "",
            lastMessageId: lastMessageId ?? messageId
        )
        row.lastMessageSenderName = "Vous"
        row.lastMessageSenderUserId = senderUserId ?? me
        row.lastMessageNature = LastMessageNature(messageType: "text", isEncrypted: true)
        return row
    }

    private func content(_ text: String, in conversation: String? = nil, language: String? = "fr") -> E2EEContent {
        E2EEContent(
            text: text, language: language, replyTo: nil,
            conversationId: conversation ?? conversationId, clientMessageId: "cmid-1", sentAt: Date()
        )
    }

    // MARK: - Lois pures

    func test_adoption_myOwnSentMessage_isReadOnTheRow() {
        let entry = E2EEPlaintextEntry.readable(content("On se voit à 18 h"), senderUserId: me)

        let text = ConversationListEndToEndTexts.adoption(of: entry, for: sealedRow())

        XCTAssertEqual(text, ConversationPreviewDeviceText(messageId: messageId, text: "On se voit à 18 h", language: "fr"))
    }

    func test_adoption_peerMessageOpenedByLibsignal_isReadOnTheRow() {
        let entry = E2EEPlaintextEntry.readable(content("Bien reçu"), senderUserId: peer)

        let text = ConversationListEndToEndTexts.adoption(of: entry, for: sealedRow(senderUserId: peer))

        XCTAssertEqual(text?.text, "Bien reçu")
    }

    func test_adoption_undecryptable_keepsTheLabel() {
        XCTAssertNil(ConversationListEndToEndTexts.adoption(of: .undecryptable, for: sealedRow()))
        XCTAssertNil(ConversationListEndToEndTexts.adoption(of: nil, for: sealedRow()))
    }

    func test_adoption_plaintextWrittenForAnotherConversation_isRefused() {
        let entry = E2EEPlaintextEntry.readable(content("Ailleurs", in: "00000000000000000000ab99"), senderUserId: me)

        XCTAssertNil(ConversationListEndToEndTexts.adoption(of: entry, for: sealedRow()))
    }

    func test_adoption_authorTheServerReassigned_isRefused() {
        let entry = E2EEPlaintextEntry.readable(content("Envoie-moi le code"), senderUserId: me)

        XCTAssertNil(ConversationListEndToEndTexts.adoption(of: entry, for: sealedRow(senderUserId: peer)))
    }

    func test_adoption_rowWithoutAuthor_isRefused() {
        var row = sealedRow()
        row.lastMessageSenderUserId = nil

        XCTAssertNil(ConversationListEndToEndTexts.adoption(
            of: .readable(content("Sans auteur"), senderUserId: me), for: row
        ))
    }

    func test_adoption_rowNotSealed_isNotTouched() {
        var row = sealedRow()
        row.lastMessageNature = LastMessageNature(messageType: "text", isEncrypted: false)

        XCTAssertNil(ConversationListEndToEndTexts.adoption(
            of: .readable(content("Clair servi"), senderUserId: me), for: row
        ))
    }

    func test_kept_dropsTheTextOfALastMessageThatChanged() {
        let known = [conversationId: ConversationPreviewDeviceText(messageId: messageId, text: "Ancien", language: nil)]

        let kept = ConversationListEndToEndTexts.kept(known, in: [sealedRow(lastMessageId: "00000000000000000000ab52")])

        XCTAssertTrue(kept.isEmpty)
    }

    func test_resolve_readsTheVaultOnlyForRowsStillWaiting() async {
        let vault = MockEndToEndMessaging()
        vault.store(.readable(content("Nouveau"), senderUserId: me), for: messageId)

        let texts = await ConversationListEndToEndTexts.resolve([sealedRow()], known: [:], from: vault)

        XCTAssertEqual(texts[conversationId]?.text, "Nouveau")
    }

    // MARK: - Rendu de la ligne

    func test_previewLine_readOnDevice_showsTheTextInsteadOfTheLabel() {
        let device = ConversationPreviewDeviceText(messageId: messageId, text: "On se voit à 18 h", language: "fr")
        let strings = ConversationPreviewStrings(language: "fr") { $0.rawValue }

        let sealed = ConversationPreviewLine.preview(
            for: sealedRow(), viewerId: me, preferredLanguages: ["fr"], now: Date(), strings: strings
        )
        let read = ConversationPreviewLine.preview(
            for: sealedRow(), viewerId: me, preferredLanguages: ["fr"], now: Date(), readOnDevice: device, strings: strings
        )

        XCTAssertEqual(sealed.icon, .encrypted)
        XCTAssertNil(read.icon)
        XCTAssertEqual(read.segments, [.text("On se voit à 18 h", language: nil)])
    }

    // MARK: - Le modèle de la liste

    private func makeViewModel(endToEnd: MockEndToEndMessaging) -> ConversationListViewModel {
        ConversationListViewModel(
            conversationService: MockConversationService(),
            preferenceService: MockPreferenceService(),
            messageSocket: MockMessageSocket(),
            messageService: MockMessageService(),
            authManager: MockAuthManager(),
            storyService: MockStoryService(),
            syncEngine: MockConversationSyncEngine(),
            messageNotificationPublisher: PassthroughSubject<MessageActivitySignal, Never>().eraseToAnyPublisher(),
            draftStore: DraftStore(userDefaults: UserDefaults(suiteName: "E2EListTexts-\(UUID().uuidString)")!),
            store: ConversationListViewModelTests.makeTestStore(),
            categoryStore: UserCategoryStore(service: ConvListTestCategoryWriter()),
            endToEnd: endToEnd
        )
    }

    private func waitForTexts(
        of viewModel: ConversationListViewModel, where predicate: @escaping ([String: ConversationPreviewDeviceText]) -> Bool
    ) async {
        let reached = expectation(description: "endToEndTexts")
        let observation = viewModel.$endToEndTexts.first(where: predicate).sink { _ in reached.fulfill() }
        await fulfillment(of: [reached], timeout: 2)
        observation.cancel()
    }

    func test_viewModel_readsMyOwnSentMessage_andNeverWritesItIntoTheConversation() async {
        let vault = MockEndToEndMessaging()
        vault.store(.readable(content("On se voit à 18 h"), senderUserId: me), for: messageId)
        let viewModel = makeViewModel(endToEnd: vault)

        viewModel.conversations = [sealedRow()]
        await waitForTexts(of: viewModel) { !$0.isEmpty }

        XCTAssertEqual(viewModel.endToEndTexts[conversationId]?.text, "On se voit à 18 h")
        XCTAssertEqual(viewModel.conversations.first?.lastMessagePreview, "")
        let persisted = String(decoding: (try? JSONEncoder().encode(viewModel.conversations)) ?? Data(), as: UTF8.self)
        XCTAssertFalse(persisted.contains("On se voit"))
    }

    func test_viewModel_envelopeOpenedLater_reachesTheRow() async {
        let vault = MockEndToEndMessaging()
        let viewModel = makeViewModel(endToEnd: vault)
        viewModel.conversations = [sealedRow(senderUserId: peer)]
        try? await Task.sleep(for: .milliseconds(80))
        XCTAssertTrue(viewModel.endToEndTexts.isEmpty)

        vault.store(.readable(content("Bien reçu"), senderUserId: peer), for: messageId)
        vault.publish(.undecryptable(messageId: "autre", conversationId: conversationId))
        await waitForTexts(of: viewModel) { !$0.isEmpty }

        XCTAssertEqual(viewModel.endToEndTexts[conversationId]?.text, "Bien reçu")
    }
}
