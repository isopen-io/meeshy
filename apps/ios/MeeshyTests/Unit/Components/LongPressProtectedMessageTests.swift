import XCTest
import MeeshySDK
@testable import Meeshy

/// **L'appui long sur un message protégé ne montre plus son contenu** (#8009,
/// complément porteur du 2026-09-26).
///
/// En Focal et en Script, l'aperçu de l'appui long (`MessageOverlayMenu`,
/// chemin sans cadre source) rendait `message.content` et les pièces EN CLAIR :
/// l'appui long contournait le flou et la vue unique. Et le menu offrait
/// « Copier », « Traduire », « Enregistrer » et « Transférer » sur un message
/// flouté — autant de sorties pour un contenu que le fil retient.
///
/// Les pièces jointes de l'aperçu, elles, étaient rognées (`.fill` dans un cadre
/// 16:9 ou plafonné à 200 pt) : elles s'affichent désormais à leur rapport
/// d'aspect ORIGINAL.
@MainActor
final class LongPressProtectedMessageTests: XCTestCase {

    // MARK: - Fabriques

    private func photo(id: String = "p1", width: Int? = 1200, height: Int? = 800,
                       isBlurred: Bool = false, isViewOnce: Bool = false) -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m1", fileName: "p.jpg", mimeType: "image/jpeg",
                          fileUrl: "https://staging.meeshy.me/p.jpg",
                          isViewOnce: isViewOnce, isBlurred: isBlurred, width: width, height: height)
    }

    private func message(attachments: [MessageAttachment] = [], blurred: Bool = false,
                         viewOnce: Bool = false, openedAt: Date? = nil) -> Message {
        var message = Message(id: "m1", conversationId: "c1", senderId: "u2", content: "secret",
                              attachments: attachments, senderName: "Demo")
        message.isBlurred = blurred
        message.isViewOnce = viewOnce
        message.viewOnceOpenedAt = openedAt
        return message
    }

    private func ctx(isMine: Bool = false, hasMedia: Bool = false, saveable: Int = 0,
                     isBlurred: Bool = false) -> MessageMenuContext {
        MessageMenuContext(isMine: isMine, canEdit: isMine, canDelete: isMine,
                           hasText: true, hasMedia: hasMedia, hasTimebasedMedia: hasMedia,
                           isPinned: false, isStarred: false, isEdited: true, hasEditRevisions: true,
                           saveableAttachmentCount: saveable, canComposeMedia: saveable > 0,
                           isBlurred: isBlurred)
    }

    // MARK: - La forme de l'aperçu

    func test_previewForm_clearMessage_isClear() {
        XCTAssertEqual(OverlayPreviewProtection.form(for: message()), .clear)
    }

    func test_previewForm_blurredText_isBlurred() {
        XCTAssertEqual(OverlayPreviewProtection.form(for: message(blurred: true)), .blurred)
    }

    func test_previewForm_blurredAttachmentOnly_isBlurred() {
        let form = OverlayPreviewProtection.form(for: message(attachments: [photo(isBlurred: true)]))
        XCTAssertEqual(form, .blurred, "une pièce floutée protège l'aperçu même si le message ne l'est pas")
    }

    func test_previewForm_sealedViewOnce_isTheSealedChip() {
        XCTAssertEqual(OverlayPreviewProtection.form(for: message(viewOnce: true)), .viewOnce(opened: false))
    }

    func test_previewForm_viewOncePhoto_isTheSealedChip() {
        let form = OverlayPreviewProtection.form(for: message(attachments: [photo(isViewOnce: true)]))
        XCTAssertEqual(form, .viewOnce(opened: false))
    }

    func test_previewForm_openedViewOnce_isTheOpenedChip() {
        XCTAssertEqual(OverlayPreviewProtection.form(for: message(viewOnce: true, openedAt: Date())),
                       .viewOnce(opened: true))
    }

    func test_previewForm_blurredAndViewOnce_viewOnceWins() {
        XCTAssertEqual(OverlayPreviewProtection.form(for: message(blurred: true, viewOnce: true)),
                       .viewOnce(opened: false))
    }

    func test_previewForm_isNeverClearForAProtectedMessage() {
        let protected = [
            message(blurred: true), message(viewOnce: true),
            message(attachments: [photo(isBlurred: true)]), message(attachments: [photo(isViewOnce: true)])
        ]
        XCTAssertTrue(protected.allSatisfy { OverlayPreviewProtection.form(for: $0) != .clear })
    }

    // MARK: - Le menu ne fait fuir aucun contenu flouté

    func test_primaryActions_blurred_offersNeitherCopyTranslateSaveNorCompose() {
        let actions = MessageActionResolver.primaryActions(ctx(hasMedia: true, saveable: 1, isBlurred: true))
        for leak in [PrimaryAction.copy, .translate, .saveMedia, .compose] {
            XCTAssertFalse(actions.contains(leak), "\(leak) ferait sortir un contenu flouté")
        }
        XCTAssertTrue(actions.contains(.more))
    }

    func test_primaryActions_blurredMine_keepsEditButNotCopy() {
        let actions = MessageActionResolver.primaryActions(ctx(isMine: true, isBlurred: true))
        XCTAssertTrue(actions.contains(.edit), "l'auteur garde l'édition de son propre message")
        XCTAssertFalse(actions.contains(.copy))
    }

    func test_moreSections_blurred_retiresEveryContentExit() {
        let items = MessageActionResolver.moreSections(ctx(hasMedia: true, isBlurred: true)).flatMap { section -> [MoreItem] in
            switch section {
            case .actions(let items), .info(let items), .moderation(let items): return items
            }
        }
        for leak in [MoreItem.copy, .forward, .share, .language, .sentiment, .transcription, .history] {
            XCTAssertFalse(items.contains(leak), "\(leak) ferait sortir un contenu flouté")
        }
        XCTAssertTrue(items.contains(.reply), "répondre reste possible : la citation masque un message protégé")
        XCTAssertTrue(items.contains(.report))
    }

    func test_primaryActions_unblurred_unchanged() {
        let actions = MessageActionResolver.primaryActions(ctx(hasMedia: true, saveable: 1))
        XCTAssertTrue(actions.contains(.copy))
        XCTAssertTrue(actions.contains(.translate))
        XCTAssertTrue(actions.contains(.saveMedia))
    }

    func test_holdsBlur_readsMessageAndAttachments() {
        XCTAssertFalse(message().holdsBlur)
        XCTAssertTrue(message(blurred: true).holdsBlur)
        XCTAssertTrue(message(attachments: [photo(isBlurred: true)]).holdsBlur)
    }

    // MARK: - Les pièces à leur rapport d'aspect ORIGINAL

    func test_aspectRatio_readsTheAttachmentDimensions() {
        XCTAssertEqual(OverlayPreviewMediaLayout.aspectRatio(of: photo(width: 1200, height: 800)), 1.5, accuracy: 0.0001)
        XCTAssertEqual(OverlayPreviewMediaLayout.aspectRatio(of: photo(width: 720, height: 1280)), 0.5625, accuracy: 0.0001)
    }

    func test_aspectRatio_missingDimensions_isSquare() {
        XCTAssertEqual(OverlayPreviewMediaLayout.aspectRatio(of: photo(width: nil, height: nil)), 1)
        XCTAssertEqual(OverlayPreviewMediaLayout.aspectRatio(of: photo(width: 0, height: 800)), 1)
    }

    func test_layout_everyCellKeepsItsRatio_forOneToFourMedia() {
        let ratios: [CGFloat] = [1.5, 0.5625, 1, 2.4]
        for count in 1...4 {
            let input = Array(ratios.prefix(count))
            let rows = OverlayPreviewMediaLayout.rows(ratios: input, width: 260, spacing: 3, maxHeight: 360)
            let cells = rows.flatMap { $0 }
            XCTAssertEqual(cells.count, count)
            for (cell, ratio) in zip(cells, input) {
                XCTAssertEqual(cell.width / cell.height, ratio, accuracy: 0.001, "ni rognée ni étirée (\(count) pièces)")
            }
        }
    }

    func test_layout_neverExceedsTheWidthOrTheHeight() {
        let tall: [CGFloat] = [0.4]
        let rows = OverlayPreviewMediaLayout.rows(ratios: tall, width: 260, spacing: 3, maxHeight: 320)
        let cell = rows[0][0]
        XCTAssertLessThanOrEqual(cell.height, 320.001, "un portrait très haut se réduit, il ne déborde pas")
        XCTAssertLessThanOrEqual(cell.width, 260.001)

        let grid = OverlayPreviewMediaLayout.rows(ratios: [1.5, 1.5, 0.75, 0.75], width: 260, spacing: 3, maxHeight: 320)
        let height = grid.map { $0.first?.height ?? 0 }.reduce(0, +) + CGFloat(grid.count - 1) * 3
        XCTAssertLessThanOrEqual(height, 320.001)
        for row in grid {
            let width = row.map(\.width).reduce(0, +) + CGFloat(row.count - 1) * 3
            XCTAssertLessThanOrEqual(width, 260.001)
        }
    }

    func test_layout_aRowSharesOneHeight() {
        let rows = OverlayPreviewMediaLayout.rows(ratios: [1.5, 0.75], width: 260, spacing: 3, maxHeight: 400)
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0][0].height, rows[0][1].height, accuracy: 0.001)
        XCTAssertEqual(rows[0][0].width + rows[0][1].width + 3, 260, accuracy: 0.001, "la rangée remplit la largeur")
    }
}
