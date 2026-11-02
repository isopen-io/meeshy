import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #11287 — la QoE d'un canvas de lecture ne mesure que la story PUBLIÉE que
/// l'hôte déclare lire : jamais une carte de fil, un post, un repost, une
/// galerie de conversation, l'aperçu du composer ni le calque sortant.
@MainActor
final class StoryPlaybackQoETargetTests: XCTestCase {

    private func resolve(
        readsPublishedStories: Bool = true,
        isOutgoing: Bool = false,
        playsPreloadedMedia: Bool = false,
        storyId: String? = "65f0a1b2c3d4e5f6a7b8c9d0"
    ) -> SocialTarget? {
        StoryPlaybackQoETarget.resolve(
            readsPublishedStories: readsPublishedStories,
            isOutgoing: isOutgoing,
            playsPreloadedMedia: playsPreloadedMedia,
            storyId: storyId
        )
    }

    func test_thePublishedStoryViewer_measuresTheStoryItReads() {
        XCTAssertEqual(resolve(), SocialTarget(kind: .story, id: "65f0a1b2c3d4e5f6a7b8c9d0"))
    }

    func test_aHostThatDoesNotReadPublishedStories_measuresNothing() {
        XCTAssertNil(resolve(readsPublishedStories: false))
    }

    func test_theOutgoingCanvas_measuresNothing() {
        XCTAssertNil(resolve(isOutgoing: true))
    }

    func test_theComposerPreview_measuresNothing() {
        XCTAssertNil(resolve(playsPreloadedMedia: true))
    }

    func test_withoutAStoryId_nothingIsMeasured() {
        XCTAssertNil(resolve(storyId: nil))
        XCTAssertNil(resolve(storyId: ""))
    }

    func test_theStoryInit_carriesTheStoryId() {
        XCTAssertEqual(StoryReaderRepresentable(story: StoryItem(id: "s1")).playbackQoEStoryId, "s1")
    }

    func test_aSynthesizedRepost_carriesNoStoryId() {
        let repost = RepostContent(
            id: "r1", author: "Bob", authorId: "u1",
            authorUsername: "bob", content: "",
            storyEffects: StoryEffects(), media: []
        )
        XCTAssertNil(StoryReaderRepresentable(repost: repost).playbackQoEStoryId)
    }
}
