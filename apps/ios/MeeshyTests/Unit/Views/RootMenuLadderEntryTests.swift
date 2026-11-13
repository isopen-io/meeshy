import XCTest
@testable import Meeshy

/// Verrouille le contenu de l'échelle du bouton flottant menu.
///
/// Le barreau qui suit les notifications est le **journal d'appels** : icône téléphone, destination
/// `ContactsHubView` ouverte sur l'onglet Appels. Il a remplacé l'ancien
/// barreau Contacts (icône `person.2.fill` → annuaire), qui restait atteignable
/// via l'onglet Contacts du hub. Un retour en arrière casse ce test.
@MainActor
final class RootMenuLadderEntryTests: XCTestCase {

    // MARK: - Ordre des barreaux

    func test_allCases_ordersLadderFromLinksToSettings() {
        XCTAssertEqual(
            RootMenuLadderEntry.allCases,
            [.game, .links, .notifications, .calls, .discover, .communities, .settings]
        )
    }

    // MARK: - Le premier barreau ouvre le jeu (#17769)

    func test_firstRung_isTheGame_closestToTheButton() {
        XCTAssertEqual(RootMenuLadderEntry.allCases.first, .game)
    }

    func test_game_opensProgression_withTheTrophyItWearsElsewhere() {
        XCTAssertEqual(RootMenuLadderEntry.game.route, .progression)
        XCTAssertEqual(RootMenuLadderEntry.game.icon, "trophy.fill", "même icône que le Profil et les Réglages")
    }

    func test_ladder_dropsTheGameWhenTheGameIsHidden() {
        XCTAssertEqual(RootMenuLadderEntry.ladder(gameHidden: false), RootMenuLadderEntry.allCases)
        XCTAssertEqual(RootMenuLadderEntry.ladder(gameHidden: true), [.links, .notifications, .calls, .discover, .communities, .settings])
    }

    func test_chrome_drawsTheFilteredLadder() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/RootFloatingChrome.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertFalse(source.contains("RootMenuLadderEntry.allCases"), "l'échelle dessinée suit « Jeu masqué »")
        XCTAssertTrue(source.contains("RootMenuLadderEntry.ladder(gameHidden:"))
    }

    func test_allCases_lastRungIsSettings() {
        XCTAssertEqual(RootMenuLadderEntry.allCases.last, .settings)
    }

    // MARK: - Le 3e barreau est le journal d'appels

    func test_callsRung_followsNotifications() {
        let ladder = RootMenuLadderEntry.allCases
        XCTAssertEqual(ladder[ladder.firstIndex(of: .notifications)! + 1], .calls)
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

    /// La Progression reste un écran PROFOND : le bandeau du jeu ne se pose pas au-dessus du jeu lui-même
    /// (`PlayerBannerPlacement`). C'est la seule exception de l'échelle.
    func test_allRoutes_areHubRoutes_butTheGame() {
        for entry in RootMenuLadderEntry.allCases where entry != .game {
            XCTAssertTrue(entry.route.isHub, "\(entry) doit pointer sur une route hub")
        }
        XCTAssertFalse(RootMenuLadderEntry.game.route.isHub)
    }

    // MARK: - Badges

    func test_badge_onlyNotificationsAndDiscoverCarryOne() {
        XCTAssertEqual(RootMenuLadderEntry.notifications.badge, .unreadNotifications)
        XCTAssertEqual(RootMenuLadderEntry.discover.badge, .pendingFriendRequests)
        XCTAssertNil(RootMenuLadderEntry.calls.badge)
        XCTAssertNil(RootMenuLadderEntry.links.badge)
        XCTAssertNil(RootMenuLadderEntry.communities.badge)
        XCTAssertNil(RootMenuLadderEntry.settings.badge)
        XCTAssertNil(RootMenuLadderEntry.game.badge, "le point « Offrande prête » attend #17796")
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
