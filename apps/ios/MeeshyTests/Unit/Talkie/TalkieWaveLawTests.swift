import XCTest
@testable import Meeshy

/// Le niveau d'une voix du talkie : sa moyenne quadratique, et le lissage bande par bande de la bulle (#17310, #20531).
final class TalkieWaveLawTests: XCTestCase {

    func test_rms_ofSilence_isZero_andOfAConstantSignal_isItsAmplitude() {
        XCTAssertEqual([Float]().withUnsafeBufferPointer(TalkieWaveLaw.rms), 0)
        XCTAssertEqual([Float](repeating: 0, count: 8).withUnsafeBufferPointer(TalkieWaveLaw.rms), 0)
        XCTAssertEqual([Float](arrayLiteral: 0.5, -0.5, 0.5, -0.5).withUnsafeBufferPointer(TalkieWaveLaw.rms), 0.5, accuracy: 0.0001)
    }

    func test_smoothed_risesQuickly_andFallsSlowly() {
        let rise = TalkieWaveLaw.smoothed(previous: 0, target: 1)
        let fall = 1 - TalkieWaveLaw.smoothed(previous: 1, target: 0)
        XCTAssertGreaterThan(rise, 0)
        XCTAssertLessThan(rise, 1)
        XCTAssertGreaterThan(rise, fall)
    }

    func test_smoothed_staysBounded_andConverges() {
        XCTAssertEqual(TalkieWaveLaw.smoothed(previous: 0.4, target: 0.4), 0.4, accuracy: 0.0001)
        XCTAssertLessThanOrEqual(TalkieWaveLaw.smoothed(previous: 1, target: 9), 1)
        XCTAssertGreaterThanOrEqual(TalkieWaveLaw.smoothed(previous: 0, target: -9), 0)
        let converged = (0..<120).reduce(Float(0)) { value, _ in TalkieWaveLaw.smoothed(previous: value, target: 0.8) }
        XCTAssertEqual(converged, 0.8, accuracy: 0.01)
    }
}
