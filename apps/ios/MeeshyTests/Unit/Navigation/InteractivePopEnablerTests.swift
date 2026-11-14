import XCTest
import UIKit
import MeeshySDK
@testable import Meeshy

/// #10839 — le geste de retour par le bord ne doit JAMAIS démarrer sur la
/// racine de la pile. `InteractivePopEnabler` retirait le délégué du geste
/// (`delegate = nil`) pour le réactiver sans barre de navigation : sans
/// délégué, plus rien ne refuse le geste quand il n'y a rien à dépiler, et un
/// balayage depuis le bord sur la liste des conversations ouvre une transition
/// vide qui gèle les touchers (le défilement ne répond plus pendant quelques
/// secondes). Le délégué posé doit survivre à l'écran qui l'a posé, puisque
/// c'est APRÈS le retour que le geste parasite part.
@MainActor
final class InteractivePopEnablerTests: XCTestCase {

    private func makeStack() -> (UIWindow, UINavigationController) {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let navigation = UINavigationController(rootViewController: UIViewController())
        navigation.setNavigationBarHidden(true, animated: false)
        window.rootViewController = navigation
        window.makeKeyAndVisible()
        return (window, navigation)
    }

    private func pushScreen(
        on navigation: UINavigationController,
        allowsEdgeSwipe: Bool = true
    ) -> InteractivePopEnabler.PopEnablerVC {
        let screen = UIViewController()
        let enabler = InteractivePopEnabler.PopEnablerVC()
        enabler.allowsEdgeSwipe = allowsEdgeSwipe
        screen.addChild(enabler)
        screen.view.addSubview(enabler.view)
        enabler.didMove(toParent: screen)
        navigation.pushViewController(screen, animated: false)
        enabler.applyEdgeSwipePolicy()
        return enabler
    }

    private func shouldBegin(_ navigation: UINavigationController) -> Bool? {
        guard let recognizer = navigation.interactivePopGestureRecognizer else { return nil }
        return recognizer.delegate?.gestureRecognizerShouldBegin?(recognizer)
    }

    func test_applyEdgeSwipePolicy_onPushedScreen_letsTheEdgeSwipeBegin() {
        let (window, navigation) = makeStack()
        _ = pushScreen(on: navigation)

        XCTAssertEqual(navigation.interactivePopGestureRecognizer?.isEnabled, true)
        XCTAssertEqual(shouldBegin(navigation), true)
        window.isHidden = true
    }

    func test_applyEdgeSwipePolicy_afterReturningToRoot_refusesTheEdgeSwipe() {
        let (window, navigation) = makeStack()
        autoreleasepool {
            _ = pushScreen(on: navigation)
            navigation.popToRootViewController(animated: false)
        }

        XCTAssertEqual(navigation.viewControllers.count, 1)
        XCTAssertEqual(shouldBegin(navigation), false)
        window.isHidden = true
    }

    func test_applyEdgeSwipePolicy_whenEdgeSwipeIsRefused_disablesTheGesture() {
        let (window, navigation) = makeStack()
        _ = pushScreen(on: navigation, allowsEdgeSwipe: false)

        XCTAssertEqual(navigation.interactivePopGestureRecognizer?.isEnabled, false)
        window.isHidden = true
    }

    // MARK: - #18491 : tout écran poussé réaffirme le geste, quel que soit le chemin

    private func appSourcesRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
    }

    func test_rootRouteDestinationBody_appliesTheRouteEdgeSwipePolicy() throws {
        let url = appSourcesRoot()
            .appendingPathComponent("Features/Main/Views/RootLayers/RootRouteDestination.swift")
        let masked = DeclarationBodyScanner.mask(try String(contentsOf: url, encoding: .utf8))
        let body = try XCTUnwrap(
            DeclarationBodyScanner.body(containing: "var body: some View", in: masked),
            "RootRouteDestination doit déclarer un body"
        )

        XCTAssertTrue(
            body.contains(".restoresEdgeSwipe(for: route)"),
            "Le body de RootRouteDestination doit appliquer .restoresEdgeSwipe(for: route) : sans lui, le geste de bord d'un écran poussé dépend du chemin parcouru"
        )
    }

    private func makeConversation() -> Conversation {
        Conversation(id: "c1", identifier: "c1", type: .direct, title: "Rivière", lastMessageAt: Date(), createdAt: Date(), updatedAt: Date())
    }

    private func pushScreen(for route: Route, on navigation: UINavigationController) {
        switch RouteEdgeSwipe.policy(for: route) {
        case .restored:
            _ = pushScreen(on: navigation)
        case .ownedByScreen:
            navigation.pushViewController(UIViewController(), animated: false)
        }
    }

    func test_policy_conversation_isOwnedByTheScreen() {
        XCTAssertEqual(RouteEdgeSwipe.policy(for: .conversation(makeConversation())), .ownedByScreen)
    }

    func test_policy_everyOtherRouteFamily_restoresTheEdgeSwipe() {
        let routes: [Route] = [
            .contacts(), .peopleDiscovery(), .nearbyDiscovery(), .profile, .settings,
            .links, .trackingLinks, .shareLinks, .communityLinks, .userStats,
            .progression, .gamePage(.league), .communityDetail("c1"), .notifications,
            .moodSpotlight(statusId: "s1"), .postDetail("p1"), .bookmarks
        ]
        for route in routes {
            XCTAssertEqual(RouteEdgeSwipe.policy(for: route), .restored, "\(route)")
        }
    }

    func test_restoresEdgeSwipe_afterARiverConversation_reEnablesTheGesture() {
        let (window, navigation) = makeStack()
        _ = pushScreen(on: navigation, allowsEdgeSwipe: false)
        XCTAssertEqual(navigation.interactivePopGestureRecognizer?.isEnabled, false)

        pushScreen(for: .contacts(), on: navigation)

        XCTAssertEqual(navigation.interactivePopGestureRecognizer?.isEnabled, true)
        XCTAssertEqual(shouldBegin(navigation), true)
        window.isHidden = true
    }

    func test_restoresEdgeSwipe_firstPushedScreenOnAFreshStack_hasTheGesture() {
        let (window, navigation) = makeStack()
        navigation.interactivePopGestureRecognizer?.isEnabled = false
        navigation.interactivePopGestureRecognizer?.delegate = nil

        pushScreen(for: .profile, on: navigation)

        XCTAssertEqual(navigation.interactivePopGestureRecognizer?.isEnabled, true)
        XCTAssertEqual(shouldBegin(navigation), true)
        window.isHidden = true
    }
}
