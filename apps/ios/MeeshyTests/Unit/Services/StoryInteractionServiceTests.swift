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

    /// `react` MUST throw (not swallow) so the caller — `sendReaction` in
    /// `StoryViewerView+Content.swift` — can roll back its optimistic emoji
    /// append / counter bump. The 409 `REACTION_LIMIT_REACHED` conflict is
    /// the concrete reproducible case (see `StoryReactionRollbackTests`),
    /// but ANY failure must propagate: the service still logs via
    /// `os.Logger` before rethrowing, it just no longer eats the error.
    func test_react_apiFailure_throwsAndLogs() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = MeeshyError.server(statusCode: 409, message: "REACTION_LIMIT_REACHED")

        do {
            try await sut.react(storyId: Self.storyId, emoji: "🔥")
            XCTFail("Expected react to rethrow the 409 conflict")
        } catch {
            XCTAssertEqual(api.postCount, 1)
        }
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
        do {
            try await sut.react(storyId: Self.storyId, emoji: "🔥")
            XCTFail("Expected first call to throw")
        } catch {
            XCTAssertEqual(api.postCount, 1)
        }

        api.errorToThrow = nil
        try? await sut.react(storyId: Self.storyId, emoji: "❤️")
        XCTAssertEqual(api.postCount, 2)
    }

    // MARK: - loadViewers (returns data, so we can assert structure)

    private func makeViewersResponse(count: Int) -> APIResponse<StoryViewersWireResponse> {
        // The mock's stub lookup goes via `as? APIResponse<T>` so we
        // need to stub with the exact generic the service requests.
        // `StoryViewersWireResponse` is intentionally non-private on
        // the service for this reason — documented at its definition.
        let viewers = (0..<count).map { i in
            """
            {
              "id":"viewer-\(i)",
              "username":"user\(i)",
              "displayName":\(i.isMultiple(of: 2) ? "null" : "\"User \(i)\""),
              "avatarUrl":null,
              "viewedAt":"2026-05-21T12:0\(i):00.000Z",
              "reaction":\(i == 0 ? "\"🔥\"" : "null")
            }
            """
        }
        return JSONStub.decode("""
        {
          "success": true,
          "data": { "viewers": [\(viewers.joined(separator: ","))] },
          "error": null
        }
        """)
    }

    func test_loadViewers_success_returnsConvertedSnapshots() async {
        let (sut, api) = makeSUT()
        let endpoint = "/posts/\(Self.storyId)/interactions"
        api.stub(endpoint, result: makeViewersResponse(count: 3))

        let result = await sut.loadViewers(storyId: Self.storyId)

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.count, 3)
        // Viewer 0 has null displayName → defaults to username
        XCTAssertEqual(result?[0].displayName, "user0")
        XCTAssertEqual(result?[0].reactionEmoji, "🔥")
        // Viewer 1 has explicit displayName
        XCTAssertEqual(result?[1].displayName, "User 1")
        XCTAssertNil(result?[1].reactionEmoji)
    }

    func test_loadViewers_apiFailure_returnsNil() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 500)

        let result = await sut.loadViewers(storyId: Self.storyId)

        XCTAssertNil(result,
                     "nil signals to the view 'keep previous list' — not 'empty list'")
    }

    func test_loadViewers_empty_returnsEmptyArray() async {
        let (sut, api) = makeSUT()
        let endpoint = "/posts/\(Self.storyId)/interactions"
        api.stub(endpoint, result: makeViewersResponse(count: 0))

        let result = await sut.loadViewers(storyId: Self.storyId)

        XCTAssertEqual(result, [],
                       "empty array means 'loaded, nobody has viewed yet'")
    }
}
