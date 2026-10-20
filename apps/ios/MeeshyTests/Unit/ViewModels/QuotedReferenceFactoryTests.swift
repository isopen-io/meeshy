import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class QuotedReferenceFactoryTests: XCTestCase {

    private func makeQuoted(
        content: String = "Hello", attachments: [MessageAttachment] = [], isEncrypted: Bool = false
    ) -> Message {
        Message(
            id: "q1",
            conversationId: "000000000000000000000091",
            senderId: "000000000000000000000002",
            content: content,
            isEncrypted: isEncrypted,
            attachments: attachments,
            senderName: "Bob",
            senderAvatarURL: "https://cdn.meeshy.me/bob.jpg",
            isMe: false
        )
    }

    private func makePhoto(
        id: String, thumbnailUrl: String? = "https://cdn.meeshy.me/t.jpg", isViewOnce: Bool = false
    ) -> MessageAttachment {
        MessageAttachment(
            id: id, mimeType: "image/jpeg", fileSize: 100, fileUrl: "https://cdn.meeshy.me/\(id).jpg",
            isViewOnce: isViewOnce, width: 10, height: 20, thumbnailUrl: thumbnailUrl, thumbHash: "hash"
        )
    }

    func test_plainMessage_servesTheElectedText_andCarriesTheAvatar() {
        let reference = QuotedReferenceFactory.reference(
            quoting: makeQuoted(), citing: nil, servedText: { "Bonjour" }
        )

        XCTAssertEqual(reference.previewText, "Bonjour")
        XCTAssertEqual(reference.authorAvatarUrl, "https://cdn.meeshy.me/bob.jpg")
        XCTAssertEqual(reference.authorName, "Bob")
    }

    func test_noServedTranslation_fallsBackOnTheOriginal() {
        let reference = QuotedReferenceFactory.reference(quoting: makeQuoted(), citing: nil, servedText: { nil })

        XCTAssertEqual(reference.previewText, "Hello")
    }

    func test_encryptedMessage_neverAsksForTheServedText_andShowsTheLockedPlaceholder() {
        var asked = false
        let quoted = makeQuoted(attachments: [makePhoto(id: "p1")], isEncrypted: true)

        let reference = QuotedReferenceFactory.reference(quoting: quoted, citing: nil, servedText: { asked = true; return "secret" })

        XCTAssertFalse(asked)
        XCTAssertEqual(reference.previewText, "🔒 🖼️")
        XCTAssertNil(reference.attachmentThumbnailUrl)
        XCTAssertNil(reference.attachmentFileUrl)
        XCTAssertNil(reference.attachmentFacts?.thumbHash)
        XCTAssertEqual(reference.attachmentIsProtected, true)
    }

    func test_viewOncePiece_hidesItsThumbnail_butKeepsTheText() {
        let quoted = makeQuoted(attachments: [makePhoto(id: "p1", isViewOnce: true)])

        let reference = QuotedReferenceFactory.reference(quoting: quoted, citing: nil, servedText: { nil })

        XCTAssertEqual(reference.previewText, "Hello")
        XCTAssertNil(reference.attachmentThumbnailUrl)
        XCTAssertNil(reference.attachmentFacts?.thumbHash)
    }

    func test_imageWithoutServerThumbnail_showsTheFileItself() {
        let quoted = makeQuoted(attachments: [makePhoto(id: "p1", thumbnailUrl: nil)])

        let reference = QuotedReferenceFactory.reference(quoting: quoted, citing: nil, servedText: { nil })

        XCTAssertEqual(reference.attachmentThumbnailUrl, "https://cdn.meeshy.me/p1.jpg")
    }

    func test_emptyContent_isSaidByItsRepresentativeMedia() {
        let quoted = makeQuoted(content: "", attachments: [makePhoto(id: "p1")])

        let reference = QuotedReferenceFactory.reference(quoting: quoted, citing: nil, servedText: { "ignoré" })

        XCTAssertNotEqual(reference.previewText, "ignoré")
        XCTAssertFalse(reference.previewText.isEmpty)
    }

    func test_citedPiece_winsOverTheRepresentative_andDropsThePieceCount() {
        let quoted = makeQuoted(attachments: [makePhoto(id: "p1"), makePhoto(id: "p2"), makePhoto(id: "p3")])

        let whole = QuotedReferenceFactory.reference(quoting: quoted, citing: nil, servedText: { nil })
        let named = QuotedReferenceFactory.reference(quoting: quoted, citing: makePhoto(id: "p3"), servedText: { nil })

        XCTAssertEqual(whole.attachmentId, "p1")
        XCTAssertEqual(whole.quotedPieceCount, 3)
        XCTAssertEqual(named.attachmentId, "p3")
        XCTAssertNil(named.quotedPieceCount)
    }

    func test_citedPieceFromAnotherMessage_fallsBackOnTheRepresentative() {
        let quoted = makeQuoted(attachments: [makePhoto(id: "p1")])

        let reference = QuotedReferenceFactory.reference(quoting: quoted, citing: makePhoto(id: "elsewhere"), servedText: { nil })

        XCTAssertEqual(reference.attachmentId, "p1")
    }
}
