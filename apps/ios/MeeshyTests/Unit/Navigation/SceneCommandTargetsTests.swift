import XCTest
@testable import Meeshy

@MainActor
final class SceneCommandTargetsTests: XCTestCase {

    private final class Counter {
        var count = 0
    }

    private func makeTargets(
        router: Router? = Router(),
        role: MeeshySceneRole = .main,
        newConversation: MeeshySceneAction? = nil,
        search: MeeshySceneAction? = nil,
        closeWindow: MeeshySceneAction? = nil,
        sendMessage: MeeshySceneAction? = nil
    ) -> SceneCommandTargets {
        SceneCommandTargets(
            navigation: router.map { MeeshySceneNavigation(router: $0, role: role) },
            newConversation: newConversation,
            search: search,
            closeWindow: closeWindow,
            sendMessage: sendMessage
        )
    }

    func test_sections_withoutPublishedNavigation_areUnavailable() {
        let targets = makeTargets(router: nil)
        XCTAssertNil(targets.action(for: .contacts))
    }

    func test_contacts_onPhoneRouter_pushesContactsHub() {
        let router = Router()
        makeTargets(router: router).action(for: .contacts)?()
        let path = router.path
        XCTAssertEqual(path, [.contacts()])
    }

    func test_contacts_onTabletRouter_isPlacedInThePanel() {
        let router = Router()
        var received: [Route] = []
        router.onRouteRequested = { route in
            received.append(route)
            return true
        }
        makeTargets(router: router).action(for: .contacts)?()
        let path = router.path
        XCTAssertTrue(path.isEmpty)
        XCTAssertEqual(received, [.contacts()])
    }

    func test_conversations_emptiesThePath() {
        let router = Router()
        router.path = [.settings, .profile]
        makeTargets(router: router).action(for: .conversations)?()
        let path = router.path
        XCTAssertTrue(path.isEmpty)
    }

    func test_back_popsOneRoute_thenDelegatesToPopCallbackAtRoot() {
        let router = Router()
        let popRequests = Counter()
        router.onPopRequested = { popRequests.count += 1 }
        router.path = [.settings, .profile]
        let targets = makeTargets(router: router)
        targets.action(for: .back)?()
        let afterFirst = router.path
        XCTAssertEqual(afterFirst, [.settings])
        targets.action(for: .back)?()
        targets.action(for: .back)?()
        let afterRoot = router.path
        XCTAssertTrue(afterRoot.isEmpty)
        XCTAssertEqual(popRequests.count, 1)
    }

    func test_detachedRole_disablesSections_butKeepsBack() {
        let targets = makeTargets(role: .detached)
        XCTAssertTrue(MeeshyShortcut.sections.allSatisfy { targets.action(for: $0) == nil })
        XCTAssertNotNil(targets.action(for: .back))
    }

    func test_newConversation_search_closeWindow_followTheirPublishedActions() {
        XCTAssertNil(makeTargets().action(for: .newConversation))
        XCTAssertNil(makeTargets().action(for: .search))
        XCTAssertNil(makeTargets().action(for: .closeWindow))

        let created = Counter()
        let searched = Counter()
        let closed = Counter()
        let targets = makeTargets(
            newConversation: MeeshySceneAction { created.count += 1 },
            search: MeeshySceneAction { searched.count += 1 },
            closeWindow: MeeshySceneAction { closed.count += 1 }
        )
        targets.action(for: .newConversation)?()
        targets.action(for: .search)?()
        targets.action(for: .closeWindow)?()
        XCTAssertEqual([created.count, searched.count, closed.count], [1, 1, 1])
    }

    func test_sendMessage_withPublishedAction_runsIt() {
        let sent = Counter()
        let targets = makeTargets(sendMessage: MeeshySceneAction { sent.count += 1 })
        targets.action(for: .sendMessage)?()
        XCTAssertEqual(sent.count, 1)
    }

    func test_sendMessage_withoutPublishedAction_isNil() {
        XCTAssertNil(makeTargets().action(for: .sendMessage))
    }
}
