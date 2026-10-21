import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

@MainActor
final class RouterCommandsTests: XCTestCase {

    private func makeRouter() -> Router {
        Router(surfaces: PresentedSurfaceRegistry())
    }

    private func makeConversation(id: String = "000000000000000000000001") -> Conversation {
        Conversation(id: id, identifier: id, type: .direct, title: "Test", lastMessageAt: Date(), createdAt: Date(), updatedAt: Date())
    }

    func test_push_relaysRouteToRouter() {
        let router = makeRouter()

        router.commands.push(.settings)

        XCTAssertEqual(router.path, [.settings])
    }

    func test_pop_relaysToRouter() {
        let router = makeRouter()
        router.path = [.settings, .profile]

        router.commands.pop()

        XCTAssertEqual(router.path, [.settings])
    }

    func test_pop_onEmptyPath_relaysToPopRequested() {
        let router = makeRouter()
        var requests = 0
        router.onPopRequested = { requests += 1 }

        router.commands.pop()

        XCTAssertEqual(requests, 1)
    }

    func test_popToRoot_relaysToRouter() {
        let router = makeRouter()
        router.path = [.settings, .profile]

        router.commands.popToRoot()

        XCTAssertEqual(router.path, [])
    }

    func test_navigateToConversation_relaysConversationAndHighlight() {
        let router = makeRouter()
        let conversation = makeConversation()

        router.commands.navigateToConversation(conversation, highlightMessageId: "m-1")

        XCTAssertEqual(router.path, [.conversation(conversation)])
        XCTAssertEqual(router.pendingHighlightMessageId, "m-1")
        XCTAssertEqual(router.pendingHighlightConversationId, conversation.id)
    }

    func test_openGame_relaysToRouter() {
        let router = makeRouter()
        let expected = makeRouter()
        expected.openGame(at: .progressionNotebook)

        router.commands.openGame(at: .progressionNotebook)

        XCTAssertEqual(router.path, expected.path)
        XCTAssertFalse(router.path.isEmpty)
    }

    func test_openPostDetailById_relaysToRouter() {
        let router = makeRouter()

        router.commands.openPostDetail(id: "p1", from: .nearby)

        XCTAssertEqual(router.path, [.postDetail("p1")])
    }

    func test_inert_relaysNothing_andIsTheEnvironmentDefault() {
        XCTAssertTrue(EnvironmentValues().routerCommands === RouterCommands.inert)

        RouterCommands.inert.push(.settings)
        RouterCommands.inert.pop()
        RouterCommands.inert.popToRoot()
        RouterCommands.inert.openGame(at: .progressionNotebook)
        RouterCommands.inert.openPostDetail(id: "p1", from: .nearby)
        RouterCommands.inert.navigateToConversation(makeConversation())
    }

    func test_commands_isStableAcrossReads() {
        let router = makeRouter()

        XCTAssertTrue(router.commands === router.commands)
    }

    func test_commands_doesNotRetainRouter() {
        weak var weakRouter: Router?
        var commands: RouterCommands?
        do {
            let router = makeRouter()
            weakRouter = router
            commands = router.commands
        }

        XCTAssertNil(weakRouter)
        commands?.push(.settings)
    }

    func test_environmentValues_carriesTheRouterCommands() {
        let router = makeRouter()
        var env = EnvironmentValues()

        env.routerCommands = router.commands

        XCTAssertTrue(env.routerCommands === router.commands)
    }
}
