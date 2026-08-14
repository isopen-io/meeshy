import XCTest
@testable import Meeshy

/// Verrouille le contenu de l'échelle du bouton flottant menu.
///
/// Le 3e barreau est le **journal d'appels** : icône téléphone, destination
/// `ContactsHubView` ouverte sur l'onglet Appels. Il a remplacé l'ancien
/// barreau Contacts (icône `person.2.fill` → annuaire), qui restait atteignable
/// via l'onglet Contacts du hub. Un retour en arrière casse ce test.
@MainActor
final class RootMenuLadderEntryTests: XCTestCase {

    // MARK: - Ordre des barreaux

    func test_allCases_ordersLadderFromLinksToSettings() {
        XCTAssertEqual(
            RootMenuLadderEntry.allCases,
            [.links, .notifications, .calls, .discover, .communities, .settings]
        )
    }

    func test_allCases_lastRungIsSettings() {
        XCTAssertEqual(RootMenuLadderEntry.allCases.last, .settings)
    }

    // MARK: - Le 3e barreau est le journal d'appels

    func test_thirdRung_isCalls() {
        XCTAssertEqual(RootMenuLadderEntry.allCases[2], .calls)
    }

    func test_calls_usesPhoneIcon() {
        XCTAssertEqual(RootMenuLadderEntry.calls.icon, "phone.fill")
    }

    func test_calls_routesToContactsHubOnCallsTab() {
        XCTAssertEqual(RootMenuLadderEntry.calls.route, .contacts(.calls))
    }

    func test_noRung_opensContactsDirectory() {
        XCTAssertFalse(
            RootMenuLadderEntry.allCases.contains { $0.route == .contacts(.contacts) },
            "L'annuaire s'atteint via l'onglet Contacts du hub, pas par un barreau dédié"
        )
    }

    // MARK: - Destinations

    func test_routes_matchEachRung() {
        XCTAssertEqual(RootMenuLadderEntry.links.route, .links)
        XCTAssertEqual(RootMenuLadderEntry.notifications.route, .notifications)
        XCTAssertEqual(RootMenuLadderEntry.discover.route, .peopleDiscovery())
        XCTAssertEqual(RootMenuLadderEntry.communities.route, .communityList)
        XCTAssertEqual(RootMenuLadderEntry.settings.route, .settings)
    }

    func test_allRoutes_areHubRoutes() {
        for entry in RootMenuLadderEntry.allCases {
            XCTAssertTrue(entry.route.isHub, "\(entry) doit pointer sur une route hub")
        }
    }

    // MARK: - Badges

    func test_badge_onlyNotificationsAndDiscoverCarryOne() {
        XCTAssertEqual(RootMenuLadderEntry.notifications.badge, .unreadNotifications)
        XCTAssertEqual(RootMenuLadderEntry.discover.badge, .pendingFriendRequests)
        XCTAssertNil(RootMenuLadderEntry.calls.badge)
        XCTAssertNil(RootMenuLadderEntry.links.badge)
        XCTAssertNil(RootMenuLadderEntry.communities.badge)
        XCTAssertNil(RootMenuLadderEntry.settings.badge)
    }

    // MARK: - Présentation

    func test_icons_areAllDistinct() {
        let icons = RootMenuLadderEntry.allCases.map(\.icon)
        XCTAssertEqual(Set(icons).count, icons.count)
    }

    func test_labels_areNeverEmpty() {
        for entry in RootMenuLadderEntry.allCases {
            XCTAssertFalse(entry.label.isEmpty, "\(entry) doit porter un libellé")
        }
    }

    func test_colorHex_isSixDigitHex() {
        for entry in RootMenuLadderEntry.allCases {
            XCTAssertEqual(entry.colorHex.count, 6, "\(entry): \(entry.colorHex)")
            XCTAssertTrue(
                entry.colorHex.allSatisfy(\.isHexDigit),
                "\(entry): \(entry.colorHex) n'est pas hexadécimal"
            )
        }
    }
}
