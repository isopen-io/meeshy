import XCTest
@testable import Meeshy

/// #8394 — la pilule d'appel « C adapté » : ce que le (…) déploie, et quelles
/// actions rejoignent le groupe « mon image » et le groupe « l'appel » selon le
/// contexte de l'appel. #8550 — une famille par ligne (rangée de la pilule en
/// groupe, rail en duo : #17327). #8578 — l'état de l'écran vit
/// dans `CallScreenLayer`. #8436 — la conversation n'a qu'une porte : l'en-tête.
@MainActor
final class CallControlsLayoutTests: XCTestCase {

    private func context(
        isOnMac: Bool = false,
        isVideoEnabled: Bool = false,
        hasSelectableCameras: Bool = false,
        isConnected: Bool = true,
        mayRecord: Bool = false,
        showsVideo: Bool? = nil
    ) -> CallActionContext {
        CallActionContext(
            isOnMac: isOnMac,
            isVideoEnabled: isVideoEnabled,
            hasSelectableCameras: hasSelectableCameras,
            isConnected: isConnected,
            mayRecord: mayRecord,
            showsVideo: showsVideo
        )
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

    func test_theCall_minimal_offersCaptionsJournalAddPeopleAndReact() {
        XCTAssertEqual(CallActionSet.resolve(context()).theCall, [.captions, .addPeople, .journal, .react])
    }

    /// #8579 — le journal de l'appel a sa porte dans « L'appel », sous-titres
    /// affichés ou non.
    func test_theCall_journal_isAlwaysOffered() {
        for isConnected in [true, false] {
            XCTAssertTrue(CallActionSet.resolve(context(isConnected: isConnected)).theCall.contains(.journal))
        }
    }

    /// #8433 · #8439 — ajouter et réagir n'ont de sens qu'une fois l'appel établi.
    func test_theCall_notYetConnected_offersNeitherAddNorReact() {
        XCTAssertEqual(CallActionSet.resolve(context(isConnected: false)).theCall, [.captions, .journal])
    }

    /// #17329 — l'ordre tranché : Sous-titres · Enregistrer · Ajouter · Journal · Réagir ·
    /// Capture. L'image dans l'image a quitté la liste : son bouton est dans l'en-tête.
    func test_theCall_everythingAvailable_ordersCaptionsRecordAddJournalReactCapture() {
        let actions = CallActionSet.resolve(context(isVideoEnabled: true, mayRecord: true))
        XCTAssertEqual(actions.theCall, [.captions, .recording, .addPeople, .journal, .react, .capture])
    }

    func test_theCall_recordingNotAllowed_isAbsent() {
        let actions = CallActionSet.resolve(context())
        XCTAssertEqual(actions.theCall, [.captions, .addPeople, .journal, .react])
    }

    func test_actionCatalog_neverOffersPictureInPicture_itLivesInTheHeader() {
        XCTAssertFalse(CallAction.allCases.map(\.rawValue).contains("pictureInPicture"))
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

    /// #9287 — le cadre en direct se choisit DANS la capture : aucune entrée à part.
    func test_theCall_videoDuo_framesLiveThroughCaptureOnly() {
        let actions = CallActionSet.resolve(context(isVideoEnabled: true, mayRecord: true))
        XCTAssertEqual(actions.theCall, [.captions, .recording, .addPeople, .journal, .react, .capture])
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
        let all = CallActionSet.resolve(context(isVideoEnabled: true, mayRecord: true))
        XCTAssertEqual(all.familyRows.map(\.actions), [all.myImage, all.theCall])
    }

    func test_familyRows_sameInDuoAndGroup_dependOnlyOnTheContext() {
        let first = CallActionSet.resolve(context(isVideoEnabled: true)).familyRows
        let second = CallActionSet.resolve(context(isVideoEnabled: true)).familyRows
        XCTAssertEqual(first, second)
    }

    func test_familyRows_everyActionAppearsExactlyOnce() {
        let all = CallActionSet.resolve(context(isVideoEnabled: true, hasSelectableCameras: true, mayRecord: true))
        let flattened = all.familyRows.flatMap(\.actions)
        XCTAssertEqual(Set(flattened).count, flattened.count)
    }

    // MARK: - Légende du bouton Caméra de « Mon image » (#17459)

    func test_cameraCaptionKey_cameraOn_isCameraNotVideo() {
        XCTAssertEqual(CallControlsCopy.cameraCaptionKey(isPaused: false), "call.control.camera.caption")
    }

    func test_cameraCaptionKey_pausedVideo_isPausedCaption() {
        XCTAssertEqual(CallControlsCopy.cameraCaptionKey(isPaused: true), "call.control.video.paused.caption")
    }
}
