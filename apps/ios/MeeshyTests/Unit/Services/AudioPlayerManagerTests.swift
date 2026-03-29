import XCTest
@testable import Meeshy

@MainActor
final class AudioPlayerManagerTests: XCTestCase {

    private func makeSUT() -> AudioPlayerManager {
        AudioPlayerManager()
    }

    // MARK: - Initial State

    func test_init_isPlayingIsFalse() {
        let sut = makeSUT()
        XCTAssertFalse(sut.isPlaying)
    }

    func test_init_progressIsZero() {
        let sut = makeSUT()
        XCTAssertEqual(sut.progress, 0)
    }

    func test_init_durationIsZero() {
        let sut = makeSUT()
        XCTAssertEqual(sut.duration, 0)
    }

    // MARK: - Stop

    func test_stop_setsIsPlayingToFalse() {
        let sut = makeSUT()
        sut.stop()
        XCTAssertFalse(sut.isPlaying)
    }

    func test_stop_resetsProgressToZero() {
        let sut = makeSUT()
        sut.stop()
        XCTAssertEqual(sut.progress, 0)
    }

    func test_stop_isIdempotent() {
        let sut = makeSUT()
        sut.stop()
        sut.stop()
        XCTAssertFalse(sut.isPlaying)
        XCTAssertEqual(sut.progress, 0)
    }

    // MARK: - Play with empty URL

    func test_play_withEmptyURLString_doesNotSetIsPlaying() {
        let sut = makeSUT()
        sut.play(urlString: "")
        XCTAssertFalse(sut.isPlaying)
    }

    // MARK: - Play stops previous playback

    func test_play_callsStopFirst_resettingState() {
        let sut = makeSUT()

        sut.play(urlString: "https://example.com/audio1.mp3")
        sut.stop()

        XCTAssertFalse(sut.isPlaying)
        XCTAssertEqual(sut.progress, 0)
    }

    // MARK: - TogglePlayPause without player

    func test_togglePlayPause_withoutPlayer_doesNothing() {
        let sut = makeSUT()
        sut.togglePlayPause()
        XCTAssertFalse(sut.isPlaying)
    }

    // MARK: - PlayLocalFile with invalid URL

    func test_playLocalFile_withInvalidURL_doesNotCrash() {
        let sut = makeSUT()
        let invalidURL = URL(fileURLWithPath: "/nonexistent/path/audio.m4a")
        sut.playLocalFile(url: invalidURL)
        XCTAssertFalse(sut.isPlaying)
    }

    // MARK: - StoppablePlayer conformance

    func test_conformsToStoppablePlayer() {
        let sut = makeSUT()
        XCTAssertTrue(sut is StoppablePlayer)
    }

    // MARK: - Stop after play resets all state

    func test_stop_afterPlayAttempt_resetsAllState() {
        let sut = makeSUT()
        sut.play(urlString: "https://example.com/audio.mp3")
        sut.stop()

        XCTAssertFalse(sut.isPlaying)
        XCTAssertEqual(sut.progress, 0)
        XCTAssertEqual(sut.duration, 0)
    }
}
