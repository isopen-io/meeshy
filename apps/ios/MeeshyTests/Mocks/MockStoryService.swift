import Foundation
import MeeshySDK
import XCTest

@MainActor
final class MockStoryService: StoryServiceProviding {
    nonisolated init() {}

    // MARK: - Stubbing

    var listResult: Result<PaginatedAPIResponse<[APIPost]>, Error> = .success(
        JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """)
    )
    var markViewedResult: Result<Void, Error> = .success(())
    var deleteResult: Result<Void, Error> = .success(())
    var reactResult: Result<Void, Error> = .success(())
    var commentResult: Result<APIPostComment, Error> = .success(
        JSONStub.decode("""
        {"id":"comment-stub","content":"stub","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
        """)
    )
    var repostResult: Result<Void, Error> = .success(())

    // MARK: - Call Tracking

    var listCallCount = 0
    var lastListCursor: String?
    var lastListLimit: Int?

    var markViewedCallCount = 0
    var lastMarkViewedStoryId: String?

    var deleteCallCount = 0
    var lastDeleteStoryId: String?

    var reactCallCount = 0
    var lastReactStoryId: String?
    var lastReactEmoji: String?

    var commentCallCount = 0
    var lastCommentStoryId: String?
    var lastCommentContent: String?

    var repostCallCount = 0
    var lastRepostStoryId: String?

    // MARK: - Protocol Conformance

    func list(cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[APIPost]> {
        listCallCount += 1
        lastListCursor = cursor
        lastListLimit = limit
        return try listResult.get()
    }

    func markViewed(storyId: String) async throws {
        markViewedCallCount += 1
        lastMarkViewedStoryId = storyId
        try markViewedResult.get()
    }

    func delete(storyId: String) async throws {
        deleteCallCount += 1
        lastDeleteStoryId = storyId
        try deleteResult.get()
    }

    func react(storyId: String, emoji: String) async throws {
        reactCallCount += 1
        lastReactStoryId = storyId
        lastReactEmoji = emoji
        try reactResult.get()
    }

    func comment(storyId: String, content: String) async throws -> APIPostComment {
        commentCallCount += 1
        lastCommentStoryId = storyId
        lastCommentContent = content
        return try commentResult.get()
    }

    func repost(storyId: String) async throws {
        repostCallCount += 1
        lastRepostStoryId = storyId
        try repostResult.get()
    }

    // MARK: - Reset

    func reset() {
        listResult = .success(JSONStub.decode("""
        {"success":true,"data":[],"pagination":null,"error":null}
        """))
        listCallCount = 0
        lastListCursor = nil
        lastListLimit = nil

        markViewedResult = .success(())
        markViewedCallCount = 0
        lastMarkViewedStoryId = nil

        deleteResult = .success(())
        deleteCallCount = 0
        lastDeleteStoryId = nil

        reactResult = .success(())
        reactCallCount = 0
        lastReactStoryId = nil
        lastReactEmoji = nil

        commentResult = .success(JSONStub.decode("""
        {"id":"comment-stub","content":"stub","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"stub"}}
        """))
        commentCallCount = 0
        lastCommentStoryId = nil
        lastCommentContent = nil

        repostResult = .success(())
        repostCallCount = 0
        lastRepostStoryId = nil
    }
}
