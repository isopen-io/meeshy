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
}
