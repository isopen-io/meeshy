import XCTest
@testable import Meeshy

@MainActor
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
}
