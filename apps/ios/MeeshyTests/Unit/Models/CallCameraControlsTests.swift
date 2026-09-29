import CoreGraphics
import XCTest
@testable import Meeshy

/// #8626 — les commandes de MA caméra vivent dans ma vignette ; quand mon
/// image passe en plein écran, en haut au centre. Un seul endroit à la fois :
/// jamais deux boutons pour la même action.
@MainActor
final class CallCameraControlsTests: XCTestCase {

    private func actions(isVideoEnabled: Bool = true) -> CallActionSet {
        CallActionSet.resolve(CallActionContext(
            isOnMac: false,
            isVideoEnabled: isVideoEnabled,
            hasSelectableCameras: false,
            isConnected: true,
            mayRecord: true,
            canPictureInPicture: false
        ))
    }

    private var cameraCount: Int { CallCameraRail.actions(from: actions()).count }

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

    // MARK: - La vignette : grille ou bouton qui la déploie

    func test_tileLayout_everySize_carriesTheControls() {
        for scale in CallSelfTileScale.allCases {
            XCTAssertNotNil(CallCameraRail.tileLayout(tileSize: scale.size, count: cameraCount), "\(scale)")
        }
    }

    func test_tileLayout_standardTile_showsTheGrid() {
        XCTAssertEqual(CallCameraRail.tileLayout(tileSize: CallSelfTileScale.x2.size, count: 4), .grid(CallCameraTileGrid(columns: 2, rows: 2)))
    }

    func test_tileLayout_smallTile_foldsIntoOneButtonThatDeploysTheGrid() {
        XCTAssertEqual(CallCameraRail.tileLayout(tileSize: CallSelfTileScale.x1.size, count: 4), .folded(expanded: CallCameraTileGrid(columns: 2, rows: 2)))
    }

    func test_tileLayout_smallTile_itsSingleButtonIsATappableTarget() {
        let size = CallSelfTileScale.x1.size
        XCTAssertLessThanOrEqual(CallCameraRail.targetSide + 2 * CallCameraRail.tileInset, size.width)
        XCTAssertLessThanOrEqual(CallCameraRail.targetSide + 2 * CallCameraRail.tileInset, size.height)
    }

    func test_tileLayout_nothingToShow_isNil() {
        XCTAssertNil(CallCameraRail.tileLayout(tileSize: CallSelfTileScale.x1.size, count: 0))
    }

    func test_expandedGrid_neverMoreThanTwoColumns() {
        XCTAssertEqual(CallCameraRail.expandedGrid(count: 4), CallCameraTileGrid(columns: 2, rows: 2))
        XCTAssertEqual(CallCameraRail.expandedGrid(count: 3), CallCameraTileGrid(columns: 2, rows: 2))
        XCTAssertEqual(CallCameraRail.expandedGrid(count: 1), CallCameraTileGrid(columns: 1, rows: 1))
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

    // MARK: - La grille de la vignette

    func test_tileGrid_standardTile_twoByTwo() {
        XCTAssertEqual(CallCameraRail.tileGrid(tileSize: CallSelfTileScale.x2.size, count: 4), CallCameraTileGrid(columns: 2, rows: 2))
    }

    func test_tileGrid_largeTile_oneRowOfThreeThenTheRest() {
        XCTAssertEqual(CallCameraRail.tileGrid(tileSize: CallSelfTileScale.x3.size, count: 4), CallCameraTileGrid(columns: 3, rows: 2))
    }

    func test_tileGrid_fewActions_neverMoreColumnsThanActions() {
        XCTAssertEqual(CallCameraRail.tileGrid(tileSize: CallSelfTileScale.x3.size, count: 1), CallCameraTileGrid(columns: 1, rows: 1))
    }

    func test_tileGrid_everyTargetIsAtLeast44Points() {
        let size = CallSelfTileScale.x2.size
        let grid = CallCameraRail.tileGrid(tileSize: size, count: 4)
        let columns = CGFloat(grid?.columns ?? 0)
        let rows = CGFloat(grid?.rows ?? 0)
        XCTAssertGreaterThanOrEqual(CallCameraRail.targetSide, 44)
        XCTAssertLessThanOrEqual(columns * CallCameraRail.targetSide + 2 * CallCameraRail.tileInset, size.width)
        XCTAssertLessThanOrEqual(rows * CallCameraRail.targetSide + 2 * CallCameraRail.tileInset, size.height)
    }

    func test_tileGrid_smallTileOrNothingToShow_isNil() {
        XCTAssertNil(CallCameraRail.tileGrid(tileSize: CallSelfTileScale.x1.size, count: 4))
        XCTAssertNil(CallCameraRail.tileGrid(tileSize: CallSelfTileScale.x2.size, count: 0))
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

    // MARK: - Pas de doublon

    func test_menuRows_cameraControlsOutOfTheMenu_leaveOnlyTheCall() {
        for placement in [CallCameraControlsPlacement.selfTile, .topCenter] {
            let rows = CallCameraRail.menuRows(actions(), placement: placement)
            XCTAssertEqual(rows.map(\.family), [.theCall], "\(placement)")
        }
    }

    func test_menuRows_noPlaceForThem_keepMyImageInTheMenu() {
        let rows = CallCameraRail.menuRows(actions(), placement: .menu)
        XCTAssertEqual(rows.map(\.family), [.myImage, .theCall])
    }

    func test_menuRows_everyCameraActionAppearsExactlyOnce() {
        let set = actions()
        for placement in [CallCameraControlsPlacement.selfTile, .topCenter, .menu] {
            let menu = CallCameraRail.menuRows(set, placement: placement).flatMap(\.actions)
            let camera = placement == .menu ? [] : CallCameraRail.actions(from: set)
            let all = menu + camera
            XCTAssertEqual(all.count, Set(all).count, "\(placement)")
            XCTAssertTrue(Set(set.myImage).isSubset(of: Set(all)), "\(placement)")
        }
    }
}
