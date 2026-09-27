import XCTest
@testable import Meeshy

/// #8394 — la pilule d'appel « C adapté » : ce que le (…) déploie, et quelles
/// actions rejoignent le rail « mon image » et le rail « l'appel » selon le
/// contexte de l'appel.
@MainActor
final class CallControlsLayoutTests: XCTestCase {

    private func context(
        isOnMac: Bool = false,
        isVideoEnabled: Bool = false,
        hasSelectableCameras: Bool = false,
        isConnected: Bool = true,
        mayRecord: Bool = false,
        canPictureInPicture: Bool = false,
        hasConversation: Bool = false
    ) -> CallActionContext {
        CallActionContext(
            isOnMac: isOnMac,
            isVideoEnabled: isVideoEnabled,
            hasSelectableCameras: hasSelectableCameras,
            isConnected: isConnected,
            mayRecord: mayRecord,
            canPictureInPicture: canPictureInPicture,
            hasConversation: hasConversation
        )
    }

    // MARK: - (…) — l'état du déploiement

    func test_disclosure_default_isCollapsed() {
        XCTAssertFalse(CallControlsDisclosure().isExpanded)
    }

    func test_toggled_collapsed_returnsExpanded_andBack() {
        let expanded = CallControlsDisclosure().toggled()
        XCTAssertTrue(expanded.isExpanded)
        XCTAssertFalse(expanded.toggled().isExpanded)
    }

    func test_presentation_collapsed_returnsHidden_inDuoAndGroup() {
        let collapsed = CallControlsDisclosure()
        XCTAssertEqual(collapsed.presentation(isGroup: false), .hidden)
        XCTAssertEqual(collapsed.presentation(isGroup: true), .hidden)
    }

    func test_presentation_expandedDuo_returnsRails() {
        XCTAssertEqual(CallControlsDisclosure(isExpanded: true).presentation(isGroup: false), .rails)
    }

    func test_presentation_expandedGroup_returnsRows() {
        XCTAssertEqual(CallControlsDisclosure(isExpanded: true).presentation(isGroup: true), .rows)
    }

    func test_accessibilityValue_followsExpansion() {
        XCTAssertEqual(CallControlsDisclosure(isExpanded: false).accessibilityState, .collapsed)
        XCTAssertEqual(CallControlsDisclosure(isExpanded: true).accessibilityState, .expanded)
    }

    // MARK: - Rail gauche « mon image »

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

    // MARK: - Rail droit « l'appel »

    func test_theCall_minimal_offersCaptionsOnly() {
        XCTAssertEqual(CallActionSet.resolve(context()).theCall, [.captions])
    }

    func test_theCall_everythingAvailable_ordersCaptionsRecordPipMessages() {
        let actions = CallActionSet.resolve(context(mayRecord: true, canPictureInPicture: true, hasConversation: true))
        XCTAssertEqual(actions.theCall, [.captions, .recording, .pictureInPicture, .messages])
    }

    func test_theCall_recordingNotAllowed_isAbsent() {
        let actions = CallActionSet.resolve(context(canPictureInPicture: true, hasConversation: true))
        XCTAssertEqual(actions.theCall, [.captions, .pictureInPicture, .messages])
    }

    // MARK: - Le rail ne porte jamais plus de quatre actions

    func test_resolve_anyContext_neverExceedsFourPerRow() {
        let all = CallActionSet.resolve(context(isVideoEnabled: true, hasSelectableCameras: true, mayRecord: true, canPictureInPicture: true, hasConversation: true))
        XCTAssertLessThanOrEqual(all.myImage.count, CallActionSet.maxPerRow)
        XCTAssertLessThanOrEqual(all.theCall.count, CallActionSet.maxPerRow)
    }
}
