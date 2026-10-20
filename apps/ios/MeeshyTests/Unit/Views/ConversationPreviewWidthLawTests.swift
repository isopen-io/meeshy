import XCTest
@testable import Meeshy

final class ConversationPreviewWidthLawTests: XCTestCase {

    func test_width_keepsTheiPhonePreviewAt340() {
        XCTAssertEqual(ConversationPreviewWidthLaw.width(rowTextWidth: 222), 340)
        XCTAssertEqual(ConversationPreviewWidthLaw.maximum, 340)
    }

    func test_width_followsANarrowColumn_withoutGoingUnderItsFloor() {
        XCTAssertEqual(ConversationPreviewWidthLaw.width(rowTextWidth: 152), 288)
        XCTAssertEqual(ConversationPreviewWidthLaw.width(rowTextWidth: 40), 240)
    }

    func test_previewSites_shareTheLawInsteadOfALiteral() throws {
        let rows = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+Rows.swift"))
        let overlays = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"))
        XCTAssertFalse(rows.contains("frame(width: 340)"))
        XCTAssertFalse(overlays.contains("maxWidth: 340)"))
        XCTAssertTrue(rows.contains("ConversationPreviewWidthLaw.width("))
        XCTAssertTrue(overlays.contains("ConversationPreviewWidthLaw.maximum"))
    }
}
