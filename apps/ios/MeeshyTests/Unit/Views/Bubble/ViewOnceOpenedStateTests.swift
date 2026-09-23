import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// **Une vue unique ouverte reste en place, `(1) · Déjà ouvert`, sans jamais se
/// dire supprimée** (#7579, #7619).
///
/// Directive porteur du 2026-09-23 : la vue unique se consomme PAR PERSONNE ;
/// ouverte, la bulle reste dans le fil avec la même puce, fond moins prononcé,
/// et son contenu est purgé. L'appui long ne montre plus rien. Un texte lu sur
/// place passe à « déjà ouvert » dès qu'on le retouche, qu'il sort de l'écran ou
/// qu'on quitte la conversation.
@MainActor
final class ViewOnceOpenedStateTests: XCTestCase {

    private let secret = "SECRET-FIL-VU texte"

    private func viewOnceText(openedAt: Date? = nil, isRevealed: Bool = false, isMe: Bool = false) -> Message {
        var message = Message(
            id: "vu1", conversationId: "c1", senderId: "u2", content: secret,
            senderName: "Demo", isMe: isMe
        )
        message.isViewOnce = true
        message.viewOnceOpenedAt = openedAt
        message.isViewOnceRevealed = isRevealed
        return message
    }

    private func content(for message: Message) -> BubbleContent {
        BubbleContent(message: message, translations: [], preferredTranslation: nil,
                      currentUserId: "me", timeString: "16:48")
    }

    // MARK: - Le modèle commun aux cinq modes

    func test_bubbleContent_openedByMe_isOpenedChipWithoutContent() {
        let opened = content(for: viewOnceText(openedAt: Date()))

        XCTAssertEqual(opened.kind, .viewOnceOpened)
        XCTAssertEqual(opened.viewOnceChipState, .opened)
        XCTAssertNil(opened.text, "le contenu d'une vue unique ouverte ne revient jamais")
    }

    func test_bubbleContent_openedByTheAuthor_isOpenedToo() {
        XCTAssertEqual(content(for: viewOnceText(openedAt: Date(), isMe: true)).kind, .viewOnceOpened)
    }

    func test_bubbleContent_openedTakesPrecedenceOverAStaleReveal() {
        XCTAssertEqual(content(for: viewOnceText(openedAt: Date(), isRevealed: true)).kind, .viewOnceOpened,
                       "la cellule passe du texte à « déjà ouvert » sans repasser par « touchez pour afficher »")
    }

    func test_bubbleContent_revealedText_isRetouchable() {
        XCTAssertTrue(content(for: viewOnceText(isRevealed: true)).isViewOnceRevealed)
        XCTAssertFalse(content(for: viewOnceText()).isViewOnceRevealed)
    }

    func test_accessibilityLabel_opened_saysAlreadyOpenedNeverDeleted() {
        let label = MessageAccessibilityLabelComposer.compose(content(for: viewOnceText(openedAt: Date())))

        XCTAssertTrue(label.contains(ViewOnceChip.accessibilityLabel(for: .opened)))
        XCTAssertFalse(label.contains(secret))
        XCTAssertFalse(label.localizedCaseInsensitiveContains("supprim"), "plus jamais « Vu et supprimé »")
    }

    func test_chip_opened_hasALessPronouncedBackground() {
        XCTAssertLessThan(ViewOnceChip.fillOpacity(for: .opened, isDark: false),
                          ViewOnceChip.fillOpacity(for: .sealed, isDark: false))
        XCTAssertLessThan(ViewOnceChip.fillOpacity(for: .opened, isDark: true),
                          ViewOnceChip.fillOpacity(for: .sealed, isDark: true))
    }

    func test_riverContents_opened_showsTheOpenedChipWithoutText() {
        let messages = [viewOnceText(openedAt: Date())]
        let geometry = RiverConversationMapping.resolveGeometry(messages: messages, viewerId: "me")
        let bubbles = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { $0.content }, time: { _ in "16:48" }
        )

        XCTAssertEqual(bubbles.first?.viewOnceChip, .opened)
        XCTAssertEqual(bubbles.first?.text, "")
    }

    // MARK: - L'appui long ne montre rien

    private func menuContext(isViewOnce: Bool, isMine: Bool = false) -> MessageMenuContext {
        MessageMenuContext(isMine: isMine, canEdit: true, canDelete: true,
            hasText: true, hasMedia: true, hasTimebasedMedia: true,
            isPinned: false, isStarred: false, isEdited: true, hasEditRevisions: true,
            saveableAttachmentCount: 1, canComposeMedia: true,
            isViewOnce: isViewOnce)
    }

    func test_primaryActions_viewOnce_offerNoContentAction() {
        XCTAssertEqual(MessageActionResolver.primaryActions(menuContext(isViewOnce: true)), [.more],
                       "ni copie, ni traduction, ni enregistrement, ni composition")
    }

    func test_moreSections_viewOnce_areDeleteAndInfosOnly() {
        XCTAssertEqual(
            MessageActionResolver.moreSections(menuContext(isViewOnce: true, isMine: true)),
            [.actions([.delete]), .info([.views])]
        )
    }

    // MARK: - Le texte lu sur place passe à « déjà ouvert »

    func test_openViewOnce_onARevealedText_closesIt() throws {
        let sut = try makeSUT()
        sut.messages = [viewOnceText()]
        _ = sut.openViewOnce(messageId: "vu1")

        guard case .closed = sut.openViewOnce(messageId: "vu1") else {
            return XCTFail("retoucher un texte révélé le referme")
        }
        XCTAssertNotNil(sut.messages[0].viewOnceOpenedAt, "l'ouverture est gravée avant que la révélation ne tombe")
    }

    func test_openViewOnce_onAnOpenedMessage_opensNothing() throws {
        let sut = try makeSUT()
        sut.messages = [viewOnceText(openedAt: Date())]

        guard case .unavailable = sut.openViewOnce(messageId: "vu1") else {
            return XCTFail("« déjà ouvert » n'a plus de contenu à rouvrir")
        }
    }

    func test_closeViewOnce_onANonRevealedMessage_doesNothing() throws {
        let sut = try makeSUT()
        sut.messages = [viewOnceText()]

        sut.closeViewOnce(messageId: "vu1")

        XCTAssertNil(sut.messages[0].viewOnceOpenedAt, "la sortie d'écran d'une puce scellée ne consomme rien")
    }

    private func makeSUT() throws -> ConversationViewModel {
        let authManager = MockAuthManager()
        authManager.simulateLoggedIn(user: MeeshyUser(id: "me", username: "me", displayName: "Me"))
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        return ConversationViewModel(
            conversationId: "c1",
            unreadCount: 0,
            isDirect: false,
            participantUserId: nil,
            anonymousSession: nil,
            authManager: authManager,
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(
                dbPool: pool,
                persistence: MessagePersistenceActor(dbWriter: pool)
            )
        )
    }
}
