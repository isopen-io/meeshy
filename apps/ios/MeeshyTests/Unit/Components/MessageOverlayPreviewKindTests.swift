import XCTest
@testable import Meeshy

/// **L'aperçu d'appui long d'un message suit le mode de lecture du fil**
/// (#11208, décision #11204, qui supplante la directive du 2026-08-23).
///
/// En Script et en Focal, la cellule pressée est une rangée plate : l'aperçu
/// rend la MÊME rangée. En Bulles, en Rivière et dans le Résumé, il rend la
/// bulle. Une loi pure le décide, jamais un booléen recopié à la main.
@MainActor
final class MessageOverlayPreviewKindTests: XCTestCase {

    func test_resolve_script_isTheFlatRow() {
        XCTAssertEqual(MessageOverlayPreviewKind.resolve(readingMode: .script), .flatRow)
    }

    func test_resolve_focal_isTheFlatRow() {
        XCTAssertEqual(MessageOverlayPreviewKind.resolve(readingMode: .focal), .flatRow)
    }

    func test_resolve_bubbles_isTheBubble() {
        XCTAssertEqual(MessageOverlayPreviewKind.resolve(readingMode: .bubbles), .bubble)
    }

    func test_resolve_river_isTheBubble() {
        XCTAssertEqual(MessageOverlayPreviewKind.resolve(readingMode: .river), .bubble)
    }

    func test_resolve_summary_isTheBubble() {
        XCTAssertEqual(MessageOverlayPreviewKind.resolve(readingMode: .summary), .bubble)
    }

    /// La loi est celle du fil, cas pour cas : un mode qui rend une rangée plate
    /// dans la liste rend une rangée plate dans l'aperçu, et seulement lui.
    func test_resolve_matchesTheThreadRowForEveryMode() {
        for mode in ConversationReadingMode.allCases {
            XCTAssertEqual(MessageOverlayPreviewKind.resolve(readingMode: mode) == .flatRow, mode.usesFlatRow, "\(mode)")
        }
    }

    /// La densité de la rangée est celle de la cellule (`focalRowInput`).
    func test_density_script_isScript_andFocal_isFocal() {
        XCTAssertEqual(MessageOverlayPreviewKind.density(for: .script), .script)
        XCTAssertEqual(MessageOverlayPreviewKind.density(for: .focal), .focal)
    }

    /// Le fil transmet son mode à l'overlay : la bande de drapeaux du texte
    /// servi (`previewServedText`) et la face de l'aperçu lisent la même valeur.
    func test_threadLanguage_flatRowFollowsTheReadingMode() {
        XCTAssertTrue(MessageOverlayMenu.ThreadLanguage(readingMode: .script).usesFlatRow)
        XCTAssertFalse(MessageOverlayMenu.ThreadLanguage(readingMode: .bubbles).usesFlatRow)
        XCTAssertFalse(MessageOverlayMenu.ThreadLanguage().usesFlatRow, "sans mode transmis, l'aperçu est une bulle")
    }

    /// La rangée se pose à 16 pt des bords de l'écran, comme une carte.
    func test_flatRowMargin_isSixteenPoints() {
        XCTAssertEqual(MessageOverlayCellPreview.flatRowMargin, 16)
    }

    /// Sous « Réduire les animations », l'entrée est un fondu bref, jamais un ressort.
    func test_reducedMotionEntrance_isAShortFade() {
        XCTAssertEqual(MessageOverlayMenu.reducedMotionFadeDuration, 0.18, accuracy: 0.0001)
    }
}
