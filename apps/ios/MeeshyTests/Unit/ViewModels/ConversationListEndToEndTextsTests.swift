import XCTest
import Combine
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **La ligne de liste d'une conversation chiffrée montre le texte que
/// l'appareil sait lire** (#12968).
///
/// Le serveur ne sert que le scellé (« 🔒 Message chiffré ») ; le clair vit
/// dans le coffre local, que le fil lisait seul. La ligne le lit désormais dans
/// le même coffre, le confronte à ce qu'elle montre (conversation, auteur,
/// composition), le tient en mémoire, et garde le libellé pour ce que cet
/// appareil n'a pas pu déchiffrer. Les lignes sont fabriquées comme la
/// production les écrit : mon propre envoi porte « Vous » et AUCUN
/// identifiant d'auteur (`ConversationListAuthor.peerUserId`).
@MainActor
final class ConversationListEndToEndTextsTests: XCTestCase {

    private let conversationId = "00000000000000000000ab01"
    private let me = "00000000000000000000aa11"
    private let peer = "00000000000000000000bb22"
    private let messageId = "00000000000000000000ab51"
    private let sentAt = Date(timeIntervalSince1970: 1_790_000_000)

    private func sealedRow(lastMessageId: String? = nil, from author: String? = nil) -> Conversation {
        let senderUserId = author ?? me
        var row = Conversation(
            id: conversationId, identifier: conversationId, type: .direct,
            lastMessageAt: sentAt.addingTimeInterval(2),
            encryptionMode: E2EEWire.mode, lastMessagePreview: "",
            lastMessageId: lastMessageId ?? messageId
        )
        row.lastMessageSenderName = senderUserId == me ? ConversationListAuthor.readerLabel : "Bob"
        row.lastMessageSenderUserId = ConversationListAuthor.peerUserId(
            senderUserId: senderUserId, senderName: row.lastMessageSenderName, readerId: me
        )
        row.lastMessageNature = LastMessageNature(messageType: "text", isEncrypted: true)
        return row
    }

    private func content(_ text: String, in conversation: String? = nil, composedAt: Date? = nil) -> E2EEContent {
        E2EEContent(
            text: text, language: "fr", replyTo: nil,
            conversationId: conversation ?? conversationId, clientMessageId: "cmid-1", sentAt: composedAt ?? sentAt
        )
    }

    // MARK: - Lois pures

    func test_adoption_myOwnSentMessage_asProductionStoresIt_isRead() {
        let entry = E2EEPlaintextEntry.readable(content("On se voit à 18 h"), senderUserId: me)

        let text = ConversationListEndToEndTexts.adoption(of: entry, for: sealedRow(), viewerId: me)

        XCTAssertEqual(text?.text, "On se voit à 18 h")
        XCTAssertEqual(text?.author, .reader)
    }

    func test_adoption_peerMessageOpenedByLibsignal_isRead() {
        let entry = E2EEPlaintextEntry.readable(content("Bien reçu"), senderUserId: peer)

        let text = ConversationListEndToEndTexts.adoption(of: entry, for: sealedRow(from: peer), viewerId: me)

        XCTAssertEqual(text?.text, "Bien reçu")
        XCTAssertEqual(text?.author, .peer(userId: peer))
    }

    func test_adoption_undecryptableOrAbsent_keepsTheLabel() {
        XCTAssertNil(ConversationListEndToEndTexts.adoption(of: .undecryptable, for: sealedRow(), viewerId: me))
        XCTAssertNil(ConversationListEndToEndTexts.adoption(of: nil, for: sealedRow(), viewerId: me))
    }

    func test_adoption_plaintextWrittenForAnotherConversation_isRefused() {
        let entry = E2EEPlaintextEntry.readable(content("Ailleurs", in: "00000000000000000000ab99"), senderUserId: me)

        XCTAssertNil(ConversationListEndToEndTexts.adoption(of: entry, for: sealedRow(), viewerId: me))
    }

    func test_adoption_peerTextServedUnderMyName_isRefused() {
        let entry = E2EEPlaintextEntry.readable(content("Envoie-moi le code"), senderUserId: peer)

        XCTAssertNil(ConversationListEndToEndTexts.adoption(of: entry, for: sealedRow(), viewerId: me))
    }

    func test_adoption_myTextServedUnderAPeerName_isRefused() {
        let entry = E2EEPlaintextEntry.readable(content("Je pars"), senderUserId: me)

        XCTAssertNil(ConversationListEndToEndTexts.adoption(of: entry, for: sealedRow(from: peer), viewerId: me))
    }

    func test_adoption_withoutViewer_isRefused() {
        let entry = E2EEPlaintextEntry.readable(content("On se voit à 18 h"), senderUserId: me)

        XCTAssertNil(ConversationListEndToEndTexts.adoption(of: entry, for: sealedRow(), viewerId: nil))
    }

    func test_adoption_oldMessageReplayedAsTheLastOne_isRefused() {
        let replayed = content("Oui, je confirme le virement", composedAt: sentAt.addingTimeInterval(-3 * 86_400))

        XCTAssertNil(ConversationListEndToEndTexts.adoption(
            of: .readable(replayed, senderUserId: peer), for: sealedRow(from: peer), viewerId: me
        ))
    }

    func test_kept_dropsATextWhoseRowNoLongerDescribesIt() {
        let entry = E2EEPlaintextEntry.readable(content("Bien reçu"), senderUserId: peer)
        let read = ConversationListEndToEndTexts.adoption(of: entry, for: sealedRow(from: peer), viewerId: me)
        var reassigned = sealedRow(from: peer)
        reassigned.lastMessageSenderUserId = "00000000000000000000cc33"

        let changedMessage = ConversationListEndToEndTexts.kept(
            [conversationId: read!], in: [sealedRow(lastMessageId: "00000000000000000000ab52", from: peer)]
        )
        let changedAuthor = ConversationListEndToEndTexts.kept([conversationId: read!], in: [reassigned])

        XCTAssertTrue(changedMessage.isEmpty)
        XCTAssertTrue(changedAuthor.isEmpty)
    }

    func test_resolve_peerMiss_isNotReReadUntilAnOpening_butMineAlwaysIs() async {
        let vault = MockEndToEndMessaging()

        let first = await ConversationListEndToEndTexts.resolve(
            [sealedRow(from: peer)], known: [:], misses: [], viewerId: me, from: vault
        )
        let mine = await ConversationListEndToEndTexts.resolve(
            [sealedRow()], known: [:], misses: [], viewerId: me, from: vault
        )

        XCTAssertEqual(first.misses, [messageId])
        XCTAssertTrue(mine.misses.isEmpty)
    }

    // MARK: - Rendu de la ligne

    func test_previewLine_readOnDevice_showsTheTextInsteadOfTheLabel() {
        let entry = E2EEPlaintextEntry.readable(content("On se voit à 18 h"), senderUserId: me)
        let device = ConversationListEndToEndTexts.adoption(of: entry, for: sealedRow(), viewerId: me)
        let strings = ConversationPreviewStrings(language: "fr") { $0.rawValue }

        let sealed = ConversationPreviewLine.preview(
            for: sealedRow(), viewerId: me, preferredLanguages: ["fr"], now: sentAt, strings: strings
        )
        let read = ConversationPreviewLine.preview(
            for: sealedRow(), viewerId: me, preferredLanguages: ["fr"], now: sentAt, readOnDevice: device, strings: strings
        )

        XCTAssertEqual(sealed.icon, .encrypted)
        XCTAssertNil(read.icon)
        XCTAssertEqual(read.segments, [.text("On se voit à 18 h", language: nil)])
    }

    // MARK: - La carte tenue par la liste

    @MainActor private final class ChangeCounter { var count = 0 }

    private func waitUntil(_ condition: @escaping @MainActor () -> Bool) async {
        let deadline = Date().addingTimeInterval(2)
        while !condition(), Date() < deadline { try? await Task.sleep(for: .milliseconds(10)) }
    }

    private func makeStore(
        rows: CurrentValueSubject<[Conversation], Never>, vault: MockEndToEndMessaging, changes: ChangeCounter = ChangeCounter()
    ) -> ConversationListEndToEndTextStore {
        ConversationListEndToEndTextStore(
            rows: rows.eraseToAnyPublisher(), endToEnd: vault,
            viewerId: { [me] in me }, mineRetryDelay: .milliseconds(150), willChange: { changes.count += 1 }
        )
    }

    func test_store_readsMyOwnSentMessage_andNeverWritesItIntoTheConversation() async {
        let vault = MockEndToEndMessaging()
        vault.store(.readable(content("On se voit à 18 h"), senderUserId: me), for: messageId)
        let rows = CurrentValueSubject<[Conversation], Never>([sealedRow()])
        let changes = ChangeCounter()
        let store = makeStore(rows: rows, vault: vault, changes: changes)

        await waitUntil { store.text(for: self.conversationId) != nil }

        XCTAssertEqual(store.text(for: conversationId)?.text, "On se voit à 18 h")
        XCTAssertEqual(changes.count, 1)
        XCTAssertEqual(rows.value.first?.lastMessagePreview, "")
        let persisted = String(decoding: (try? JSONEncoder().encode(rows.value)) ?? Data(), as: UTF8.self)
        XCTAssertFalse(persisted.contains("On se voit"))
    }

    func test_store_envelopeOpenedLater_reachesTheRow() async {
        let vault = MockEndToEndMessaging()
        let rows = CurrentValueSubject<[Conversation], Never>([sealedRow(from: peer)])
        let store = makeStore(rows: rows, vault: vault)
        try? await Task.sleep(for: .milliseconds(80))
        XCTAssertNil(store.text(for: conversationId))

        vault.store(.readable(content("Bien reçu"), senderUserId: peer), for: messageId)
        vault.publish(.undecryptable(messageId: "autre", conversationId: conversationId))
        await waitUntil { store.text(for: self.conversationId) != nil }

        XCTAssertEqual(store.text(for: conversationId)?.text, "Bien reçu")
    }

    func test_store_myAcknowledgedSend_rangedAfterTheRow_reachesItWithoutAnotherChange() async {
        let vault = MockEndToEndMessaging()
        let rows = CurrentValueSubject<[Conversation], Never>([sealedRow()])
        let store = makeStore(rows: rows, vault: vault)
        try? await Task.sleep(for: .milliseconds(80))

        await vault.remember(content("Je pars"), from: me, as: [messageId])
        await waitUntil { store.text(for: self.conversationId) != nil }

        XCTAssertEqual(store.text(for: conversationId)?.text, "Je pars")
    }

    func test_store_listEmptiedOnSignOut_dropsEveryText() async {
        let vault = MockEndToEndMessaging()
        vault.store(.readable(content("On se voit à 18 h"), senderUserId: me), for: messageId)
        let rows = CurrentValueSubject<[Conversation], Never>([sealedRow()])
        let store = makeStore(rows: rows, vault: vault)
        await waitUntil { store.text(for: self.conversationId) != nil }

        rows.send([])
        await waitUntil { store.text(for: self.conversationId) == nil }

        XCTAssertNil(store.text(for: conversationId))
    }
}
