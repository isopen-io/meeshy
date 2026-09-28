import XCTest
@testable import Meeshy

/// #8550 — toucher n'importe où sur la scène masque TOUS les contrôles (en-tête,
/// pilule et ses rangées, sous-menu ouvert, statut d'enregistrement, bandeau de
/// partage), en duo comme en groupe ; les sous-titres et la vignette perso
/// restent, et une demande de consentement reste toujours visible.
@MainActor
final class CallChromeVisibilityTests: XCTestCase {

    private let hideable: [CallChromeElement] = [.header, .controls, .openPanel, .recordingStatus, .screenShareBanner]
    private let permanent: [CallChromeElement] = [.captions, .selfView, .recordingConsent]

    func test_isVisible_revealed_showsEveryElement() {
        let visibility = CallChromeVisibility(isRevealed: true)
        XCTAssertTrue(CallChromeElement.allCases.allSatisfy(visibility.isVisible))
    }

    func test_isVisible_hiddenByTap_hidesAllControlsTogether() {
        let visibility = CallChromeVisibility(isRevealed: true).toggled()
        XCTAssertTrue(hideable.allSatisfy { !visibility.isVisible($0) })
    }

    func test_isVisible_hidden_keepsCaptionsSelfViewAndConsent() {
        let visibility = CallChromeVisibility(isRevealed: false)
        XCTAssertTrue(permanent.allSatisfy(visibility.isVisible))
    }

    func test_isVisible_stageFullScreen_hidesControlsEvenWhenRevealed() {
        let visibility = CallChromeVisibility(isRevealed: true, isStageFullScreen: true)
        XCTAssertFalse(visibility.isVisible(.controls))
        XCTAssertFalse(visibility.isVisible(.header))
        XCTAssertTrue(visibility.isVisible(.captions))
    }

    func test_everyElement_isEitherHideableOrPermanent() {
        XCTAssertEqual(Set(hideable).union(permanent), Set(CallChromeElement.allCases))
        XCTAssertTrue(Set(hideable).isDisjoint(with: permanent))
    }

    func test_toggled_twice_returnsToTheStart() {
        let start = CallChromeVisibility(isRevealed: true, isStageFullScreen: false)
        XCTAssertEqual(start.toggled().toggled(), start)
    }

    func test_toggled_keepsTheStageFullScreenChoice() {
        XCTAssertTrue(CallChromeVisibility(isRevealed: true, isStageFullScreen: true).toggled().isStageFullScreen)
    }

    // MARK: - Un mode libère l'écran (#8578)

    func test_isVisible_modeActive_hidesTheWholeCallChromeAndTheSelfView() {
        let visibility = CallChromeVisibility(isRevealed: true, isModeActive: true)
        XCTAssertTrue(hideable.allSatisfy { !visibility.isVisible($0) })
        XCTAssertFalse(visibility.isVisible(.selfView))
    }

    func test_isVisible_modeActive_keepsCaptionsAndConsent() {
        let visibility = CallChromeVisibility(isRevealed: true, isModeActive: true)
        XCTAssertTrue(visibility.isVisible(.captions))
        XCTAssertTrue(visibility.isVisible(.recordingConsent))
    }

    func test_toggled_keepsTheModeAndStaysHidden() {
        let toggled = CallChromeVisibility(isRevealed: false, isModeActive: true).toggled()
        XCTAssertTrue(toggled.isModeActive)
        XCTAssertFalse(toggled.isVisible(.controls))
    }

    // MARK: - Qui peut masquer par un toucher

    func test_mayToggleByTap_videoStage_inDuoAndGroup() {
        XCTAssertTrue(CallChromeVisibility.mayToggleByTap(isVideoStage: true))
    }

    func test_mayToggleByTap_audioStage_neverHidesTheOnlyControls() {
        XCTAssertFalse(CallChromeVisibility.mayToggleByTap(isVideoStage: false))
    }

    // MARK: - Masquage automatique (4 s)

    func test_mayAutoHide_videoStage_nothingOpen_returnsTrue() {
        XCTAssertTrue(CallChromeVisibility.mayAutoHide(isVideoStage: true, isPanelOpen: false, isOnMac: false, isVoiceOverRunning: false))
    }

    func test_mayAutoHide_panelOpen_returnsFalse() {
        XCTAssertFalse(CallChromeVisibility.mayAutoHide(isVideoStage: true, isPanelOpen: true, isOnMac: false, isVoiceOverRunning: false))
    }

    func test_mayAutoHide_voiceOver_returnsFalse() {
        XCTAssertFalse(CallChromeVisibility.mayAutoHide(isVideoStage: true, isPanelOpen: false, isOnMac: false, isVoiceOverRunning: true))
    }

    func test_mayAutoHide_mac_returnsFalse() {
        XCTAssertFalse(CallChromeVisibility.mayAutoHide(isVideoStage: true, isPanelOpen: false, isOnMac: true, isVoiceOverRunning: false))
    }

    func test_mayAutoHide_audioStage_returnsFalse() {
        XCTAssertFalse(CallChromeVisibility.mayAutoHide(isVideoStage: false, isPanelOpen: false, isOnMac: false, isVoiceOverRunning: false))
    }

    func test_autoHideDelay_isFourSeconds() {
        XCTAssertEqual(CallChromeVisibility.autoHideDelayNanoseconds, 4_000_000_000)
    }

    // MARK: - Une scène est-elle vidéo ?

    func test_isVideoStage_duo_followsTheDuoVideoLayout() {
        XCTAssertTrue(CallChromeVisibility.isVideoStage(isGroup: false, isLocalVideoEnabled: false, isDuoVideoActive: true, remoteCamerasOn: 0))
        XCTAssertFalse(CallChromeVisibility.isVideoStage(isGroup: false, isLocalVideoEnabled: true, isDuoVideoActive: false, remoteCamerasOn: 3))
    }

    func test_isVideoStage_groupWithARemoteCamera_returnsTrue() {
        XCTAssertTrue(CallChromeVisibility.isVideoStage(isGroup: true, isLocalVideoEnabled: false, isDuoVideoActive: false, remoteCamerasOn: 1))
    }

    func test_isVideoStage_groupWithMyCameraOnly_returnsTrue() {
        XCTAssertTrue(CallChromeVisibility.isVideoStage(isGroup: true, isLocalVideoEnabled: true, isDuoVideoActive: false, remoteCamerasOn: 0))
    }

    func test_isVideoStage_groupOfAvatars_returnsFalse() {
        XCTAssertFalse(CallChromeVisibility.isVideoStage(isGroup: true, isLocalVideoEnabled: false, isDuoVideoActive: true, remoteCamerasOn: 0))
    }
}
