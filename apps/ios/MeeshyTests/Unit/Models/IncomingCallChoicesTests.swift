import XCTest
@testable import Meeshy

/// OPUS-5 — l'écran d'appel entrant : « Répondre sans vidéo » et la vignette
/// de ma caméra, pour un appel vidéo seulement.
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
}
