import MeeshySDK
import XCTest
@testable import Meeshy

/// Ce que la bulle et le compteur du talkie calculent hors du dessin (#20531) : le cadre, le niveau moyen, le temps
/// écoulé et ce que VoiceOver en dit.
final class TalkieVoiceBubbleTests: XCTestCase {

    private let geometry = TalkieBubbleGeometry(baseRadius: 50, maxAmplitude: 20)

    func test_frameSide_coversTheWholeBubbleAndHalfTheWidestStroke() {
        let widest = max(TalkieVoiceBubble.strokeWidth, TalkieBubbleLaw.reducedMotionStroke(level: 1))
        XCTAssertEqual(TalkieVoiceBubble.frameSide(for: geometry), 2 * (50 + 20) + widest)
    }

    func test_meanLevel_silence_isZero() {
        XCTAssertEqual(TalkieBubbleLaw.meanLevel(bands: [Float](repeating: 0, count: 120)), 0)
    }

    func test_meanLevel_mixedBands_isTheirAverageOverAllBands() {
        let bands = [Float](repeating: 1, count: 30) + [Float](repeating: 0, count: 90)
        XCTAssertEqual(TalkieBubbleLaw.meanLevel(bands: bands), 0.25, accuracy: 0.0001)
    }

    func test_meanLevel_nonFiniteAndOutOfRange_areBoundedLikeTheTips() {
        let bands: [Float] = [.nan, .infinity, -3, 4]
        XCTAssertEqual(TalkieBubbleLaw.meanLevel(bands: bands), 0.25, accuracy: 0.0001)
    }

    func test_meanLevel_noBands_isZero() {
        XCTAssertEqual(TalkieBubbleLaw.meanLevel(bands: []), 0)
    }

    func test_elapsedSeconds_countsWholeSecondsDown() {
        let start = Date(timeIntervalSinceReferenceDate: 1000)
        XCTAssertEqual(TalkieVoiceClock.elapsedSeconds(since: start, now: start.addingTimeInterval(4.9)), 4)
    }

    func test_elapsedSeconds_clockSkewBeforeStart_isZero() {
        let start = Date(timeIntervalSinceReferenceDate: 1000)
        XCTAssertEqual(TalkieVoiceClock.elapsedSeconds(since: start, now: start.addingTimeInterval(-2)), 0)
    }

    func test_text_underAMinute_readsMinutesColonPaddedSeconds() {
        XCTAssertEqual(TalkieVoiceClock.text(seconds: 4, locale: Locale(identifier: "fr_FR")), "0:04")
    }

    func test_text_pastAMinute_keepsMinutesUnpadded() {
        XCTAssertEqual(TalkieVoiceClock.text(seconds: 75, locale: Locale(identifier: "fr_FR")), "1:15")
    }

    func test_accessibilityLabel_saysRecordingAndTheSpokenDuration() {
        let spoken = MediaFormat.duration(4, style: .spoken)
        let label = TalkieVoiceClock.accessibilityLabel(seconds: 4)
        XCTAssertTrue(label.contains(spoken), label)
        XCTAssertNotEqual(label, spoken)
    }
}
