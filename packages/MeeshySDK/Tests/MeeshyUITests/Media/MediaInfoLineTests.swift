import XCTest
@testable import MeeshyUI

/// **`largeur × hauteur · poids · durée`** (#9577, directive porteur
/// 2026-10-07) — séparés par un point médian, la durée DÉCOMPTANT pendant la
/// lecture et rendant la durée totale à l'arrêt.
final class MediaInfoLineTests: XCTestCase {

    func test_theThreeSegments_areJoinedByAMiddleDot() {
        let segments = MediaInfoLine.segments(width: 1080, height: 1920,
                                              fileSizeLabel: "4.0 MB", hasDuration: true)
        XCTAssertEqual(segments, [.dimensions("1080 \u{00D7} 1920"), .fileSize("4.0 MB"), .duration])
        XCTAssertEqual(MediaInfoLine.text(segments, durationLabel: "0:12"),
                       "1080 \u{00D7} 1920 \u{00B7} 4.0 MB \u{00B7} 0:12")
    }

    func test_anImage_hasNoDurationSegment() {
        let segments = MediaInfoLine.segments(width: 800, height: 600,
                                              fileSizeLabel: "200.0 KB", hasDuration: false)
        XCTAssertEqual(MediaInfoLine.text(segments, durationLabel: nil),
                       "800 \u{00D7} 600 \u{00B7} 200.0 KB")
    }

    func test_aMissingSegment_leavesNoOrphanSeparator() {
        XCTAssertEqual(
            MediaInfoLine.text(MediaInfoLine.segments(width: nil, height: nil,
                                                      fileSizeLabel: "4.0 MB", hasDuration: true),
                               durationLabel: "0:12"),
            "4.0 MB \u{00B7} 0:12")
        XCTAssertEqual(
            MediaInfoLine.text(MediaInfoLine.segments(width: 0, height: 1920,
                                                      fileSizeLabel: nil, hasDuration: true),
                               durationLabel: "0:12"),
            "0:12", "une dimension nulle n'est pas une dimension")
        XCTAssertTrue(MediaInfoLine.segments(width: nil, height: nil,
                                             fileSizeLabel: "", hasDuration: false).isEmpty)
    }

    // MARK: - La durée décompte

    func test_whilePlaying_theDurationShowsTheRemainingTime() {
        XCTAssertEqual(MediaInfoLine.displayedDuration(total: 12, elapsed: 4.2, isPlaying: true),
                       7.8, accuracy: 0.001)
    }

    func test_atRest_theDurationShowsTheTotal() {
        XCTAssertEqual(MediaInfoLine.displayedDuration(total: 12, elapsed: 4.2, isPlaying: false), 12)
    }

    func test_theRemainingTime_neverGoesNegative() {
        XCTAssertEqual(MediaInfoLine.displayedDuration(total: 12, elapsed: 12.4, isPlaying: true), 0)
        XCTAssertEqual(MediaInfoLine.displayedDuration(total: 12, elapsed: .nan, isPlaying: true), 12)
    }

    func test_theTotal_comesFromTheEngineOnceItKnows_elseFromTheDeclaredDuration() {
        XCTAssertEqual(MediaInfoLine.totalDuration(engine: 0, declared: 12), 12,
                       "avant que les pistes soient chargées, le moteur dit 0 : la pièce jointe répond")
        XCTAssertEqual(MediaInfoLine.totalDuration(engine: 12.6, declared: 12), 12.6)
        XCTAssertEqual(MediaInfoLine.totalDuration(engine: .nan, declared: 12), 12)
    }
}
