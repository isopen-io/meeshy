import CoreGraphics
import XCTest
@testable import Meeshy

/// #8626 — où vit le ZOOM de MA caméra : en haut au centre quand mon image
/// passe en plein écran, dans ma vignette sinon. #17327 — ma vignette ne porte
/// plus aucune commande autour d'elle : les commandes de ma caméra sont le rail
/// gauche du duo (`CallControlsDispositionTests`).
@MainActor
final class CallCameraControlsTests: XCTestCase {

    // MARK: - Placement

    func test_placement_myImageFullScreen_goesTopCenter() {
        XCTAssertEqual(CallCameraRail.placement(isMyImageFullScreen: true, showsMyImageTile: true), .topCenter)
    }

    func test_placement_myImageInTheTile_goesInTheTileWhateverItsSize() {
        XCTAssertEqual(CallCameraRail.placement(isMyImageFullScreen: false, showsMyImageTile: true), .selfTile)
    }

    func test_placement_noTile_returnsToTheMenu() {
        XCTAssertEqual(CallCameraRail.placement(isMyImageFullScreen: false, showsMyImageTile: false), .menu)
    }

    // MARK: - Le bouton plié

    func test_foldedMenu_tapOnTheButton_opensThenCloses() {
        XCTAssertTrue(CallCameraRail.foldedMenu(isOpen: false, after: .button))
        XCTAssertFalse(CallCameraRail.foldedMenu(isOpen: true, after: .button))
    }

    func test_foldedMenu_tapOnAnAction_closes() {
        XCTAssertFalse(CallCameraRail.foldedMenu(isOpen: true, after: .action))
    }

    func test_foldedMenu_tapElsewhere_closes() {
        XCTAssertFalse(CallCameraRail.foldedMenu(isOpen: true, after: .elsewhere))
        XCTAssertFalse(CallCameraRail.foldedMenu(isOpen: false, after: .elsewhere))
    }

    func test_foldedMenu_tapElsewhereWhileOpen_isConsumed() {
        XCTAssertTrue(CallCameraRail.consumesTapElsewhere(isFoldedMenuOpen: true))
        XCTAssertFalse(CallCameraRail.consumesTapElsewhere(isFoldedMenuOpen: false))
    }

    // MARK: - Le zoom dans la vignette

    func test_zoomSlot_everyTileSize_hasRoomForTheCycleButton() {
        for scale in CallSelfTileScale.allCases {
            XCTAssertLessThanOrEqual(CallCameraRail.targetSide + 2 * CallCameraRail.tileInset, scale.size.width, "\(scale)")
            XCTAssertLessThanOrEqual(CallCameraRail.targetSide + 2 * CallCameraRail.tileInset, scale.size.height, "\(scale)")
        }
    }

    // MARK: - Visibilité

    func test_isShown_atItsPlaceWithTheControls_isShown() {
        XCTAssertTrue(CallCameraRail.isShown(.selfTile, at: .selfTile, chrome: CallChromeVisibility()))
        XCTAssertTrue(CallCameraRail.isShown(.topCenter, at: .topCenter, chrome: CallChromeVisibility()))
    }

    func test_isShown_elsewhere_isHidden() {
        XCTAssertFalse(CallCameraRail.isShown(.topCenter, at: .selfTile, chrome: CallChromeVisibility()))
        XCTAssertFalse(CallCameraRail.isShown(.menu, at: .topCenter, chrome: CallChromeVisibility()))
    }

    func test_isShown_aTapHidesTheControls_hidesThemToo() {
        XCTAssertFalse(CallCameraRail.isShown(.selfTile, at: .selfTile, chrome: CallChromeVisibility(isRevealed: false)))
        XCTAssertFalse(CallCameraRail.isShown(.topCenter, at: .topCenter, chrome: CallChromeVisibility(isRevealed: false)))
    }

    func test_isShown_duringAMode_isHidden() {
        XCTAssertFalse(CallCameraRail.isShown(.selfTile, at: .selfTile, chrome: CallChromeVisibility(isModeActive: true)))
    }
}
