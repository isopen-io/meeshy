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

    // Mirror of PostModelsTests.makeDecoder — handles ISO8601 with fractional seconds.
    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: str) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Bad date: \(str)")
        }
        return decoder
    }

    func test_toFeedPost_mapsTopLevelStoryEffectsAndAudio() throws {
        let json = """
        {
          "id": "p1",
          "content": "caption",
          "type": "STORY",
          "createdAt": "2026-06-20T10:00:00.000Z",
          "author": { "id": "u1", "name": "Marie", "username": "marie" },
          "storyEffects": {},
          "audioUrl": "https://cdn/voice.mp3"
        }
        """
        let api = try makeDecoder().decode(APIPost.self, from: Data(json.utf8))
        let post = api.toFeedPost(preferredLanguages: ["fr"])
        XCTAssertNotNil(post.storyEffects)
        XCTAssertEqual(post.audioUrl, "https://cdn/voice.mp3")
        XCTAssertTrue(post.isStory)
    }

    func test_storyItem_fromFeedPost_carriesCanvasFields() {
        var post = FeedPost(author: "Marie", authorId: "u1", type: "STORY", content: "caption")
        post.storyEffects = StoryEffects()
        post.audioUrl = "https://cdn/voice.mp3"
        post.media = [FeedMedia.image()]

        let item = StoryItem(feedPost: post)

        XCTAssertEqual(item.id, post.id)
        XCTAssertEqual(item.content, "caption")
        XCTAssertEqual(item.media.count, 1)
        XCTAssertNotNil(item.storyEffects)
        XCTAssertEqual(item.audioUrl, "https://cdn/voice.mp3")
    }

    // MARK: - Republication de story (fallback source)

    private func makeStoryRepostSource(
        id: String = "src1",
        effects: StoryEffects? = StoryEffects(),
        media: [FeedMedia] = [],
        audioUrl: String? = nil
    ) -> RepostContent {
        RepostContent(
            id: id, author: "J. Charles", authorId: "u9", authorUsername: "jcharles",
            content: "original caption", type: "STORY",
            audioUrl: audioUrl, storyEffects: effects, media: media
        )
    }

    func test_storyItem_fromFeedPost_storyRepostWithoutOwnContent_fallsBackToSource() {
        let sourceMedia = FeedMedia.image()
        var post = FeedPost(author: "Andre", authorId: "u2", type: "STORY", content: "")
        post.repost = makeStoryRepostSource(media: [sourceMedia], audioUrl: "https://cdn/bg.mp3")

        let item = StoryItem(feedPost: post)

        XCTAssertNotNil(item.storyEffects)
        XCTAssertEqual(item.media.map(\.id), [sourceMedia.id])
        XCTAssertEqual(item.audioUrl, "https://cdn/bg.mp3")
        XCTAssertEqual(item.repostOfId, "src1")
        XCTAssertEqual(item.repostAuthorName, "J. Charles")
        XCTAssertEqual(item.repostAuthorUsername, "jcharles")
    }

    func test_storyItem_fromFeedPost_storyRepostWithOwnEffects_keepsOwnEffectsAndMergesMedia() {
        let ownMedia = FeedMedia.image()
        let sourceMedia = FeedMedia.image()
        var ownEffects = StoryEffects()
        ownEffects.backgroundAudioId = "own-bg"
        var post = FeedPost(author: "Andre", authorId: "u2", type: "STORY", content: "mon ajout")
        post.storyEffects = ownEffects
        post.media = [ownMedia]
        post.repost = makeStoryRepostSource(media: [sourceMedia])

        let item = StoryItem(feedPost: post)

        XCTAssertEqual(item.storyEffects?.backgroundAudioId, "own-bg")
        XCTAssertEqual(item.media.map(\.id), [ownMedia.id, sourceMedia.id])
        XCTAssertEqual(item.content, "mon ajout")
    }

    func test_storyItem_fromFeedPost_nonStoryRepost_noFallback() {
        var post = FeedPost(author: "Andre", authorId: "u2", type: "STORY", content: "")
        post.repost = RepostContent(
            id: "post1", author: "J. Charles", content: "plain post",
            type: "POST", storyEffects: StoryEffects(), media: [FeedMedia.image()]
        )

        let item = StoryItem(feedPost: post)

        XCTAssertNil(item.storyEffects)
        XCTAssertTrue(item.media.isEmpty)
        XCTAssertNil(item.repostOfId)
    }

    func test_storyItem_fromFeedPost_mergeDeduplicatesSharedMediaIds() {
        let shared = FeedMedia.image()
        var post = FeedPost(author: "Andre", authorId: "u2", type: "STORY", content: "")
        post.media = [shared]
        post.repost = makeStoryRepostSource(media: [shared])

        let item = StoryItem(feedPost: post)

        XCTAssertEqual(item.media.map(\.id), [shared.id])
    }
}
