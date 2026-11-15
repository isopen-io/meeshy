// apps/ios/MeeshyTests/Unit/Focal/FocalFocusDetailsMotionLawTests.swift

import XCTest
@testable import Meeshy

/// #7624 — la carte et les détails du message élu ne se reconfigurent plus en
/// plein fling. Mesuré au simulateur : chaque changement d'élection pendant un
/// défilement rapide appliquait un snapshot de reconfiguration (706 ms de fil
/// principal sur 25 s de flings, Time Profiler) et faisait changer la hauteur
/// de deux rangées sous le doigt. La loi DIFFÈRE la reconfiguration jusqu'à ce
/// que le défilement ralentisse à une vitesse de lecture — l'élection, elle,
/// continue de suivre le doigt (loupe par transform de calque, sans relayout).
final class FocalFocusDetailsMotionLawTests: XCTestCase {

    func test_revealsDetails_flingSpeed_returnsFalse() {
        XCTAssertFalse(
            FocalFocusDetailsMotionLaw.revealsDetails(speed: 2400),
            "à vitesse de fling, personne ne lit : reconfigurer l'élu coûte un rendu et un relayout par élection, pour rien."
        )
    }

    func test_revealsDetails_flingTowardNewest_returnsFalse() {
        XCTAssertFalse(
            FocalFocusDetailsMotionLaw.revealsDetails(speed: -2400),
            "le sens du défilement ne change rien : seule la vitesse compte."
        )
    }

    func test_revealsDetails_readingSpeed_returnsTrue() {
        XCTAssertTrue(
            FocalFocusDetailsMotionLaw.revealsDetails(speed: 250),
            "à vitesse de lecture, la carte et les détails suivent l'élection comme avant (directive 2026-08-22)."
        )
    }

    func test_revealsDetails_atRest_returnsTrue() {
        XCTAssertTrue(FocalFocusDetailsMotionLaw.revealsDetails(speed: 0))
    }

    func test_speed_firstSample_isZero() {
        var meter = ScrollSpeedMeter()
        meter.note(offset: 400, at: 10)
        XCTAssertEqual(meter.speed, 0, "un seul échantillon ne dit aucune vitesse")
    }

    func test_speed_twoSamples_isPointsPerSecond() {
        var meter = ScrollSpeedMeter()
        meter.note(offset: 400, at: 10)
        meter.note(offset: 440, at: 10.02)
        XCTAssertEqual(meter.speed, 2000, accuracy: 0.5)
    }

    func test_speed_sameInstant_keepsPreviousSpeed() {
        var meter = ScrollSpeedMeter()
        meter.note(offset: 400, at: 10)
        meter.note(offset: 440, at: 10.02)
        meter.note(offset: 700, at: 10.02)
        XCTAssertEqual(
            meter.speed, 2000, accuracy: 0.5,
            "deux rappels dans le même instant (compensation d'offset dans la même transaction) ne sont pas une vitesse infinie"
        )
    }

    func test_speed_afterReset_restartsFromZero() {
        var meter = ScrollSpeedMeter()
        meter.note(offset: 400, at: 10)
        meter.note(offset: 440, at: 10.02)
        meter.reset()
        meter.note(offset: 0, at: 20)
        XCTAssertEqual(meter.speed, 0, "une nouvelle session de défilement ne mesure pas l'écart avec la précédente")
    }
}
