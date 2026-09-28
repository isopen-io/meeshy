import XCTest
@testable import Meeshy

/// #8394 — la pilule d'appel « C adapté » : ce que le (…) déploie, et quelles
/// actions rejoignent le groupe « mon image » et le groupe « l'appel » selon le
/// contexte de l'appel. #8550 — une rangée par famille, empilées au-dessus de
/// la rangée de base, en duo comme en groupe ; un sous-menu s'ouvre DANS la
/// pilule. #8436 — la conversation n'a qu'une porte : l'en-tête.
@MainActor
final class CallControlsLayoutTests: XCTestCase {

    private func context(
        isOnMac: Bool = false,
        isVideoEnabled: Bool = false,
        hasSelectableCameras: Bool = false,
        isConnected: Bool = true,
        mayRecord: Bool = false,
        canPictureInPicture: Bool = false,
        showsVideo: Bool? = nil
    ) -> CallActionContext {
        CallActionContext(
            isOnMac: isOnMac,
            isVideoEnabled: isVideoEnabled,
            hasSelectableCameras: hasSelectableCameras,
            isConnected: isConnected,
            mayRecord: mayRecord,
            canPictureInPicture: canPictureInPicture,
            showsVideo: showsVideo
        )
    }

    // MARK: - (…) — l'état du déploiement

    func test_disclosure_default_isCollapsed() {
        XCTAssertFalse(CallControlsDisclosure().isExpanded)
        XCTAssertNil(CallControlsDisclosure().openPanel)
    }

    func test_toggled_collapsed_returnsExpanded_andBack() {
        let expanded = CallControlsDisclosure().toggled()
        XCTAssertTrue(expanded.isExpanded)
        XCTAssertFalse(expanded.toggled().isExpanded)
    }

    func test_presentation_collapsed_returnsHidden() {
        XCTAssertEqual(CallControlsDisclosure().presentation, .hidden)
    }

    func test_presentation_expanded_returnsRowsWithoutPanel() {
        XCTAssertEqual(CallControlsDisclosure(isExpanded: true).presentation, .rows(panel: nil))
    }

    func test_accessibilityValue_followsExpansion() {
        XCTAssertEqual(CallControlsDisclosure(isExpanded: false).accessibilityState, .collapsed)
        XCTAssertEqual(CallControlsDisclosure(isExpanded: true).accessibilityState, .expanded)
    }

    // MARK: - Sous-menus dans la pilule

    func test_toggling_panel_opensItInsideTheExpandedPill() {
        let disclosure = CallControlsDisclosure(isExpanded: true).toggling(.effects)
        XCTAssertEqual(disclosure.presentation, .rows(panel: .effects))
        XCTAssertTrue(disclosure.isOpen(.effects))
    }

    func test_toggling_samePanelTwice_closesIt_keepsTheRows() {
        let disclosure = CallControlsDisclosure(isExpanded: true).toggling(.capture).toggling(.capture)
        XCTAssertEqual(disclosure.presentation, .rows(panel: nil))
    }

    func test_toggling_anotherPanel_replacesTheOpenOne() {
        let disclosure = CallControlsDisclosure(isExpanded: true).toggling(.react).toggling(.recording)
        XCTAssertEqual(disclosure.openPanel, .recording)
    }

    func test_toggled_collapsingThePill_closesTheOpenPanel() {
        let collapsed = CallControlsDisclosure(isExpanded: true).toggling(.effects).toggled()
        XCTAssertEqual(collapsed.presentation, .hidden)
        XCTAssertNil(collapsed.toggled().openPanel, "Rouvrir le (…) ne rouvre pas un sous-menu oublié")
    }

    func test_init_collapsedWithPanel_keepsNoPanel() {
        XCTAssertNil(CallControlsDisclosure(isExpanded: false, openPanel: .capture).openPanel)
    }

    func test_closingPanel_keepsTheFamilyRows() {
        let disclosure = CallControlsDisclosure(isExpanded: true).toggling(.effects).closingPanel()
        XCTAssertEqual(disclosure.presentation, .rows(panel: nil))
    }

    func test_reconciled_panelWhoseActionVanished_closesIt() {
        let audioOnly = CallActionSet.resolve(context(isVideoEnabled: false))
        let disclosure = CallControlsDisclosure(isExpanded: true).toggling(.effects).reconciled(with: audioOnly)
        XCTAssertNil(disclosure.openPanel)
        XCTAssertTrue(disclosure.isExpanded)
    }

    func test_reconciled_panelStillOffered_keepsIt() {
        let video = CallActionSet.resolve(context(isVideoEnabled: true))
        let disclosure = CallControlsDisclosure(isExpanded: true).toggling(.capture).reconciled(with: video)
        XCTAssertEqual(disclosure.openPanel, .capture)
    }

    func test_panel_eachPointsAtItsOwnAction() {
        XCTAssertEqual(CallControlsPanel.allCases.map(\.action), [.effects, .capture, .react, .recording])
    }

    // MARK: - Groupe « mon image »

    func test_myImage_audioCall_offersOnlyCameraAndScreen() {
        let actions = CallActionSet.resolve(context(isVideoEnabled: false))
        XCTAssertEqual(actions.myImage, [.camera, .screenShare])
    }

    func test_myImage_videoOnPhone_offersCameraFlipEffectsScreen_inOrder() {
        let actions = CallActionSet.resolve(context(isVideoEnabled: true))
        XCTAssertEqual(actions.myImage, [.camera, .flipCamera, .effects, .screenShare])
    }

    func test_myImage_selectableCameras_replacesFlipWithPicker() {
        let actions = CallActionSet.resolve(context(isVideoEnabled: true, hasSelectableCameras: true))
        XCTAssertEqual(actions.myImage, [.camera, .cameraPicker, .effects, .screenShare])
    }

    func test_myImage_onMac_hidesFlipAndScreen() {
        let actions = CallActionSet.resolve(context(isOnMac: true, isVideoEnabled: true))
        XCTAssertEqual(actions.myImage, [.camera, .effects])
    }

    func test_myImage_notYetConnected_hidesScreenShare() {
        let actions = CallActionSet.resolve(context(isConnected: false))
        XCTAssertEqual(actions.myImage, [.camera])
    }

    // MARK: - Groupe « l'appel »

    func test_theCall_minimal_offersCaptionsAddPeopleAndReact() {
        XCTAssertEqual(CallActionSet.resolve(context()).theCall, [.captions, .addPeople, .react])
    }

    /// #8433 · #8439 — ajouter et réagir n'ont de sens qu'une fois l'appel établi.
    func test_theCall_notYetConnected_offersNeitherAddNorReact() {
        XCTAssertEqual(CallActionSet.resolve(context(isConnected: false)).theCall, [.captions])
    }

    func test_theCall_everythingAvailable_ordersCaptionsAddReactCaptureRecordPip() {
        let actions = CallActionSet.resolve(context(isVideoEnabled: true, mayRecord: true, canPictureInPicture: true))
        XCTAssertEqual(actions.theCall, [.captions, .addPeople, .react, .capture, .recording, .pictureInPicture])
    }

    func test_theCall_recordingNotAllowed_isAbsent() {
        let actions = CallActionSet.resolve(context(canPictureInPicture: true))
        XCTAssertEqual(actions.theCall, [.captions, .addPeople, .react, .pictureInPicture])
    }

    /// #8552 — on ne capture que ce qu'on voit : un appel sans vidéo n'a rien
    /// à monter.
    func test_theCall_audioOnly_offersNoCapture() {
        XCTAssertFalse(CallActionSet.resolve(context(isVideoEnabled: false)).contains(.capture))
    }

    func test_theCall_remoteVideoOnly_offersCapture() {
        let actions = CallActionSet.resolve(context(isVideoEnabled: false, showsVideo: true))
        XCTAssertTrue(actions.theCall.contains(.capture))
    }

    func test_theCall_videoNotYetConnected_offersNoCapture() {
        let actions = CallActionSet.resolve(context(isVideoEnabled: true, isConnected: false))
        XCTAssertFalse(actions.contains(.capture))
    }

    /// #8436 — « Messages » doublait le bouton Conversation de l'en-tête : la
    /// conversation n'a plus qu'une porte, à droite de la flèche.
    func test_actionCatalog_neverOffersMessages() {
        XCTAssertFalse(CallAction.allCases.map(\.rawValue).contains("messages"))
    }

    // MARK: - Une rangée par famille, défilant à l'horizontale

    func test_familyRows_bothFamilies_myImageAboveTheCall() {
        let rows = CallActionSet.resolve(context(isVideoEnabled: true)).familyRows
        XCTAssertEqual(rows.map(\.family), [.myImage, .theCall])
    }

    func test_familyRows_keepEveryActionOnItsRow_neverCutsIntoColumns() {
        let all = CallActionSet.resolve(context(isVideoEnabled: true, mayRecord: true, canPictureInPicture: true))
        XCTAssertEqual(all.familyRows.map(\.actions), [all.myImage, all.theCall])
    }

    func test_familyRows_sameInDuoAndGroup_dependOnlyOnTheContext() {
        let first = CallActionSet.resolve(context(isVideoEnabled: true)).familyRows
        let second = CallActionSet.resolve(context(isVideoEnabled: true)).familyRows
        XCTAssertEqual(first, second)
    }

    func test_familyRows_everyActionAppearsExactlyOnce() {
        let all = CallActionSet.resolve(context(isVideoEnabled: true, hasSelectableCameras: true, mayRecord: true, canPictureInPicture: true))
        let flattened = all.familyRows.flatMap(\.actions)
        XCTAssertEqual(Set(flattened).count, flattened.count)
    }
}
