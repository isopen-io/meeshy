import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

@MainActor
final class StoryActiveBridgeTests: XCTestCase {

    // MARK: - Fixture

    /// Builds a minimal `APIPost` for the bridge tests. Mirrors the
    /// `makePost` helpers used by Phase D / E suites — JSON decode keeps the
    /// fixture aligned with the decoder behaviour the bridge exercises in
    /// production rather than diverging from it via a synthetic init.
    private func makePost(authorId: String = "user-42", postId: String = "p1") -> APIPost {
        JSONStub.decode("""
        {
            "id": "\(postId)",
            "type": "STORY",
            "content": "story content",
            "createdAt": "2026-01-15T12:00:00.000Z",
            "expiresAt": null,
            "author": {"id": "\(authorId)", "username": "alice"}
        }
        """)
    }

    // MARK: - Tests

    func test_handleAppear_intentComments_setsRequestWithCommentsAction() {
        let coordinator = MockStoryViewerCoordinator()
        let post = makePost(authorId: "user-42", postId: "p1")
        let bridge = StoryActiveBridge(
            post: post,
            intent: .comments,
            viewerCoordinator: coordinator,
            dismiss: {}
        )

        bridge.handleAppear()

        XCTAssertEqual(coordinator.lastRequest?.initialAction, .showCommentsOverlay)
        XCTAssertEqual(coordinator.lastRequest?.id, "user-42")
        XCTAssertEqual(coordinator.lastRequest?.postId, "p1",
                       "R4 inc.2: the notification request must carry the exact story post id so the container can unit-fetch it when absent from the tray")
        XCTAssertEqual(coordinator.presentCallCount, 1)
    }

    func test_handleAppear_intentReactions_setsRequestWithViewersSheet() {
        let coordinator = MockStoryViewerCoordinator()
        let post = makePost(authorId: "user-99", postId: "p2")
        let bridge = StoryActiveBridge(
            post: post,
            intent: .reactions,
            viewerCoordinator: coordinator,
            dismiss: {}
        )

        bridge.handleAppear()

        XCTAssertEqual(coordinator.lastRequest?.initialAction, .showViewersSheet)
        XCTAssertEqual(coordinator.lastRequest?.id, "user-99")
        XCTAssertEqual(coordinator.presentCallCount, 1)
    }

    func test_handleAppear_dismissesSelfAfterRequestSet() {
        let coordinator = MockStoryViewerCoordinator()
        let post = makePost()
        var dismissed = false
        let bridge = StoryActiveBridge(
            post: post,
            intent: .comments,
            viewerCoordinator: coordinator,
            dismiss: { dismissed = true }
        )

        bridge.handleAppear()

        XCTAssertTrue(dismissed, "Bridge should call dismiss() after presenting the viewer")
    }
}

// MARK: - Mock Coordinator

@MainActor
private final class MockStoryViewerCoordinator: StoryViewerCoordinating {
    var lastRequest: StoryViewerRequest?
    var presentCallCount = 0

    func present(_ request: StoryViewerRequest) {
        presentCallCount += 1
        lastRequest = request
    }
}
