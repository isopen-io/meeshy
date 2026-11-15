import XCTest
@testable import Meeshy

final class MediaBackgroundPolicyTests: XCTestCase {

    private func decide(
        audioQueuePlaying: Bool = false,
        audioQueueActive: Bool = false,
        anyAudioEnginePlaying: Bool = false,
        video: MediaBackgroundPolicy.VideoVerdict = .none
    ) -> MediaBackgroundPolicy.Decision {
        MediaBackgroundPolicy.decide(
            audioQueuePlaying: audioQueuePlaying,
            audioQueueActive: audioQueueActive,
            anyAudioEnginePlaying: anyAudioEnginePlaying,
            video: video
        )
    }

    private func videoVerdict(
        videoPlaying: Bool = false,
        pipConfigured: Bool = false,
        pipStartingOrEngaged: Bool = false,
        pipFailed: Bool = false
    ) -> MediaBackgroundPolicy.VideoVerdict {
        MediaBackgroundPolicy.backgroundVideo(
            videoPlaying: videoPlaying,
            pipConfigured: pipConfigured,
            pipStartingOrEngaged: pipStartingOrEngaged,
            pipFailed: pipFailed
        )
    }

    // MARK: - Vidéo : PiP ou pause (#11041)

    func test_backgroundVideo_playingWithPipStarting_handsOffToPip() {
        XCTAssertEqual(
            videoVerdict(videoPlaying: true, pipConfigured: true, pipStartingOrEngaged: true),
            .handOffToPip,
            "Une fenêtre PiP qui démarre (willStart) ou est ouverte reprend la vidéo : la mettre en pause l'avorterait"
        )
    }

    func test_backgroundVideo_playingWithPipConfiguredButNeverStarted_pauses() {
        XCTAssertEqual(videoVerdict(videoPlaying: true, pipConfigured: true), .pause)
    }

    func test_backgroundVideo_playingWithoutPip_pauses() {
        XCTAssertEqual(videoVerdict(videoPlaying: true), .pause,
            "Une bulle inline (sans PiP) ne continue JAMAIS de jouer en arrière-plan")
    }

    func test_backgroundVideo_pipFailedToStart_pauses() {
        XCTAssertEqual(
            videoVerdict(videoPlaying: true, pipConfigured: true, pipStartingOrEngaged: true, pipFailed: true),
            .pause,
            "Repli : une fenêtre qui échoue à s'ouvrir laisse la vidéo sans lieu — elle s'arrête"
        )
    }

    func test_backgroundVideo_pausedVideoInsideAnOpenPip_keepsTheWindow() {
        XCTAssertEqual(
            videoVerdict(pipConfigured: true, pipStartingOrEngaged: true),
            .handOffToPip,
            "Une fenêtre PiP ouverte sur une vidéo en pause reste ouverte : la démonter fermerait la fenêtre de l'utilisateur"
        )
    }

    func test_backgroundVideo_nothingPlaying_isNone() {
        XCTAssertEqual(videoVerdict(), .none)
        XCTAssertEqual(videoVerdict(pipConfigured: true), .none)
        XCTAssertEqual(videoVerdict(pipConfigured: true, pipFailed: true), .none)
    }

    // MARK: - Décision d'ensemble

    func test_decide_handOffToPip_neitherPausesNorReleasesTheSession() {
        let decision = decide(video: .handOffToPip)
        XCTAssertFalse(decision.pausesVideo)
        XCTAssertTrue(decision.keepsSessionAlive)
    }

    func test_decide_videoPaused_tearsDownWhenNoAudioLives() {
        let decision = decide(video: .pause)
        XCTAssertTrue(decision.pausesVideo)
        XCTAssertFalse(decision.keepsSessionAlive)
    }

    func test_decide_audioQueuePlaying_keepsSessionAlive() {
        let decision = decide(audioQueuePlaying: true)
        XCTAssertFalse(decision.pausesVideo)
        XCTAssertTrue(decision.keepsSessionAlive)
    }

    func test_decide_pausedAudioQueue_keepsSessionAlive() {
        let decision = decide(audioQueueActive: true)
        XCTAssertTrue(decision.keepsSessionAlive)
    }

    func test_decide_standaloneAudioEnginePlaying_keepsSessionAlive() {
        let decision = decide(anyAudioEnginePlaying: true)
        XCTAssertTrue(decision.keepsSessionAlive)
    }

    func test_decide_videoPausedWhileAudioQueueActive_pausesVideoButKeepsSession() {
        let decision = decide(audioQueueActive: true, video: .pause)
        XCTAssertTrue(decision.pausesVideo)
        XCTAssertTrue(decision.keepsSessionAlive)
    }

    func test_decide_everythingIdle_tearsDown() {
        let decision = decide()
        XCTAssertFalse(decision.pausesVideo)
        XCTAssertFalse(decision.keepsSessionAlive)
    }
}
