import XCTest
import MeeshySDK
@testable import Meeshy

/// **Chaque pièce d'un message se vise seule** (milestone 165).
///
/// #9906 — « Supprimer le média » effaçait `attachments.first`, quelle que soit
/// la pièce visée. Le témoin vise la TROISIÈME pièce d'un lot : la règle la
/// rend, elle, et jamais sa voisine.
@MainActor
final class MessagePieceTargetTests: XCTestCase {

    // MARK: - Fabriques

    private func photo(_ id: String, width: Int? = 1200, height: Int? = 800,
                       isBlurred: Bool = false, isViewOnce: Bool = false) -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m1", fileName: "\(id).jpg", mimeType: "image/jpeg",
                          fileUrl: "https://staging.meeshy.me/\(id).jpg",
                          isViewOnce: isViewOnce, isBlurred: isBlurred, width: width, height: height)
    }

    private func video(_ id: String) -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m1", fileName: "\(id).mp4", mimeType: "video/mp4",
                          fileUrl: "https://staging.meeshy.me/\(id).mp4", width: 1080, height: 1920)
    }

    private func place(_ id: String) -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m1", fileName: "", mimeType: "application/x-location")
    }

    private func message(_ attachments: [MessageAttachment]) -> Message {
        Message(id: "m1", conversationId: "c1", senderId: "u2", content: "",
                attachments: attachments, senderName: "Demo")
    }

    private var lotOfFive: Message {
        message([photo("p1"), photo("p2"), photo("p3"), video("v4"), photo("p5")])
    }

    // MARK: - #9906 — la pièce supprimée est celle qu'on vise

    func test_deletableMedia_thirdPieceTargeted_returnsTheThirdPiece() {
        XCTAssertEqual(MessagePieceTarget.deletableMedia(in: lotOfFive, targeted: "p3"), "p3")
    }

    func test_deletableMedia_targetedVideoInsideALot_returnsThatVideo() {
        XCTAssertEqual(MessagePieceTarget.deletableMedia(in: lotOfFive, targeted: "v4"), "v4")
    }

    func test_deletableMedia_lotWithoutTarget_designatesNothing() {
        XCTAssertNil(MessagePieceTarget.deletableMedia(in: lotOfFive, targeted: nil),
                     "sans visée, un lot ne désigne aucune pièce — jamais la première par défaut")
    }

    func test_deletableMedia_singlePieceWithoutTarget_designatesIt() {
        XCTAssertEqual(MessagePieceTarget.deletableMedia(in: message([photo("p1")]), targeted: nil), "p1")
    }

    func test_deletableMedia_singlePieceBesideAPlace_designatesThePiece() {
        XCTAssertEqual(MessagePieceTarget.deletableMedia(in: message([place("l1"), photo("p1")]), targeted: nil), "p1")
    }

    func test_deletableMedia_targetFromAnotherMessage_designatesNothing() {
        XCTAssertNil(MessagePieceTarget.deletableMedia(in: lotOfFive, targeted: "ailleurs"),
                     "une visée qui n'appartient pas au message n'atteint rien")
    }

    // MARK: - #9907 — l'aperçu d'UNE pièce

    func test_pieces_areTheTilesOfTheMessage_inOrder_withoutPlaces() {
        let mixed = message([photo("p1"), place("l1"), video("v2"), photo("p3")])
        XCTAssertEqual(MessagePieceTarget.pieces(of: mixed).map(\.id), ["p1", "v2", "p3"])
    }

    func test_piece_targetedTileOfTheMessage_isFound() {
        XCTAssertEqual(MessagePieceTarget.piece("p3", in: lotOfFive)?.id, "p3")
    }

    func test_piece_withoutTargetOrFromElsewhere_isNil_soThePreviewStaysTheWholeMessage() {
        XCTAssertNil(MessagePieceTarget.piece(nil, in: lotOfFive))
        XCTAssertNil(MessagePieceTarget.piece("ailleurs", in: lotOfFive))
    }

    func test_position_thirdOfSeven_readsThreeSlashSeven() {
        XCTAssertEqual(MessagePieceTarget.position(index: 2, count: 7), "3/7")
    }

    func test_index_thirdPiece_isTwo() {
        XCTAssertEqual(MessagePieceTarget.index(of: "p3", in: lotOfFive), 2)
    }

    func test_neighbour_movesWithinTheMessage_andStopsAtItsEdges() {
        XCTAssertEqual(MessagePieceTarget.neighbour(of: "p3", step: 1, in: lotOfFive), "v4")
        XCTAssertEqual(MessagePieceTarget.neighbour(of: "p3", step: -1, in: lotOfFive), "p2")
        XCTAssertNil(MessagePieceTarget.neighbour(of: "p5", step: 1, in: lotOfFive))
        XCTAssertNil(MessagePieceTarget.neighbour(of: "p1", step: -1, in: lotOfFive))
    }

    func test_fittedSize_portraitPieceInALandscapeStage_keepsItsRatio() {
        let size = MessagePieceTarget.fittedSize(ratio: 9.0 / 16.0, in: CGSize(width: 360, height: 400))
        XCTAssertEqual(size.height, 400, accuracy: 0.001)
        XCTAssertEqual(size.width / size.height, 9.0 / 16.0, accuracy: 0.001, "jamais étirée")
    }

    func test_fittedSize_landscapePiece_fillsTheWidth_andKeepsItsRatio() {
        let size = MessagePieceTarget.fittedSize(ratio: 3.0 / 2.0, in: CGSize(width: 360, height: 400))
        XCTAssertEqual(size.width, 360, accuracy: 0.001)
        XCTAssertEqual(size.height, 240, accuracy: 0.001)
    }

    func test_fittedSize_unknownRatio_isASquare_neverAStretch() {
        let size = MessagePieceTarget.fittedSize(ratio: 0, in: CGSize(width: 360, height: 400))
        XCTAssertEqual(size.width, size.height, accuracy: 0.001)
    }

    func test_isProtected_blurredOrViewOncePiece_orViewOnceMessage() {
        XCTAssertTrue(MessagePieceTarget.isProtected(photo("p1", isBlurred: true), in: lotOfFive))
        XCTAssertTrue(MessagePieceTarget.isProtected(photo("p1", isViewOnce: true), in: lotOfFive))
        var sealed = lotOfFive
        sealed.isViewOnce = true
        XCTAssertTrue(MessagePieceTarget.isProtected(photo("p1"), in: sealed))
        XCTAssertFalse(MessagePieceTarget.isProtected(photo("p1"), in: lotOfFive))
    }

    func test_pieceMenu_alwaysEndsWithTheWholeMessage() {
        let ctx = MessagePieceMenu.Context(isProtected: true, exits: .unrestricted, canDelete: false)
        XCTAssertEqual(MessagePieceMenu.actions(ctx).last, .wholeMessage,
                       "l'aperçu d'une pièce ne retire jamais l'accès au message entier")
    }

    // MARK: - #9907 — le même geste dans tous les modes de lecture

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }

    func test_everyTileSurface_longPressOpensThePiecePreview() throws {
        let bulles = try source("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
        XCTAssertEqual(bulles.components(separatedBy: "MessagePieceLongPress(attachmentId: attachment.id").count - 1, 2,
                       "la photo ET la vidéo de grille ouvrent l'aperçu de leur pièce")
        let focal = try source("Meeshy/Features/Main/Focal/Row/FocalAttachmentBlock.swift")
        XCTAssertTrue(focal.contains("MessagePieceLongPress(attachmentId: attachment.id"),
                      "Focal et Script ouvrent l'aperçu de la pièce par le MÊME geste")
    }

    func test_threadCell_injectsThePieceLongPress_exceptInSelectionMode() throws {
        let controller = try source("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(controller.contains(".environment(\\.messagePieceLongPress, selectionModeActive ? nil : pieceLongPressHandler)"))
    }

    // MARK: - #9908 — le menu agit sur la pièce visée

    private let blurredExits = MessageExitOffer(law: .ordinary, holdsBlur: true, isEncrypted: false)

    func test_pieceMenu_clearPiece_offersReplySaveDeleteThenTheWholeMessage() {
        let ctx = MessagePieceMenu.Context(isProtected: false, exits: .unrestricted, canDelete: true)
        XCTAssertEqual(MessagePieceMenu.actions(ctx), [.replyToPiece, .saveMedia, .deletePiece, .wholeMessage])
    }

    func test_pieceMenu_withoutTheRightToDelete_offersNoDeletion() {
        let ctx = MessagePieceMenu.Context(isProtected: false, exits: .unrestricted, canDelete: false)
        XCTAssertFalse(MessagePieceMenu.actions(ctx).contains(.deletePiece))
    }

    func test_pieceMenu_protectedPiece_neitherQuotesNorSaves_butStaysDeletable() {
        let ctx = MessagePieceMenu.Context(isProtected: true, exits: .unrestricted, canDelete: true)
        XCTAssertEqual(MessagePieceMenu.actions(ctx), [.deletePiece, .wholeMessage])
    }

    func test_pieceMenu_exitLawRefusingSave_offersNoSave() {
        let ctx = MessagePieceMenu.Context(isProtected: false, exits: blurredExits, canDelete: false)
        XCTAssertFalse(MessagePieceMenu.actions(ctx).contains(.saveMedia))
    }

    func test_save_targetedThirdPiece_requestsThatPiece() {
        let request = MessageExitTransport.saveRequest(for: lotOfFive, piece: "p3")
        XCTAssertEqual(request?.attachmentId, "p3", "jamais la première pièce du lot")
    }

    func test_save_targetedProtectedPiece_requestsNothing() {
        let lot = message([photo("p1"), photo("p2", isBlurred: true)])
        XCTAssertNil(MessageExitTransport.saveRequest(for: lot, piece: "p2"))
    }

    func test_save_withoutTarget_keepsTheFirstPieceRule() {
        XCTAssertEqual(MessageExitTransport.saveRequest(for: lotOfFive)?.attachmentId, "p1")
    }

    private func citation(of messageId: String, naming attachmentId: String?, story: Bool = false) -> ReplyReference {
        ReplyReference(messageId: messageId, authorName: "Demo", previewText: "photo",
                       attachmentId: attachmentId, isStoryReply: story)
    }

    func test_replyAnchor_citationNamingThePiece_anchorsIt() {
        let anchor = MessagePieceTarget.replyAnchor(pending: citation(of: "m1", naming: "p3"), pieceId: "p3")
        XCTAssertEqual(anchor, QuotedAttachmentSend(attachmentId: "p3"))
    }

    func test_replyAnchor_citationReplacedByAnotherReply_dropsTheAnchor() {
        XCTAssertNil(MessagePieceTarget.replyAnchor(pending: citation(of: "m2", naming: "p9"), pieceId: "p3"))
        XCTAssertNil(MessagePieceTarget.replyAnchor(pending: nil, pieceId: "p3"))
        XCTAssertNil(MessagePieceTarget.replyAnchor(pending: citation(of: "m1", naming: "p3"), pieceId: nil))
    }

    func test_replyAnchor_storyCitation_neverAnchorsAPiece() {
        XCTAssertNil(MessagePieceTarget.replyAnchor(pending: citation(of: "s1", naming: "p3", story: true), pieceId: "p3"))
    }

    func test_pieceActions_reachThePieceThroughTheThreadPaths() throws {
        let host = try source("Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift")
        XCTAssertTrue(host.contains("triggerReply(for: message, citing: piece)"), "répondre cite la pièce")
        XCTAssertTrue(host.contains("MessageExitTransport.save(message, piece: piece.id, through: mediaSaveCoordinator)"))
        XCTAssertTrue(host.contains("deleteMedia(targeted: piece.id, of: message)"), "supprimer vise la pièce")
        let send = try source("Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift")
        XCTAssertEqual(send.components(separatedBy: "replyAnchor").count - 1, 4,
                       "l'ancre est lue une fois et transmise aux trois envois en ligne qui portent la citation")
    }

    // MARK: - #9910 — on réagit sur chaque pièce partout

    func test_reactionToggle_firstEmoji_isPosted() {
        let outcome = AttachmentReactionToggle.apply("❤️", summary: nil, mine: nil)
        XCTAssertEqual(outcome, .init(summary: ["❤️": 1], mine: ["❤️"], added: true))
    }

    func test_reactionToggle_emojisStack_neverSwap() {
        let outcome = AttachmentReactionToggle.apply("🔥", summary: ["❤️": 2], mine: ["❤️"])
        XCTAssertEqual(outcome.summary, ["❤️": 2, "🔥": 1])
        XCTAssertEqual(outcome.mine, ["❤️", "🔥"])
    }

    func test_reactionToggle_sameEmojiAgain_isWithdrawn() {
        let outcome = AttachmentReactionToggle.apply("❤️", summary: ["❤️": 1], mine: ["❤️"])
        XCTAssertEqual(outcome, .init(summary: nil, mine: nil, added: false))
    }

    func test_focalGrid_reactionChange_repaintsTheBlock() {
        var reacted = photo("p1")
        reacted.reactionSummary = ["👍": 1]
        let before = FocalAttachmentBlock(items: [photo("p1"), photo("p2")], accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        let after = FocalAttachmentBlock(items: [reacted, photo("p2")], accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        XCTAssertNotEqual(before, after, "une réaction posée doit franchir la porte Equatable de la grille Focal")
    }

    func test_focalTile_offersTheSameReactionGestureAsTheBubbleTile() throws {
        let focal = try source("Meeshy/Features/Main/Focal/Row/FocalAttachmentBlock.swift")
        XCTAssertTrue(focal.contains("FocalPieceDoubleTap(enabled: canReact)"), "le double tap ouvre le sélecteur")
        XCTAssertTrue(focal.contains("AttachmentReactionPickerOverlay(isPresented: $showReactionPicker)"),
                      "le MÊME sélecteur que la tuile de bulle")
        XCTAssertTrue(focal.contains("onReactToAttachment: onReactToAttachment"), "la grille transmet le geste à ses cases")
        let row = try source("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(row.contains("onReactToAttachment: actions.onReactToAttachment"), "la rangée câble la réaction par pièce")
    }

    func test_gridVideo_showsItsReactionBadge() throws {
        let bulles = try source("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
        guard let start = bulles.range(of: "private var videoBody: some View {"),
              let end = bulles.range(of: "// MARK: - Sub-Views", range: start.upperBound..<bulles.endIndex) else {
            return XCTFail("`videoBody` introuvable — le témoin ne mesure plus rien")
        }
        XCTAssertTrue(bulles[start.upperBound..<end.lowerBound].contains("reactionsBadge"),
                      "la vidéo de grille montre ce qu'elle a récolté")
    }

    /// Recette du 2026-10-10 : un double tap sur une VIDÉO de grille ouvrait le
    /// menu d'édition du message (Select / Picture it / Reply), le double tap de
    /// la cellule n'étant précédé d'aucun geste de la tuile. Il ouvre désormais
    /// le sélecteur de réaction de CETTE pièce, comme la photo voisine.
    func test_gridVideo_doubleTapOpensItsReactionPicker_likeTheImage() throws {
        let bulles = try source("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
        guard let start = bulles.range(of: "private var videoBody: some View {"),
              let end = bulles.range(of: "// MARK: - Sub-Views", range: start.upperBound..<bulles.endIndex) else {
            return XCTFail("`videoBody` introuvable — le témoin ne mesure plus rien")
        }
        let video = bulles[start.upperBound..<end.lowerBound]
        XCTAssertTrue(video.contains("QuickReactionDoubleTap(isEnabled: canReactPerImage)"))
        XCTAssertTrue(video.contains("AttachmentReactionPickerOverlay(isPresented: $showReactionPicker)"))
    }

    func test_fullscreenReaction_reachesAPieceOutsideTheLoadedWindow() throws {
        let gallery = try source("Meeshy/Features/Main/Views/ConversationView+MediaGallery.swift")
        XCTAssertTrue(gallery.contains("viewModel.toggleAttachmentReaction(outOfWindow: piece"))
        XCTAssertTrue(gallery.contains("catalog.applyReaction(bascule, toAttachment: attachment.id)"))
        XCTAssertFalse(gallery.contains("reactableMedia: { catalog.snapshot.isLoaded($0.id) }"),
                       "une pièce de l'index offre la réaction, que le catalogue repeint")
    }

    // MARK: - #9911 — la citation dit combien de pièces porte le message

    private func wholeMessageCitation(pieces: Int?, protected: Bool = false) -> ReplyReference {
        var reference = ReplyReference(messageId: "m1", authorName: "Demo", previewText: "photo",
                                       attachmentType: "image", attachmentIsProtected: protected ? true : nil)
        reference.quotedPieceCount = pieces
        return reference
    }

    func test_extraPieces_sevenTiles_announcesPlusSix() {
        XCTAssertEqual(wholeMessageCitation(pieces: 7).quotedExtraPieceCount, 6)
    }

    func test_extraPieces_singleTile_announcesNothing() {
        XCTAssertNil(wholeMessageCitation(pieces: 1).quotedExtraPieceCount)
    }

    func test_extraPieces_namedPieceOrUnknownCount_announcesNothing() {
        XCTAssertNil(wholeMessageCitation(pieces: nil).quotedExtraPieceCount)
    }

    func test_extraPieces_protectedCitation_announcesNoCount() {
        XCTAssertNil(wholeMessageCitation(pieces: 5, protected: true).quotedExtraPieceCount,
                     "un compte est déjà un fait sur ce que la protection retient")
    }

    func test_pieceCount_aBlobEngravedBeforeTheField_stillDecodes() throws {
        let encoded = try JSONEncoder().encode(wholeMessageCitation(pieces: 3))
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        object.removeValue(forKey: "quotedPieceCount")
        let legacy = try JSONSerialization.data(withJSONObject: object)
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: legacy)
        XCTAssertNil(decoded.quotedPieceCount)
        XCTAssertEqual(decoded.messageId, "m1")
    }

    func test_spotlight_citationNamingAPiece_lightsThatPiece() {
        let named = citation(of: "m1", naming: "p3")
        XCTAssertEqual(QuotedPieceSpotlight.pieceId(of: named, jumpingTo: "m1"), "p3")
    }

    func test_spotlight_wholeMessageCitation_lightsNothing() {
        var whole = citation(of: "m1", naming: "p1")
        whole.quotedPieceCount = 4
        XCTAssertNil(QuotedPieceSpotlight.pieceId(of: whole, jumpingTo: "m1"),
                     "la face d'une citation du message entier n'a pas choisi sa tuile")
        XCTAssertNil(QuotedPieceSpotlight.pieceId(of: citation(of: "m1", naming: nil), jumpingTo: "m1"))
    }

    func test_spotlight_jumpToAnotherMessageOrAStory_lightsNothing() {
        XCTAssertNil(QuotedPieceSpotlight.pieceId(of: citation(of: "m1", naming: "p3"), jumpingTo: "m2"))
        XCTAssertNil(QuotedPieceSpotlight.pieceId(of: citation(of: "m1", naming: "p3", story: true), jumpingTo: "m1"))
    }

    func test_everyCitationSkin_postsThePlusN() throws {
        for path in ["Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift",
                     "Meeshy/Features/Main/Focal/Row/FocalQuotedReplyView.swift",
                     "Meeshy/Features/Main/Views/ConversationView+ComposerBanners.swift"] {
            XCTAssertTrue(try source(path).contains(".quotedExtraPieces("), "\(path) doit poser « +N »")
        }
        XCTAssertTrue(try source("Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift")
            .contains("quotedPieceCount: reply.quotedPieceCount"), "la porte Equatable de la bulle lit le compte")
    }

    func test_quoteJump_carriesTheCitation_andLightsTheTileWhenItLands() throws {
        let controller = try source("Meeshy/Features/Main/Views/MessageListViewController.swift")
        XCTAssertTrue(controller.contains("onReplyTap: quoteJumpHandler"))
        XCTAssertTrue(controller.contains("focalActions.onReplyTap = quoteJumpHandler"))
        XCTAssertTrue(controller.contains("releasePieceSpotlight(at: indexPath)"))
        XCTAssertTrue(controller.contains(".environment(\\.pieceSpotlight,"))
        let bulles = try source("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
        XCTAssertEqual(bulles.components(separatedBy: "PieceSpotlightRing(attachmentId: attachment.id").count - 1, 2)
        XCTAssertTrue(try source("Meeshy/Features/Main/Focal/Row/FocalAttachmentBlock.swift")
            .contains("PieceSpotlightRing(attachmentId: attachment.id"))
    }

    // MARK: - Fail-closed sur la protection du MESSAGE (pièces sans drapeau)

    private func protectedLots() -> [String: Message] {
        let clear = [photo("p1"), photo("p2"), photo("p3")]
        var blurred = message(clear); blurred.isBlurred = true
        var viewOnce = message(clear); viewOnce.isViewOnce = true
        var encrypted = message(clear); encrypted.isEncrypted = true
        var flame = message(clear); flame.effects = MessageEffects(flags: .ephemeral, ephemeralDuration: 300)
        var afterRead = message(clear); afterRead.effects = MessageEffects(flags: [.ephemeral, .ephemeralAfterRead])
        return ["flou": blurred, "vue unique": viewOnce, "chiffré": encrypted,
                "éphémère": flame, "après lecture": afterRead]
    }

    func test_piece_protectedMessageWithUnflaggedPieces_opensNoPiecePreview() {
        for (nature, lot) in protectedLots() {
            XCTAssertTrue(MessagePieceTarget.messageIsProtected(lot), "\(nature) : le message est protégé")
            XCTAssertNil(MessagePieceTarget.piece("p2", in: lot),
                         "\(nature) : l'appui long retombe sur l'aperçu protégé du message")
        }
    }

    func test_pieceMenu_protectedMessageWithUnflaggedPieces_offersNeitherSaveNorReply() {
        for (nature, lot) in protectedLots() {
            let piece = photo("p2")
            XCTAssertTrue(MessagePieceTarget.isProtected(piece, in: lot), "\(nature) : la pièce hérite de la protection")
            let actions = MessagePieceMenu.actions(MessagePieceMenu.Context(
                isProtected: MessagePieceTarget.isProtected(piece, in: lot), exits: lot.exitOffer, canDelete: false))
            XCTAssertFalse(actions.contains(.saveMedia), "\(nature) : rien ne s'enregistre")
            XCTAssertFalse(actions.contains(.replyToPiece), "\(nature) : rien ne se cite")
            XCTAssertNil(MessageExitTransport.saveRequest(for: lot, piece: "p2"), "\(nature) : le transport refuse aussi")
        }
    }

    func test_piece_clearMessage_stillOpensThePiecePreview() {
        XCTAssertFalse(MessagePieceTarget.messageIsProtected(lotOfFive))
        XCTAssertEqual(MessagePieceTarget.piece("p2", in: lotOfFive)?.id, "p2")
    }
}
