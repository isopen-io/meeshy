import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

@MainActor
final class FeedPostRowRenderInputsTests: XCTestCase {

    private func makePost(_ id: String = "p1") -> FeedPost {
        FeedPost(id: id, author: "Zoe", authorId: "u1", content: "Bonjour", likes: 3)
    }

    private func engagement(likes: Int = 3, isLiked: Bool = false) -> FeedPostEngagementSnapshot {
        FeedPostEngagementSnapshot(
            isLiked: isLiked,
            displayLikeCount: likes,
            isHeartInFlight: false,
            isBookmarked: false,
            isBookmarkInFlight: false,
            displayBookmarkCount: 0,
            isReposted: false,
            isRepostInFlight: false,
            displayRepostCount: 0,
            isShareInFlight: false,
            displayShareCount: 0
        )
    }

    private func inputs(
        _ post: FeedPost,
        engagement: FeedPostEngagementSnapshot? = nil,
        ring: StoryRingState = .none,
        mood: String? = nil
    ) -> FeedPostRowRenderInputs {
        FeedPostRowRenderInputs(
            post: post,
            engagement: engagement ?? self.engagement(),
            authorStoryRing: ring,
            authorMoodEmoji: mood
        )
    }

    func test_identicalInputs_areEqual() {
        XCTAssertEqual(inputs(makePost()), inputs(makePost()))
    }

    func test_differentStoryRing_isNotEqual() {
        XCTAssertNotEqual(inputs(makePost(), ring: .none), inputs(makePost(), ring: .unread))
    }

    func test_differentMoodEmoji_isNotEqual() {
        XCTAssertNotEqual(inputs(makePost(), mood: nil), inputs(makePost(), mood: "😀"))
    }

    func test_differentEngagementLikeCount_isNotEqual() {
        XCTAssertNotEqual(
            inputs(makePost(), engagement: engagement(likes: 3)),
            inputs(makePost(), engagement: engagement(likes: 4))
        )
    }

    func test_sameIdDifferentContent_isNotEqual() {
        var edited = makePost()
        edited.content = "Salut"

        XCTAssertEqual(makePost(), edited, "Précondition : FeedPost == ne compare que l'id")
        XCTAssertNotEqual(inputs(makePost()), inputs(edited))
    }

    func test_trackedLinkMapChange_isNotEqual() {
        var tracked = makePost()
        tracked.trackedLinkMap = ["https://a.example": "https://m.ee/abc"]

        XCTAssertNotEqual(inputs(makePost()), inputs(tracked))
    }

    func test_coversEveryPostFieldFeedPostCardCompares() {
        let ring = ServedProfileDecorItem(pack: "contours-essentiels", item: "filet", origin: .builtin)
        let variants: [(String, (inout FeedPost) -> Void)] = [
            ("likes", { $0.likes += 1 }),
            ("isLiked", { $0.isLiked.toggle() }),
            ("repostCount", { $0.repostCount += 1 }),
            ("bookmarkCount", { $0.bookmarkCount += 1 }),
            ("shareCount", { $0.shareCount += 1 }),
            ("commentCount", { $0.commentCount += 1 }),
            ("content", { $0.content += "!" }),
            ("translatedContent", { $0.translatedContent = "Hello" }),
            ("translations", { $0.translations = ["en": PostTranslation(text: "Hello")] }),
            ("authorRing", { $0.authorRing = ring }),
            ("media", { $0.media = [.image(url: "https://m.ee/a.jpg")] }),
        ]

        for (name, mutate) in variants {
            let base = makePost()
            var changed = base
            mutate(&changed)
            let cardsEqual = FeedPostCard(post: base) == FeedPostCard(post: changed)
            guard !cardsEqual else { continue }
            XCTAssertNotEqual(inputs(base), inputs(changed), "\(name) change la carte mais pas la ligne")
        }
    }
}
