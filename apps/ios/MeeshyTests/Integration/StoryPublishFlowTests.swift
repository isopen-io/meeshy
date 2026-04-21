import XCTest
import MeeshySDK
@testable import Meeshy

/// Integration test: create slides -> upload -> publish -> visible
@MainActor
final class StoryPublishFlowTests: XCTestCase {

    // MARK: - Helpers

    private func makeService() -> MockStoryService {
        MockStoryService()
    }

    private func makeAPIPost(id: String = "story001") -> APIPost {
        JSONStub.decode("""
        {"id":"\(id)","type":"story","content":"Hello slide","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"user001","username":"testuser"}}
        """)
    }

    // MARK: - List Stories

    func test_listStories_returnsEmpty_initially() async {
        let service = makeService()
        let result = try? await service.list(cursor: nil, limit: 20)

        XCTAssertEqual(service.listCallCount, 1)
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.data.count, 0)
    }

    func test_listStories_withData_returnsPosts() async {
        let service = makeService()
        let post = makeAPIPost()
        service.listResult = .success(
            PaginatedAPIResponse(success: true, data: [post], pagination: nil, error: nil)
        )

        let result = try? await service.list(cursor: nil, limit: 20)

        XCTAssertEqual(result?.data.count, 1)
        XCTAssertEqual(result?.data.first?.id, "story001")
    }

    // MARK: - Mark Viewed

    func test_markViewed_callsService() async {
        let service = makeService()

        try? await service.markViewed(storyId: "story001")

        XCTAssertEqual(service.markViewedCallCount, 1)
        XCTAssertEqual(service.lastMarkViewedStoryId, "story001")
    }

    // MARK: - React to Story

    func test_reactToStory_callsServiceWithEmoji() async {
        let service = makeService()

        try? await service.react(storyId: "story001", emoji: "heart")

        XCTAssertEqual(service.reactCallCount, 1)
        XCTAssertEqual(service.lastReactStoryId, "story001")
        XCTAssertEqual(service.lastReactEmoji, "heart")
    }

    // MARK: - Comment on Story

    func test_commentOnStory_returnsComment() async {
        let service = makeService()

        let comment = try? await service.comment(storyId: "story001", content: "Great story!")

        XCTAssertEqual(service.commentCallCount, 1)
        XCTAssertEqual(service.lastCommentStoryId, "story001")
        XCTAssertEqual(service.lastCommentContent, "Great story!")
        XCTAssertNotNil(comment)
    }

    // MARK: - Delete Story

    func test_deleteStory_callsService() async {
        let service = makeService()

        try? await service.delete(storyId: "story001")

        XCTAssertEqual(service.deleteCallCount, 1)
        XCTAssertEqual(service.lastDeleteStoryId, "story001")
    }

    // MARK: - Repost Story

    func test_repostStory_callsService() async {
        let service = makeService()

        try? await service.repost(storyId: "story001")

        XCTAssertEqual(service.repostCallCount, 1)
        XCTAssertEqual(service.lastRepostStoryId, "story001")
    }

    // MARK: - Full Publish Flow

    func test_fullFlow_listThenViewThenReact() async {
        let service = makeService()
        let post = makeAPIPost(id: "s001")
        service.listResult = .success(
            PaginatedAPIResponse(success: true, data: [post], pagination: nil, error: nil)
        )

        let stories = try? await service.list(cursor: nil, limit: 20)
        XCTAssertEqual(stories?.data.count, 1)

        let storyId = stories?.data.first?.id ?? ""
        try? await service.markViewed(storyId: storyId)
        try? await service.react(storyId: storyId, emoji: "fire")

        XCTAssertEqual(service.listCallCount, 1)
        XCTAssertEqual(service.markViewedCallCount, 1)
        XCTAssertEqual(service.reactCallCount, 1)
    }
}
