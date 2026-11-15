import XCTest
import SwiftUI
@testable import MeeshyUI

/// **Une seule implémentation par brique** (#9891) : les points de frappe et
/// la pulsation. Les copies app-side ont été retirées ; ces témoins disent ce
/// que l'atome unique doit continuer de rendre, pour qu'aucun appelant ne voie
/// la différence.
@MainActor
final class MediaBrickUnicityTests: XCTestCase {

    // MARK: - Points de frappe

    func test_typingDots_keepTheHistoricalCadence() {
        XCTAssertEqual(MeeshyTypingDots.dotSize, 5)
        XCTAssertEqual(MeeshyTypingDots.period, 0.5)
        XCTAssertEqual(MeeshyTypingDots.stagger, 0.18)
    }

    func test_typingDots_pulseBetweenHalfAndFullSize_whileMotionIsAllowed() {
        XCTAssertEqual(MeeshyTypingDots.scale(isAnimating: false, restsStill: false), 0.5)
        XCTAssertEqual(MeeshyTypingDots.opacity(isAnimating: false, restsStill: false), 0.4)
        XCTAssertEqual(MeeshyTypingDots.scale(isAnimating: true, restsStill: false), 1.0)
        XCTAssertEqual(MeeshyTypingDots.opacity(isAnimating: true, restsStill: false), 1.0)
    }

    /// Figés à la phase basse, ils se liraient comme un contrôle éteint : leur
    /// présence dit déjà « quelqu'un écrit ».
    func test_typingDots_restAtTheHighPhase_underReduceMotion_evenBeforeAppearing() {
        XCTAssertEqual(MeeshyTypingDots.scale(isAnimating: false, restsStill: true), 1.0)
        XCTAssertEqual(MeeshyTypingDots.opacity(isAnimating: false, restsStill: true), 1.0)
    }

    // MARK: - Pulsation

    func test_pulse_carriesTheMessageEffectCadence() {
        let message = PulseEffect(intensity: 0.02, period: 1.0)
        XCTAssertEqual(message.intensity, 0.02)
        XCTAssertEqual(message.period, 1.0)

        let historical = PulseEffect()
        XCTAssertEqual(historical.intensity, 0.04, "les appelants sans réglage gardent leur amplitude")
        XCTAssertEqual(historical.period, 1.8, "et leur respiration")
    }

    func test_pulse_anInactiveEffect_startsNoEndlessLoop() {
        XCTAssertFalse(PulseEffect.pulses(intensity: 0, reduceMotion: false))
        XCTAssertFalse(PulseEffect.pulses(intensity: 0.02, reduceMotion: true))
        XCTAssertTrue(PulseEffect.pulses(intensity: 0.02, reduceMotion: false))
    }
}
