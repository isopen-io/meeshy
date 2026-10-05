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
        XCTAssertEqual(content(message(blurred: true)).protectedTap(), .revealInPlace)
    }

    func test_resolve_blurredText_mine_revealsInPlaceToo() {
        XCTAssertEqual(content(message(blurred: true, isMe: true)).protectedTap(), .revealInPlace)
    }

    func test_resolve_blurredTextWithDocument_revealsInPlace() {
        XCTAssertEqual(content(message(attachments: [document()], blurred: true)).protectedTap(), .revealInPlace)
    }

    // MARK: - Média flouté : révélé SUR PLACE (#8389)

    /// Directive porteur du 2026-09-27 : « lorsqu'on touche un message en flou,
    /// cela doit l'AFFICHER et NON le montrer en plein écran ». Le premier
    /// toucher lève le voile dans la bulle ; le plein écran n'arrive qu'au
    /// toucher suivant, sur la case révélée.
    func test_resolve_blurredPhoto_revealsInPlace_neverFullscreen() {
        XCTAssertEqual(content(message(text: "", attachments: [photo()], blurred: true)).protectedTap(), .revealInPlace)
    }

    func test_resolve_blurredPhotoWithCaption_revealsInPlace() {
        XCTAssertEqual(content(message(text: "légende", attachments: [photo()], blurred: true)).protectedTap(), .revealInPlace)
    }

    func test_resolve_blurredVideo_revealsInPlace() {
        XCTAssertEqual(content(message(text: "", attachments: [video()], blurred: true)).protectedTap(), .revealInPlace)
    }

    func test_resolve_blurredPhoto_mine_revealsInPlaceToo() {
        XCTAssertEqual(content(message(text: "", attachments: [photo()], blurred: true, isMe: true)).protectedTap(), .revealInPlace)
    }

    func test_resolve_tappedGridCellOfBlurredMessage_revealsInPlace() {
        let grid = content(message(text: "", attachments: [photo(id: "p1"), photo(id: "p2")], blurred: true))
        XCTAssertEqual(grid.protectedTap(on: photo(id: "p2")), .revealInPlace)
    }

    // MARK: - Cellule de grille qui porte SA protection

    func test_resolve_blurredAttachmentCell_revealsInPlace() {
        XCTAssertEqual(ProtectedContentTap.resolve(cell: photo(isBlurred: true)), .revealInPlace)
    }

    func test_resolve_blurredAttachmentCell_inUnblurredMessage_revealsInPlace() {
        let cell = photo(isBlurred: true)
        XCTAssertEqual(content(message(text: "", attachments: [cell])).protectedTap(on: cell), .revealInPlace)
    }

    func test_resolve_viewOnceAttachmentCell_stillOpensFullscreen() {
        let cell = photo(isViewOnce: true)
        XCTAssertEqual(ProtectedContentTap.resolve(cell: cell), .openFullscreen(cell))
    }

    func test_resolve_unprotectedCell_isNone() {
        XCTAssertEqual(ProtectedContentTap.resolve(cell: photo()), .none)
    }

    // MARK: - Le toucher SUIVANT, une fois révélé (Rivière)

    /// La Rivière ne rend aucun média : une fois le voile levé, c'est le
    /// toucher suivant sur le contenu révélé qui ouvre la première pièce
    /// visuelle — le plein écran reste atteignable, jamais au premier geste.
    func test_afterReveal_withPhotoAfterDocument_opensTheFirstVisual() {
        let first = photo(id: "p1")
        XCTAssertEqual(ProtectedContentTap.afterReveal(media: [document(), first, photo(id: "p2")]), .openFullscreen(first))
    }

    func test_afterReveal_withoutVisual_isNone() {
        XCTAssertEqual(ProtectedContentTap.afterReveal(media: [document()]), .none)
        XCTAssertEqual(ProtectedContentTap.afterReveal(media: []), .none)
    }

    // MARK: - Câblage : aucun plein écran au premier toucher (#8389)

    func test_wiring_noVeilLayerOpensFullscreenAnyMore() throws {
        for path in ["Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift",
                     "Meeshy/Features/Main/Focal/Row/FocalRow.swift",
                     "Meeshy/Features/Main/Focal/Row/FocalProtectedContent.swift",
                     "Meeshy/Features/Main/Focal/Row/FocalAttachmentBlock.swift",
                     "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift"] {
            let source = try String(contentsOf: Self.iosRoot.appendingPathComponent(path), encoding: .utf8)
            XCTAssertFalse(source.contains("ProtectedGridCellTapLayer"), "\(path) : la couche qui ouvrait chaque case sous le voile est retirée")
            XCTAssertFalse(source.contains("protectedGridCellBounds"), path)
        }
        let reveal = try body(of: "private func revealBlurredContent()",
                              in: "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift")
        XCTAssertFalse(reveal.contains("openProtectedMedia"), "le voile de la bulle lève le flou, il n'ouvre rien : \(reveal)")
        XCTAssertTrue(reveal.contains("blurController.requestReveal"), reveal)
    }

    func test_wiring_blurredGridCell_revealsInPlace_viewOnceCellStillOpens() throws {
        let reveal = try body(of: "private func handleReveal()",
                              in: "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
        XCTAssertTrue(reveal.contains("revealedAttachmentIds.insert(attachment.id)"), reveal)
        XCTAssertTrue(reveal.contains("onOpenProtected(media)"), reveal)
    }

    func test_wiring_focalProtectedContent_neverOpensOnTheFirstTap() throws {
        let affordance = try body(of: "private var revealAffordance: some View",
                                  in: "Meeshy/Features/Main/Focal/Row/FocalProtectedContent.swift")
        XCTAssertFalse(affordance.contains("onMediaTap"), affordance)
    }

    func test_wiring_focalBlurredCell_revealsInPlace() throws {
        let cell = try body(of: "struct FocalGridCell: View",
                            in: "Meeshy/Features/Main/Focal/Row/FocalAttachmentBlock.swift")
        XCTAssertTrue(cell.contains("isRevealed: isRevealed"), "l'état de protection lit la révélation de la case")
        XCTAssertTrue(cell.contains("FocalMediaProtection.tap(on: attachment"), cell)
        let law = try body(of: "static func tap(on attachment: MessageAttachment",
                           in: "Meeshy/Features/Main/Focal/Row/FocalAttachmentBlock.swift")
        XCTAssertTrue(law.contains("ProtectedContentTap.resolve(cell: attachment)"), "la décision unique du toucher protégé (#8009)")
        XCTAssertTrue(law.contains("case .revealInPlace"), law)
    }

    func test_wiring_riverVeil_opensTheMediaOnlyAfterReveal() throws {
        let url = Self.iosRoot.appendingPathComponent("Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(source.contains("tapAfterReveal: content.tapAfterReveal, onMediaTap: onMediaTap"),
                      "la Rivière ouvre le média au toucher SUIVANT la révélation")
    }

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private func body(of anchor: String, in relativePath: String) throws -> String {
        let source = try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
        let start = try XCTUnwrap(source.range(of: anchor), "ancre absente : \(anchor)")
        let open = try XCTUnwrap(source[start.upperBound...].firstIndex(of: "{"))
        var depth = 0
        var index = open
        while index < source.endIndex {
            if source[index] == "{" { depth += 1 }
            if source[index] == "}" { depth -= 1; if depth == 0 { break } }
            index = source.index(after: index)
        }
        return String(source[open...index])
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

    // MARK: - Une vue unique FLOUTÉE ouverte reste floutée (#8567)
    //
    // Décision porteur du 2026-09-29 : « l'ouverture de la vue unique n'enlève
    // pas le flou, sauf si c'est un attachement directement ». Le texte ouvert
    // reste voilé, et le geste du voile est celui du FLOU — il révèle sur
    // place, il ne consomme pas une seconde fois la vue unique.

    func test_resolve_revealedBlurredViewOnceText_tapRevealsTheBlurInPlace() {
        XCTAssertEqual(content(message(blurred: true, viewOnce: true, revealed: true)).protectedTap(), .revealInPlace)
    }

    func test_bubbleContent_revealedBlurredViewOnceText_staysVeiledOverItsText() {
        let opened = content(message(text: "code 4242", blurred: true, viewOnce: true, revealed: true))
        XCTAssertEqual(opened.kind, .standard)
        XCTAssertEqual(opened.text?.raw, "code 4242", "ouverte, la vue unique livre son texte au modèle")
        XCTAssertTrue(opened.requiresVeil, "…mais le flou le garde voilé")
        XCTAssertFalse(opened.veilConsumesViewOnce, "le voile restant est celui du FLOU")
        XCTAssertFalse(opened.viewOnceRetouchIsActive, "toucher le voile ne referme pas la vue unique")
    }

    func test_accessibilityLabel_revealedBlurredViewOnceText_doesNotReadTheText() {
        let label = MessageAccessibilityLabelComposer.compose(
            content(message(text: "code 4242", blurred: true, viewOnce: true, revealed: true)))
        XCTAssertFalse(label.contains("4242"), label)
    }

    func test_veilReveal_revealedBlurredViewOnceText_revealsWithoutConsuming() {
        let opened = content(message(blurred: true, viewOnce: true, revealed: true))
        let controller = BubbleBlurRevealController()
        var consumed = 0

        controller.requestReveal(
            request: .init(messageId: opened.messageId, isViewOnce: opened.veilConsumesViewOnce),
            consumeViewOnce: { _, completion in consumed += 1; completion(true) }
        )

        XCTAssertTrue(controller.isRevealed, "le geste du flou lève le voile sur place")
        XCTAssertEqual(consumed, 0, "la vue unique a déjà été consommée à l'ouverture")
    }

    func test_bubbleContent_revealedViewOnceText_withoutBlur_isRetouchable() {
        let opened = content(message(viewOnce: true, revealed: true))
        XCTAssertFalse(opened.requiresVeil)
        XCTAssertTrue(opened.viewOnceRetouchIsActive)
    }

    func test_veilConsumesViewOnce_blurredOnly_isFalse() {
        XCTAssertFalse(content(message(blurred: true)).veilConsumesViewOnce)
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
            ProtectedContentTap.revealInPlace.accessibilityHint,
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

    /// Mesuré au simulateur : VoiceOver lisait le texte FLOUTÉ en entier
    /// (« 8009 · texte FLOUTÉ : le code secret est 4242 »). Le libellé dit
    /// désormais qu'il est flouté ; l'indice dit ce que fait le toucher.
    func test_accessibilityLabel_blurredText_doesNotReadTheText() {
        let label = MessageAccessibilityLabelComposer.compose(content(message(text: "code 4242", blurred: true)))
        XCTAssertFalse(label.contains("4242"), label)
        XCTAssertTrue(label.contains("Demo"), "l'expéditeur reste dit : \(label)")
    }

    func test_accessibilityLabel_clearText_stillReadsTheText() {
        let label = MessageAccessibilityLabelComposer.compose(content(message(text: "code 4242")))
        XCTAssertTrue(label.contains("4242"), label)
    }

    func test_accessibilityHint_blurredMedia_saysItShowsInPlace_notFullscreen() {
        let hint = content(message(text: "", attachments: [photo()], blurred: true)).protectedTap().accessibilityHint ?? ""
        XCTAssertEqual(hint, ProtectedContentTap.revealInPlace.accessibilityHint)
        XCTAssertFalse(hint.localizedCaseInsensitiveContains("plein écran"), hint)
    }

    func test_accessibilityHint_fullscreenSaysFullscreen() {
        let hint = ProtectedContentTap.openFullscreen(photo()).accessibilityHint ?? ""
        XCTAssertTrue(hint.localizedCaseInsensitiveContains("plein écran")
                      || hint.localizedCaseInsensitiveContains("full screen"), hint)
    }
}
