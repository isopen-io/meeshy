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

    // MARK: - Le cadre de la cellule passe dans le repère de l'overlay

    /// iPad, paysage : la conversation vit dans la colonne de droite, à 400 pt
    /// du bord de la fenêtre. Le cadre de la cellule arrive en coordonnées de
    /// FENÊTRE (`cellFrameInWindow`) ; l'overlay place l'aperçu dans SON repère.
    /// Sans conversion, la bulle s'ouvrait 400 pt à droite de sa cellule.
    func test_sourceFrame_conversationInTheRightColumn_isShiftedIntoTheOverlay() {
        let local = MessageOverlayMenu.sourceFrame(
            windowFrame: CGRect(x: 450, y: 300, width: 320, height: 60),
            containerOrigin: CGPoint(x: 400, y: 0))

        XCTAssertEqual(local, CGRect(x: 50, y: 300, width: 320, height: 60))
    }

    func test_sourceFrame_overlayAtTheWindowOrigin_isUnchanged() {
        let frame = CGRect(x: 16, y: 420, width: 343, height: 72)

        XCTAssertEqual(MessageOverlayMenu.sourceFrame(windowFrame: frame, containerOrigin: .zero), frame)
    }

    func test_sourceFrame_overlayBelowTheWindowTop_isShiftedUp() {
        let local = MessageOverlayMenu.sourceFrame(
            windowFrame: CGRect(x: 16, y: 420, width: 343, height: 72),
            containerOrigin: CGPoint(x: 0, y: 24))

        XCTAssertEqual(local, CGRect(x: 16, y: 396, width: 343, height: 72))
    }

    /// Sans cellule matérialisée, aucun cadre : l'aperçu se pose au centre, et
    /// la conversion ne fabrique pas un cadre là où il n'y en a pas.
    func test_sourceFrame_noCellFrame_staysZero() {
        XCTAssertEqual(MessageOverlayMenu.sourceFrame(windowFrame: .zero, containerOrigin: CGPoint(x: 400, y: 0)), .zero)
    }
}
