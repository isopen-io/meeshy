import XCTest
@testable import MeeshySDK

/// #10321 (d) — la publication par canevas porte sa clé d'idempotence jusqu'à
/// `POST /posts`, et le rejeu porte la MÊME.
final class CanvasPostIdempotencyTests: XCTestCase {

    private func makeSUT() -> (service: PostService, mock: MockAPIClient) {
        let mock = MockAPIClient()
        mock.stub("/posts", result: APIResponse(success: true, data: Self.stubbedPost(), error: nil))
        return (PostService(api: mock), mock)
    }

    private static func stubbedPost() -> APIPost {
        APIPost(
            id: "created-1", type: "STORY", visibility: "PUBLIC", visibilityUserIds: nil, content: nil,
            originalLanguage: nil, createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: APIAuthor(id: "a1", username: "alice", displayName: "Alice", avatar: nil),
            likeCount: 0, commentCount: 0, repostCount: 0, viewCount: 0, postOpenCount: nil,
            qualifiedViewCount: nil, playCount: nil,
            bookmarkCount: 0, shareCount: 0, reactionSummary: nil, isPinned: false,
            isEdited: false, media: nil, comments: nil, repostOf: nil,
            originalRepostOfId: nil, isQuote: nil,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil, storyEffects: nil,
            translations: nil, isLikedByMe: nil, isBookmarkedByMe: nil, isRepostedByMe: nil,
            isViewedByMe: nil, currentUserReactions: nil, viaUsername: nil
        )
    }

    private func publish(_ service: PostService, key: String?) async throws {
        _ = try await service.createCanvasPost(
            type: .story, content: "Bonjour", storyEffects: nil, visibility: "PUBLIC",
            visibilityUserIds: nil, originalLanguage: "fr", mediaIds: nil, repostOfId: nil,
            mentions: nil, allowSoundExtraction: nil, mediaAlt: nil, mediaCaption: nil,
            alsoAsReel: nil, clientMutationId: key
        )
    }

    func test_createCanvasPost_withKey_sendsItAsClientMutationIdHeader() async throws {
        let (service, mock) = makeSUT()
        let key = ClientMutationId.storySlide(queueItemId: "item-1", slideId: "slide-a")

        try await publish(service, key: key)

        XCTAssertEqual(mock.lastRequest?.path, "/posts")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(mock.lastRequest?.headers?["X-Client-Mutation-Id"], key)
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["type"] as? String, "STORY")
    }

    func test_createCanvasPost_replayOfTheSameSlide_carriesTheSameKey() async throws {
        let (service, mock) = makeSUT()

        try await publish(service, key: ClientMutationId.storySlide(queueItemId: "item-1", slideId: "slide-a"))
        try await publish(service, key: ClientMutationId.storySlide(queueItemId: "item-1", slideId: "slide-a"))

        let keys = mock.requests.map { $0.headers?["X-Client-Mutation-Id"] }
        XCTAssertEqual(keys.count, 2)
        XCTAssertNotNil(keys[0])
        XCTAssertEqual(keys[0], keys[1])
    }
}
