import XCTest
@testable import Meeshy
@testable import MeeshySDK

@MainActor
final class SyncPillRouterTests: XCTestCase {

    private var fakeRouter: FakeRoutePusher!
    private var router: SyncPillRouter!
    private var lookupResult: Conversation?

    override func setUp() {
        fakeRouter = FakeRoutePusher()
        lookupResult = nil
        router = SyncPillRouter(
            router: fakeRouter,
            conversationLookup: { [weak self] _ in self?.lookupResult }
        )
    }

    func test_open_conversation_with_match_pushes_conversation_route() async {
        let conv = Conversation.makeStub(id: "c-1")
        lookupResult = conv
        await router.open(.conversation(id: "c-1"))
        XCTAssertEqual(fakeRouter.pushed.count, 1)
        if case .conversation(let pushed) = fakeRouter.pushed.first {
            XCTAssertEqual(pushed.id, "c-1")
        } else {
            XCTFail("expected .conversation route")
        }
    }

    func test_open_conversation_without_match_is_noop() async {
        lookupResult = nil
        await router.open(.conversation(id: "c-x"))
        XCTAssertTrue(fakeRouter.pushed.isEmpty)
    }

    func test_open_post_pushes_post_detail_route() async {
        await router.open(.post(id: "p-2"))
        XCTAssertEqual(fakeRouter.pushed.count, 1)
        if case .postDetail(let id, _, _) = fakeRouter.pushed.first {
            XCTAssertEqual(id, "p-2")
        } else {
            XCTFail("expected .postDetail route")
        }
    }

    func test_open_unknown_is_noop() async {
        await router.open(.unknown)
        XCTAssertTrue(fakeRouter.pushed.isEmpty)
    }
}

@MainActor
final class FakeRoutePusher: RoutePushing {
    var pushed: [Route] = []
    func push(_ route: Route) { pushed.append(route) }
}

private extension Conversation {
    static func makeStub(id: String) -> Conversation {
        MeeshyConversation(
            id: id,
            identifier: id,
            type: .direct,
            participantUserId: "stub-user"
        )
    }
}
