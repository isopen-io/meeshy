import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// **Une adresse écrite par un invité anonyme s'affiche telle quelle** (#10286).
///
/// Directive porteur 2026-10-12 : un participant sans compte ne produit AUCUN
/// lien — ni aperçu, ni carte de conversation, ni lecteur intégré, ni lien
/// suivi `/l/`, ni texte cliquable. Les messages des inscrits ne changent pas.
/// Chaque témoin anonyme a son témoin inscrit : sans lui, un builder qui ne
/// détecterait plus aucun lien passerait pour conforme.
@MainActor
final class AnonymousSenderLinksTests: XCTestCase {

    // MARK: - Fabriques

    private func message(_ text: String, anonymous: Bool, trackedLinks: [String: String] = [:]) -> Message {
        Message(id: "m1", conversationId: "c1", senderId: "p2", content: text,
                senderName: "Invité", senderIsAnonymous: anonymous, isMe: false,
                trackedLinkMap: trackedLinks)
    }

    private func text(_ message: Message) -> BubbleContent.Text? {
        BubbleContent(message: message, translations: [], preferredTranslation: nil,
                      currentUserId: "me", timeString: "10:00").text
    }

    private func linkRuns(_ attributed: AttributedString) -> [URL] {
        attributed.runs.compactMap(\.link)
    }

    // MARK: - Aperçu de lien

    func test_init_anonymousSenderWithWebAddress_hasNoLinkPreview() throws {
        let resolved = try XCTUnwrap(text(message("Va sur https://exemple.com", anonymous: true)))

        XCTAssertNil(resolved.firstLinkURL)
        XCTAssertTrue(resolved.linksAreInert)
        XCTAssertEqual(resolved.raw, "Va sur https://exemple.com")
    }

    func test_init_registeredSenderWithWebAddress_keepsLinkPreview() throws {
        let resolved = try XCTUnwrap(text(message("Va sur https://exemple.com", anonymous: false)))

        XCTAssertEqual(resolved.firstLinkURL, "https://exemple.com")
        XCTAssertFalse(resolved.linksAreInert)
    }

    func test_init_senderWithoutProvenAccount_hasNoLinkPreview() throws {
        let unproven = Message(id: "m1", conversationId: "c1", senderId: "p2",
                               content: "Va sur https://exemple.com", senderName: "?",
                               senderHasAccount: false, isMe: false)

        let resolved = try XCTUnwrap(text(unproven))

        XCTAssertNil(resolved.firstLinkURL)
        XCTAssertTrue(resolved.linksAreInert)
    }

    // MARK: - Carte de conversation

    func test_init_anonymousSenderWithShareLink_hasNoConversationCard() throws {
        let resolved = try XCTUnwrap(text(message("Viens : https://meeshy.me/join/mshy_x", anonymous: true)))

        XCTAssertNil(resolved.conversationCardTarget)
        XCTAssertNil(resolved.firstLinkURL)
    }

    func test_init_registeredSenderWithShareLink_keepsConversationCard() throws {
        let resolved = try XCTUnwrap(text(message("Viens : https://meeshy.me/join/mshy_x", anonymous: false)))

        XCTAssertEqual(resolved.conversationCardTarget, .shareLink(identifier: "mshy_x"))
    }

    // MARK: - Lecteur intégré

    func test_init_anonymousSenderWithVideoAddress_hasNoEmbeddedVideo() throws {
        let resolved = try XCTUnwrap(text(message("https://www.youtube.com/watch?v=dQw4w9WgXcQ", anonymous: true)))

        XCTAssertNil(resolved.embeddedVideo)
        XCTAssertNil(resolved.embedTrackedURL)
    }

    func test_init_registeredSenderWithVideoAddress_keepsEmbeddedVideo() throws {
        let resolved = try XCTUnwrap(text(message("https://www.youtube.com/watch?v=dQw4w9WgXcQ", anonymous: false)))

        XCTAssertNotNil(resolved.embeddedVideo)
    }

    // MARK: - Lien suivi

    func test_init_anonymousSenderWithLegacyShortLinks_hasNoLinkNorCard() throws {
        let written = "Vu m+abc123 et https://meeshy.me/l/abc"
        let resolved = try XCTUnwrap(text(message(written, anonymous: true)))

        XCTAssertNil(resolved.firstLinkURL)
        XCTAssertNil(resolved.conversationCardTarget)
        XCTAssertTrue(resolved.linksAreInert)
        XCTAssertEqual(resolved.raw, written)
    }

    func test_init_anonymousSenderWithTrackedLink_dropsTheTrackedMap() throws {
        let resolved = try XCTUnwrap(text(message("Va sur https://exemple.com", anonymous: true,
                                                  trackedLinks: ["https://exemple.com": "tok123"])))

        XCTAssertTrue(resolved.trackedLinks.isEmpty)
        XCTAssertNil(resolved.embedTrackedURL)
    }

    // MARK: - Texte rendu

    func test_attributed_linksAreInert_rendersEveryAddressAsWrittenWithoutLink() {
        let written = "Va sur https://exemple.com, [doc](https://doc.example.org), https://meeshy.me/l/abc et m+abc123"

        let attributed = MessageTextRenderer.attributed(
            written, color: .primary,
            trackedLinks: ["https://exemple.com": "tok123"],
            linksAreInert: true
        )

        XCTAssertTrue(linkRuns(attributed).isEmpty)
        XCTAssertEqual(String(attributed.characters), written)
    }

    func test_attributed_linksNotInert_keepsTappableLinks() {
        let attributed = MessageTextRenderer.attributed("Va sur https://exemple.com", color: .primary)

        XCTAssertFalse(linkRuns(attributed).isEmpty)
    }

    // MARK: - Rivière

    func test_linkEmbed_anonymousSender_isNil() {
        let embed = RiverConversationMapping.linkEmbed(
            of: message("Viens : https://meeshy.me/join/mshy_x", anonymous: true), text: \.content)

        XCTAssertNil(embed)
    }

    func test_linkEmbed_registeredSender_keepsTheCard() {
        let embed = RiverConversationMapping.linkEmbed(
            of: message("Viens : https://meeshy.me/join/mshy_x", anonymous: false), text: \.content)

        XCTAssertEqual(embed?.conversationCardTarget, .shareLink(identifier: "mshy_x"))
    }

    // MARK: - Citation

    func test_reply_quotedAnonymousAuthor_comparesDifferentlyFromRegistered() {
        var anonymous = ReplyReference(messageId: "q1", authorName: "Invité", previewText: "https://exemple.com")
        anonymous.authorIsAnonymous = true
        let registered = ReplyReference(messageId: "q1", authorName: "Invité", previewText: "https://exemple.com")

        XCTAssertNotEqual(BubbleContent.Reply(reference: anonymous, isStory: false),
                          BubbleContent.Reply(reference: registered, isStory: false))
    }

    // MARK: - Avis d'arrivée (#9717)

    private func joinNotice(username: String, givenName: String?, anonymous: Bool) -> BubbleContent.JoinNotice {
        BubbleContent.JoinNotice(participantId: "participant-1", displayName: username,
                                 isAnonymous: anonymous, viaShareLink: anonymous, fallbackText: "repli",
                                 username: username, givenName: givenName, linkRules: nil)
    }

    func test_joinNoticePresentation_anonymousGuestWithGivenName_showsNoTechnicalHandle() {
        let presentation = JoinNoticePresentation(notice: joinNotice(username: "ano_Emma", givenName: "Emma", anonymous: true))

        XCTAssertEqual(presentation.primaryName, "Emma")
        XCTAssertNil(presentation.handle)
        XCTAssertTrue(presentation.showsNoAccountBadge)
    }

    func test_joinNoticePresentation_registeredAccountNamedLikeAGuest_keepsItsHandle() {
        let presentation = JoinNoticePresentation(notice: joinNotice(username: "ano_bob", givenName: "Bob", anonymous: false))

        XCTAssertEqual(presentation.primaryName, "Bob")
        XCTAssertEqual(presentation.handle, "@ano_bob")
        XCTAssertFalse(presentation.showsNoAccountBadge)
    }
}
