import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryReaderRepresentableInitsTests: XCTestCase {

    func test_initRepost_buildsRepresentable() {
        let repost = RepostContent(
            id: "r1", author: "Bob", authorId: "u1",
            authorUsername: "bob", content: "",
            storyEffects: StoryEffects(), media: []
        )
        let rep = StoryReaderRepresentable(
            repost: repost,
            preferredContentLanguages: ["fr"],
            mute: true
        )
        XCTAssertEqual(rep.preferredLanguages, ["fr"])
        XCTAssertEqual(rep.mute, true)
    }

    /// RF3: the repost init must forward `isPaused` (defaulting false) so the
    /// PostDetail STORY-repost canvas gets the same off-screen + call-aware pause
    /// wiring as the native story canvas — without it, an unmuted repost would
    /// play with sound while scrolled off-screen.
    func test_initRepost_forwardsIsPaused() {
        let repost = RepostContent(
            id: "r1", author: "Bob", authorId: "u1",
            authorUsername: "bob", content: "",
            storyEffects: StoryEffects(), media: []
        )
        let paused = StoryReaderRepresentable(
            repost: repost, preferredContentLanguages: ["fr"], mute: false, isPaused: true
        )
        XCTAssertTrue(paused.isPaused)
        XCTAssertFalse(paused.mute)

        let playing = StoryReaderRepresentable(repost: repost, mute: false)
        XCTAssertFalse(playing.isPaused, "isPaused defaults to false (backward-compatible)")
    }

    func test_initPost_buildsRepresentable() {
        let author = APIAuthor(id: "u1", username: "alice", displayName: "Alice", avatar: nil)
        let post = APIPost(
            id: "p1", type: "STORY", visibility: "PUBLIC", content: "hi",
            originalLanguage: "fr", createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: author, likeCount: 0, commentCount: 0, repostCount: 0,
            viewCount: 0, postOpenCount: nil, qualifiedViewCount: nil, playCount: nil, bookmarkCount: 0, shareCount: 0, reactionSummary: nil,
            isPinned: false, isEdited: false, media: nil, comments: nil,
            repostOf: nil, originalRepostOfId: nil, isQuote: false,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil,
            storyEffects: nil, translations: nil, isLikedByMe: nil,
            isBookmarkedByMe: nil, isRepostedByMe: nil,
            isViewedByMe: nil, currentUserReactions: nil, mentionedUsers: nil, viaUsername: nil
        )
        let rep = StoryReaderRepresentable(post: post, preferredLanguage: "fr", mute: false)
        XCTAssertEqual(rep.preferredLanguages, ["fr"])
    }
}
