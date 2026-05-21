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

    // MARK: - A3 — Audio session cleanup on failure

    /// Idempotency contract: the helper must be safe to call when no
    /// session is active (no-op) and must not throw. Pinning this lets
    /// `startRecording`'s catch path call it without `try?` boilerplate.
    func test_deactivateAudioSessionAfterFailure_isIdempotent() {
        let sut = makeSUT()
        sut.deactivateAudioSessionAfterFailure()
        sut.deactivateAudioSessionAfterFailure()
        sut.deactivateAudioSessionAfterFailure()
        // No crash, no precondition. The OS no-ops if nothing is active.
        XCTAssertFalse(sut.isRecording)
    }

    /// Regression guard: the helper is referenced by the AVAudioRecorder
    /// init failure path. If someone removes the call from `startRecording`,
    /// the test below ensures the helper still exists (compile-time pin).
    func test_deactivateAudioSessionAfterFailure_isCallable() {
        let sut = makeSUT()
        // Method is internal; simply being able to call it = invariant holds.
        sut.deactivateAudioSessionAfterFailure()
        XCTAssertFalse(sut.isRecording)
    }
}
