import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// D0.2 — un élément « permanent » (duration nil : texte/sticker sans fenêtre)
/// doit occuper sa lane de startTime à slideDuration. duration ≤ 0 est traité
/// pareil (donnée dégénérée, jamais une vraie fenêtre).
final class TimelineGeometryEffectiveDurationTests: XCTestCase {

    func test_effectiveClipDuration_explicitWindow_passesThrough() {
        XCTAssertEqual(
            TimelineGeometry.effectiveClipDuration(startTime: 2, duration: 3, slideDuration: 10),
            3)
    }

    func test_effectiveClipDuration_nilDuration_extendsToSlideEnd() {
        XCTAssertEqual(
            TimelineGeometry.effectiveClipDuration(startTime: 2, duration: nil, slideDuration: 10),
            8)
    }

    func test_effectiveClipDuration_zeroDuration_extendsToSlideEnd() {
        XCTAssertEqual(
            TimelineGeometry.effectiveClipDuration(startTime: 0, duration: 0, slideDuration: 6),
            6)
    }

    func test_effectiveClipDuration_startPastSlideEnd_clampsToZero() {
        XCTAssertEqual(
            TimelineGeometry.effectiveClipDuration(startTime: 12, duration: nil, slideDuration: 10),
            0)
    }
}
