import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class StoryNotificationTargetViewModelTests: XCTestCase {

    // MARK: - Helpers

    private func makeContext() -> StoryNotificationContext {
        StoryNotificationContext(
            actorAvatar: nil,
            actorDisplayName: "Alice",
            trigger: .reaction(emoji: "🔥"),
            occurredAt: Date()
        )
    }

    private func makePost(id: String, expiresAt: Date?) -> APIPost {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let expiresAtJSON = expiresAt.map { "\"\(formatter.string(from: $0))\"" } ?? "null"
        return JSONStub.decode("""
        {
            "id": "\(id)",
            "type": "STORY",
            "content": "story content",
            "createdAt": "2026-01-15T12:00:00.000Z",
            "expiresAt": \(expiresAtJSON),
            "author": {"id": "a1", "username": "alice"}
        }
        """)
    }

    // MARK: - Tests

    func test_load_withCachedActiveStory_emitsActiveImmediately() async {
        let mock = MockStoryService()
        let post = makePost(id: "p1", expiresAt: Date().addingTimeInterval(3600))
        mock.cachedPostResult = post
        mock.fetchPostResult = .success(post)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )

        await vm.load()

        if case .active(let p) = vm.state {
            XCTAssertEqual(p.id, "p1")
        } else {
            XCTFail("Expected .active, got \(vm.state)")
        }
    }

    func test_load_withCachedExpiredStory_emitsExpiredImmediately() async {
        let mock = MockStoryService()
        let post = makePost(id: "p1", expiresAt: Date().addingTimeInterval(-3600))
        mock.cachedPostResult = post
        mock.fetchPostResult = .failure(APIError.serverError(404, "Not Found"))

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .comments,
            context: makeContext(),
            storyService: mock
        )

        await vm.load()
        XCTAssertEqual(vm.state, .expired)
    }

    func test_load_withoutCache_fetchesFromNetwork_thenEmitsActive() async {
        let mock = MockStoryService()
        let post = makePost(id: "p1", expiresAt: Date().addingTimeInterval(3600))
        mock.cachedPostResult = nil
        mock.fetchPostResult = .success(post)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )
        await vm.load()

        if case .active(let p) = vm.state {
            XCTAssertEqual(p.id, "p1")
        } else {
            XCTFail("Expected .active, got \(vm.state)")
        }
    }

    func test_load_withoutCache_andNetwork404_emitsExpired() async {
        let mock = MockStoryService()
        mock.cachedPostResult = nil
        mock.fetchPostResult = .failure(APIError.serverError(404, "Not Found"))

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )
        await vm.load()
        XCTAssertEqual(vm.state, .expired)
    }

    func test_load_withoutCache_andNetworkError_emitsExpired() async {
        let mock = MockStoryService()
        mock.cachedPostResult = nil
        mock.fetchPostResult = .failure(URLError(.notConnectedToInternet))

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )
        await vm.load()
        XCTAssertEqual(vm.state, .expired)
    }

    func test_load_cacheActive_butNetworkReturnsExpired_revalidatesToExpired() async {
        let mock = MockStoryService()
        let cached = makePost(id: "p1", expiresAt: Date().addingTimeInterval(60))
        let fresh = makePost(id: "p1", expiresAt: Date().addingTimeInterval(-1))
        mock.cachedPostResult = cached
        mock.fetchPostResult = .success(fresh)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )
        await vm.load()
        XCTAssertEqual(vm.state, .expired)
    }

    func test_load_idempotent_canBeCalledMultipleTimes() async {
        let mock = MockStoryService()
        let post = makePost(id: "p1", expiresAt: Date().addingTimeInterval(3600))
        mock.cachedPostResult = nil
        mock.fetchPostResult = .success(post)

        let vm = StoryNotificationTargetViewModel(
            storyId: "p1",
            intent: .reactions,
            context: makeContext(),
            storyService: mock
        )
        await vm.load()
        await vm.load()
        await vm.load()

        if case .active = vm.state {} else { XCTFail("Expected .active, got \(vm.state)") }
        XCTAssertEqual(mock.fetchPostCallCount, 3)
    }
}

// MARK: - LoadState Equatable conformance for assertions

extension StoryNotificationTargetViewModel.LoadState: @retroactive Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        switch (lhs, rhs) {
        case (.loading, .loading), (.expired, .expired):
            return true
        case (.active(let a), .active(let b)):
            return a.id == b.id
        default:
            return false
        }
    }
}
