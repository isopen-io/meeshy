import XCTest
import MeeshySDK
@testable import Meeshy

/// #16332 (revue de sécurité) — la baguette « Imager » du plein écran suit la
/// loi de sortie du message PORTEUR, comme Transférer : jamais une pièce ou un
/// message protégé, jamais une pièce dont le porteur est inconnu.
@MainActor
final class GalleryImagerOfferTests: XCTestCase {

    private func photo(_ id: String = "p1", isBlurred: Bool = false, isViewOnce: Bool = false) -> MessageAttachment {
        MessageAttachment(id: id, messageId: "m1", fileName: "\(id).jpg", mimeType: "image/jpeg",
                          fileUrl: "https://staging.meeshy.me/\(id).jpg",
                          isViewOnce: isViewOnce, isBlurred: isBlurred, width: 1200, height: 800)
    }

    private func message(_ attachments: [MessageAttachment], isEncrypted: Bool = false) -> Message {
        Message(id: "m1", conversationId: "c1", senderId: "u2", content: "", isEncrypted: isEncrypted,
                attachments: attachments, senderName: "Demo")
    }

    func test_offers_ordinaryMessage_offersTheWand() {
        let piece = photo()
        XCTAssertTrue(GalleryImagerOffer.offers(piece, carrier: message([piece])))
    }

    func test_offers_unknownCarrier_offersNothing() {
        XCTAssertFalse(GalleryImagerOffer.offers(photo(), carrier: nil))
    }

    func test_offers_encryptedCarrier_offersNothing() {
        let piece = photo()
        XCTAssertFalse(GalleryImagerOffer.offers(piece, carrier: message([piece], isEncrypted: true)))
    }

    func test_offers_blurredPiece_offersNothing() {
        let piece = photo(isBlurred: true)
        XCTAssertFalse(GalleryImagerOffer.offers(piece, carrier: message([piece])))
    }

    func test_offers_plainPieceOfAMessageHoldingAViewOncePiece_offersNothing() {
        let piece = photo("p1")
        XCTAssertFalse(GalleryImagerOffer.offers(piece, carrier: message([piece, photo("p2", isViewOnce: true)])))
    }
}
