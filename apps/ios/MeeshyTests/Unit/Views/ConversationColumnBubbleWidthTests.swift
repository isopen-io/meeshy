import XCTest
import SwiftUI
@testable import Meeshy

/// Les bulles se mesurent à la LISTE qui les porte — la colonne de l'iPad, une fenêtre détachée —, jamais à la
/// fenêtre principale : l'écart qui distingue envoyé et reçu reste celui de l'iPhone, dans chaque fenêtre.
@MainActor
final class ConversationColumnBubbleWidthTests: XCTestCase {

    /// 820 pt de fenêtre en portrait : 508 pt mesurés à la fenêtre débordaient une colonne de ~488 pt.
    func test_theListWidth_capsTheBubble() {
        XCTAssertEqual(DeviceLayout.bubbleMaxWidth(sizeClass: .regular, containerWidth: 488), 488 * 0.62, accuracy: 0.5)
        XCTAssertEqual(DeviceLayout.bubbleMaxWidth(sizeClass: .compact, containerWidth: 320), 320 * 0.70, accuracy: 0.5)
    }

    func test_withoutAList_bubblesMeasureTheWindow() {
        XCTAssertEqual(DeviceLayout.bubbleMaxWidth(sizeClass: .compact),
                       DeviceLayout.bubbleMaxWidth(containerWidth: DeviceLayout.windowSize.width, sizeClass: .compact))
    }

    /// Une valeur GLOBALE posée par la fenêtre principale s'appliquait aussi aux bulles d'une fenêtre détachée, plus
    /// étroite : chaque cellule pose désormais la largeur de SA liste.
    func test_eachListHandsItsOwnWidth_noGlobalColumnWidth() throws {
        let rows = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/MessageListViewController+Rows.swift"))
        XCTAssertTrue(rows.contains(".environment(\\.bubbleContainerWidth, self.collectionView.bounds.width"))
        let bubble = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift"))
        XCTAssertTrue(bubble.contains("containerWidth: bubbleContainerWidth"))
        let layout = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Core/DeviceLayout.swift"))
        XCTAssertFalse(layout.contains("conversationColumnWidth"))
    }
}
