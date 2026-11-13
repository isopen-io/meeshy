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

    /// #17945 — la scène, c'est l'image en vidéo, le fond derrière l'avatar d'un duo audio établi
    /// et, par l'extension du porteur (dernier commentaire de #17945), le fond d'un GROUPE sans
    /// aucune caméra allumée. Les MÊMES vecteurs qu'Android (`CallChromeVisibility.isTapStage`) et le
    /// web, composés depuis la règle de la scène vidéo. Le vecteur « groupe, aucune caméra → non »
    /// figeait le dessin d'avant l'extension : il devient « oui ».
    func test_isTapStage_followsTheSharedVectors() {
        XCTAssertTrue(tapStage(isGroup: false, camera: true, isConnected: true), "duo, vidéo")
        XCTAssertTrue(tapStage(isGroup: false, camera: false, isConnected: true), "duo, audio établi")
        XCTAssertFalse(tapStage(isGroup: false, camera: false, isConnected: false), "duo, audio pas encore établi")
        XCTAssertTrue(tapStage(isGroup: true, camera: true, isConnected: true), "groupe, une caméra")
        XCTAssertTrue(tapStage(isGroup: true, camera: false, isConnected: true), "groupe, aucune caméra")
    }

    /// #17945 étendu — en groupe sans caméra, le toucher range l'en-tête, la pilule, le journal et
    /// les bannières ; les sous-titres restent dans un verre sans rangée (loi 11), et la capsule de
    /// la une se range avec les contrôles. Le second toucher rend le journal.
    func test_groupWithoutCamera_aTapStowsTheChrome_captionsStay() {
        XCTAssertTrue(CallChromeVisibility.mayToggleByTap(isTapStage: tapStage(isGroup: true, camera: false, isConnected: true), isVoiceOverRunning: false))
        let stowed = CallChromeVisibility(isRevealed: true).toggled()
        for element in hideable { XCTAssertFalse(stowed.isVisible(element), "\(element) se range") }
        XCTAssertTrue(stowed.isVisible(.captions))
        let journal = CallScreenLayer.panel(.journal)
        let stowedText = CallPillText.resolve(isCaptionsEnabled: true, layer: journal, isChromeRevealed: stowed.isVisible(.controls))
        XCTAssertEqual(stowedText, .captionsAlone, "le journal se range, les sous-titres restent")
        XCTAssertTrue(stowedText.isOnStage(isStageFullScreen: false), "le verre des sous-titres reste dans le flux de la grille")
        let revealedText = CallPillText.resolve(isCaptionsEnabled: true, layer: journal, isChromeRevealed: stowed.toggled().isVisible(.controls))
        XCTAssertEqual(revealedText, .journal)
    }

    /// Sous VoiceOver, rien ne se range — groupe sans caméra compris.
    func test_groupWithoutCamera_underVoiceOver_nothingStows() {
        XCTAssertFalse(CallChromeVisibility.mayToggleByTap(isTapStage: tapStage(isGroup: true, camera: false, isConnected: true), isVoiceOverRunning: true))
    }

    private func tapStage(isGroup: Bool, camera: Bool, isConnected: Bool) -> Bool {
        let isVideoStage = CallChromeVisibility.isVideoStage(
            isGroup: isGroup,
            isLocalVideoEnabled: false,
            isDuoVideoActive: !isGroup && camera,
            remoteCamerasOn: isGroup && camera ? 1 : 0
        )
        return CallChromeVisibility.isTapStage(isVideoStage: isVideoStage, isConnected: isConnected)
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
