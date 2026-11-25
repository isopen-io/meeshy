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

    // MARK: - Le spectre horizontal du bandeau reçu (2026-11-25)

    func test_ribbon_silence_isAFlatLineOnTheMidline() {
        let size = CGSize(width: 120, height: 28)
        let crest = TalkieRibbonLaw.crest(bands: [], size: size)
        XCTAssertEqual(crest.count, TalkieBubbleLaw.bandCount)
        XCTAssertTrue(crest.allSatisfy { abs($0.y - 14) < 0.0001 })
    }

    func test_ribbon_bandsRunFromTheBassOnTheLeftToTheTrebleOnTheRight() {
        let size = CGSize(width: 119, height: 28)
        let crest = TalkieRibbonLaw.crest(bands: [], size: size)
        XCTAssertEqual(crest.first?.x ?? -1, 0, accuracy: 0.0001)
        XCTAssertEqual(crest.last?.x ?? -1, 119, accuracy: 0.0001)
        XCTAssertEqual(crest[60].x, 60, accuracy: 0.0001)
    }

    /// Une bande à −40 dBFS monte à la moitié de la demi-hauteur, comme l'orbe ; rien ne sort du cadre.
    func test_ribbon_answersTheVoiceLikeTheOrb_andNeverLeavesItsFrame() {
        let size = CGSize(width: 120, height: 28)
        var bands = [Float](repeating: 0, count: 120)
        bands[0] = 0.2
        bands[1] = 9
        bands[2] = .nan
        let crest = TalkieRibbonLaw.crest(bands: bands, size: size)
        XCTAssertEqual(crest[0].y, 7, accuracy: 0.0001)
        XCTAssertEqual(crest[1].y, 0, accuracy: 0.0001)
        XCTAssertEqual(crest[2].y, 14, accuracy: 0.0001)
        XCTAssertTrue(crest.allSatisfy { $0.y >= 0 && $0.y <= 14 })
    }

    /// Le contour est le miroir de la crête autour de la ligne médiane : fermé, jamais au-delà du bas du cadre.
    func test_ribbon_shape_isMirroredAroundTheMidline() {
        let size = CGSize(width: 120, height: 28)
        var bands = [Float](repeating: 0, count: 120)
        bands[30] = 1
        let shape = TalkieRibbonLaw.shape(bands: bands, size: size)
        XCTAssertEqual(shape.boundingRect.minY, 0, accuracy: 0.0001)
        XCTAssertEqual(shape.boundingRect.maxY, 28, accuracy: 0.0001)
    }

    /// Le bouton « Parler » du bandeau ne montre que MA voix qui part, jamais celle du pair (elle vit dans le spectre).
    func test_bubble_readingOneDirection_ignoresTheOther() {
        let stage = TalkieVoiceStage()
        let now = TalkieVoiceStage.hostNow()
        stage.begin(userId: "bob", direction: .incoming, at: Date())
        stage.push(userId: "bob", direction: .incoming, bands: [Float](repeating: 1, count: 120), at: now - 1)
        XCTAssertEqual(TalkieVoiceBubble.bands(stage: stage, userId: "bob", direction: .outgoing, now: now).max(), 0)
        XCTAssertGreaterThan(TalkieVoiceBubble.bands(stage: stage, userId: "bob", direction: nil, now: now).max() ?? 0, 0)
    }
}
