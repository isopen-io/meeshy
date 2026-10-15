import XCTest
import MeeshySDK
@testable import Meeshy

/// #10628 — un emoji seul qui répond : carte citée en petit, puis l'emoji en
/// grand SANS bulle, dans tous les modes (bulle, Focal, Script, Rivière).
@MainActor
final class BubbleEmojiReplyRoutingTests: XCTestCase {

    func test_emojiReplyFloatsBelowQuote_emojiOnlyWithReply_isTrue() {
        XCTAssertTrue(makeContent(text: "😂", reply: makeReply()).emojiReplyFloatsBelowQuote)
    }

    func test_emojiReplyFloatsBelowQuote_emojiOnlyWithoutReply_isFalse() {
        XCTAssertFalse(makeContent(text: "😂", reply: nil).emojiReplyFloatsBelowQuote)
    }

    func test_emojiReplyFloatsBelowQuote_textWithReply_isFalse() {
        XCTAssertFalse(makeContent(text: "ok", reply: makeReply()).emojiReplyFloatsBelowQuote)
    }

    func test_flatRowDrawsQuote_emojiOnlyWithReply_isTrue() {
        XCTAssertTrue(makeContent(text: "😂", reply: makeReply()).flatRowDrawsQuote,
                      "Focal/Script : la carte citée se pose au-dessus de l'emoji en grand.")
    }

    func test_bubbleLayout_quoteCardsShareOneTapRule() throws {
        let layout = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift")
        let emojiReply = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+EmojiReply.swift")
        let rule = ".onTapGesture { openQuotedTarget(reply) }"
        XCTAssertTrue(emojiReply.contains(rule))
        XCTAssertGreaterThanOrEqual(
            layout.components(separatedBy: rule).count - 1, 2,
            "L'unité du type contient +EmojiReply : la bulle texte doit poser SA propre règle à côté de celle de l'emoji en réponse."
        )
    }

    func test_bubbleLayout_routesEmojiReplyThroughTheSharedPredicate() throws {
        let layout = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift")
        XCTAssertTrue(layout.contains("content.emojiReplyFloatsBelowQuote"))
    }

    func test_flatRowRendersLargeEmoji_emojiOnlyWithReply_isTrue() {
        XCTAssertTrue(makeContent(text: "😂", reply: makeReply()).flatRowRendersLargeEmoji,
                      "Focal/Script/Rivière : un emoji seul en réponse reste un grand emoji libre.")
    }

    func test_flatRowRendersLargeEmoji_emojiOnlyWithoutReply_isTrue() {
        XCTAssertTrue(makeContent(text: "😂", reply: nil).flatRowRendersLargeEmoji)
    }

    func test_flatRowRendersLargeEmoji_textWithReply_isFalse() {
        XCTAssertFalse(makeContent(text: "ok", reply: makeReply()).flatRowRendersLargeEmoji)
    }

    func test_focalRow_routesEmojiThroughTheSharedPredicate() throws {
        let row = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Focal/Row/FocalRow.swift")
        XCTAssertTrue(row.contains("} else if content.flatRowRendersLargeEmoji {"),
                      "la rangée plate décide l'emoji en grand par le prédicat partagé, jamais par une condition locale.")
        XCTAssertFalse(row.contains("content.reply == nil"),
                       "aucune condition sur la citation ne doit renvoyer l'emoji en texte normal.")
    }

    private func makeReply() -> ReplyReference {
        ReplyReference(messageId: "m0", authorName: "Bob", previewText: "Salut")
    }

    private func makeContent(text: String, reply: ReplyReference?) -> BubbleContent {
        let msg = MeeshyMessage(
            id: "m1", conversationId: "c1", senderId: "u1", content: text,
            originalLanguage: "fr", messageType: .text, messageSource: .user,
            isEdited: false, editedAt: nil, deletedAt: nil, replyToId: nil,
            storyReplyToId: nil, forwardedFromId: nil, forwardedFromConversationId: nil,
            expiresAt: nil, effects: MessageEffects(flags: []), maxViewOnceCount: nil,
            viewOnceCount: 0, pinnedAt: nil, pinnedBy: nil, isEncrypted: false,
            encryptionMode: nil, createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: Date(timeIntervalSince1970: 0), attachments: [], reactions: [],
            replyTo: reply, forwardedFrom: nil, senderName: "Tester",
            senderUsername: "tester", senderColor: "#888", senderAvatarURL: nil,
            senderUserId: "u1", deliveryStatus: .sent, isMe: false,
            deliveredToAllAt: nil, readByAllAt: nil, deliveredCount: 0, readCount: 0,
            cachedTimeString: "12:34", callSummary: nil
        )
        return BubbleContent(message: msg, translations: [], preferredTranslation: nil, currentUserId: "u1")
    }
}
