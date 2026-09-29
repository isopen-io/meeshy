import CoreGraphics
import XCTest
@testable import Meeshy

/// #8626 — les commandes de MA caméra vivent avec ma vignette ; quand mon
/// image passe en plein écran, en haut au centre. Un seul endroit à la fois :
/// jamais deux boutons pour la même action. #8747 — AUTOUR de la vignette,
/// jamais dedans : Effets · Écran au-dessus, Retourner · Caméra en dessous.
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

    // MARK: - #8747 — les rangées AUTOUR de la vignette

    private typealias Placement = CallSelfTileControlsPlacement

    /// Un iPhone portrait : en-tête jusqu'à 111 pt, pilule à partir de 738 pt.
    private let portrait = CGRect(x: 8, y: 111, width: 377, height: 627)

    private func tile(x: CGFloat = 277, y: CGFloat, scale: CallSelfTileScale = .x2) -> CGRect {
        CGRect(origin: CGPoint(x: x, y: y), size: scale.size)
    }

    func test_selfTileRows_effectsAndScreenAbove_flipAndCameraBelow() {
        let rows = CallCameraRail.selfTileRows(CallCameraRail.actions(from: actions()))
        XCTAssertEqual(rows.effects, [.effects, .screenShare])
        XCTAssertEqual(rows.camera, [.flipCamera, .camera])
    }

    func test_selfTileRows_externalCamera_pickerTakesTheFlipPlace() {
        let rows = CallCameraRail.selfTileRows([.cameraPicker, .camera, .effects, .screenShare])
        XCTAssertEqual(rows.camera, [.cameraPicker, .camera])
    }

    func test_selfTileRows_everyCameraActionAppearsExactlyOnce() {
        let all = CallCameraRail.actions(from: actions())
        let rows = CallCameraRail.selfTileRows(all)
        XCTAssertEqual(Set(rows.effects + rows.camera), Set(all))
        XCTAssertEqual((rows.effects + rows.camera).count, all.count)
    }

    func test_layout_roomOnBothSides_effectsAboveAndCameraBelow() {
        let frame = tile(y: 300)
        let layout = Placement.layout(tile: frame, bounds: portrait, effectsCount: 2, cameraCount: 2)
        XCTAssertEqual(layout.effects?.side, .above)
        XCTAssertEqual(layout.camera?.side, .below)
        XCTAssertEqual(layout.effects?.frame.maxY, frame.minY - Placement.edgeGap)
        XCTAssertEqual(layout.camera?.frame.minY, frame.maxY + Placement.edgeGap)
    }

    func test_layout_rowsAreOutsideTheTile() {
        let frame = tile(y: 300)
        let layout = Placement.layout(tile: frame, bounds: portrait, effectsCount: 2, cameraCount: 2)
        for row in [layout.effects, layout.camera] {
            XCTAssertFalse(frame.intersects(row?.frame ?? .zero))
        }
    }

    func test_layout_rowsAreCenteredOnTheTile() {
        let frame = tile(x: 140, y: 300)
        let layout = Placement.layout(tile: frame, bounds: portrait, effectsCount: 2, cameraCount: 2)
        XCTAssertEqual(layout.effects?.frame.midX, frame.midX)
        XCTAssertEqual(layout.camera?.frame.midX, frame.midX)
    }

    func test_layout_everyButtonIs44Points() {
        let layout = Placement.layout(tile: tile(y: 300), bounds: portrait, effectsCount: 2, cameraCount: 2)
        XCTAssertGreaterThanOrEqual(Placement.buttonSide, 44)
        XCTAssertEqual(layout.effects?.frame.height, Placement.buttonSide)
        XCTAssertEqual(layout.effects?.frame.width, Placement.rowWidth(count: 2))
    }

    func test_layout_tileAgainstTheCorner_rowStaysInsideTheScreen() {
        let frame = tile(x: 290, y: 300, scale: .x1)
        let layout = Placement.layout(tile: frame, bounds: portrait, effectsCount: 2, cameraCount: 2)
        for row in [layout.effects, layout.camera] {
            XCTAssertLessThanOrEqual(row?.frame.maxX ?? .infinity, portrait.maxX)
            XCTAssertGreaterThanOrEqual(row?.frame.minX ?? -.infinity, portrait.minX)
        }
    }

    func test_layout_underTheHeader_effectsGoBelowTheCameraRow() {
        let frame = tile(y: 130)
        let layout = Placement.layout(tile: frame, bounds: portrait, effectsCount: 2, cameraCount: 2)
        XCTAssertEqual(layout.camera?.side, .below)
        XCTAssertEqual(layout.effects?.side, .below)
        XCTAssertEqual(layout.camera?.frame.minY, frame.maxY + Placement.edgeGap)
        XCTAssertEqual(layout.effects?.frame.minY, frame.maxY + Placement.edgeGap + Placement.buttonSide + Placement.rowGap)
    }

    func test_layout_aboveThePill_cameraGoesAboveTheEffectsRow() {
        let frame = tile(y: portrait.maxY - CallSelfTileScale.x2.size.height - 10)
        let layout = Placement.layout(tile: frame, bounds: portrait, effectsCount: 2, cameraCount: 2)
        XCTAssertEqual(layout.effects?.side, .above)
        XCTAssertEqual(layout.camera?.side, .above)
        XCTAssertEqual(layout.effects?.frame.maxY, frame.minY - Placement.edgeGap)
        XCTAssertEqual(layout.camera?.frame.maxY, frame.minY - Placement.edgeGap - Placement.buttonSide - Placement.rowGap)
    }

    func test_layout_noRoomAnywhere_rowOverlapsTheTileEdgeMinimally() {
        let landscape = CGRect(x: 8, y: 60, width: 836, height: 180)
        let frame = tile(y: 50, scale: .x3)
        let layout = Placement.layout(tile: frame, bounds: landscape, effectsCount: 2, cameraCount: 2)
        XCTAssertEqual(layout.effects?.side, .above)
        XCTAssertEqual(layout.effects?.frame.minY, landscape.minY, "Ramenée sous l'en-tête, pas plus bas")
        XCTAssertEqual(layout.camera?.side, .below)
        XCTAssertEqual(layout.camera?.frame.maxY, landscape.maxY, "Ramenée au-dessus de la pilule, pas plus haut")
    }

    func test_layout_rowsNeverCrossTheHeaderOrThePill() {
        for y in stride(from: CGFloat(0), through: 800, by: 25) {
            let layout = Placement.layout(tile: tile(y: y), bounds: portrait, effectsCount: 2, cameraCount: 2)
            for row in [layout.effects, layout.camera].compactMap({ $0 }) {
                XCTAssertGreaterThanOrEqual(row.frame.minY, portrait.minY, "y=\(y)")
                XCTAssertLessThanOrEqual(row.frame.maxY, portrait.maxY, "y=\(y)")
            }
        }
    }

    func test_layout_emptyRow_isNil() {
        let layout = Placement.layout(tile: tile(y: 300), bounds: portrait, effectsCount: 0, cameraCount: 1)
        XCTAssertNil(layout.effects)
        XCTAssertEqual(layout.camera?.frame.width, Placement.buttonSide)
    }

    func test_layout_lonelyEffectsRowUnderTheHeader_takesTheFreeSpotBelow() {
        let frame = tile(y: 130)
        let layout = Placement.layout(tile: frame, bounds: portrait, effectsCount: 2, cameraCount: 0)
        XCTAssertEqual(layout.effects?.side, .below)
        XCTAssertEqual(layout.effects?.frame.minY, frame.maxY + Placement.edgeGap)
    }

    func test_following_rowsMoveWithTheDrag_withoutChangingSide() {
        let container = CGRect(x: 0, y: 0, width: 393, height: 852)
        let resting = Placement.layout(tile: tile(x: 140, y: 300), bounds: portrait, effectsCount: 2, cameraCount: 2)
        let dragged = Placement.following(resting, offset: CGSize(width: -30, height: 40), within: container)
        XCTAssertEqual(dragged.effects?.frame.midX, (resting.effects?.frame.midX ?? 0) - 30)
        XCTAssertEqual(dragged.effects?.frame.midY, (resting.effects?.frame.midY ?? 0) + 40)
        XCTAssertEqual(dragged.effects?.side, resting.effects?.side)
        XCTAssertEqual(dragged.camera?.frame.midY, (resting.camera?.frame.midY ?? 0) + 40)
    }

    func test_following_dragOffTheScreen_rowsStayOnIt() {
        let container = CGRect(x: 0, y: 0, width: 393, height: 852)
        let resting = Placement.layout(tile: tile(y: 300), bounds: portrait, effectsCount: 2, cameraCount: 2)
        let dragged = Placement.following(resting, offset: CGSize(width: 500, height: -900), within: container)
        XCTAssertEqual(dragged.effects?.frame.maxX, container.maxX)
        XCTAssertEqual(dragged.effects?.frame.minY, container.minY)
    }

    func test_restingCenter_topCorner_leavesARowUnderTheHeader() {
        let size = CallSelfTileScale.x2.size
        let center = Placement.restingCenter(CGPoint(x: 327, y: 130), tileSize: size, bounds: portrait)
        XCTAssertEqual(center.y - size.height / 2, portrait.minY + Placement.rowSpan)
        XCTAssertEqual(center.x, 327)
        let layout = Placement.layout(tile: CGRect(x: center.x - size.width / 2, y: center.y - size.height / 2, width: size.width, height: size.height), bounds: portrait, effectsCount: 2, cameraCount: 2)
        XCTAssertEqual(layout.effects?.side, .above, "Au repos, Effets · Écran tiennent au-dessus")
    }

    func test_restingCenter_bottomCorner_leavesARowAboveThePill() {
        let size = CallSelfTileScale.x3.size
        let center = Placement.restingCenter(CGPoint(x: 100, y: 700), tileSize: size, bounds: portrait)
        XCTAssertEqual(center.y + size.height / 2, portrait.maxY - Placement.rowSpan)
    }

    func test_restingCenter_alreadyClear_staysPut() {
        let point = CGPoint(x: 100, y: 400)
        XCTAssertEqual(Placement.restingCenter(point, tileSize: CallSelfTileScale.x2.size, bounds: portrait), point)
    }

    func test_restingCenter_tooShortForBothRows_staysPut() {
        let point = CGPoint(x: 100, y: 120)
        let short = CGRect(x: 8, y: 60, width: 836, height: 180)
        XCTAssertEqual(Placement.restingCenter(point, tileSize: CallSelfTileScale.x2.size, bounds: short), point)
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
