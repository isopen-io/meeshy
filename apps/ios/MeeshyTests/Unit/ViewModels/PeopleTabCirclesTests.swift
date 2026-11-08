import XCTest
@testable import Meeshy

/// L'onglet « Cercles » du hub People (#13938) : il ÉTEND le hub existant, il n'en crée
/// pas un second. Les trois onglets historiques gardent leur rang.
@MainActor
final class PeopleTabCirclesTests: XCTestCase {

    func test_circlesIsTheFourthTab_theOthersKeepTheirRank() {
        XCTAssertEqual(PeopleTab.allCases, [.calls, .keypad, .contacts, .circles])
    }

    func test_circlesHasATitleAndAnIcon() {
        XCTAssertFalse(PeopleTab.circles.title.isEmpty)
        XCTAssertFalse(PeopleTab.circles.icon.isEmpty)
    }

    func test_theRouteToCirclesIsTitledLikeTheTab() {
        XCTAssertEqual(Route.contacts(.circles).displayTitle, PeopleTab.circles.title)
    }
}
