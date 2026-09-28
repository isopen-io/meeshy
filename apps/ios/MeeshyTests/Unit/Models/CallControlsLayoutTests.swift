import XCTest
@testable import Meeshy

/// #8394 — la pilule d'appel « C adapté » : ce que le (…) déploie, et quelles
/// actions rejoignent le groupe « mon image » et le groupe « l'appel » selon le
/// contexte de l'appel. #8432 — les actions montent AU-DESSUS de la pilule, en
/// duo comme en groupe. #8436 — la conversation n'a qu'une porte : l'en-tête.
@MainActor
final class CallControlsLayoutTests: XCTestCase {

    private func context(
        isOnMac: Bool = false,
        isVideoEnabled: Bool = false,
        hasSelectableCameras: Bool = false,
        isConnected: Bool = true,
        mayRecord: Bool = false,
        canPictureInPicture: Bool = false
    ) -> CallActionContext {
        CallActionContext(
            isOnMac: isOnMac,
            isVideoEnabled: isVideoEnabled,
            hasSelectableCameras: hasSelectableCameras,
            isConnected: isConnected,
            mayRecord: mayRecord,
            canPictureInPicture: canPictureInPicture
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

    func test_presentation_expandedDuo_returnsRowAbovePill() {
        XCTAssertEqual(CallControlsDisclosure(isExpanded: true).presentation(isGroup: false), .row)
    }

    func test_presentation_expandedGroup_returnsRows() {
        XCTAssertEqual(CallControlsDisclosure(isExpanded: true).presentation(isGroup: true), .rows)
    }

    func test_accessibilityValue_followsExpansion() {
        XCTAssertEqual(CallControlsDisclosure(isExpanded: false).accessibilityState, .collapsed)
        XCTAssertEqual(CallControlsDisclosure(isExpanded: true).accessibilityState, .expanded)
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

    func test_theCall_everythingAvailable_ordersCaptionsAddReactRecordPip() {
        let actions = CallActionSet.resolve(context(mayRecord: true, canPictureInPicture: true))
        XCTAssertEqual(actions.theCall, [.captions, .addPeople, .react, .recording, .pictureInPicture])
    }

    func test_theCall_recordingNotAllowed_isAbsent() {
        let actions = CallActionSet.resolve(context(canPictureInPicture: true))
        XCTAssertEqual(actions.theCall, [.captions, .addPeople, .react, .pictureInPicture])
    }

    /// #8436 — « Messages » doublait le bouton Conversation de l'en-tête : la
    /// conversation n'a plus qu'une porte, à droite de la flèche.
    func test_actionCatalog_neverOffersMessages() {
        XCTAssertFalse(CallAction.allCases.map(\.rawValue).contains("messages"))
    }

    // MARK: - Duo : la rangée au-dessus de la pilule

    func test_duoRows_fewActions_joinsBothGroupsInOneRow() {
        let actions = CallActionSet.resolve(context(isConnected: false))
        XCTAssertEqual(actions.duoRows, [[.camera, .captions]])
    }

    func test_duoRows_tooManyForOneRow_splitsMyImageThenTheCall() {
        let actions = CallActionSet.resolve(context(isVideoEnabled: true, mayRecord: true, canPictureInPicture: true))
        XCTAssertEqual(actions.duoRows, [
            [.camera, .flipCamera, .effects, .screenShare],
            [.captions, .addPeople, .react, .recording, .pictureInPicture]
        ])
    }

    func test_duoRows_anyContext_neverExceedsTheDuoRowWidth() {
        let all = CallActionSet.resolve(context(isVideoEnabled: true, hasSelectableCameras: true, mayRecord: true, canPictureInPicture: true))
        XCTAssertTrue(all.duoRows.allSatisfy { $0.count <= CallActionSet.maxPerDuoRow })
    }

    // MARK: - Une rangée ne porte jamais plus de quatre actions

    func test_resolve_anyContext_neverExceedsFourPerRow() {
        let all = CallActionSet.resolve(context(isVideoEnabled: true, hasSelectableCameras: true, mayRecord: true, canPictureInPicture: true))
        XCTAssertTrue(all.groupSections.flatMap(\.rows).allSatisfy { $0.count <= CallActionSet.maxPerRow })
    }

    /// Un groupe plus large que quatre colonnes continue sur une rangée de
    /// plus, sous le même titre : la grille garde ses quatre colonnes.
    func test_groupSections_overflowingGroup_continuesOnANewRow() {
        let all = CallActionSet.resolve(context(isVideoEnabled: true, mayRecord: true, canPictureInPicture: true))
        XCTAssertEqual(all.groupSections.map(\.group), [.myImage, .theCall])
        XCTAssertEqual(all.groupSections.last?.rows, [[.captions, .addPeople, .react, .recording], [.pictureInPicture]])
    }
}
