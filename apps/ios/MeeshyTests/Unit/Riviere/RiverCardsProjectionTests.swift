import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #8139 — la Rivière rend, elle aussi, la carte de conversation et la carte
/// de visite, par les MÊMES points que les autres modes (`BubbleLinkEmbed`,
/// `BubbleAttachmentView`) : sa bulle ne rendait qu'un `Text`.
@MainActor
final class RiverCardsProjectionTests: XCTestCase {

    private static let t0 = Date(timeIntervalSince1970: 1_700_000_000)

    private func contents(for message: MeeshyMessage) -> RiverBubbleContent? {
        let messages = [message]
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me"))
        return RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { $0.content }, time: { _ in "12:00" }
        ).first
    }

    private func message(content: String, attachments: [MeeshyMessageAttachment] = []) -> MeeshyMessage {
        var m = MeeshyMessage(id: "m1", conversationId: "c", senderId: "alice", content: content,
                              createdAt: Self.t0, updatedAt: Self.t0)
        m.senderName = "Alice"
        m.attachments = attachments
        return m
    }

    func test_contents_conversationLink_carriesTheLinkEmbedWithItsCardTarget() {
        let content = contents(for: message(content: "Viens : https://meeshy.me/join/mshy_club"))
        XCTAssertEqual(content?.linkEmbed?.conversationCardTarget, .shareLink(identifier: "mshy_club"))
    }

    func test_contents_plainText_carriesNoLinkEmbed() {
        XCTAssertNil(contents(for: message(content: "Bonjour"))?.linkEmbed)
    }

    func test_contents_contactCardAttachment_isCarriedToTheBubble() {
        let vcf = MeeshyMessageAttachment(id: "vcf1", fileName: "Zoé.vcf", originalName: "Zoé.vcf", mimeType: "text/vcard", fileSize: 90)
        let content = contents(for: message(content: "", attachments: [vcf]))
        XCTAssertEqual(content?.contactCards.items.map(\.id), ["vcf1"])
    }

    func test_riverBubble_mountsTheSharedCardPoints() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Riviere/View/RiverBubbleView.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertTrue(source.contains("BubbleLinkEmbed("))
        XCTAssertTrue(source.contains("BubbleAttachmentView("))
    }
}
