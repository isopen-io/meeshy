import XCTest
import SwiftUI
@testable import Meeshy

/// Sur iPad, les bulles se mesurent à la colonne de la conversation, pas à la
/// fenêtre : l'écart qui distingue envoyé et reçu reste celui de l'iPhone.
@MainActor
final class ConversationColumnBubbleWidthTests: XCTestCase {

    override func tearDown() {
        DeviceLayout.conversationColumnWidth = nil
        super.tearDown()
    }

    func test_iPadColumn_capsBubblesAgainstTheColumn() {
        DeviceLayout.conversationColumnWidth = 488
        XCTAssertEqual(DeviceLayout.bubbleMaxWidth(sizeClass: .regular), 488 * 0.62, accuracy: 0.5,
                       "820 pt de fenêtre en portrait : 508 pt mesurés à la fenêtre débordaient la colonne")
    }

    func test_withoutAColumn_bubblesMeasureTheWindow() {
        DeviceLayout.conversationColumnWidth = nil
        XCTAssertEqual(DeviceLayout.bubbleMaxWidth(sizeClass: .compact),
                       DeviceLayout.bubbleMaxWidth(containerWidth: DeviceLayout.windowSize.width, sizeClass: .compact))
    }

    func test_theIPadRoot_publishesAndWithdrawsItsColumnWidth() throws {
        let root = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/iPadRootView.swift"))
        XCTAssertTrue(root.contains("DeviceLayout.conversationColumnWidth = width"))
        XCTAssertTrue(root.contains("DeviceLayout.conversationColumnWidth = nil"))
    }
}
