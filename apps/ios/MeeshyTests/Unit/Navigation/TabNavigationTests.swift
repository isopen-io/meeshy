import XCTest
import MeeshySDK
@testable import Meeshy

// MARK: - Tab Navigation Tests
//
// The app uses a ZStack-based menu ladder (not TabView) for main navigation.
// Tab-like switching is managed by Router.push() for top-level hub routes.
// This file tests that switching between hub routes works correctly.

@MainActor
final class TabNavigationTests: XCTestCase {

    // MARK: - Hub Route Switching

    func test_switch_betweenHubRoutes_replacesCurrentHub() {
        let router = Router()
        router.push(.profile)
        XCTAssertEqual(router.currentRoute, .profile)

        router.push(.settings)
        XCTAssertEqual(router.path.count, 2)
        XCTAssertEqual(router.currentRoute, .settings)
    }

    func test_switch_fromConversationListToProfile_pushesOnStack() {
        let router = Router()
        router.push(.profile)
        XCTAssertTrue(router.isHubRoute)
        XCTAssertEqual(router.path.count, 1)
    }

    func test_switch_hubToDeepToAnotherHub_keepsStack() {
        let router = Router()
        router.push(.profile)
        router.push(.editProfile)
        XCTAssertTrue(router.isDeepRoute)

        router.push(.settings)
        XCTAssertEqual(router.path.count, 3)
        XCTAssertTrue(router.isHubRoute)
    }

    // MARK: - ContactsTab Routing

    func test_contacts_defaultTab_isContacts() {
        let route = Route.contacts()
        if case .contacts(let tab) = route {
            XCTAssertEqual(tab, .contacts)
        } else {
            XCTFail("Expected .contacts route")
        }
    }

    func test_contacts_requestsTab_passesThrough() {
        let route = Route.contacts(.requests)
        if case .contacts(let tab) = route {
            XCTAssertEqual(tab, .requests)
        } else {
            XCTFail("Expected .contacts route")
        }
    }

    func test_contacts_discoverTab_passesThrough() {
        let route = Route.contacts(.discover)
        if case .contacts(let tab) = route {
            XCTAssertEqual(tab, .discover)
        } else {
            XCTFail("Expected .contacts route")
        }
    }

    func test_contacts_blockedTab_passesThrough() {
        let route = Route.contacts(.blocked)
        if case .contacts(let tab) = route {
            XCTAssertEqual(tab, .blocked)
        } else {
            XCTFail("Expected .contacts route")
        }
    }

    // MARK: - All hub routes are recognized

    func test_allHubRoutes_returnTrueForIsHub() {
        let hubRoutes: [Route] = [.profile, .settings, .communityList, .contacts(), .links, .notifications]
        for route in hubRoutes {
            XCTAssertTrue(route.isHub, "\(route) should be a hub route")
        }
    }

    // MARK: - popToRoot returns to conversation list (empty path)

    func test_popToRoot_fromAnyHub_returnsToConversationList() {
        let router = Router()
        router.push(.settings)
        router.push(.profile)
        router.popToRoot()
        XCTAssertTrue(router.path.isEmpty)
        XCTAssertNil(router.currentRoute)
        XCTAssertTrue(router.isHubRoute)
    }
}
