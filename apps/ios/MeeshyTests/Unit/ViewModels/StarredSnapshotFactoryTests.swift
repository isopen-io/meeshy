import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class StarredSnapshotFactoryTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 2_000)

    private func makeMessage(
        content: String, attachments: [MessageAttachment] = [], senderName: String? = "Alice", senderUsername: String? = "alice"
    ) -> Message {
        Message(
            id: "local-1",
            conversationId: "000000000000000000000097",
            senderId: "u1",
            content: content,
            createdAt: Date(timeIntervalSince1970: 100),
            attachments: attachments,
            senderName: senderName,
            senderUsername: senderUsername,
            senderUserId: "acct-1"
        )
    }

    private func snapshot(of message: Message, translatedPreview: String? = nil) -> StarredMessageSnapshot {
        StarredSnapshotFactory.snapshot(
            of: message, canonicalId: "srv-1", conversationId: "conv-1", conversationName: "Équipe",
            conversationAccentColor: "FF8800", translatedPreview: translatedPreview, now: now
        )
    }

    func test_snapshot_keysTheCanonicalId_andCarriesTheConversationIdentity() {
        let result = snapshot(of: makeMessage(content: "Bonjour"))

        XCTAssertEqual(result.id, "srv-1")
        XCTAssertEqual(result.conversationId, "conv-1")
        XCTAssertEqual(result.conversationName, "Équipe")
        XCTAssertEqual(result.senderUserId, "acct-1")
        XCTAssertEqual(result.starredAt, now)
        XCTAssertEqual(result.sentAt, Date(timeIntervalSince1970: 100))
    }

    func test_preview_prefersTheServedTranslation_overTheOriginal() {
        XCTAssertEqual(snapshot(of: makeMessage(content: "Hello"), translatedPreview: "Bonjour").contentPreview, "Bonjour")
    }

    func test_preview_blankTranslation_fallsBackOnTheOriginal() {
        XCTAssertEqual(snapshot(of: makeMessage(content: "Hello"), translatedPreview: "  \n").contentPreview, "Hello")
    }

    func test_preview_blankContentWithAttachment_isTheMediaSummary() {
        let photo = MessageAttachment(id: "a1", mimeType: "image/jpeg", fileUrl: "https://cdn/a1.jpg")

        let result = snapshot(of: makeMessage(content: " ", attachments: [photo]))

        XCTAssertFalse(result.contentPreview.isEmpty)
        XCTAssertEqual(result.attachmentKind, "image")
    }

    func test_preview_blankContentWithoutAttachment_isEmpty() {
        XCTAssertEqual(snapshot(of: makeMessage(content: "")).contentPreview, "")
    }

    func test_preview_isCappedAt280Characters() {
        XCTAssertEqual(snapshot(of: makeMessage(content: String(repeating: "a", count: 500))).contentPreview.count, 280)
    }

    func test_senderName_fallsBackOnTheUsername() {
        XCTAssertEqual(snapshot(of: makeMessage(content: "x", senderName: nil)).senderName, "alice")
    }

    func test_snapshot_ofAnEndToEndMessageReadOnTheDevice_keepsOnlyTheSealedLabel() {
        var message = makeMessage(content: "[Encrypted]")
        message.isEncrypted = true
        message.encryptionMode = E2EEWire.mode
        message.adoptDecryptedContent("le secret déchiffré")

        let result = snapshot(of: message, translatedPreview: "the decrypted secret")

        XCTAssertEqual(result.contentPreview, StarredSnapshotFactory.sealedPreview)
    }
}
