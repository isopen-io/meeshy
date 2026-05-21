import XCTest
@testable import Meeshy
import MeeshySDK

/// M1 follow-up to PR #280 — pins the 3 fire-and-forget endpoints that
/// the story viewer surfaces use (translate, comment, react). The
/// service used to be 4 inline `try?` blocks in 3 different View+
/// extension files; this test class confirms that they now hit the
/// right endpoints and survive a network failure without crashing.
@MainActor
final class StoryInteractionServiceTests: XCTestCase {

    private static let storyId = "story-1"

    private func makeEmptyResponse() -> APIResponse<AnyCodable> {
        JSONStub.decode("""
        { "success": true, "data": {}, "error": null }
        """)
    }

    private func makeSUT() -> (sut: StoryInteractionService, api: MockAPIClientForApp) {
        let api = MockAPIClientForApp()
        let sut = StoryInteractionService(api: api)
        return (sut, api)
    }

    // MARK: - requestTranslation

    func test_requestTranslation_hitsCorrectEndpoint() async {
        let (sut, api) = makeSUT()
        let endpoint = "/posts/\(Self.storyId)/translate"
        api.stub(endpoint, result: makeEmptyResponse())

        await sut.requestTranslation(storyId: Self.storyId, targetLanguage: "es")

        XCTAssertEqual(api.postCount, 1)
        XCTAssertEqual(api.requestEndpoints.last, endpoint)
    }

    func test_requestTranslation_apiFailure_doesNotThrow() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 503)

        // Must not crash. The error is intentionally swallowed (logged
        // via os.Logger) — the user-visible UX is "translation didn't
        // happen", surfaced through the absent translation in the
        // socket payload.
        await sut.requestTranslation(storyId: Self.storyId, targetLanguage: "es")

        XCTAssertEqual(api.postCount, 1)
    }

    // MARK: - postComment

    func test_postComment_minimalArgs_hitsEndpoint() async {
        let (sut, api) = makeSUT()
        let endpoint = "/posts/\(Self.storyId)/comments"
        api.stub(endpoint, result: makeEmptyResponse())

        await sut.postComment(
            storyId: Self.storyId,
            content: "great story",
            originalLanguage: "fr"
        )

        XCTAssertEqual(api.postCount, 1)
        XCTAssertEqual(api.requestEndpoints.last, endpoint)
    }

    func test_postComment_replyWithEffectFlags_hitsEndpoint() async {
        let (sut, api) = makeSUT()
        let endpoint = "/posts/\(Self.storyId)/comments"
        api.stub(endpoint, result: makeEmptyResponse())

        await sut.postComment(
            storyId: Self.storyId,
            content: "👏",
            originalLanguage: "fr",
            effectFlags: 7,
            parentId: "comment-parent"
        )

        XCTAssertEqual(api.postCount, 1)
        XCTAssertEqual(api.requestEndpoints.last, endpoint)
    }

    func test_postComment_apiFailure_doesNotThrow() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 401)

        await sut.postComment(
            storyId: Self.storyId,
            content: "swallowed",
            originalLanguage: "fr"
        )

        XCTAssertEqual(api.postCount, 1)
    }

    // MARK: - react

    func test_react_hitsCorrectEndpoint() async {
        let (sut, api) = makeSUT()
        let endpoint = "/posts/\(Self.storyId)/like"
        api.stub(endpoint, result: makeEmptyResponse())

        await sut.react(storyId: Self.storyId, emoji: "🔥")

        XCTAssertEqual(api.postCount, 1)
        XCTAssertEqual(api.requestEndpoints.last, endpoint)
    }

    func test_react_apiFailure_doesNotThrow() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 429)

        await sut.react(storyId: Self.storyId, emoji: "🔥")

        XCTAssertEqual(api.postCount, 1)
    }

    // MARK: - Failure-then-success: proves the catch handler is recoverable.
    //
    // If any of the service methods accidentally captured error state in a
    // way that broke the next call, this test would surface it. Same SUT
    // instance, two calls, the second after errorToThrow is cleared.

    func test_react_failureThenSuccess_secondCallStillFires() async {
        let (sut, api) = makeSUT()
        let endpoint = "/posts/\(Self.storyId)/like"
        api.stub(endpoint, result: makeEmptyResponse())

        api.errorToThrow = NSError(domain: "TestNetwork", code: 500)
        await sut.react(storyId: Self.storyId, emoji: "🔥")
        XCTAssertEqual(api.postCount, 1)

        api.errorToThrow = nil
        await sut.react(storyId: Self.storyId, emoji: "❤️")
        XCTAssertEqual(api.postCount, 2)
    }
}
