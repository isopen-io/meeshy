import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
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

        XCTAssertTrue(router.path.isEmpty)
        XCTAssertEqual(router.presentedPost?.postId, "p1")
    }

    func test_closePostDetail_relaysToRouter_andClosesTheSheet() {
        let router = makeRouter()
        router.commands.push(.postDetail("p1"))

        router.commands.closePostDetail()

        XCTAssertNil(router.presentedPost)
    }

    func test_postDetailHeaderGlyph_isACross_whenThePostIsASheet() {
        let router = makeRouter()

        XCTAssertEqual(router.commands.postDetailHeaderGlyph, .close)
    }

    func test_postDetailHeaderGlyph_isBack_inTheTwoColumnPanel() {
        let router = makeRouter()
        router.onRouteRequested = { _ in true }

        XCTAssertEqual(router.commands.postDetailHeaderGlyph, .back)
    }

    func test_inert_relaysNothing_andIsTheEnvironmentDefault() {
        XCTAssertTrue(EnvironmentValues().routerCommands === RouterCommands.inert)

        RouterCommands.inert.push(.settings)
        RouterCommands.inert.pop()
        RouterCommands.inert.popToRoot()
        RouterCommands.inert.closePostDetail()
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

    func test_openProfileSheet_setsDeepLinkProfileUser() {
        let router = makeRouter()
        let user = ProfileSheetUser(userId: "u-1", username: "alice")

        router.commands.openProfileSheet(user)

        XCTAssertEqual(router.deepLinkProfileUser, user)
    }

    func test_openProfile_anonymousParticipantInConversation_setsParticipantProfileTarget() {
        let router = makeRouter()
        let visitor = ProfileSheetUser(username: "guest", participantId: "p-1", isAnonymous: true)

        router.commands.openProfile(visitor, inConversation: "c-1")

        XCTAssertEqual(router.participantProfileTarget, ParticipantProfileTarget(conversationId: "c-1", participantId: "p-1"))
        XCTAssertNil(router.deepLinkProfileUser)
    }

    func test_requestFeedComposer_armsPendingOpenFeedComposer() {
        let router = makeRouter()

        router.commands.requestFeedComposer()

        XCTAssertTrue(router.consumePendingFeedComposer())
        XCTAssertFalse(router.consumePendingFeedComposer())
    }

    func test_armSearch_setsPendingOpenSearch() {
        let router = makeRouter()

        router.commands.armSearch()

        XCTAssertTrue(router.pendingOpenSearch)
    }

    func test_requestHighlight_setsMessageThenConversation() {
        let router = makeRouter()

        router.commands.requestHighlight(messageId: "m-1", inConversation: "c-1")

        XCTAssertEqual(router.pendingHighlightMessageId, "m-1")
        XCTAssertEqual(router.pendingHighlightConversationId, "c-1")
    }

    func test_openPackShop_replacesStackWithSettings() {
        let router = makeRouter()
        router.path = [.profile]

        router.commands.openPackShop(domain: .sticker)

        XCTAssertEqual(router.path, [.settings])
    }

    func test_inertCommands_doNothing() {
        let inert = RouterCommands.inert

        inert.openProfileSheet(ProfileSheetUser(username: "alice"))
        inert.openProfile(ProfileSheetUser(username: "alice"), inConversation: nil)
        inert.requestFeedComposer()
        inert.armSearch()
        inert.requestHighlight(messageId: "m-1", inConversation: "c-1")
        inert.openPackShop(domain: nil)
    }

    func test_relayingMeeshyRouter_underInjection_handsTheInjectedRouter() throws {
        let router = makeRouter()
        let ecran = RenderedScreen(
            Color.clear.frame(width: 40, height: 40).modifier(RelayProbe()).modifier(MeeshyRouterInjection(router: router))
        )
        defer { ecran.dismount() }

        let relais = try XCTUnwrap(ecran.node("relay.on"))

        XCTAssertEqual(relais.label, String(describing: ObjectIdentifier(router)))
    }

    func test_relayingMeeshyRouter_withoutInjection_rendersTheContentUntouched() {
        let ecran = RenderedScreen(Color.clear.frame(width: 40, height: 40).modifier(RelayProbe()))
        defer { ecran.dismount() }

        XCTAssertNil(ecran.node("relay.on"))
        XCTAssertNotNil(ecran.node("relay.base"))
    }

    func test_meeshyRouter_crossesAFullScreenCover() {
        let router = makeRouter()
        let ecran = RenderedScreen(
            Color.clear
                .fullScreenCover(isPresented: .constant(true)) {
                    Color.clear.frame(width: 40, height: 40).modifier(RelayProbe())
                }
                .modifier(MeeshyRouterInjection(router: router))
        )
        defer { ecran.dismount() }

        XCTAssertNotNil(ecran.frame(of: "relay.on", borne: 30))
    }
}

private struct RelayProbe: ViewModifier {
    @Environment(\.meeshyRouter) private var meeshyRouter

    func body(content: Content) -> some View {
        content
            .accessibilityElement(children: .ignore)
            .accessibilityIdentifier("relay.base")
            .relayingMeeshyRouter(meeshyRouter) { view, router in
                view
                    .accessibilityIdentifier("relay.on")
                    .accessibilityLabel(String(describing: ObjectIdentifier(router)))
            }
    }
}
