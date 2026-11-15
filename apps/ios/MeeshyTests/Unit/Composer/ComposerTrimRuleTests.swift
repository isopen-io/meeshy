import XCTest
import CoreMedia
@testable import Meeshy

/// **La découpe d'une vidéo capturée** (#9353, spec § 3.3).
@MainActor
final class ComposerTrimRuleTests: XCTestCase {

    func test_initialRange_isTheWholeClip() {
        XCTAssertEqual(ComposerTrimRule.initialRange(duration: 7.25), 0...7.25)
    }

    func test_initialRange_clipShorterThanMinimum_isWholeClip() {
        XCTAssertEqual(ComposerTrimRule.initialRange(duration: 0.2), 0...0.2)
        XCTAssertFalse(ComposerTrimRule.canTrim(duration: 0.2), "une prise trop courte ne se découpe pas")
        XCTAssertTrue(ComposerTrimRule.canTrim(duration: 1))
    }

    func test_movedStart_staysBeforeTheEndMinusTheMinimum() {
        XCTAssertEqual(ComposerTrimRule.movedStart(6.9, range: 1...7).upperBound, 7)
        XCTAssertEqual(ComposerTrimRule.movedStart(6.9, range: 1...7).lowerBound, 7 - ComposerTrimRule.minimum, accuracy: 0.0001)
        XCTAssertEqual(ComposerTrimRule.movedStart(-2, range: 1...7).lowerBound, 0)
    }

    func test_movedEnd_staysAfterTheStartPlusTheMinimum_andWithinTheClip() {
        XCTAssertEqual(ComposerTrimRule.movedEnd(1.1, range: 1...7, duration: 8).upperBound, 1 + ComposerTrimRule.minimum, accuracy: 0.0001)
        XCTAssertEqual(ComposerTrimRule.movedEnd(99, range: 1...7, duration: 8).upperBound, 8)
    }

    /// Une prise plus courte que le minimum ne produit jamais une plage à l'envers.
    func test_moved_onAClipShorterThanTheMinimum_keepsAValidRange() {
        XCTAssertEqual(ComposerTrimRule.movedStart(0.15, range: 0...0.2), 0...0.2)
        XCTAssertEqual(ComposerTrimRule.movedEnd(0.05, range: 0...0.2, duration: 0.2), 0...0.2)
    }

    func test_millisecondText_readsMinutesSecondsMilliseconds() {
        let anglais = Locale(identifier: "en_US")
        XCTAssertEqual(ComposerTrimRule.millisecondText(3.482, locale: anglais), "0:03.482")
        XCTAssertEqual(ComposerTrimRule.millisecondText(75.0409, locale: anglais), "1:15.041")
        XCTAssertEqual(ComposerTrimRule.millisecondText(-1, locale: anglais), "0:00.000")
        XCTAssertEqual(ComposerTrimRule.millisecondText(.nan, locale: anglais), "0:00.000")
        XCTAssertFalse(ComposerTrimRule.millisecondText(3.482, locale: Locale(identifier: "ar_SA")).contains("3"),
                       "en arabe, la lecture suit les chiffres de la langue")
    }

    func test_playhead_isClampedIntoTheRange() {
        XCTAssertEqual(ComposerTrimRule.playhead(0.5, in: 1...4), 1)
        XCTAssertEqual(ComposerTrimRule.playhead(2.5, in: 1...4), 2.5)
        XCTAssertEqual(ComposerTrimRule.playhead(9, in: 1...4), 4)
    }

    func test_timeAtX_mapsTheTrackToTheClip() {
        XCTAssertEqual(ComposerTrimRule.time(atX: 150, width: 300, duration: 8), 4, accuracy: 0.0001)
        XCTAssertEqual(ComposerTrimRule.time(atX: -20, width: 300, duration: 8), 0)
        XCTAssertEqual(ComposerTrimRule.time(atX: 900, width: 300, duration: 8), 8)
        XCTAssertEqual(ComposerTrimRule.time(atX: 10, width: 0, duration: 8), 0, "une piste sans largeur ne divise rien")
    }

    func test_preciseTime_stripMovesUnderTheFixedMarker() {
        let pps: CGFloat = 40 * 300 / 8
        XCTAssertEqual(ComposerTrimRule.preciseTime(anchor: 3, translationX: 15, pointsPerSecond: pps), 3 - 0.01, accuracy: 0.00001,
                       "faire glisser la bande vers la droite amène un instant ANTÉRIEUR sous le trait")
        XCTAssertEqual(ComposerTrimRule.preciseTime(anchor: 3, translationX: 15, pointsPerSecond: 0), 3,
                       "une piste sans échelle ne bouge pas")
    }

    func test_timeRange_wholeClip_isNil_andAPartIsExported() {
        XCTAssertNil(ComposerTrimRule.timeRange(0...8, duration: 8))
        XCTAssertNil(ComposerTrimRule.timeRange(nil, duration: 8), "hors découpe, rien ne se coupe")
        let plage = ComposerTrimRule.timeRange(1.5...4, duration: 8)
        XCTAssertEqual(plage?.start.seconds ?? -1, 1.5, accuracy: 0.001)
        XCTAssertEqual(plage?.duration.seconds ?? -1, 2.5, accuracy: 0.001)
    }
}
