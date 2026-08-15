import XCTest
@testable import Meeshy

/// LWS-6 (contrat §4.3) — `LentilleSticker`, vue pure. Pas de framework de
/// rendu SwiftUI dans ce bundle de tests (ni ViewInspector, ni snapshot) :
/// la logique testable est extraite en fonctions/propriétés PURES sur le
/// type lui-même (`displayTitle`, `letterSpacing`), exercées directement —
/// même patron que `LentilleSectionResolver`/`ScrollTimePillLaw`.
final class LentilleStickerTests: XCTestCase {

    // MARK: - Majuscules (§4.3 « majuscules »)

    func test_displayTitle_uppercasesLowercaseInput() {
        XCTAssertEqual(LentilleSticker.displayTitle("aujourd'hui"), "AUJOURD'HUI")
    }

    func test_displayTitle_leavesAlreadyUppercaseUnchanged() {
        XCTAssertEqual(LentilleSticker.displayTitle("PINNED"), "PINNED")
    }

    func test_displayTitle_uppercasesMixedCaseAccentedInput() {
        XCTAssertEqual(LentilleSticker.displayTitle("Épinglées"), "ÉPINGLÉES")
    }

    // MARK: - Letter-spacing `.1em` (§4.3) dérivé de LentilleMetrics, jamais un point fixe

    func test_letterSpacing_isDerivedFromMetricsSizeAndEm() {
        let expected = LentilleMetrics.Sticker.size * LentilleMetrics.Sticker.letterSpacingEm
        XCTAssertEqual(LentilleSticker.letterSpacing, expected)
    }

    func test_letterSpacing_isPositive() {
        // Un tracking négatif ou nul romprait la lisibilité du sticker —
        // garde de sanité minimale sur la valeur dérivée.
        XCTAssertGreaterThan(LentilleSticker.letterSpacing, 0)
    }
}
