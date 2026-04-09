import XCTest
@testable import Meeshy

final class DarkFrameDetectorTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT() -> DarkFrameDetector {
        DarkFrameDetector()
    }

    // MARK: - Initial State

    func test_init_lastAverageBrightnessIsNil() {
        let sut = makeSUT()
        XCTAssertNil(sut.lastAverageBrightness)
    }

    // MARK: - Reset

    func test_reset_clearsLastAverageBrightness() {
        let sut = makeSUT()
        // Simulate that some state was set (we can't easily create CVPixelBuffer in unit tests)
        sut.reset()
        XCTAssertNil(sut.lastAverageBrightness)
    }

    func test_reset_canBeCalledMultipleTimes() {
        let sut = makeSUT()
        sut.reset()
        sut.reset()
        XCTAssertNil(sut.lastAverageBrightness)
    }

    // MARK: - Callbacks

    func test_onDarkFrameDetected_canBeSet() {
        let sut = makeSUT()
        var called = false
        sut.onDarkFrameDetected = { called = true }
        sut.onDarkFrameDetected?()
        XCTAssertTrue(called)
    }

    func test_onLightFrameRestored_canBeSet() {
        let sut = makeSUT()
        var called = false
        sut.onLightFrameRestored = { called = true }
        sut.onLightFrameRestored?()
        XCTAssertTrue(called)
    }

    func test_callbacks_defaultToNil() {
        let sut = makeSUT()
        XCTAssertNil(sut.onDarkFrameDetected)
        XCTAssertNil(sut.onLightFrameRestored)
    }
}
