import XCTest
@testable import Meeshy

/// OPUS-5 — l'écran d'appel entrant : « Répondre sans vidéo » et la vignette
/// de ma caméra, pour un appel vidéo seulement.
@MainActor
final class IncomingCallChoicesTests: XCTestCase {

    func test_videoCall_offersAnswerWithoutVideo_betweenDeclineAndAccept() {
        XCTAssertEqual(IncomingCallChoices.actions(isVideoCall: true), [.decline, .answerWithoutVideo, .accept])
    }

    func test_audioCall_offersOnlyDeclineAndAccept() {
        XCTAssertEqual(IncomingCallChoices.actions(isVideoCall: false), [.decline, .accept])
    }

    func test_accept_staysOnTheTrailingEdge() {
        XCTAssertEqual(IncomingCallChoices.actions(isVideoCall: true).last, .accept)
        XCTAssertEqual(IncomingCallChoices.actions(isVideoCall: false).last, .accept)
    }

    func test_selfPreview_onlyForAVideoCallWithALiveCamera() {
        XCTAssertTrue(IncomingCallChoices.showsSelfPreview(isVideoCall: true, hasLocalVideoTrack: true))
        XCTAssertFalse(IncomingCallChoices.showsSelfPreview(isVideoCall: true, hasLocalVideoTrack: false))
        XCTAssertFalse(IncomingCallChoices.showsSelfPreview(isVideoCall: false, hasLocalVideoTrack: true))
        XCTAssertFalse(IncomingCallChoices.showsSelfPreview(isVideoCall: false, hasLocalVideoTrack: false))
    }

    func test_threeButtons_fitOnTheNarrowestIPhone() {
        let count = IncomingCallChoices.actions(isVideoCall: true).count
        let width = CGFloat(count) * 70 + CGFloat(count - 1) * IncomingCallChoices.buttonSpacing(for: count)
        XCTAssertLessThanOrEqual(width, 320 - 2 * 16)
    }

    func test_twoButtons_keepTheirWideSpacing() {
        XCTAssertEqual(IncomingCallChoices.buttonSpacing(for: 2), 60)
    }

    // MARK: - Avant de décrocher : micro, caméra, ce que l'autre verra (P17, #16945)

    func test_preAnswerBar_onlyForAVideoCall() {
        XCTAssertTrue(IncomingCallChoices.showsPreAnswerBar(isVideoCall: true))
        XCTAssertFalse(IncomingCallChoices.showsPreAnswerBar(isVideoCall: false))
    }

    func test_preAnswer_byDefault_answersWithVideoAndAnOpenMicrophone() {
        let choice = IncomingPreAnswer()
        XCTAssertEqual(choice.route(isVideoCall: true), .asOffered)
        XCTAssertFalse(choice.answersMuted)
    }

    func test_exposure_bothOn_withALiveCamera_isSeenAndHeard() {
        XCTAssertEqual(IncomingPreAnswer().exposure(isVideoCall: true, hasLocalVideoTrack: true), .seenAndHeard)
    }

    func test_exposure_cameraTurnedOff_isHeardOnly() {
        let choice = IncomingPreAnswer().togglingCamera()
        XCTAssertEqual(choice.exposure(isVideoCall: true, hasLocalVideoTrack: true), .heardOnly)
    }

    func test_exposure_microphoneTurnedOff_isSeenMuted() {
        let choice = IncomingPreAnswer().togglingMicrophone()
        XCTAssertEqual(choice.exposure(isVideoCall: true, hasLocalVideoTrack: true), .seenMuted)
    }

    func test_exposure_bothOff_isNeither() {
        let choice = IncomingPreAnswer().togglingMicrophone().togglingCamera()
        XCTAssertEqual(choice.exposure(isVideoCall: true, hasLocalVideoTrack: true), .neither)
    }

    func test_exposure_withoutALiveCamera_neverClaimsToBeSeen() {
        XCTAssertEqual(IncomingPreAnswer().exposure(isVideoCall: true, hasLocalVideoTrack: false), .heardOnly)
        XCTAssertEqual(IncomingPreAnswer().togglingMicrophone().exposure(isVideoCall: true, hasLocalVideoTrack: false), .neither)
    }

    func test_route_cameraTurnedOff_answersWithoutVideo() {
        XCTAssertEqual(IncomingPreAnswer().togglingCamera().route(isVideoCall: true), .withoutVideo)
    }

    func test_route_audioCall_isAlwaysAsOffered() {
        XCTAssertEqual(IncomingPreAnswer().togglingCamera().route(isVideoCall: false), .asOffered)
    }

    func test_answersMuted_microphoneTurnedOff_isTrue() {
        XCTAssertTrue(IncomingPreAnswer().togglingMicrophone().answersMuted)
    }

    func test_toggling_twice_returnsToTheDefault() {
        XCTAssertEqual(IncomingPreAnswer().togglingCamera().togglingCamera(), IncomingPreAnswer())
        XCTAssertEqual(IncomingPreAnswer().togglingMicrophone().togglingMicrophone(), IncomingPreAnswer())
    }

    func test_selfColorKey_withMyId_isMyId() {
        XCTAssertEqual(IncomingCallChoices.selfColorKey(userId: "65f0c0ffee0000000000abcd"), "65f0c0ffee0000000000abcd")
    }

    func test_selfColorKey_withoutAnId_isNil() {
        XCTAssertNil(IncomingCallChoices.selfColorKey(userId: nil))
        XCTAssertNil(IncomingCallChoices.selfColorKey(userId: ""))
    }

    func test_selfPreview_cameraTurnedOff_isHidden() {
        XCTAssertFalse(IncomingCallChoices.showsSelfPreview(isVideoCall: true, hasLocalVideoTrack: true, cameraChosen: false))
        XCTAssertTrue(IncomingCallChoices.showsSelfPreview(isVideoCall: true, hasLocalVideoTrack: true, cameraChosen: true))
    }
    // MARK: - La disposition de la vue P17, l'écran audio livré inchangé (#16945)

    func test_layout_videoCall_isThePreviewLayout_audioCall_keepsTheShippedOne() {
        XCTAssertEqual(IncomingCallLayout.of(isVideoCall: true), .videoPreview)
        XCTAssertEqual(IncomingCallLayout.of(isVideoCall: false), .audio)
    }

    func test_layout_preview_putsTheTypeChipAboveTheName_withoutTheGreyLineNorTheBadge() {
        XCTAssertTrue(IncomingCallLayout.videoPreview.showsTypeChipAboveName)
        XCTAssertFalse(IncomingCallLayout.videoPreview.showsTypeLineAndBadge)
    }

    func test_layout_audio_keepsTheGreyLineAndTheBadgeUnderTheName() {
        XCTAssertFalse(IncomingCallLayout.audio.showsTypeChipAboveName)
        XCTAssertTrue(IncomingCallLayout.audio.showsTypeLineAndBadge)
    }

    func test_layout_preview_answers_withWhiteCaptions() {
        XCTAssertEqual(IncomingCallLayout.videoPreview.acceptCaption, .answer)
        XCTAssertTrue(IncomingCallLayout.videoPreview.whiteCaptions)
    }

    func test_layout_audio_keepsAccept_andItsTintedCaptions() {
        XCTAssertEqual(IncomingCallLayout.audio.acceptCaption, .accept)
        XCTAssertFalse(IncomingCallLayout.audio.whiteCaptions)
    }

    func test_callerDisc_hiddenWhileTheCallerVideoPlays_shownOtherwise() {
        XCTAssertFalse(IncomingCallChoices.showsCallerDisc(previewPlaysVideo: true))
        XCTAssertTrue(IncomingCallChoices.showsCallerDisc(previewPlaysVideo: false))
    }

    func test_acceptGlyph_followsTheRoute() {
        XCTAssertEqual(IncomingCallChoices.acceptGlyph(isVideoCall: true, route: .asOffered), "video.fill")
        XCTAssertEqual(IncomingCallChoices.acceptGlyph(isVideoCall: true, route: .withoutVideo), "phone.fill")
        XCTAssertEqual(IncomingCallChoices.acceptGlyph(isVideoCall: false, route: .asOffered), "phone.fill")
    }

    // MARK: - Le bouton Caméra dit ce que la phrase dit

    func test_cameraFilms_chosenButNotYetLive_isFalse() {
        XCTAssertFalse(IncomingPreAnswer().cameraFilms(isVideoCall: true, hasLocalVideoTrack: false))
    }

    func test_cameraFilms_chosenAndLive_isTrue() {
        XCTAssertTrue(IncomingPreAnswer().cameraFilms(isVideoCall: true, hasLocalVideoTrack: true))
    }

    func test_cameraFilms_turnedOff_isFalse_evenWithALiveTrack() {
        XCTAssertFalse(IncomingPreAnswer().togglingCamera().cameraFilms(isVideoCall: true, hasLocalVideoTrack: true))
    }

    func test_cameraFilms_agreesWithTheSentence_whileTheCameraStarts() {
        let choice = IncomingPreAnswer()
        XCTAssertFalse(choice.cameraFilms(isVideoCall: true, hasLocalVideoTrack: false))
        XCTAssertEqual(choice.exposure(isVideoCall: true, hasLocalVideoTrack: false), .heardOnly)
    }

    // MARK: - #17732 P17.5 — ma vignette se fond aussi sous « Réduire les animations »

    func test_selfPreviewFade_isQuarterSecond_andShorterUnderReduceMotion() {
        XCTAssertEqual(IncomingCallChoices.selfPreviewFadeDuration(reduceMotion: false), 0.25)
        XCTAssertEqual(IncomingCallChoices.selfPreviewFadeDuration(reduceMotion: true), CallChromeStow.reducedFadeDuration)
        XCTAssertGreaterThan(IncomingCallChoices.selfPreviewFadeDuration(reduceMotion: true), 0, "jamais de coupure nette")
    }

    func test_selfPreview_fadesInBothModes_neverCutsWithANilAnimation() throws {
        let view = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/IncomingCallView.swift")
        )
        XCTAssertTrue(view.contains("IncomingCallChoices.selfPreviewFadeDuration(reduceMotion: reduceMotion)"))
        XCTAssertFalse(view.contains(".animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: shows)"))
    }
}
