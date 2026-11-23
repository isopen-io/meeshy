import XCTest
@testable import Meeshy
import MeeshySDK

/// **Le premier lien de CONTENU d'un message reçoit la carte vivante** (#19332,
/// contrat § 5.1) — pas forcément son premier lien. Précédence : vidéo >
/// conversation > contenu > aperçu générique ; et les exclusions de l'aperçu
/// existant valent pour la carte : un message lu seulement par l'appareil, ou
/// écrit sans compte, n'en déplie aucune.
@MainActor
final class BubbleContentLinkChoiceTests: XCTestCase {

    private static let postId = "66f0c0ffee0000000000c0de"

    // MARK: - Fabriques

    private func clear(_ text: String) -> Message {
        Message(id: "000000000000000000000c01", conversationId: "c1", senderId: "p2", content: text,
                senderName: "Bob", isMe: false)
    }

    private func text(_ message: Message) throws -> BubbleContent.Text {
        try XCTUnwrap(BubbleContent(message: message, translations: [], preferredTranslation: nil,
                                    currentUserId: "me", timeString: "10:00").text)
    }

    // MARK: - Le choix du lien

    func test_text_sharedTrackedLink_getsTheContentCard() throws {
        let resolved = try text(clear("🔗 Publication de Amani : https://meeshy.me/l/Ab3xYz"))

        XCTAssertEqual(resolved.contentLink, ContentLinkMatch(url: "https://meeshy.me/l/Ab3xYz", target: .tracked(token: "Ab3xYz")))
    }

    func test_text_contentLinkAfterAnExternalLink_getsTheCard_whileThePreviewKeepsTheFirstLink() throws {
        let resolved = try text(clear("Lis https://exemple.org/article puis https://meeshy.me/reel/\(Self.postId)"))

        XCTAssertEqual(resolved.contentLink?.target, .content(ContentPathTarget(postId: Self.postId, type: .reel)))
        XCTAssertEqual(resolved.firstLinkURL, "https://exemple.org/article")
    }

    func test_text_withoutContentLink_keepsTheGenericPreviewAlone() throws {
        let resolved = try text(clear("Lis https://exemple.org/article et https://meeshy.me/u/amani"))

        XCTAssertNil(resolved.contentLink)
        XCTAssertEqual(resolved.firstLinkURL, "https://exemple.org/article")
    }

    // MARK: - Précédence

    func test_text_videoFirst_winsOverTheContentCard() throws {
        let resolved = try text(clear("https://www.youtube.com/watch?v=dQw4w9WgXcQ et https://meeshy.me/post/\(Self.postId)"))

        XCTAssertNotNil(resolved.embeddedVideo)
        XCTAssertNil(resolved.contentLink)
    }

    func test_text_conversationLinkFirst_winsOverTheContentCard() throws {
        let resolved = try text(clear("Viens : https://meeshy.me/join/mshy_x puis https://meeshy.me/post/\(Self.postId)"))

        XCTAssertEqual(resolved.conversationCardTarget, .shareLink(identifier: "mshy_x"))
        XCTAssertNil(resolved.contentLink)
    }

    // MARK: - Exclusions

    func test_text_decryptedOnDevice_mountsNoContentCard() throws {
        var message = Message(id: "000000000000000000000c02", conversationId: "c1", senderId: "p2",
                              content: E2EEWire.contentPlaceholder, isEncrypted: true, encryptionMode: "e2ee",
                              senderName: "Bob", isMe: false)
        message.adoptDecryptedContent("Regarde https://meeshy.me/post/\(Self.postId)")

        let resolved = try text(message)

        XCTAssertNil(resolved.contentLink, "rien ne part demander le contenu d'un lien que seul l'appareil a lu")
    }

    func test_text_senderWithoutAccount_mountsNoContentCard() throws {
        let anonymous = Message(id: "000000000000000000000c03", conversationId: "c1", senderId: "p2",
                                content: "Regarde https://meeshy.me/post/\(Self.postId)",
                                senderName: "Invité", senderIsAnonymous: true, isMe: false)

        let resolved = try text(anonymous)

        XCTAssertNil(resolved.contentLink)
        XCTAssertTrue(resolved.linksAreInert)
    }
}
