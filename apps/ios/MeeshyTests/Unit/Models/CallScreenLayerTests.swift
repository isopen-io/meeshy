import XCTest
@testable import Meeshy

/// #8578 — l'écran d'appel n'active qu'UNE chose à la fois : la scène seule,
/// le menu du (…), un panneau qui REMPLACE les rangées, ou un mode qui libère
/// tout l'écran. #8576 — les options caméra de l'image plein écran.
@MainActor
final class CallScreenLayerTests: XCTestCase {

    private func actions(
        isVideoEnabled: Bool = true,
        isConnected: Bool = true,
        hasSelectableCameras: Bool = false,
        isOnMac: Bool = false,
        showsVideo: Bool? = nil
    ) -> CallActionSet {
        CallActionSet.resolve(CallActionContext(
            isOnMac: isOnMac,
            isVideoEnabled: isVideoEnabled,
            hasSelectableCameras: hasSelectableCameras,
            isConnected: isConnected,
            mayRecord: true,
            canPictureInPicture: false,
            showsVideo: showsVideo
        ))
    }

    // MARK: - Le (…)

    func test_togglingMenu_idle_opensTheMenu() {
        XCTAssertEqual(CallScreenLayer.idle.togglingMenu(), .menu)
    }

    func test_togglingMenu_menu_returnsToIdle() {
        XCTAssertEqual(CallScreenLayer.menu.togglingMenu(), .idle)
    }

    func test_togglingMenu_openPanel_closesEverything() {
        XCTAssertEqual(CallScreenLayer.panel(.react).togglingMenu(), .idle)
    }

    func test_togglingMenu_mode_isIgnored() {
        XCTAssertEqual(CallScreenLayer.mode(.effects).togglingMenu(), .mode(.effects))
    }

    // MARK: - Un panneau remplace les rangées

    func test_opening_fromTheMenu_opensThePanel() {
        XCTAssertEqual(CallScreenLayer.menu.opening(.record), .panel(.record))
    }

    func test_opening_anotherPanel_replacesTheOpenOne() {
        XCTAssertEqual(CallScreenLayer.panel(.react).opening(.record), .panel(.record))
    }

    func test_opening_theOpenPanelAgain_returnsToTheMenu() {
        XCTAssertEqual(CallScreenLayer.panel(.react).opening(.react), .menu)
    }

    func test_opening_duringAMode_isIgnored() {
        XCTAssertEqual(CallScreenLayer.mode(.montage).opening(.journal), .mode(.montage))
    }

    func test_backToMenu_fromAPanel_returnsToTheMenu() {
        XCTAssertEqual(CallScreenLayer.panel(.people).backToMenu(), .menu)
    }

    func test_backToMenu_withoutAPanel_changesNothing() {
        XCTAssertEqual(CallScreenLayer.idle.backToMenu(), .idle)
        XCTAssertEqual(CallScreenLayer.mode(.effects).backToMenu(), .mode(.effects))
    }

    func test_closed_anyLayer_returnsToIdle() {
        let layers: [CallScreenLayer] = [.idle, .menu, .panel(.journal), .mode(.effects)]
        XCTAssertTrue(layers.allSatisfy { $0.closed() == .idle })
    }

    func test_pillPanel_reactAndRecord_areDrawnInThePill_insteadOfTheRows() {
        XCTAssertEqual(CallScreenLayer.panel(.react).pillPanel, .react)
        XCTAssertEqual(CallScreenLayer.panel(.record).pillPanel, .record)
        XCTAssertFalse(CallScreenLayer.panel(.react).showsFamilyRows)
        XCTAssertFalse(CallScreenLayer.panel(.record).showsFamilyRows)
    }

    func test_pillPanel_peopleAndJournal_openAboveTheRows_notInThePill() {
        XCTAssertNil(CallScreenLayer.panel(.people).pillPanel)
        XCTAssertNil(CallScreenLayer.panel(.journal).pillPanel)
        XCTAssertTrue(CallScreenLayer.panel(.journal).showsFamilyRows)
    }

    func test_showsFamilyRows_onlyInTheMenuOrUnderASheet() {
        XCTAssertTrue(CallScreenLayer.menu.showsFamilyRows)
        XCTAssertFalse(CallScreenLayer.idle.showsFamilyRows)
        XCTAssertFalse(CallScreenLayer.mode(.effects).showsFamilyRows)
    }

    func test_panel_eachPointsAtItsOwnAction() {
        XCTAssertEqual(CallScreenPanel.allCases.map(\.action), [.react, .recording, .addPeople, .journal])
    }

    // MARK: - Un mode libère l'écran

    func test_entering_aMode_freesTheScreen() {
        let layer = CallScreenLayer.menu.entering(.effects)
        XCTAssertEqual(layer, .mode(.effects))
        XCTAssertTrue(layer.freesTheScreen)
        XCTAssertFalse(layer.isExpanded)
        XCTAssertNil(layer.openPanel)
    }

    func test_entering_anotherMode_replacesTheActiveOne() {
        XCTAssertEqual(CallScreenLayer.mode(.effects).entering(.montage), .mode(.montage))
    }

    func test_exitingMode_returnsToIdle() {
        XCTAssertEqual(CallScreenLayer.mode(.montage).exitingMode(), .idle)
    }

    func test_exitingMode_withoutAMode_changesNothing() {
        XCTAssertEqual(CallScreenLayer.panel(.react).exitingMode(), .panel(.react))
    }

    func test_mode_eachPointsAtItsEntryAction() {
        XCTAssertEqual(CallScreenMode.allCases.map(\.action), [.effects, .capture])
    }

    // MARK: - Masquage automatique

    func test_mayAutoHide_onlyOnTheSceneOrTheMenu() {
        XCTAssertTrue(CallScreenLayer.idle.mayAutoHide)
        XCTAssertTrue(CallScreenLayer.menu.mayAutoHide)
        XCTAssertFalse(CallScreenLayer.panel(.react).mayAutoHide)
        XCTAssertFalse(CallScreenLayer.mode(.effects).mayAutoHide)
    }

    // MARK: - Ce que l'appel ne permet plus

    func test_reconciled_modeWhoseActionVanished_returnsToIdle() {
        let audioOnly = actions(isVideoEnabled: false)
        XCTAssertEqual(CallScreenLayer.mode(.effects).reconciled(with: audioOnly), .idle)
    }

    func test_reconciled_montageWithoutVideo_returnsToIdle() {
        let noVideo = actions(isVideoEnabled: false, showsVideo: false)
        XCTAssertEqual(CallScreenLayer.mode(.montage).reconciled(with: noVideo), .idle)
    }

    func test_reconciled_panelWhoseActionVanished_returnsToTheMenu() {
        let notConnected = actions(isConnected: false)
        XCTAssertEqual(CallScreenLayer.panel(.react).reconciled(with: notConnected), .menu)
    }

    func test_reconciled_stillOffered_keepsTheLayer() {
        let video = actions()
        XCTAssertEqual(CallScreenLayer.mode(.montage).reconciled(with: video), .mode(.montage))
        XCTAssertEqual(CallScreenLayer.panel(.journal).reconciled(with: video), .panel(.journal))
    }

    // MARK: - Les options caméra (#8576)

    func test_cameraRail_videoOnPhone_flipCameraEffectsScreen_inOrder() {
        XCTAssertEqual(CallCameraRail.actions(from: actions()), [.flipCamera, .camera, .effects, .screenShare])
    }

    func test_cameraRail_selectableCameras_offersThePicker() {
        XCTAssertEqual(CallCameraRail.actions(from: actions(hasSelectableCameras: true)), [.cameraPicker, .camera, .effects, .screenShare])
    }

    func test_cameraRail_onMac_offersCameraAndEffectsOnly() {
        XCTAssertEqual(CallCameraRail.actions(from: actions(isOnMac: true)), [.camera, .effects])
    }

    func test_cameraRail_neverOffersAnActionOfTheCall() {
        let rail = Set(CallCameraRail.actions(from: actions()))
        XCTAssertTrue(rail.isDisjoint(with: Set(actions().theCall)))
    }

    func test_isMyImageFullScreen_duo_followsTheLocalPrimary() {
        XCTAssertTrue(CallCameraRail.isMyImageFullScreen(isGroupStage: false, isSelfFeatured: false, isLocalPrimary: true))
        XCTAssertFalse(CallCameraRail.isMyImageFullScreen(isGroupStage: false, isSelfFeatured: true, isLocalPrimary: false))
    }

    func test_isMyImageFullScreen_group_followsMyTileAtTheFront() {
        XCTAssertTrue(CallCameraRail.isMyImageFullScreen(isGroupStage: true, isSelfFeatured: true, isLocalPrimary: false))
        XCTAssertFalse(CallCameraRail.isMyImageFullScreen(isGroupStage: true, isSelfFeatured: false, isLocalPrimary: true))
    }
}
