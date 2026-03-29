import XCTest
@testable import Meeshy

@MainActor
final class AudioRecorderManagerTests: XCTestCase {

    private func makeSUT() -> AudioRecorderManager {
        AudioRecorderManager()
    }

    // MARK: - Initial State

    func test_init_isRecordingIsFalse() {
        let sut = makeSUT()
        XCTAssertFalse(sut.isRecording)
    }

    func test_init_durationIsZero() {
        let sut = makeSUT()
        XCTAssertEqual(sut.duration, 0)
    }

    func test_init_recordedFileURLIsNil() {
        let sut = makeSUT()
        XCTAssertNil(sut.recordedFileURL)
    }

    func test_init_audioLevelsHas15Elements() {
        let sut = makeSUT()
        XCTAssertEqual(sut.audioLevels.count, 15)
    }

    func test_init_audioLevelsAreAllZero() {
        let sut = makeSUT()
        XCTAssertTrue(sut.audioLevels.allSatisfy { $0 == 0 })
    }

    // MARK: - Stop Recording without starting

    func test_stopRecording_withoutStarting_returnsNil() {
        let sut = makeSUT()
        let url = sut.stopRecording()
        XCTAssertNil(url)
    }

    func test_stopRecording_withoutStarting_isRecordingRemainsFalse() {
        let sut = makeSUT()
        _ = sut.stopRecording()
        XCTAssertFalse(sut.isRecording)
    }

    // MARK: - Cancel Recording without starting

    func test_cancelRecording_withoutStarting_doesNotCrash() {
        let sut = makeSUT()
        sut.cancelRecording()
        XCTAssertFalse(sut.isRecording)
    }

    func test_cancelRecording_resetsRecordedFileURL() {
        let sut = makeSUT()
        sut.cancelRecording()
        XCTAssertNil(sut.recordedFileURL)
    }

    func test_cancelRecording_resetsDurationToZero() {
        let sut = makeSUT()
        sut.cancelRecording()
        XCTAssertEqual(sut.duration, 0)
    }

    func test_cancelRecording_resetsAudioLevelsToZero() {
        let sut = makeSUT()
        sut.cancelRecording()
        XCTAssertEqual(sut.audioLevels.count, 15)
        XCTAssertTrue(sut.audioLevels.allSatisfy { $0 == 0 })
    }

    // MARK: - Cancel is idempotent

    func test_cancelRecording_calledMultipleTimes_doesNotCrash() {
        let sut = makeSUT()
        sut.cancelRecording()
        sut.cancelRecording()
        sut.cancelRecording()
        XCTAssertFalse(sut.isRecording)
        XCTAssertNil(sut.recordedFileURL)
    }

    // MARK: - Stop then Cancel sequence

    func test_stopThenCancel_doesNotCrash() {
        let sut = makeSUT()
        _ = sut.stopRecording()
        sut.cancelRecording()
        XCTAssertFalse(sut.isRecording)
        XCTAssertNil(sut.recordedFileURL)
    }
}
