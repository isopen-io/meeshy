import XCTest
@testable import Meeshy

/// La colonne de liste d'iPad se redimensionne (30 % à 50 %) : le rang se mesure à elle, plus à 42 % de la fenêtre.
final class ConversationRowWidthLawTests: XCTestCase {

    func test_aNarrowIPadColumn_budgetsItsOwnWidth_notFortyTwoPercentOfTheWindow() {
        // 30 % d'une fenêtre de 1 024 pt.
        let width = ConversationRowWidthLaw.textWidth(listWidth: 307, windowWidth: 1024, isRegular: true)
        XCTAssertEqual(width, 307 - 32 - ConversationRowWidthLaw.chrome)
        XCTAssertLessThan(width, min(1024 * 0.42, 520) - 32 - 52 - 28 - 24)
    }

    func test_beforeTheFirstMeasure_theWindowStandsIn() {
        XCTAssertEqual(ConversationRowWidthLaw.textWidth(listWidth: 0, windowWidth: 390, isRegular: false), 390 - 32 - 136)
        XCTAssertEqual(ConversationRowWidthLaw.textWidth(listWidth: 0, windowWidth: 1366, isRegular: true), 520 - 136)
    }

    func test_neverBelowTheFloor() {
        XCTAssertEqual(ConversationRowWidthLaw.textWidth(listWidth: 100, windowWidth: 1024, isRegular: true), 120)
    }

    func test_theList_measuresItsColumn() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView.swift"))
        XCTAssertTrue(code.contains("listWidth: listColumnSize.width"))
        XCTAssertTrue(code.contains("action: { listColumnSize = $0 }"))
        XCTAssertFalse(code.contains("min(windowWidth * 0.42, 520)"))
    }
}
