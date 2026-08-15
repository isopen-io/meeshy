import XCTest
import MeeshySDK
@testable import Meeshy

/// F-082 (WS-3) — critères §7 :
/// - « Aucune bulle visible » : garde source — aucun des 4 fichiers
///   `Focal/Row/Focal{AttachmentBlock,AudioBlock,QuotedReplyView,SystemRows}.swift`
///   ne contient `BubbleBackground` ni `cornerRadius: 18`.
/// - `Equatable` des blocs riches — le gate de re-render (même patron que
///   `LentilleRowEquatableTests`/`FocalRowInputEquatableTests`).
@MainActor
final class FocalRichBlockEquatableTests: XCTestCase {

    // MARK: - Garde source « aucune bulle »

    private static let ws3Files = [
        "FocalAttachmentBlock.swift",
        "FocalAudioBlock.swift",
        "FocalQuotedReplyView.swift",
        "FocalSystemRows.swift"
    ]

    private func source(_ fileName: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Focal
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Focal/Row/\(fileName)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_ws3Files_neverReferenceBubbleBackground() throws {
        for fileName in Self.ws3Files {
            let stripped = AppSourceGuard.stripComments(try source(fileName))
            XCTAssertFalse(
                stripped.contains("BubbleBackground"),
                "\(fileName) ne doit référencer aucun fond de bulle (contrat §WS-3 : « aucune bulle visible »)"
            )
        }
    }

    func test_ws3Files_neverHardcodeBubbleCornerRadius18() throws {
        for fileName in Self.ws3Files {
            let stripped = AppSourceGuard.stripComments(try source(fileName))
            XCTAssertFalse(
                stripped.contains("cornerRadius: 18"),
                "\(fileName) ne doit jamais reproduire le radius 18 de la bulle chat historique"
            )
        }
    }

    // MARK: - Fabrique minimale

    private func makeContent(
        attachments: BubbleContent.Attachments = .none,
        isMe: Bool = false
    ) -> BubbleContent {
        BubbleContent(
            messageId: "m1", kind: .standard, text: nil, translation: nil, reply: nil,
            attachments: attachments, location: nil, ephemeral: nil, isBlurred: false,
            isViewOnce: false, isPinned: false, isForwarded: false, editedAt: nil,
            isEditSaving: false, hasEditHistory: false, reactions: [],
            meta: BubbleContent.Meta(timeString: "10:41", deliveryStatus: nil),
            isMe: isMe, senderName: "Ali", callNotice: nil
        )
    }

    private func imageAttachment(id: String, thumbnailUrl: String = "https://x/a.jpg") -> MeeshyMessageAttachment {
        var att = MeeshyMessageAttachment(id: id, fileName: "a", originalName: "a", mimeType: "image/jpeg", fileSize: 1)
        att.thumbnailUrl = thumbnailUrl
        return att
    }

    // MARK: - FocalAttachmentBlock

    func test_focalAttachmentBlock_equatable_sameInputs_isEqual() {
        let items = [imageAttachment(id: "a1")]
        let lhs = FocalAttachmentBlock(items: items, accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        let rhs = FocalAttachmentBlock(items: items, accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        XCTAssertEqual(lhs, rhs)
    }

    func test_focalAttachmentBlock_equatable_differentThumbnail_isNotEqual() {
        let lhs = FocalAttachmentBlock(items: [imageAttachment(id: "a1", thumbnailUrl: "https://x/1.jpg")], accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        let rhs = FocalAttachmentBlock(items: [imageAttachment(id: "a1", thumbnailUrl: "https://x/2.jpg")], accentHex: "#31B6BA", messageDeliveryStatus: .sent)
        XCTAssertNotEqual(lhs, rhs)
    }

    func test_focalAttachmentBlock_equatable_ignoresClosureIdentity() {
        let items = [imageAttachment(id: "a1")]
        let lhs = FocalAttachmentBlock(items: items, accentHex: "#31B6BA", messageDeliveryStatus: .sent, onMediaTap: { _ in })
        let rhs = FocalAttachmentBlock(items: items, accentHex: "#31B6BA", messageDeliveryStatus: .sent, onMediaTap: { _ in })
        XCTAssertEqual(lhs, rhs, "les callbacks n'entrent jamais dans l'égalité — patron BubbleFooterActions")
    }

    // MARK: - FocalAudioBlock

    func test_focalAudioBlock_equatable_sameContent_isEqual() {
        let content = makeContent(attachments: .audio([MeeshyMessageAttachment(id: "au1", fileName: "a", originalName: "a", mimeType: "audio/mpeg", fileSize: 1)]))
        let lhs = FocalAudioBlock(content: content, accentHex: "#31B6BA", isDark: false, allAudioItems: [], translatedAudios: [], mentionDisplayNames: [:], conversationName: "Conv")
        let rhs = FocalAudioBlock(content: content, accentHex: "#31B6BA", isDark: false, allAudioItems: [], translatedAudios: [], mentionDisplayNames: [:], conversationName: "Conv")
        XCTAssertEqual(lhs, rhs)
    }

    func test_focalAudioBlock_equatable_differentDark_isNotEqual() {
        let content = makeContent(attachments: .audio([MeeshyMessageAttachment(id: "au1", fileName: "a", originalName: "a", mimeType: "audio/mpeg", fileSize: 1)]))
        let lhs = FocalAudioBlock(content: content, accentHex: "#31B6BA", isDark: false, allAudioItems: [], translatedAudios: [], mentionDisplayNames: [:], conversationName: "Conv")
        let rhs = FocalAudioBlock(content: content, accentHex: "#31B6BA", isDark: true, allAudioItems: [], translatedAudios: [], mentionDisplayNames: [:], conversationName: "Conv")
        XCTAssertNotEqual(lhs, rhs)
    }

    // MARK: - FocalQuotedReplyView

    func test_focalQuotedReplyView_equatable_sameReply_isEqual() {
        let reply = BubbleContent.Reply(
            reference: ReplyReference(messageId: "q1", authorName: "Bo", previewText: "hi", isMe: false, authorColor: "#31B6BA"),
            isStory: false
        )
        let lhs = FocalQuotedReplyView(reply: reply, accentHex: "#31B6BA", isDark: false, mentionDisplayNames: [:])
        let rhs = FocalQuotedReplyView(reply: reply, accentHex: "#31B6BA", isDark: false, mentionDisplayNames: [:])
        XCTAssertEqual(lhs, rhs)
    }

    // MARK: - FocalSystemRows (leaf views)

    func test_focalDeletedRow_equatable() {
        XCTAssertEqual(FocalDeletedRow(isDark: false), FocalDeletedRow(isDark: false))
        XCTAssertNotEqual(FocalDeletedRow(isDark: false), FocalDeletedRow(isDark: true))
    }

    func test_focalSystemNoticeRow_equatable() {
        XCTAssertEqual(
            FocalSystemNoticeRow(text: "Appel vidéo · 04:32", isDark: false),
            FocalSystemNoticeRow(text: "Appel vidéo · 04:32", isDark: false)
        )
        XCTAssertNotEqual(
            FocalSystemNoticeRow(text: "a", isDark: false),
            FocalSystemNoticeRow(text: "b", isDark: false)
        )
    }
}
