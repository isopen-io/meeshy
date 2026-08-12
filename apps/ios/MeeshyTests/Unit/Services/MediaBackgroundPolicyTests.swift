import XCTest
@testable import Meeshy

final class MediaBackgroundPolicyTests: XCTestCase {

    private func decide(
        audioQueuePlaying: Bool = false,
        audioQueueActive: Bool = false,
        anyAudioEnginePlaying: Bool = false,
        videoPlaying: Bool = false,
        pipEngaged: Bool = false
    ) -> MediaBackgroundPolicy.Decision {
        MediaBackgroundPolicy.decide(
            audioQueuePlaying: audioQueuePlaying,
            audioQueueActive: audioQueueActive,
            anyAudioEnginePlaying: anyAudioEnginePlaying,
            videoPlaying: videoPlaying,
            pipEngaged: pipEngaged
        )
    }

    func test_decide_videoPlayingWithoutPip_pausesVideo() {
        let decision = decide(videoPlaying: true)
        XCTAssertTrue(decision.pausesVideo)
        XCTAssertFalse(decision.keepsSessionAlive)
    }

    func test_decide_videoPlayingWithPipEngaged_keepsVideoAndSession() {
        let decision = decide(videoPlaying: true, pipEngaged: true)
        XCTAssertFalse(decision.pausesVideo)
        XCTAssertTrue(decision.keepsSessionAlive)
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

    func test_decide_videoPlayingWhileAudioQueueActive_pausesVideoButKeepsSession() {
        let decision = decide(audioQueueActive: true, videoPlaying: true)
        XCTAssertTrue(decision.pausesVideo)
        XCTAssertTrue(decision.keepsSessionAlive)
    }

    func test_decide_everythingIdle_tearsDown() {
        let decision = decide()
        XCTAssertFalse(decision.pausesVideo)
        XCTAssertFalse(decision.keepsSessionAlive)
    }
}
