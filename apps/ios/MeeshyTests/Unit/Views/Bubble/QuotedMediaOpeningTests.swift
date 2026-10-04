import XCTest
import MeeshySDK
@testable import Meeshy

/// #8283 — la pièce qu'ouvre la zone MÉDIA d'une citation, élue par UN site.
///
/// Le Fil (`MessageListViewController.openQuotedMedia`) et la Rivière
/// (`ConversationView+River`) ouvrent le même plein écran depuis une citation :
/// ils doivent élire la MÊME pièce et refuser les MÊMES secrets. `nil` ⇒ l'hôte
/// retombe sur le saut au message cité.
final class QuotedMediaOpeningTests: XCTestCase {

    private func reference(
        type: String? = "video/mp4",
        attachmentId: String? = nil,
        fileUrl: String? = "https://cdn.meeshy.me/v.mp4",
        isProtected: Bool? = nil
    ) -> ReplyReference {
        ReplyReference(
            messageId: "m-cited", authorName: "Alice", previewText: "",
            attachmentType: type, attachmentId: attachmentId,
            attachmentFileUrl: fileUrl, attachmentIsProtected: isProtected
        )
    }

    private func piece(id: String, mime: String, isViewOnce: Bool = false, isBlurred: Bool = false) -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m-cited", mimeType: mime,
                          fileUrl: "https://cdn.meeshy.me/\(id)",
                          isViewOnce: isViewOnce, isBlurred: isBlurred)
    }

    private func cited(_ attachments: [MessageAttachment]) -> MeeshyMessage {
        MeeshyMessage(id: "m-cited", conversationId: "c", senderId: "alice", content: "", attachments: attachments)
    }

    func test_attachment_citedMessageInTheWindow_opensTheAnchoredPiece() {
        let photo = piece(id: "a1", mime: "image/jpeg")
        let video = piece(id: "a2", mime: "video/mp4")

        let opened = QuotedMediaOpening.attachment(for: reference(attachmentId: "a2"), quoted: cited([photo, video]))

        XCTAssertEqual(opened?.id, "a2", "l'ancre de la citation désigne la pièce, quel que soit son rang")
    }

    func test_attachment_citedMessageOutOfTheWindow_opensThePieceRebuiltFromTheQuote() {
        let opened = QuotedMediaOpening.attachment(for: reference(type: "audio/m4a", fileUrl: "https://cdn.meeshy.me/old.m4a"), quoted: nil)

        XCTAssertEqual(opened?.type, .audio)
        XCTAssertEqual(opened?.fileUrl, "https://cdn.meeshy.me/old.m4a")
    }

    func test_attachment_anchoredPieceMissingFromTheWindowedMessage_isNil_neverAnotherPiece() {
        let opened = QuotedMediaOpening.attachment(
            for: reference(attachmentId: "gone"),
            quoted: cited([piece(id: "a1", mime: "image/jpeg")])
        )

        XCTAssertNil(opened, "ouvrir une autre pièce que celle que la réponse cite serait montrer autre chose")
    }

    func test_attachment_protectedQuote_isNil() {
        XCTAssertNil(QuotedMediaOpening.attachment(for: reference(isProtected: true), quoted: nil))
        XCTAssertNil(
            QuotedMediaOpening.attachment(for: reference(isProtected: true), quoted: cited([piece(id: "a1", mime: "video/mp4")])),
            "la protection DÉCLARÉE par la citation couvre aussi la pièce relue dans la fenêtre"
        )
    }

    func test_attachment_protectedPieceInTheWindow_isNil() {
        XCTAssertNil(QuotedMediaOpening.attachment(for: reference(), quoted: cited([piece(id: "a1", mime: "video/mp4", isViewOnce: true)])))
        XCTAssertNil(QuotedMediaOpening.attachment(for: reference(), quoted: cited([piece(id: "a1", mime: "image/jpeg", isBlurred: true)])))
    }

    func test_attachment_document_isNil_theJumpOffersItsCard() {
        XCTAssertNil(QuotedMediaOpening.attachment(for: reference(), quoted: cited([piece(id: "a1", mime: "application/pdf")])))
    }

    // MARK: - Le geste de la zone média (#8320, repris par la Rivière #8283)

    func test_gesture_quotedAudio_playsInPlace_neverOpensTheFullscreen() {
        let inWindow = QuotedMediaOpening.gesture(
            for: reference(type: "audio/m4a", attachmentId: "a1"),
            quoted: cited([piece(id: "a1", mime: "audio/m4a")])
        )
        let outOfWindow = QuotedMediaOpening.gesture(for: reference(type: "audio/m4a"), quoted: nil)

        guard case .playInPlace = inWindow else { return XCTFail("un audio cité se JOUE sur place (#8320), il n'ouvre rien : \(inWindow)") }
        guard case .playInPlace = outOfWindow else { return XCTFail("hors de la fenêtre aussi : \(outOfWindow)") }
    }

    func test_gesture_quotedVideo_opensTheElectedPieceInTheFullscreen() {
        let gesture = QuotedMediaOpening.gesture(
            for: reference(attachmentId: "a2"),
            quoted: cited([piece(id: "a1", mime: "image/jpeg"), piece(id: "a2", mime: "video/mp4")])
        )

        guard case .open(let attachment) = gesture else { return XCTFail("une vidéo citée s'ouvre en plein écran : \(gesture)") }
        XCTAssertEqual(attachment.id, "a2")
    }

    func test_gesture_protectedOrDocument_followsTheQuote() {
        let protected = QuotedMediaOpening.gesture(for: reference(isProtected: true), quoted: nil)
        let document = QuotedMediaOpening.gesture(for: reference(), quoted: cited([piece(id: "a1", mime: "application/pdf")]))

        guard case .followQuote = protected else { return XCTFail("un secret n'ouvre rien : \(protected)") }
        guard case .followQuote = document else { return XCTFail("un document se trouve sur le message d'origine : \(document)") }
    }
}
