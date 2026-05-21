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
        api.errorToThrow = NSError(domain: "TestNetwork", code: 503)

        // Seed prior results so we can prove they're wiped on failure.
        sut.searchResults = [Self.makeUser(id: "stale", username: "stale")]

        await sut.performSearch(query: "anything")

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertFalse(sut.isSearching)
    }

    func test_search_shortQuery_clearsResultsWithoutNetwork() {
        let (sut, api) = makeSUT()
        sut.searchResults = [Self.makeUser(id: "x", username: "x")]
        sut.isSearching = true

        sut.search(query: "a")  // 1 char

        XCTAssertTrue(sut.searchResults.isEmpty)
        XCTAssertFalse(sut.isSearching)
        XCTAssertEqual(api.requestCount, 0, "No network call must happen below the 2-char threshold")
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
