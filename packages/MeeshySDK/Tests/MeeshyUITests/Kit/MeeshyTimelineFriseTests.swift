import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K22 — la frise du temps, lue comme des VALEURS. Squelette : le témoin rouge
/// précède le composant.
@Suite("MeeshyTimelineFrise")
struct MeeshyTimelineFriseTests {

    @Test("déplacer une barre garde sa durée et la borne à la scène")
    func rule_dragged_move_keepsSpanAndStaysInScene() {
        let rule = MeeshyTimelineFriseRule(duration: 6, minimumSpan: 0.3)
        #expect(rule.dragged(1...3, part: .move, by: 10) == 4...6)
    }
}
