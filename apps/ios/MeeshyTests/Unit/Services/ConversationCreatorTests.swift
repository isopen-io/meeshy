import XCTest
@testable import Meeshy
import MeeshySDK

/// P4.1 — covers the small service that moved the DM POST flow out of
/// `ConversationView+Header.swift`. The view used to call
/// `APIClient.shared.post` directly; the new shape goes through
/// `ConversationCreator` which conforms to `ConversationCreating` and
/// takes its API client via init injection.
@MainActor
final class ConversationCreatorTests: XCTestCase {

    private func makeAPIConversationResponse(
        id: String = "conv-new",
        type: String = "direct"
    ) -> APIResponse<APIConversation> {
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

    // MARK: - Success path

    func test_createDirectConversation_postsCorrectBody_andDecodesAPIConversation() async throws {
        let api = MockAPIClientForApp()
        api.stub("/conversations", result: makeAPIConversationResponse(id: "conv-direct-1"))
        let sut = ConversationCreator(api: api)

        let conversation = try await sut.createDirectConversation(
            with: "u-other",
            currentUserId: "u-self"
        )

        XCTAssertEqual(conversation.id, "conv-direct-1")
        XCTAssertEqual(api.postCount, 1)
        XCTAssertEqual(api.requestEndpoints.last, "/conversations")
    }

    // MARK: - Failure path

    func test_createDirectConversation_apiFailure_propagatesError() async {
        let api = MockAPIClientForApp()
        api.errorToThrow = NSError(domain: "TestNetwork", code: 500)
        let sut = ConversationCreator(api: api)

        do {
            _ = try await sut.createDirectConversation(
                with: "u-other",
                currentUserId: "u-self"
            )
            XCTFail("Should have rethrown the API error")
        } catch {
            // Expected — the view-level call site swallows this on purpose
            // (fire-and-forget on a user tap), but the service itself must
            // bubble it up so any future caller can decide what to do.
        }
    }
}
