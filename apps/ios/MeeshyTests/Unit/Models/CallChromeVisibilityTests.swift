import XCTest
@testable import Meeshy

/// #8550 — toucher n'importe où sur la scène masque TOUS les contrôles (en-tête,
/// pilule et ses rangées, sous-menu ouvert, statut d'enregistrement, bandeau de
/// partage), en duo comme en groupe ; les sous-titres et la vignette perso
/// restent, et une demande de consentement reste toujours visible.
@MainActor
final class CallChromeVisibilityTests: XCTestCase {

    private let hideable: [CallChromeElement] = [.header, .controls, .openPanel, .recordingStatus, .screenShareBanner, .featuredCapsule]
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

    /// U1.10 · #8550 — la capsule « Revenir à la grille · Plein écran » se range AVEC les
    /// contrôles et revient au second toucher ; le plein écran, lui, ne la range pas : c'est
    /// par elle qu'on en sort.
    func test_featuredCapsule_followsTheControls_butSurvivesTheFullScreen() {
        XCTAssertTrue(CallChromeVisibility(isRevealed: true).isVisible(.featuredCapsule))
        XCTAssertTrue(CallChromeVisibility(isRevealed: true, isStageFullScreen: true).isVisible(.featuredCapsule))
        XCTAssertFalse(CallChromeVisibility(isRevealed: false).isVisible(.featuredCapsule))
        XCTAssertFalse(CallChromeVisibility(isRevealed: false, isStageFullScreen: true).isVisible(.featuredCapsule))
        XCTAssertTrue(CallChromeVisibility(isRevealed: false).toggled().isVisible(.featuredCapsule), "le second toucher la rend")
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

    // MARK: - Qui peut masquer par un toucher (loi 11, #17945)

    /// #17945 — la scène, c'est l'image en vidéo et le fond derrière l'avatar d'un duo audio
    /// établi. Un groupe sans caméra n'a pas d'image à libérer : ses vignettes répondent au
    /// toucher. Les MÊMES vecteurs qu'Android (`CallChromeVisibility.isTapStage`) et le web. Le
    /// témoin d'avant (« une scène audio ne cache jamais ses contrôles ») figeait le dessin que
    /// la décision porteur a retourné.
    func test_isTapStage_followsTheSharedVectors() {
        XCTAssertTrue(CallChromeVisibility.isTapStage(isGroup: false, isVideoStage: true, isConnected: true), "duo, vidéo")
        XCTAssertTrue(CallChromeVisibility.isTapStage(isGroup: false, isVideoStage: false, isConnected: true), "duo, audio établi")
        XCTAssertFalse(CallChromeVisibility.isTapStage(isGroup: false, isVideoStage: false, isConnected: false), "duo, audio pas encore établi")
        XCTAssertTrue(CallChromeVisibility.isTapStage(isGroup: true, isVideoStage: true, isConnected: true), "groupe, une caméra")
        XCTAssertFalse(CallChromeVisibility.isTapStage(isGroup: true, isVideoStage: false, isConnected: true), "groupe, aucune caméra")
    }

    /// Sous VoiceOver les contrôles restent en place : le toucher ne les range pas.
    func test_mayToggleByTap_onTheStage_exceptUnderVoiceOver() {
        XCTAssertTrue(CallChromeVisibility.mayToggleByTap(isTapStage: true, isVoiceOverRunning: false))
        XCTAssertFalse(CallChromeVisibility.mayToggleByTap(isTapStage: true, isVoiceOverRunning: true))
        XCTAssertFalse(CallChromeVisibility.mayToggleByTap(isTapStage: false, isVoiceOverRunning: false))
    }

    /// #17945 — en duo audio, le journal se range avec la pilule et l'avatar reprend 120 pt ; le
    /// second toucher rend le journal, donc l'en-tête compact (G1 → G2 rend l'état d'avant).
    func test_audioDuo_aTapStowsTheJournal_andTheNextGivesItBack() {
        let journal = CallScreenLayer.panel(.journal)
        let stowed = CallChromeVisibility(isRevealed: true).toggled()
        let stowedText = CallPillText.resolve(isCaptionsEnabled: false, layer: journal, isChromeRevealed: stowed.isVisible(.controls))
        XCTAssertFalse(stowedText.compactsAudioLayout, "rangé, l'avatar grandit à 120 pt")
        XCTAssertFalse(stowed.isVisible(.header))
        let revealed = stowed.toggled()
        let revealedText = CallPillText.resolve(isCaptionsEnabled: false, layer: journal, isChromeRevealed: revealed.isVisible(.controls))
        XCTAssertTrue(revealedText.compactsAudioLayout, "rendu, le journal revient et resserre l'avatar")
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
