import XCTest
@testable import Meeshy
import MeeshySDK

/// P4.1 — pins the MVVM extraction for `NewConversationView`.
///
/// The view used to call `APIClient.shared.request` / `.post` directly,
/// which made it impossible to test the search / create flow without
/// driving real network. The new `NewConversationViewModel` accepts an
/// `APIClientProviding` via init injection and exposes published state so
/// the SwiftUI body becomes a pure projection.
@MainActor
final class NewConversationViewModelTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        api: MockAPIClientForApp? = nil,
        currentUserId: String = "current-user"
    ) -> (sut: NewConversationViewModel, api: MockAPIClientForApp) {
        let api = api ?? MockAPIClientForApp()
        let sut = NewConversationViewModel(
            api: api,
            currentUserIdProvider: { currentUserId }
        )
        return (sut, api)
    }

    // MARK: - Fixtures

    private static func makeSearchResponse(users: [(id: String, username: String)]) -> APIResponse<[SearchedUser]> {
        let items = users.map { u in
            """
            {"id":"\(u.id)","username":"\(u.username)","firstName":null,"lastName":null,"displayName":null,"email":null,"isOnline":null,"lastActiveAt":null,"avatar":null}
            """
        }
        return JSONStub.decode("""
        {"success":true,"data":[\(items.joined(separator: ","))],"error":null}
        """)
    }

    private static func makeUser(id: String, username: String) -> SearchedUser {
        JSONStub.decode("""
        {"id":"\(id)","username":"\(username)","firstName":null,"lastName":null,"displayName":null,"email":null,"isOnline":null,"lastActiveAt":null,"avatar":null}
        """)
    }

    private static func makeConversationResponse(id: String, type: String = "direct") -> APIResponse<APIConversation> {
        JSONStub.decode("""
        {
          "success": true,
          "data": {
            "id": "\(id)",
            "type": "\(type)",
            "title": null,
            "isActive": true,
            "createdAt": "2026-05-21T12:00:00.000Z",
            "updatedAt": "2026-05-21T12:00:00.000Z",
            "members": []
          },
          "error": null
        }
        """)
    }

    // MARK: - performSearch

    func test_performSearch_success_populatesResultsAndDropsCurrentUser() async {
        let (sut, api) = makeSUT(currentUserId: "u-current")
        api.stub(
            "/users/search",
            result: Self.makeSearchResponse(users: [
                ("u-1", "alice"),
                ("u-current", "self"),
                ("u-2", "bob")
            ])
        )

        await sut.performSearch(query: "al")

        XCTAssertFalse(sut.isSearching)
        XCTAssertEqual(sut.searchResults.map(\.id), ["u-1", "u-2"],
                       "The current user must be filtered out of the search results")
    }

    func test_performSearch_apiFailure_clearsResultsAndStopsSpinner() async {
        let (sut, api) = makeSUT()

        // Drive the state via the real pipeline (no `searchResults = [...]`
        // — that property is `private(set)` so the view can never mutate it
        // directly, and the test honours the same contract).
        api.stub(
            "/users/search",
            result: Self.makeSearchResponse(users: [("u-1", "alice")])
        )
        await sut.performSearch(query: "first")
        XCTAssertFalse(sut.searchResults.isEmpty)

        api.errorToThrow = NSError(domain: "TestNetwork", code: 503)
        await sut.performSearch(query: "second")

        XCTAssertTrue(sut.searchResults.isEmpty, "Failure must clear previously displayed results")
        XCTAssertFalse(sut.isSearching)
    }

    // Audit 2026-07-20: a failed search used to look IDENTICAL to a genuine
    // "zero results" search (both cleared `searchResults` silently, no
    // distinct state, no log) — `searchFailed` closes that gap.
    func test_performSearch_apiFailure_setsSearchFailedTrue() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 503)

        await sut.performSearch(query: "first")

        XCTAssertTrue(sut.searchFailed)
    }

    func test_performSearch_success_afterPriorFailure_clearsSearchFailedFlag() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 503)
        await sut.performSearch(query: "first")
        XCTAssertTrue(sut.searchFailed)

        api.errorToThrow = nil
        api.stub("/users/search", result: Self.makeSearchResponse(users: [("u-1", "alice")]))
        await sut.performSearch(query: "second")

        XCTAssertFalse(sut.searchFailed, "A successful retry must clear the stale failure flag")
    }

    func test_performSearch_zeroResultsWithoutError_leavesSearchFailedFalse() async {
        // 0 résultat ≠ échec: an empty (but successful) response must NOT
        // set the failure flag.
        let (sut, api) = makeSUT()
        api.stub("/users/search", result: Self.makeSearchResponse(users: []))

        await sut.performSearch(query: "nobody-matches-this")

        XCTAssertFalse(sut.searchFailed)
        XCTAssertTrue(sut.searchResults.isEmpty)
    }

    func test_search_shortQuery_clearsResultsWithoutNetwork() async {
        let (sut, api) = makeSUT()

        // Populate via the real pipeline first.
        api.stub(
            "/users/search",
            result: Self.makeSearchResponse(users: [("u-1", "alice")])
        )
        await sut.performSearch(query: "first")
        let baselineRequestCount = api.requestCount
        XCTAssertFalse(sut.searchResults.isEmpty)

        sut.search(query: "a")  // 1 char — below threshold

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertFalse(sut.isSearching)
        XCTAssertEqual(
            api.requestCount, baselineRequestCount,
            "No network call must happen below the 2-char threshold"
        )
    }

    // MARK: - dismissError / clearSearch (encapsulation contract)

    func test_dismissError_clearsErrorMessage() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 500)
        await sut.createConversation(
            selectedUsers: [Self.makeUser(id: "u-1", username: "alice")],
            groupTitle: ""
        )
        XCTAssertNotNil(sut.errorMessage)

        sut.dismissError()

        XCTAssertNil(sut.errorMessage)
    }

    func test_clearSearch_resetsResultsAndSpinner() async {
        let (sut, api) = makeSUT()
        api.stub("/users/search", result: Self.makeSearchResponse(users: [("u-1", "alice")]))
        await sut.performSearch(query: "first")
        XCTAssertFalse(sut.searchResults.isEmpty)

        sut.clearSearch()

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertFalse(sut.isSearching)
    }

    // MARK: - createConversation

    func test_createConversation_directPair_setsCreatedConversation() async {
        let (sut, api) = makeSUT(currentUserId: "u-current")
        api.stub("/conversations", result: Self.makeConversationResponse(id: "conv-1"))

        await sut.createConversation(
            selectedUsers: [Self.makeUser(id: "u-1", username: "alice")],
            groupTitle: ""
        )

        XCTAssertFalse(sut.isCreating)
        XCTAssertNil(sut.errorMessage)
        XCTAssertEqual(sut.createdConversation?.id, "conv-1")
        XCTAssertEqual(api.postCount, 1)
    }

    func test_createConversation_failure_surfacesErrorMessage() async {
        let (sut, api) = makeSUT()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 500)

        await sut.createConversation(
            selectedUsers: [Self.makeUser(id: "u-1", username: "alice")],
            groupTitle: ""
        )

        XCTAssertFalse(sut.isCreating)
        XCTAssertNil(sut.createdConversation)
        XCTAssertNotNil(sut.errorMessage, "Failure must surface a user-facing error string instead of silently failing")
    }

    func test_createConversation_emptyParticipants_isNoOp() async {
        let (sut, api) = makeSUT()
        await sut.createConversation(selectedUsers: [], groupTitle: "")
        XCTAssertEqual(api.postCount, 0)
        XCTAssertFalse(sut.isCreating)
        XCTAssertNil(sut.createdConversation)
    }

    func test_createConversation_userBlocked_setsBlockSpecificError() async {
        let (sut, api) = makeSUT()
        // Gateway rejects a DM with a blocked user (either direction) with a
        // 403 carrying `code: USER_BLOCKED`, surfaced as MeeshyError.forbidden.
        api.errorToThrow = MeeshyError.forbidden(
            reason: "blocked",
            body: Data(#"{"success":false,"error":"USER_BLOCKED","code":"USER_BLOCKED"}"#.utf8)
        )

        await sut.createConversation(
            selectedUsers: [Self.makeUser(id: "u-1", username: "alice")],
            groupTitle: ""
        )

        XCTAssertFalse(sut.isCreating)
        XCTAssertNil(sut.createdConversation)
        let blocked = String(
            localized: "new_conversation.error.blocked",
            defaultValue: "Vous ne pouvez pas démarrer de conversation avec cet utilisateur.",
            bundle: .main
        )
        XCTAssertEqual(sut.errorMessage, blocked,
                       "A USER_BLOCKED 403 must surface the block-specific message, not the generic create failure")
    }

    func test_isUserBlockedError_detectsCodeInForbiddenBodyOnly() {
        let blocked = MeeshyError.forbidden(reason: nil, body: Data(#"{"code":"USER_BLOCKED"}"#.utf8))
        XCTAssertTrue(blocked.isUserBlockedError)

        let otherForbidden = MeeshyError.forbidden(reason: "nope", body: Data(#"{"code":"FORBIDDEN"}"#.utf8))
        XCTAssertFalse(otherForbidden.isUserBlockedError)

        let noBody = MeeshyError.forbidden(reason: nil, body: nil)
        XCTAssertFalse(noBody.isUserBlockedError)

        let nonForbidden: Error = NSError(domain: "x", code: 1)
        XCTAssertFalse(nonForbidden.isUserBlockedError)
    }

    func test_consumeCreatedConversation_clearsState() async {
        let (sut, api) = makeSUT()
        api.stub("/conversations", result: Self.makeConversationResponse(id: "conv-1"))
        await sut.createConversation(
            selectedUsers: [Self.makeUser(id: "u-1", username: "alice")],
            groupTitle: ""
        )
        XCTAssertNotNil(sut.createdConversation)

        sut.consumeCreatedConversation()

        XCTAssertNil(sut.createdConversation,
                     "After consumption the navigation hand-off must not refire on next render")
    }
}
