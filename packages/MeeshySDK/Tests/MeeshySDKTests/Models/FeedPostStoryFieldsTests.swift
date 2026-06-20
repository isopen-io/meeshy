import XCTest
@testable import MeeshySDK

final class FeedPostStoryFieldsTests: XCTestCase {

    private func makeStoryEffects() -> StoryEffects {
        // StoryEffects has an all-defaulted init; a bare instance is a valid
        // non-nil canvas payload for round-trip purposes.
        StoryEffects()
    }

    func test_isStory_trueForStoryType_caseInsensitive() {
        XCTAssertTrue(FeedPost(author: "A", type: "STORY", content: "").isStory)
        XCTAssertTrue(FeedPost(author: "A", type: "story", content: "").isStory)
    }

    func test_isStory_falseForNonStory() {
        XCTAssertFalse(FeedPost(author: "A", type: "POST", content: "").isStory)
        XCTAssertFalse(FeedPost(author: "A", type: nil, content: "").isStory)
    }

    func test_codable_roundTrip_preservesStoryEffectsAndAudioUrl() throws {
        var post = FeedPost(author: "A", type: "STORY", content: "hello")
        post.storyEffects = makeStoryEffects()
        post.audioUrl = "https://cdn/x.mp3"

        let data = try JSONEncoder().encode(post)
        let decoded = try JSONDecoder().decode(FeedPost.self, from: data)

        XCTAssertNotNil(decoded.storyEffects)
        XCTAssertEqual(decoded.audioUrl, "https://cdn/x.mp3")
    }

    func test_codable_roundTrip_nilStoryFields_stayNil() throws {
        let post = FeedPost(author: "A", content: "plain")
        let data = try JSONEncoder().encode(post)
        let decoded = try JSONDecoder().decode(FeedPost.self, from: data)
        XCTAssertNil(decoded.storyEffects)
        XCTAssertNil(decoded.audioUrl)
    }
}
