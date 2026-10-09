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
        let (sut, api, _) = makeSUTWithParticipation()
        return (sut, api)
    }

    private func makeSUTWithParticipation() -> (sut: StoryInteractionService, api: MockAPIClientForApp, participation: SpyParticipationRecorder) {
        let api = MockAPIClientForApp()
        let participation = SpyParticipationRecorder()
        let sut = StoryInteractionService(api: api, participation: participation)
        return (sut, api, participation)
    }

    func test_noteComment_notesTheCommentForTheStoryRail() {
        let (sut, _, participation) = makeSUTWithParticipation()

        sut.noteComment(storyId: Self.storyId)

        XCTAssertEqual(participation.notes.map { $0.storyId }, [Self.storyId])
        XCTAssertEqual(participation.notes.map { $0.mark }, [.commented])
    }

    func test_requestTranslation_notesNothing() async {
        let (sut, api, participation) = makeSUTWithParticipation()
        api.stub("/posts/\(Self.storyId)/translate", result: makeEmptyResponse())

        await sut.requestTranslation(storyId: Self.storyId, targetLanguage: "es")

        XCTAssertTrue(participation.notes.isEmpty)
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

    // MARK: - react

    func test_react_hitsCorrectEndpoint() async throws {
        let (sut, api) = makeSUT()
        let endpoint = "/posts/\(Self.storyId)/like"
        api.stub(endpoint, result: makeEmptyResponse())

        try await sut.react(storyId: Self.storyId, emoji: "🔥")

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

    func test_loadViewers_enrichedRow_carriesWhatThePersonDid() async {
        let (sut, api) = makeSUT()
        let endpoint = "/posts/\(Self.storyId)/interactions"
        let response: APIResponse<StoryViewersWireResponse> = JSONStub.decode("""
        {
          "success": true,
          "data": { "viewers": [
            {
              "id":"viewer-0", "username":"noor", "displayName":"Noor", "avatarUrl":null,
              "viewedAt":"2026-10-10T12:00:00.000Z",
              "reaction":"😂", "reactions":["❤️","😂"],
              "shareCount":1, "repostCount":2, "commentCount":3, "replyCount":4, "bookmarked":true
            }
          ] },
          "error": null
        }
        """)
        api.stub(endpoint, result: response)

        let result = await sut.loadViewers(storyId: Self.storyId)

        XCTAssertEqual(result?.first?.reactionEmoji, "😂")
        XCTAssertEqual(result?.first?.engagement.marks, [
            .reactions(["❤️", "😂"]), .comments(3), .replies(4), .reposts(2), .shares(1)
        ])
    }

    func test_loadViewers_rowWithoutCounters_drawsNoMark() async {
        let (sut, api) = makeSUT()
        let endpoint = "/posts/\(Self.storyId)/interactions"
        api.stub(endpoint, result: makeViewersResponse(count: 2))

        let result = await sut.loadViewers(storyId: Self.storyId)

        XCTAssertEqual(result?[0].engagement.marks, [.reactions(["🔥"])])
        XCTAssertEqual(result?[1].engagement.marks, [])
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

    // MARK: - loadViewerList (#9727) — un refus se distingue d'une panne

    func test_loadViewerList_forbidden_returnsForbidden() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = MeeshyError.forbidden(reason: "Only the author of a story, or an administrator, can view this list", body: nil)

        let outcome = await sut.loadViewerList(postId: Self.storyId)

        guard case .forbidden = outcome else {
            return XCTFail("a 403 is a REFUSAL the sheet must say, not a failure nor an empty list — got \(outcome)")
        }
    }

    func test_loadViewerList_networkFailure_returnsFailed() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 503)

        let outcome = await sut.loadViewerList(postId: Self.storyId)

        guard case .failed = outcome else { return XCTFail("expected .failed, got \(outcome)") }
    }

    func test_loadViewerList_success_returnsLoadedRows() async {
        let (sut, api) = makeSUT()
        api.stub("/posts/\(Self.storyId)/interactions", result: makeViewersResponse(count: 2))

        let outcome = await sut.loadViewerList(postId: Self.storyId)

        guard case .loaded(let rows) = outcome else { return XCTFail("expected .loaded, got \(outcome)") }
        XCTAssertEqual(rows.count, 2)
    }

    func test_loadViewers_forbidden_returnsNil() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = MeeshyError.forbidden(reason: nil, body: nil)

        let result = await sut.loadViewers(storyId: Self.storyId)

        XCTAssertNil(result)
    }
}

/// QUI peut ouvrir « Vues » (#9727, décision porteur 2026-10-09) — miroir de
/// `viewerListAccess` côté passerelle : l'auteur d'une story ou d'un statut ;
/// ADMIN/BIGBOSS pour tout contenu ; l'auteur d'un post ou d'un réel n'en voit
/// que les nombres.
final class PublicationViewersAccessTests: XCTestCase {

    func test_mayList_authorOfPostOrReel_notAdmin_isRefused() {
        for type in ["POST", "REEL", nil] as [String?] {
            XCTAssertFalse(PublicationViewersAccess.mayList(postType: type, isAuthor: true, viewerRole: "USER"), "\(type ?? "nil")")
        }
    }

    func test_mayList_authorOfStoryOrStatus_isAllowed() {
        XCTAssertTrue(PublicationViewersAccess.mayList(postType: "STORY", isAuthor: true, viewerRole: "USER"))
        XCTAssertTrue(PublicationViewersAccess.mayList(postType: "STATUS", isAuthor: true, viewerRole: nil))
    }

    func test_mayList_administrator_isAllowedOnAnyContent() {
        for role in ["ADMIN", "BIGBOSS", "admin"] {
            XCTAssertTrue(PublicationViewersAccess.mayList(postType: "POST", isAuthor: false, viewerRole: role), role)
            XCTAssertTrue(PublicationViewersAccess.mayList(postType: "REEL", isAuthor: true, viewerRole: role), role)
        }
    }

    func test_mayList_otherRoles_areRefused() {
        for role in ["MODERATOR", "AUDIT", "ANALYST", "AGENT", "USER", ""] {
            XCTAssertFalse(PublicationViewersAccess.mayList(postType: "POST", isAuthor: false, viewerRole: role), role)
            XCTAssertFalse(PublicationViewersAccess.mayList(postType: "STORY", isAuthor: false, viewerRole: role), role)
        }
        XCTAssertFalse(PublicationViewersAccess.mayList(postType: "POST", isAuthor: false, viewerRole: nil))
    }
}

@MainActor
private final class SpyParticipationRecorder: StoryViewerParticipationRecording {
    nonisolated deinit {}

    private(set) var notes: [(mark: StoryViewerParticipationMark, storyId: String)] = []

    func note(_ mark: StoryViewerParticipationMark, storyId: String) {
        notes.append((mark, storyId))
    }
}
