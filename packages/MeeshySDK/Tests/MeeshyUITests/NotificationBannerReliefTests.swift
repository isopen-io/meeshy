import XCTest
@testable import MeeshyUI

/// #8723 — la bannière in-app se BALAIE vers le haut pour se fermer, se tire
/// vers le bas pour s'ouvrir en aperçu, et garde son texte lisible sous le verre.
@MainActor
final class NotificationBannerReliefTests: XCTestCase {

    func test_outcome_swipedUpPastThreshold_dismisses() {
        XCTAssertEqual(NotificationBannerSwipe.outcome(translation: -40, predictedEnd: -40), .dismiss)
    }

    func test_outcome_flickedUp_dismissesEvenIfShort() {
        XCTAssertEqual(NotificationBannerSwipe.outcome(translation: -12, predictedEnd: -120), .dismiss)
    }

    func test_outcome_pulledDown_opensThePreview() {
        XCTAssertEqual(NotificationBannerSwipe.outcome(translation: 50, predictedEnd: 60), .preview)
    }

    func test_outcome_smallJitter_doesNothing() {
        XCTAssertEqual(NotificationBannerSwipe.outcome(translation: 8, predictedEnd: 10), .none)
        XCTAssertEqual(NotificationBannerSwipe.outcome(translation: -10, predictedEnd: -20), .none)
    }

    /// Le voile sous le verre reste DENSE : le verre donne la matière, mais le
    /// texte du thème doit garder son contraste sur une photo ou une vidéo.
    func test_scrimOpacity_staysDenseEnoughForLegibility_inBothThemes() {
        XCTAssertGreaterThanOrEqual(NotificationToastView.scrimOpacity(isDark: true), 0.7)
        XCTAssertGreaterThanOrEqual(NotificationToastView.scrimOpacity(isDark: false), 0.7)
        XCTAssertLessThan(NotificationToastView.scrimOpacity(isDark: true), 1.0)
    }
}
