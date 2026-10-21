import XCTest
import SwiftUI
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

/// **Les bulles de l'aperçu se mesurent à la carte, jamais à la fenêtre**
/// (#11213). Sans `bubbleContainerWidth`, la bulle prenait 70 % de la FENÊTRE :
/// sur iPad elle débordait de la carte de 340 pt, sur iPhone elle écrasait la
/// gouttière qui distingue l'envoyé du reçu.
@MainActor
final class ConversationPreviewBubbleWidthTests: XCTestCase {

    private func cardWidth(listWidth: CGFloat, isRegular: Bool) -> CGFloat {
        ConversationPreviewWidthLaw.width(
            rowTextWidth: ConversationRowWidthLaw.textWidth(listWidth: listWidth, windowWidth: listWidth, isRegular: isRegular)
        )
    }

    private func assertBubbleFitsTheCard(listWidth: CGFloat, sizeClass: UserInterfaceSizeClass, file: StaticString = #filePath, line: UInt = #line) {
        let card = cardWidth(listWidth: listWidth, isRegular: sizeClass == .regular)
        let inner = ConversationPreviewRenderer.contentWidth(cardWidth: card)
        let bubble = DeviceLayout.bubbleMaxWidth(containerWidth: ConversationPreviewRenderer.bubbleContainerWidth(cardWidth: card), sizeClass: sizeClass)

        XCTAssertLessThanOrEqual(bubble, 0.78 * inner, file: file, line: line)
        XCTAssertGreaterThan(bubble, 0, file: file, line: line)
    }

    func test_bubbleMaxWidth_iPhone393_staysWithinTheCard() {
        assertBubbleFitsTheCard(listWidth: 393, sizeClass: .compact)
    }

    func test_bubbleMaxWidth_iPadColumn_staysWithinTheCard() {
        assertBubbleFitsTheCard(listWidth: 420, sizeClass: .regular)
    }

    func test_bubbleMaxWidth_iPadFullWidth_staysWithinTheCard() {
        assertBubbleFitsTheCard(listWidth: 1024, sizeClass: .regular)
    }

    /// La colonne des bulles est la largeur INTÉRIEURE de la carte : deux marges
    /// de 16 pt retirées, comme `bubbleContainerWidth` le pose.
    func test_bubbleContainerWidth_isTheCardMinusTwoMargins() {
        XCTAssertEqual(ConversationPreviewRenderer.bubbleContainerWidth(cardWidth: 340), 340 - 2 * 16)
    }
}
