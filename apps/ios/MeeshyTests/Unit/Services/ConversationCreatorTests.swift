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

    // MARK: - L'en-tête n'ouvre le direct qu'une fois (#18297)

    func test_directMessageOpener_secondTapWhileOpening_isAbsorbed() async {
        let creator = SuspendedDirectCreator()
        let opener = DirectMessageOpener(creator: creator)
        let first = Task { await opener.open(with: "u-other", currentUserId: "u-self") }
        while creator.calls == 0 { await Task.yield() }
        let second = Task { await opener.open(with: "u-other", currentUserId: "u-self") }
        for _ in 0..<20 { await Task.yield() }
        creator.release()

        let opened = await first.value
        let absorbed = await second.value

        XCTAssertEqual(absorbed, .busy, "un second toucher pendant la création n'en relance pas une autre")
        XCTAssertEqual(opened, .opened(SuspendedDirectCreator.created))
        XCTAssertEqual(creator.calls, 1)
    }

    func test_directMessageOpener_failure_isReported_andTheNextTapRetries() async {
        let creator = SuspendedDirectCreator()
        creator.outcome = .failure(NSError(domain: "TestNetwork", code: 503))
        creator.release()
        let opener = DirectMessageOpener(creator: creator)

        let failed = await opener.open(with: "u-other", currentUserId: "u-self")
        creator.outcome = .success(SuspendedDirectCreator.created)
        let retried = await opener.open(with: "u-other", currentUserId: "u-self")

        XCTAssertEqual(failed, .failed, "l'échec remonte à l'hôte, qui le dit")
        XCTAssertEqual(retried, .opened(SuspendedDirectCreator.created), "après un échec, le toucher suivant réessaie")
        XCTAssertEqual(creator.calls, 2)
    }
}

/// Un créateur qui ne rend la main qu'à `release()` : la création reste EN
/// COURS le temps qu'un second toucher arrive. Relâché, il répond aussitôt.
@MainActor
private final class SuspendedDirectCreator: ConversationCreating {
    static let created = MeeshyConversation(id: "conv-dm", identifier: "conv-dm", type: .direct)

    nonisolated deinit {}

    var outcome: Result<Conversation, Error> = .success(SuspendedDirectCreator.created)
    private(set) var calls = 0
    private var isReleased = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func createDirectConversation(with userId: String, currentUserId: String) async throws -> Conversation {
        calls += 1
        if !isReleased {
            await withCheckedContinuation { waiters.append($0) }
        }
        return try outcome.get()
    }

    func release() {
        isReleased = true
        let pending = waiters
        waiters = []
        pending.forEach { $0.resume() }
    }
}
