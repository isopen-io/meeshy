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
///
/// Le témoin porte sur la valeur que la vue POSE dans l'environnement
/// (`ConversationPreviewRenderer.bubbleEnvironmentWidth`, que
/// `LongPressPreviewGuardTests` exige au site de la bulle), lue par la fonction
/// que la bulle appelle elle-même (`DeviceLayout.bubbleMaxWidth(sizeClass:containerWidth:)`).
@MainActor
final class ConversationPreviewBubbleWidthTests: XCTestCase {

    private func cardWidth(windowWidth: CGFloat, isRegular: Bool) -> CGFloat {
        ConversationPreviewWidthLaw.width(
            rowTextWidth: ConversationRowWidthLaw.textWidth(listWidth: windowWidth, windowWidth: windowWidth, isRegular: isRegular)
        )
    }

    /// iPad plein écran : la colonne posée est la carte moins ses deux marges,
    /// jamais la fenêtre de 1 024 pt.
    func test_bubbleEnvironmentWidth_iPadWindow_isTheCardNotTheWindow() throws {
        let window: CGFloat = 1024
        let card = cardWidth(windowWidth: window, isRegular: true)

        let posed = try XCTUnwrap(ConversationPreviewRenderer.bubbleEnvironmentWidth(cardWidth: card))

        XCTAssertEqual(posed, card - 2 * 16)
        XCTAssertLessThan(posed, window)
    }

    /// La bulle, mesurée sur ce qui est posé, ne déborde jamais l'intérieur de
    /// la carte — alors que mesurée sur la fenêtre, elle le débordait sur iPad.
    func test_bubbleMeasuredOnThePosedWidth_neverOverflowsTheCard() throws {
        let cases: [(CGFloat, UserInterfaceSizeClass)] = [(393, .compact), (420, .regular), (1024, .regular)]
        for (window, sizeClass) in cases {
            let card = cardWidth(windowWidth: window, isRegular: sizeClass == .regular)
            let posed = try XCTUnwrap(ConversationPreviewRenderer.bubbleEnvironmentWidth(cardWidth: card))

            let bubble = DeviceLayout.bubbleMaxWidth(sizeClass: sizeClass, containerWidth: posed)

            XCTAssertLessThanOrEqual(bubble, card - 2 * 16, "fenêtre \(window)")
            XCTAssertGreaterThan(bubble, 0, "fenêtre \(window)")
        }
        let iPadCard = cardWidth(windowWidth: 1024, isRegular: true)
        XCTAssertGreaterThan(
            DeviceLayout.bubbleMaxWidth(containerWidth: 1024, sizeClass: .regular), iPadCard - 2 * 16,
            "prémisse : mesurée sur la fenêtre, la bulle déborderait la carte"
        )
    }

    /// Une carte pas encore mesurée ne pose rien : la bulle garde son repli
    /// plutôt qu'une colonne nulle.
    func test_bubbleEnvironmentWidth_unmeasuredCard_posesNothing() {
        XCTAssertNil(ConversationPreviewRenderer.bubbleEnvironmentWidth(cardWidth: 0))
        XCTAssertNil(ConversationPreviewRenderer.bubbleEnvironmentWidth(cardWidth: 2 * 16))
    }
}
