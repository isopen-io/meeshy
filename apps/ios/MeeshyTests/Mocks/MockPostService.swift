import Foundation
import MeeshySDK
import XCTest

nonisolated(unsafe) private let emptyPaginatedPosts: PaginatedAPIResponse<[APIPost]> = JSONStub.decode("""
{"success":true,"data":[],"pagination":null,"error":null}
""")

private let stubPost: APIPost = JSONStub.decode("""
{"id":"post-stub","type":"POST","content":"stub","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
""")

private let stubComment: APIPostComment = JSONStub.decode("""
{"id":"comment-stub","content":"stub","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
""")

final class MockPostService: PostServiceProviding, @unchecked Sendable {

    // MARK: - Stubbing

    var getFeedResult: Result<PaginatedAPIResponse<[APIPost]>, Error> = .success(emptyPaginatedPosts)
    var getReelsResult: Result<PaginatedAPIResponse<[APIPost]>, Error>? = nil
    var createResult: Result<APIPost, Error> = .success(stubPost)
    var deleteResult: Result<Void, Error> = .success(())
    var likeResult: Result<Void, Error> = .success(())
    var unlikeResult: Result<Void, Error> = .success(())
    var bookmarkResult: Result<Void, Error> = .success(())
    var addCommentResult: Result<APIPostComment, Error> = .success(stubComment)
    var likeCommentResult: Result<Void, Error> = .success(())
    var unlikeCommentResult: Result<Void, Error> = .success(())
    var deleteCommentResult: Result<Void, Error> = .success(())
    var repostResult: Result<APIPost, Error> = .success(stubPost)
    var shareResult: Result<Void, Error> = .success(())
    var createStoryResult: Result<APIPost, Error> = .success(stubPost)
    var createWithTypeResult: Result<APIPost, Error> = .success(stubPost)

    // MARK: - Call Tracking

    var getFeedCallCount = 0
    var lastGetFeedCursor: String?
    var lastGetFeedLimit: Int?

    var getReelsCallCount = 0
    var lastGetReelsSeedId: String?
    var lastGetReelsCursor: String?
    var lastGetReelsLimit: Int?

    var createCallCount = 0
    var lastCreateContent: String?
    var lastCreateType: String?
    var lastCreateRepostOfId: String?

    var deleteCallCount = 0
    var lastDeletePostId: String?

    var likeCallCount = 0
    var lastLikePostId: String?

    var unlikeCallCount = 0
    var lastUnlikePostId: String?

    var bookmarkCallCount = 0
    var lastBookmarkPostId: String?

    var addCommentCallCount = 0
    var lastAddCommentPostId: String?
    var lastAddCommentContent: String?
    var lastAddCommentParentId: String?
    var lastAddCommentClientMutationId: String?
    var lastAddCommentAttachmentIds: [String]?

    var likeCommentCallCount = 0
    var lastLikeCommentPostId: String?
    var lastLikeCommentCommentId: String?
    var unlikeCommentCallCount = 0
    var lastUnlikeCommentPostId: String?
    var lastUnlikeCommentCommentId: String?
    var deleteCommentCallCount = 0
    var lastDeleteCommentPostId: String?
    var lastDeleteCommentCommentId: String?

    var repostCallCount = 0
    var lastRepostPostId: String?
    var lastRepostTargetType: PostType?
    var lastRepostContent: String?
    var lastRepostIsQuote: Bool?

    var shareCallCount = 0
    var lastSharePostId: String?
    var lastShareGenerateLink: Bool?
    var lastSharePlatform: String?

    var createStoryCallCount = 0
    var lastCreateStoryContent: String?
    var lastCreateStoryRepostOfId: String?
    var lastCreateStoryOriginalLanguage: String?

    var createWithTypeCallCount = 0
    var lastCreateWithTypeType: PostType?

    var updateCallCount = 0
    var lastUpdatePostId: String?
    var lastUpdateContent: String?
    var lastUpdateOriginalLanguage: String?
    var lastUpdateType: String?
    var lastUpdateRemoveMediaIds: [String]?

    var viewPostCallCount = 0
    var lastViewPostId: String?

    var getPostViewsCallCount = 0
    var getUserPostsCallCount = 0
    var getCommentRepliesCallCount = 0
    var getCommunityPostsCallCount = 0

    var getBookmarksResult: Result<PaginatedAPIResponse<[APIPost]>, Error> = .success(emptyPaginatedPosts)
    var getBookmarksCallCount = 0
    var lastGetBookmarksCursor: String?

    var removeBookmarkResult: Result<Void, Error> = .success(())
    var removeBookmarkCallCount = 0
    var lastRemoveBookmarkPostId: String?

    var getPostResult: Result<APIPost, Error> = .success(stubPost)
    var getPostCallCount = 0
    var lastGetPostId: String?

    var getCommentsResult: Result<PaginatedAPIResponse<[APIPostComment]>, Error> = {
        let empty: PaginatedAPIResponse<[APIPostComment]> = JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
        return .success(empty)
    }()
    var getCommentsCallCount = 0
    var lastGetCommentsPostId: String?

    var recordImpressionsCallCount = 0
    var lastRecordImpressionPostIds: [String]?

    var recordImpressionCallCount = 0
    var lastRecordImpressionPostId: String?
    var lastRecordImpressionSource: String?

    var recordEngagementCallCount = 0
    var lastRecordEngagementSessions: [EngagementSession]?

    // MARK: - Protocol Conformance

    func getFeed(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getFeedCallCount += 1
        lastGetFeedCursor = cursor
        lastGetFeedLimit = limit
        return try getFeedResult.get()
    }

    func getReels(seedReelId: String?, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getReelsCallCount += 1
        lastGetReelsSeedId = seedReelId
        lastGetReelsCursor = cursor
        lastGetReelsLimit = limit
        // Falls through to `getFeedResult` when no dedicated reels stub is set, so
        // existing tests that only stub the feed keep working unchanged.
        return try (getReelsResult ?? getFeedResult).get()
    }

    func create(content: String?, type: String, visibility: String, moodEmoji: String?,
                mediaIds: [String]?, audioUrl: String?, audioDuration: Int?,
                originalLanguage: String?,
                mobileTranscription: MobileTranscriptionPayload?,
                repostOfId: String?) async throws -> APIPost {
        createCallCount += 1
        lastCreateContent = content
        lastCreateType = type
        lastCreateRepostOfId = repostOfId
        return try createResult.get()
    }

    func delete(postId: String) async throws {
        deleteCallCount += 1
        lastDeletePostId = postId
        try deleteResult.get()
    }

    func like(postId: String) async throws {
        likeCallCount += 1
        lastLikePostId = postId
        try likeResult.get()
    }

    func unlike(postId: String) async throws {
        unlikeCallCount += 1
        lastUnlikePostId = postId
        try unlikeResult.get()
    }

    func bookmark(postId: String) async throws {
        bookmarkCallCount += 1
        lastBookmarkPostId = postId
        try bookmarkResult.get()
    }

    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?,
                    attachmentIds: [String]?, mobileTranscription: MobileTranscriptionPayload?,
                    originalLanguage: String?) async throws -> APIPostComment {
        addCommentCallCount += 1
        lastAddCommentPostId = postId
        lastAddCommentContent = content
        lastAddCommentParentId = parentId
        lastAddCommentAttachmentIds = attachmentIds
        return try addCommentResult.get()
    }

    func addComment(postId: String, content: String, parentId: String?, effectFlags: Int?, clientMutationId: String?) async throws -> APIPostComment {
        lastAddCommentClientMutationId = clientMutationId
        return try await addComment(postId: postId, content: content, parentId: parentId, effectFlags: effectFlags)
    }

    func likeComment(postId: String, commentId: String) async throws {
        likeCommentCallCount += 1
        lastLikeCommentPostId = postId
        lastLikeCommentCommentId = commentId
        try likeCommentResult.get()
    }

    func unlikeComment(postId: String, commentId: String) async throws {
        unlikeCommentCallCount += 1
        lastUnlikeCommentPostId = postId
        lastUnlikeCommentCommentId = commentId
        try unlikeCommentResult.get()
    }

    func deleteComment(postId: String, commentId: String) async throws {
        deleteCommentCallCount += 1
        lastDeleteCommentPostId = postId
        lastDeleteCommentCommentId = commentId
        try deleteCommentResult.get()
    }

    func repost(postId: String, targetType: PostType?, content: String?, isQuote: Bool) async throws -> APIPost {
        repostCallCount += 1
        lastRepostPostId = postId
        lastRepostTargetType = targetType
        lastRepostContent = content
        lastRepostIsQuote = isQuote
        return try repostResult.get()
    }

    func share(postId: String) async throws {
        shareCallCount += 1
        lastSharePostId = postId
        try shareResult.get()
    }

    func share(postId: String, platform: String?, generateLink: Bool) async throws -> PostShareResult {
        shareCallCount += 1
        lastSharePostId = postId
        lastSharePlatform = platform
        lastShareGenerateLink = generateLink
        try shareResult.get()
        return PostShareResult(
            shared: true,
            shareCount: 1,
            shortUrl: generateLink ? "https://meeshy.me/l/mock123" : nil,
            token: generateLink ? "mock123" : nil
        )
    }

    func createStory(content: String?, storyEffects: StoryEffects?, visibility: String,
                     visibilityUserIds: [String]?, originalLanguage: String?, mediaIds: [String]?,
                     repostOfId: String?) async throws -> APIPost {
        createStoryCallCount += 1
        lastCreateStoryContent = content
        lastCreateStoryRepostOfId = repostOfId
        lastCreateStoryOriginalLanguage = originalLanguage
        return try createStoryResult.get()
    }

    func createWithType(_ type: PostType, content: String, visibility: String,
                        moodEmoji: String?, storyEffects: StoryEffects?) async throws -> APIPost {
        createWithTypeCallCount += 1
        lastCreateWithTypeType = type
        return try createWithTypeResult.get()
    }

    func requestTranslation(postId: String, targetLanguage: String) async throws {}

    func pinPost(postId: String) async throws {}

    func unpinPost(postId: String) async throws {}

    func update(postId: String, content: String?, visibility: String?, moodEmoji: String?, originalLanguage: String?, type: String?, removeMediaIds: [String]?) async throws -> APIPost {
        updateCallCount += 1
        lastUpdatePostId = postId
        lastUpdateContent = content
        lastUpdateOriginalLanguage = originalLanguage
        lastUpdateType = type
        lastUpdateRemoveMediaIds = removeMediaIds
        return try createResult.get()
    }

    func viewPost(postId: String, duration: Int?) async throws {
        viewPostCallCount += 1
        lastViewPostId = postId
    }

    func getPostViews(postId: String, limit: Int, offset: Int) async throws -> PostViewersResponse {
        getPostViewsCallCount += 1
        return JSONStub.decode("""
        {"items":[],"pagination":{"total":0,"offset":0,"limit":\(limit),"hasMore":false}}
        """)
    }

    func getUserPosts(userId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getUserPostsCallCount += 1
        return try getFeedResult.get()
    }

    func getCommentReplies(postId: String, commentId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        getCommentRepliesCallCount += 1
        return JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
    }

    func getCommunityPosts(communityId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getCommunityPostsCallCount += 1
        return try getFeedResult.get()
    }

    func getBookmarks(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        getBookmarksCallCount += 1
        lastGetBookmarksCursor = cursor
        return try getBookmarksResult.get()
    }

    func removeBookmark(postId: String) async throws {
        removeBookmarkCallCount += 1
        lastRemoveBookmarkPostId = postId
        try removeBookmarkResult.get()
    }

    func getPost(postId: String) async throws -> APIPost {
        getPostCallCount += 1
        lastGetPostId = postId
        return try getPostResult.get()
    }

    func getComments(postId: String, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPostComment]> {
        getCommentsCallCount += 1
        lastGetCommentsPostId = postId
        return try getCommentsResult.get()
    }

    func recordImpressions(postIds: [String], source: String) async throws {
        recordImpressionsCallCount += 1
        lastRecordImpressionPostIds = postIds
    }

    func recordImpression(postId: String, source: String) async throws {
        recordImpressionCallCount += 1
        lastRecordImpressionPostId = postId
        lastRecordImpressionSource = source
    }

    func recordEngagement(_ sessions: [EngagementSession]) async throws {
        recordEngagementCallCount += 1
        lastRecordEngagementSessions = sessions
    }

    // MARK: - Reset

    func reset() {
        getFeedResult = .success(emptyPaginatedPosts)
        getFeedCallCount = 0
        lastGetFeedCursor = nil
        lastGetFeedLimit = nil

        getReelsResult = nil
        getReelsCallCount = 0
        lastGetReelsSeedId = nil
        lastGetReelsCursor = nil
        lastGetReelsLimit = nil

        createResult = .success(stubPost)
        createCallCount = 0
        lastCreateContent = nil
        lastCreateType = nil
        lastCreateRepostOfId = nil

        deleteResult = .success(())
        deleteCallCount = 0
        lastDeletePostId = nil

        likeResult = .success(())
        likeCallCount = 0
        lastLikePostId = nil

        unlikeResult = .success(())
        unlikeCallCount = 0
        lastUnlikePostId = nil

        bookmarkResult = .success(())
        bookmarkCallCount = 0
        lastBookmarkPostId = nil

        addCommentResult = .success(stubComment)
        addCommentCallCount = 0
        lastAddCommentPostId = nil
        lastAddCommentContent = nil
        lastAddCommentParentId = nil
        lastAddCommentClientMutationId = nil
        lastAddCommentAttachmentIds = nil

        likeCommentResult = .success(())
        likeCommentCallCount = 0
        lastLikeCommentPostId = nil
        lastLikeCommentCommentId = nil
        unlikeCommentResult = .success(())
        unlikeCommentCallCount = 0
        lastUnlikeCommentPostId = nil
        lastUnlikeCommentCommentId = nil
        deleteCommentResult = .success(())
        deleteCommentCallCount = 0
        lastDeleteCommentPostId = nil
        lastDeleteCommentCommentId = nil

        repostResult = .success(stubPost)
        repostCallCount = 0
        lastRepostPostId = nil
        lastRepostTargetType = nil
        lastRepostContent = nil
        lastRepostIsQuote = nil

        shareResult = .success(())
        shareCallCount = 0
        lastSharePostId = nil
        lastShareGenerateLink = nil
        lastSharePlatform = nil

        createStoryResult = .success(stubPost)
        createStoryCallCount = 0
        lastCreateStoryContent = nil
        lastCreateStoryRepostOfId = nil
        lastCreateStoryOriginalLanguage = nil

        createWithTypeResult = .success(stubPost)
        createWithTypeCallCount = 0
        lastCreateWithTypeType = nil

        updateCallCount = 0
        lastUpdatePostId = nil
        lastUpdateContent = nil
        lastUpdateOriginalLanguage = nil
        lastUpdateType = nil
        viewPostCallCount = 0
        lastViewPostId = nil
        getPostViewsCallCount = 0
        getUserPostsCallCount = 0
        getCommentRepliesCallCount = 0
        getCommunityPostsCallCount = 0

        getBookmarksResult = .success(emptyPaginatedPosts)
        getBookmarksCallCount = 0
        lastGetBookmarksCursor = nil

        removeBookmarkResult = .success(())
        removeBookmarkCallCount = 0
        lastRemoveBookmarkPostId = nil

        getPostResult = .success(stubPost)
        getPostCallCount = 0
        lastGetPostId = nil

        getCommentsCallCount = 0
        lastGetCommentsPostId = nil

        recordImpressionsCallCount = 0
        lastRecordImpressionPostIds = nil

        recordImpressionCallCount = 0
        lastRecordImpressionPostId = nil
        lastRecordImpressionSource = nil

        recordEngagementCallCount = 0
        lastRecordEngagementSessions = nil
    }
}
