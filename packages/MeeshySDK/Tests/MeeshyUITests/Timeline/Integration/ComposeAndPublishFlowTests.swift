import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

// MARK: - TimelinePublisher

/// Orchestrates the compose → publish flow using a `TimelineViewModel` snapshot
/// and a `PostServiceProviding` backend. Thin glue — no business logic.
@MainActor
final class TimelinePublisher {

    private let postService: PostServiceProviding

    init(postService: PostServiceProviding) {
        self.postService = postService
    }

    /// Publish the current `TimelineViewModel` project as a story.
    /// Returns the created `APIPost` on success.
    func publish(project: TimelineProject, visibility: String = "PUBLIC") async throws -> APIPost {
        var slide = StorySlide()
        project.apply(to: &slide)
        return try await postService.createStory(
            content: nil,
            storyEffects: slide.effects,
            visibility: visibility,
            visibilityUserIds: nil,
            originalLanguage: nil,
            mediaIds: nil,
            repostOfId: nil
        )
    }
}

// MARK: - MockPostService

final class MockPostService: PostServiceProviding, @unchecked Sendable {

    var createStoryResult: Result<APIPost, Error> = .failure(NSError(domain: "mock", code: -1))
    private(set) var createStoryCallCount = 0
    private(set) var lastStoryEffects: StoryEffects?

    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String,
                     visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?, repostOfId: String?) async throws -> APIPost {
        createStoryCallCount += 1
        lastStoryEffects = storyEffects
        return try createStoryResult.get()
    }

    // MARK: - Unused stubs (minimal conformance)

    func getFeed(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        throw NSError(domain: "mock", code: -1)
    }
    func getReels(seedReelId: String?, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        throw NSError(domain: "mock", code: -1)
    }
    func create(content: String?, type: String, visibility: String, moodEmoji: String?,
                mediaIds: [String]?, audioUrl: String?, audioDuration: Int?,
                originalLanguage: String?, mobileTranscription: MobileTranscriptionPayload?,
                repostOfId: String?) async throws -> APIPost {
        throw NSError(domain: "mock", code: -1)
    }
    func update(postId: String, content: String?, visibility: String?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?) async throws -> APIPost {
        throw NSError(domain: "mock", code: -1)
    }
    func delete(postId: String) async throws {}
    func like(postId: String) async throws {}
    func unlike(postId: String) async throws {}
    func bookmark(postId: String) async throws {}
    func getBookmarks(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        throw NSError(domain: "mock", code: -1)
    }
    func removeBookmark(postId: String) async throws {}
    func getPost(postId: String) async throws -> APIPost { throw NSError(domain: "mock", code: -1) }
    func getComments(postId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        throw NSError(domain: "mock", code: -1)
    }
    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?,
                    attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?,
                    originalLanguage: String?) async throws -> APIPostComment {
        throw NSError(domain: "mock", code: -1)
    }
    func likeComment(postId: String, commentId: String) async throws {}
    func unlikeComment(postId: String, commentId: String) async throws {}
    func deleteComment(postId: String, commentId: String) async throws {}
    func repost(postId: String, targetType: PostType?, content: String?, isQuote: Bool) async throws -> APIPost {
        throw NSError(domain: "mock", code: -1)
    }
    func share(postId: String) async throws {}
    func share(postId: String, platform: String?, generateLink: Bool) async throws -> PostShareResult {
        PostShareResult(shared: true, shareCount: 0, shortUrl: nil, token: nil)
    }
    func createWithType(_ type: PostType, content: String, visibility: String,
                        moodEmoji: String?, storyEffects: StoryEffects?) async throws -> APIPost {
        throw NSError(domain: "mock", code: -1)
    }
    func requestTranslation(postId: String, targetLanguage: String) async throws {}
    func pinPost(postId: String) async throws {}
    func unpinPost(postId: String) async throws {}
    func viewPost(postId: String, duration: Int?) async throws {}
    func getPostViews(postId: String, limit: Int, offset: Int) async throws -> PostViewersResponse {
        throw NSError(domain: "mock", code: -1)
    }
    func getUserPosts(userId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        throw NSError(domain: "mock", code: -1)
    }
    func getCommentReplies(postId: String, commentId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        throw NSError(domain: "mock", code: -1)
    }
    func getCommunityPosts(communityId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        throw NSError(domain: "mock", code: -1)
    }
    func recordImpressions(postIds: [String], source: String) async throws {}
    func recordImpression(postId: String, source: String) async throws {}
    func recordEngagement(_ sessions: [EngagementSession]) async throws {}
}

// MARK: - ComposeAndPublishFlowTests

/// Task 46 — integration test: compose a timeline project (add media + audio + trim)
/// then publish via TimelinePublisher. Verifies the full orchestration chain.
@MainActor
final class ComposeAndPublishFlowTests: XCTestCase {

    private func makeSUT() -> (vm: TimelineViewModel, engine: MockStoryTimelineEngine, publisher: TimelinePublisher, postService: MockPostService) {
        let engine = MockStoryTimelineEngine()
        let vm = TimelineViewModel(
            engine: engine,
            commandStack: CommandStack(),
            snapEngine: SnapEngine(toleranceSeconds: 0.1)
        )
        vm.bootstrap(project: TimelineProjectFactory.emptyProject(duration: 15),
                     mediaURLs: [:], images: [:])
        let mockPost = MockPostService()
        let publisher = TimelinePublisher(postService: mockPost)
        return (vm, engine, publisher, mockPost)
    }

    func test_composeFlow_addMediaAudioTrim_thenPublish_callsPostService() async throws {
        let (vm, _, publisher, mockPost) = makeSUT()
        await vm.awaitConfigured()

        // Step 1: add a video clip
        vm.addMedia(id: "vid-1", postMediaId: "pm-1", kind: .video, startTime: 0, duration: 8)
        XCTAssertEqual(vm.project.mediaObjects.count, 1)

        // Step 2: add an audio clip
        vm.addAudio(id: "aud-1", postMediaId: "pm-2", startTime: 0, duration: 8)
        XCTAssertEqual(vm.project.audioPlayerObjects.count, 1)

        // Step 3: trim end of video clip
        vm.trimClipEnd(id: "vid-1", deltaTimeSeconds: -1.5)
        let trimmedDuration = vm.project.mediaObjects.first?.duration ?? 0
        XCTAssertEqual(trimmedDuration, 6.5, accuracy: 0.01)

        // Step 4: publish — PostService receives the effects payload
        mockPost.createStoryResult = .success(try fakePost())
        let _ = try await publisher.publish(project: vm.project)
        XCTAssertEqual(mockPost.createStoryCallCount, 1)
        // The effects forwarded to the service must contain the video clip
        XCTAssertEqual(mockPost.lastStoryEffects?.mediaObjects?.count, 1)
        XCTAssertEqual(mockPost.lastStoryEffects?.audioPlayerObjects?.count, 1)
    }

    // MARK: - Helpers

    private func fakePost() throws -> APIPost {
        let json = """
        {
          "id":"post-999","type":"STORY","visibility":"PUBLIC",
          "content":null,"originalLanguage":null,
          "createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z",
          "author":{"id":"u-1","username":"test","displayName":"Test","avatar":null,"isVerified":false,"createdAt":"2026-01-01T00:00:00.000Z"},
          "isPinned":false
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { dec in
            let s = try dec.singleValueContainer().decode(String.self)
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return f.date(from: s) ?? Date()
        }
        return try decoder.decode(APIPost.self, from: json)
    }
}
