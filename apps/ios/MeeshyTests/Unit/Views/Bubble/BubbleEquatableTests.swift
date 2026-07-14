import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

@MainActor
final class BubbleEquatableTests: XCTestCase {

    func test_bubbleBackground_sameInputs_equal() {
        let a = BubbleBackground(isMe: true, accentHex: "FF0000", isDark: false)
        let b = BubbleBackground(isMe: true, accentHex: "FF0000", isDark: false)
        XCTAssertEqual(a, b)
    }

    func test_bubbleBackground_differentTheme_notEqual() {
        let a = BubbleBackground(isMe: false, accentHex: "FF0000", isDark: false)
        let b = BubbleBackground(isMe: false, accentHex: "FF0000", isDark: true)
        XCTAssertNotEqual(a, b)
    }

    func test_editedIndicator_savingState_notEqual() {
        let a = BubbleEditedIndicator(isMe: false, isSaving: false, hasEditHistory: false, isDark: false)
        let b = BubbleEditedIndicator(isMe: false, isSaving: true, hasEditHistory: false, isDark: false)
        XCTAssertNotEqual(a, b)
    }

    func test_footer_sameModel_equal() {
        let model = BubbleFooterModel(
            sender: nil, flags: [], showsTranslate: false,
            timestamp: "12:34", delivery: .read, isOffline: false, isMe: true
        )
        let a = BubbleFooter(model: model, actions: .none, style: .overlay, isDark: false)
        let b = BubbleFooter(model: model, actions: .none, style: .overlay, isDark: false)
        XCTAssertEqual(a, b)
    }

    func test_footer_differentTimestamp_notEqual() {
        let base = BubbleFooterModel(
            sender: nil, flags: [], showsTranslate: false,
            timestamp: "12:34", delivery: .sent, isOffline: false, isMe: true
        )
        var other = base
        other.timestamp = "12:35"
        let a = BubbleFooter(model: base, actions: .none, style: .row, isDark: false)
        let b = BubbleFooter(model: other, actions: .none, style: .row, isDark: false)
        XCTAssertNotEqual(a, b)
    }

    func test_pinnedIndicator_isStateless() {
        XCTAssertEqual(
            BubblePinnedIndicator(),
            BubblePinnedIndicator()
        )
    }

    func test_reactionsOverlay_sameSummaries_equal() {
        // MeeshyReactionSummary has no latestAt field — drop the spec template
        // value, the manual Equatable on BubbleReactionsOverlay projects
        // (emoji, count, includesMe) only.
        let s = [ReactionSummary(emoji: "👍", count: 2, includesMe: true)]
        let a = BubbleReactionsOverlay(
            messageId: "m1",
            summaries: s,
            isMe: false,
            isDark: true,
            isLastReceivedMessage: true,
            accentHex: "FFF"
        )
        let b = BubbleReactionsOverlay(
            messageId: "m1",
            summaries: s,
            isMe: false,
            isDark: true,
            isLastReceivedMessage: true,
            accentHex: "FFF"
        )
        XCTAssertEqual(a, b)
    }

    func test_reactionsOverlay_callbackDifference_stillEqual() {
        // Les callbacks ne participent PAS à l'égalité.
        var a = BubbleReactionsOverlay(
            messageId: "m1",
            summaries: [],
            isMe: false,
            isDark: false,
            isLastReceivedMessage: false,
            accentHex: "F"
        )
        let b = BubbleReactionsOverlay(
            messageId: "m1",
            summaries: [],
            isMe: false,
            isDark: false,
            isLastReceivedMessage: false,
            accentHex: "F"
        )
        a.onAddReaction = { _ in }
        XCTAssertEqual(a, b)
    }
}

// MARK: - BubbleContent.Reply story-side mutation equality (Task14)

/// Verifies that late-arriving story-side mutations (thumbnail, counters) correctly
/// invalidate Reply equality so the quoted-reply cell re-renders.
@MainActor
final class BubbleReplyEqualityTests: XCTestCase {

    private func makeReply(
        messageId: String = "m1",
        previewText: String = "Preview",
        isStory: Bool = false,
        moodEmoji: String? = nil,
        storyPublishedAt: Date? = nil,
        attachmentThumbnailUrl: String? = nil,
        storyThumbnailUrl: String? = nil,
        storyReactionCount: Int? = nil,
        storyCommentCount: Int? = nil,
        storyShareCount: Int? = nil
    ) -> BubbleContent.Reply {
        BubbleContent.Reply(
            reference: ReplyReference(
                messageId: messageId,
                authorName: "Alice",
                previewText: previewText,
                attachmentThumbnailUrl: attachmentThumbnailUrl,
                isStoryReply: isStory,
                storyPublishedAt: storyPublishedAt,
                storyReactionCount: storyReactionCount,
                storyCommentCount: storyCommentCount,
                storyShareCount: storyShareCount,
                storyThumbnailUrl: storyThumbnailUrl,
                moodEmoji: moodEmoji
            ),
            isStory: isStory
        )
    }

    func test_identicalReplies_equal() {
        let a = makeReply(messageId: "m1", previewText: "hi")
        let b = makeReply(messageId: "m1", previewText: "hi")
        XCTAssertEqual(a, b)
    }

    func test_attachmentThumbnailUrlChange_notEqual() {
        let a = makeReply(attachmentThumbnailUrl: nil)
        let b = makeReply(attachmentThumbnailUrl: "https://cdn.meeshy.me/t1.webp")
        XCTAssertNotEqual(a, b)
    }

    func test_storyThumbnailUrlChange_notEqual() {
        let a = makeReply(isStory: true, storyThumbnailUrl: nil)
        let b = makeReply(isStory: true, storyThumbnailUrl: "https://cdn.meeshy.me/s1.webp")
        XCTAssertNotEqual(a, b)
    }

    func test_storyReactionCountChange_notEqual() {
        let a = makeReply(isStory: true, storyReactionCount: 0)
        let b = makeReply(isStory: true, storyReactionCount: 5)
        XCTAssertNotEqual(a, b)
    }

    func test_storyCommentCountChange_notEqual() {
        let a = makeReply(isStory: true, storyCommentCount: 2)
        let b = makeReply(isStory: true, storyCommentCount: 3)
        XCTAssertNotEqual(a, b)
    }

    func test_storyShareCountChange_notEqual() {
        let a = makeReply(isStory: true, storyShareCount: nil)
        let b = makeReply(isStory: true, storyShareCount: 1)
        XCTAssertNotEqual(a, b)
    }
}

// MARK: - BubbleContent.Attachments mutation-field equality (Task14)

/// Verifies that server-side attachment mutations (thumbnail generation, blur
/// reveal, view-once count, per-image reactions) correctly invalidate bubble
/// equality so SwiftUI re-renders the cell. Previously only attachment IDs
/// were compared, causing stale renders after these server-side updates.
@MainActor
final class BubbleAttachmentsEqualityTests: XCTestCase {

    private func makeImage(
        id: String = "a1",
        thumbnailUrl: String? = nil,
        fileUrl: String = "",
        isBlurred: Bool = false,
        viewOnceCount: Int = 0,
        width: Int? = nil,
        height: Int? = nil,
        reactionSummary: [String: Int]? = nil,
        currentUserReactions: [String]? = nil
    ) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            mimeType: "image/jpeg",
            fileUrl: fileUrl,
            viewOnceCount: viewOnceCount,
            isBlurred: isBlurred,
            width: width,
            height: height,
            thumbnailUrl: thumbnailUrl,
            reactionSummary: reactionSummary,
            currentUserReactions: currentUserReactions
        )
    }

    // MARK: - Identity (same fields, same IDs) → equal

    func test_visualGrid_identicalAttachments_equal() {
        let a = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", thumbnailUrl: "t1")])
        let b = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", thumbnailUrl: "t1")])
        XCTAssertEqual(a, b)
    }

    // MARK: - Server-side thumbnail update → not equal

    func test_visualGrid_thumbnailUrlChange_notEqual() {
        let a = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", thumbnailUrl: nil)])
        let b = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", thumbnailUrl: "https://cdn.meeshy.me/thumb/a1.webp")])
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Blur reveal → not equal

    func test_visualGrid_isBlurredChange_notEqual() {
        let a = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", isBlurred: true)])
        let b = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", isBlurred: false)])
        XCTAssertNotEqual(a, b)
    }

    // MARK: - View-once consumption → not equal

    func test_audio_viewOnceCountChange_notEqual() {
        let a = BubbleContent.Attachments.audio([makeImage(id: "a1", viewOnceCount: 0)])
        let b = BubbleContent.Attachments.audio([makeImage(id: "a1", viewOnceCount: 1)])
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Dimensions filled by server → not equal

    func test_visualGrid_dimensionsChange_notEqual() {
        let a = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", width: nil, height: nil)])
        let b = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", width: 1080, height: 720)])
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Per-image reactions (BUG2 A') → not equal

    func test_visualGrid_reactionSummaryChange_notEqual() {
        let a = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", reactionSummary: nil)])
        let b = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", reactionSummary: ["👍": 1])])
        XCTAssertNotEqual(a, b)
    }

    func test_visualGrid_reactionCountChange_notEqual() {
        let a = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", reactionSummary: ["👍": 1])])
        let b = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", reactionSummary: ["👍": 2])])
        XCTAssertNotEqual(a, b)
    }

    func test_visualGrid_currentUserReactionsChange_notEqual() {
        let a = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", currentUserReactions: nil)])
        let b = BubbleContent.Attachments.visualGrid([makeImage(id: "a1", currentUserReactions: ["👍"])])
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Different IDs → not equal (existing behaviour preserved)

    func test_visualGrid_differentIds_notEqual() {
        let a = BubbleContent.Attachments.visualGrid([makeImage(id: "a1")])
        let b = BubbleContent.Attachments.visualGrid([makeImage(id: "a2")])
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Mixed attachments — visual mutations propagate

    func test_mixed_visualThumbnailChange_notEqual() {
        let a = BubbleContent.Attachments.mixed(
            visual: [makeImage(id: "v1", thumbnailUrl: nil)],
            audio: [],
            nonMedia: []
        )
        let b = BubbleContent.Attachments.mixed(
            visual: [makeImage(id: "v1", thumbnailUrl: "t.webp")],
            audio: [],
            nonMedia: []
        )
        XCTAssertNotEqual(a, b)
    }
}

/// Garde de l'animation d'entree des reactions. La pile produit ne doit animer
/// QUE les reactions reellement ajoutees (toggle local / socket temps reel),
/// jamais celles qui scrollent simplement dans le viewport (cellule recyclee).
@MainActor
final class ReactionAnimationGateTests: XCTestCase {

    override func setUp() async throws {
        try await super.setUp()
        ReactionAnimationGate.resetForTesting()
    }

    override func tearDown() async throws {
        ReactionAnimationGate.resetForTesting()
        try await super.tearDown()
    }

    /// LE cas du bug : une reaction existante, jamais marquee, ne doit pas
    /// animer quand sa bulle (re)apparait au scroll.
    func test_shouldAnimate_unmarked_isFalse() {
        XCTAssertFalse(ReactionAnimationGate.shouldAnimate(messageId: "m1", emoji: "👍"))
    }

    /// Une reaction marquee (ajout reel) anime — et UNIQUEMENT cette cle.
    func test_markAdded_thenShouldAnimate_isTrue_forThatKeyOnly() {
        let t = Date()
        ReactionAnimationGate.now = { t }
        ReactionAnimationGate.markAdded(messageId: "m1", emoji: "👍")
        XCTAssertTrue(ReactionAnimationGate.shouldAnimate(messageId: "m1", emoji: "👍"))
        XCTAssertFalse(ReactionAnimationGate.shouldAnimate(messageId: "m1", emoji: "❤️"))
        XCTAssertFalse(ReactionAnimationGate.shouldAnimate(messageId: "m2", emoji: "👍"))
    }

    /// Passe la fenetre d'animation, un scroll-in ulterieur rend la reaction
    /// statiquement (plus d'animation).
    func test_markAdded_expiresAfterWindow() {
        var t = Date()
        ReactionAnimationGate.now = { t }
        ReactionAnimationGate.markAdded(messageId: "m1", emoji: "👍")
        t = t.addingTimeInterval(ReactionAnimationGate.window + 0.1)
        XCTAssertFalse(ReactionAnimationGate.shouldAnimate(messageId: "m1", emoji: "👍"))
    }
}
