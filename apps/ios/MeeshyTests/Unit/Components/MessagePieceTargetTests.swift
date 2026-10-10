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
}
