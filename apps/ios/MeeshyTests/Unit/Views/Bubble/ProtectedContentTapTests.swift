import XCTest
@testable import Meeshy
import MeeshySDK

/// **Que fait un toucher sur un contenu protégé ?** (#8009)
///
/// Demande porteur du 2026-09-26 : « toucher un message flou ou à vue unique en
/// affiche clairement le contenu, et un média caché s'ouvre directement en plein
/// écran ». Jusqu'ici, un média FLOUTÉ se dévoilait dans la bulle (voile
/// temporaire, puis un second toucher pour le plein écran), et une cellule de
/// grille protégée demandait un APPUI LONG — le toucher ne faisait rien.
///
/// Un témoin par ligne du tableau : texte ou média × flouté ou vue unique ×
/// scellé, révélé ou déjà ouvert. Les trois modes (Script, Focal, Bulles)
/// consomment le même `BubbleContent`, donc la même décision.
@MainActor
final class ProtectedContentTapTests: XCTestCase {

    // MARK: - Fabriques

    private func photo(id: String = "p1", messageId: String = "m1",
                       isBlurred: Bool = false, isViewOnce: Bool = false) -> MessageAttachment {
        MessageAttachment(id: id, messageId: messageId, fileName: "p.jpg", mimeType: "image/jpeg",
                          fileUrl: "https://staging.meeshy.me/p.jpg",
                          isViewOnce: isViewOnce, isBlurred: isBlurred)
    }

    private func video(id: String = "v1") -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m1", fileName: "v.mp4", mimeType: "video/mp4",
                          fileUrl: "https://staging.meeshy.me/v.mp4")
    }

    private func document() -> MessageAttachment {
        MessageAttachment(id: "d1", messageId: "m1", fileName: "c.pdf", mimeType: "application/pdf",
                          fileUrl: "https://staging.meeshy.me/c.pdf")
    }

    private func message(text: String = "secret", attachments: [MessageAttachment] = [],
                         blurred: Bool = false, viewOnce: Bool = false,
                         isMe: Bool = false, revealed: Bool = false, openedAt: Date? = nil) -> Message {
        var message = Message(id: "m1", conversationId: "c1", senderId: isMe ? "me" : "u2",
                              content: text, attachments: attachments, senderName: "Demo", isMe: isMe)
        message.isBlurred = blurred
        message.isViewOnce = viewOnce
        message.isViewOnceRevealed = revealed
        message.viewOnceOpenedAt = openedAt
        return message
    }

    private func content(_ message: Message) -> BubbleContent {
        BubbleContent(message: message, translations: [], preferredTranslation: nil,
                      currentUserId: "me", timeString: "10:00")
    }

    // MARK: - Rien de protégé

    func test_resolve_unprotectedText_isNone() {
        XCTAssertEqual(content(message()).protectedTap(), .none)
    }

    func test_resolve_unprotectedPhoto_isNone() {
        XCTAssertEqual(content(message(text: "", attachments: [photo()])).protectedTap(), .none)
    }

    // MARK: - Texte flouté

    func test_resolve_blurredText_revealsInPlace() {
        XCTAssertEqual(content(message(blurred: true)).protectedTap(), .revealText)
    }

    func test_resolve_blurredText_mine_revealsInPlaceToo() {
        XCTAssertEqual(content(message(blurred: true, isMe: true)).protectedTap(), .revealText)
    }

    func test_resolve_blurredTextWithDocument_revealsInPlace_noFullscreenForADocument() {
        let tap = content(message(attachments: [document()], blurred: true)).protectedTap()
        XCTAssertEqual(tap, .revealText, "un document n'a pas de plein écran : il se dévoile sur place")
    }

    // MARK: - Média flouté : plein écran DIRECT

    func test_resolve_blurredPhoto_opensFullscreenOnThatPhoto() {
        let tap = content(message(text: "", attachments: [photo()], blurred: true)).protectedTap()
        XCTAssertEqual(tap, .openFullscreen(photo()))
    }

    func test_resolve_blurredPhotoWithCaption_opensFullscreen_notAnInBubbleReveal() {
        let tap = content(message(text: "légende", attachments: [photo()], blurred: true)).protectedTap()
        XCTAssertEqual(tap, .openFullscreen(photo()),
                       "le média caché s'ouvre en plein écran, sans dévoilement préalable dans la bulle")
    }

    func test_resolve_blurredVideo_opensFullscreen() {
        var blurred = message(text: "", attachments: [video()], blurred: true)
        blurred.isBlurred = true
        XCTAssertEqual(content(blurred).protectedTap(), .openFullscreen(video()))
    }

    func test_resolve_blurredPhoto_mine_opensFullscreenToo() {
        let tap = content(message(text: "", attachments: [photo()], blurred: true, isMe: true)).protectedTap()
        XCTAssertEqual(tap, .openFullscreen(photo()))
    }

    // MARK: - Cellule de grille : CE média

    func test_resolve_tappedGridCell_opensThatCell_notTheFirst() {
        let first = photo(id: "p1"), second = photo(id: "p2")
        let grid = content(message(text: "", attachments: [first, second], blurred: true))
        XCTAssertEqual(grid.protectedTap(on: second), .openFullscreen(second))
    }

    func test_resolve_blurredAttachmentCell_inUnblurredMessage_opensFullscreen() {
        let cell = photo(isBlurred: true)
        XCTAssertEqual(ProtectedContentTap.resolve(cell: cell), .openFullscreen(cell))
    }

    func test_resolve_viewOnceAttachmentCell_opensFullscreen() {
        let cell = photo(isViewOnce: true)
        XCTAssertEqual(ProtectedContentTap.resolve(cell: cell), .openFullscreen(cell))
    }

    func test_resolve_unprotectedCell_isNone() {
        XCTAssertEqual(ProtectedContentTap.resolve(cell: photo()), .none)
    }

    // MARK: - Vue unique

    func test_resolve_sealedViewOnceText_opensInPlace() {
        XCTAssertEqual(content(message(viewOnce: true)).protectedTap(), .openViewOnce(fullscreen: false))
    }

    func test_resolve_sealedViewOncePhoto_opensFullscreen() {
        let tap = content(message(text: "", attachments: [photo(isViewOnce: true)])).protectedTap()
        XCTAssertEqual(tap, .openViewOnce(fullscreen: true),
                       "le contenu scellé n'est pas dans le modèle : l'hôte ouvre le plein écran")
    }

    func test_resolve_sealedViewOnceVideo_opensFullscreen() {
        let tap = content(message(text: "", attachments: [video()], viewOnce: true)).protectedTap()
        XCTAssertEqual(tap, .openViewOnce(fullscreen: true))
    }

    func test_resolve_sealedViewOnce_mine_opensToo() {
        XCTAssertEqual(content(message(viewOnce: true, isMe: true)).protectedTap(), .openViewOnce(fullscreen: false))
    }

    func test_resolve_blurredAndViewOnceText_isTheViewOnceThatDecides() {
        XCTAssertEqual(content(message(blurred: true, viewOnce: true)).protectedTap(), .openViewOnce(fullscreen: false))
    }

    func test_resolve_revealedViewOnceText_retouchClosesIt() {
        XCTAssertEqual(content(message(viewOnce: true, revealed: true)).protectedTap(), .closeViewOnce)
    }

    func test_resolve_openedViewOnce_doesNotReopen() {
        let opened = content(message(viewOnce: true, openedAt: Date())).protectedTap()
        XCTAssertEqual(opened, .alreadyOpened)
    }

    func test_resolve_openedViewOncePhoto_doesNotReopen() {
        let opened = content(message(text: "", attachments: [photo(isViewOnce: true)], openedAt: Date())).protectedTap()
        XCTAssertEqual(opened, .alreadyOpened)
    }

    // MARK: - VoiceOver dit ce que fait le toucher

    func test_accessibilityHint_saysWhatTheTapDoes() {
        XCTAssertNil(ProtectedContentTap.none.accessibilityHint)
        XCTAssertNil(ProtectedContentTap.alreadyOpened.accessibilityHint)
        let hints = [
            ProtectedContentTap.revealText.accessibilityHint,
            ProtectedContentTap.openFullscreen(photo()).accessibilityHint,
            ProtectedContentTap.openViewOnce(fullscreen: false).accessibilityHint,
            ProtectedContentTap.closeViewOnce.accessibilityHint
        ]
        XCTAssertTrue(hints.allSatisfy { ($0?.isEmpty == false) })
        XCTAssertEqual(Set(hints.compactMap { $0 }).count, hints.count, "chaque geste a son propre libellé")
        XCTAssertEqual(ProtectedContentTap.openViewOnce(fullscreen: true).accessibilityHint,
                       ProtectedContentTap.openFullscreen(photo()).accessibilityHint,
                       "une vue unique média dit, elle aussi, qu'elle s'ouvre en plein écran")
    }

    func test_accessibilityHint_fullscreenSaysFullscreen() {
        let hint = ProtectedContentTap.openFullscreen(photo()).accessibilityHint ?? ""
        XCTAssertTrue(hint.localizedCaseInsensitiveContains("plein écran")
                      || hint.localizedCaseInsensitiveContains("full screen"), hint)
    }
}
