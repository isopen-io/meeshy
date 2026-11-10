import XCTest
@testable import Meeshy

/// #17323 — la loi pure qui choisit le traitement de verre de CHAQUE bouton de
/// l'appel : Liquid Glass interactif quand l'OS le permet, verre dessiné sinon,
/// Fin toujours rouge, actif toujours blanc plein à icône sombre.
@MainActor
final class CallButtonGlassRuleTests: XCTestCase {

    private let allKinds: [CallPillButtonKind] = [.normal, .active, .destructive, .warning]

    func test_everyButtonKind_isInteractiveGlass_onEveryOS() {
        for kind in allKinds {
            for available in [true, false] {
                let treatment = CallButtonGlassRule.treatment(for: kind, isLiquidGlassAvailable: available)
                XCTAssertTrue(treatment.isInteractive, "\(kind) doit répondre au toucher (available: \(available))")
            }
        }
    }

    func test_neutralButtons_areLiquidGlassWithoutAnyBacking() {
        for kind in [CallPillButtonKind.normal, .warning] {
            let treatment = CallButtonGlassRule.treatment(for: kind, isLiquidGlassAvailable: true)
            XCTAssertEqual(treatment.surface, .liquidGlass)
            XCTAssertFalse(treatment.hasSolidWhiteBacking, "Un bouton inactif est du verre, pas un disque posé")
        }
    }

    func test_activeButton_staysSolidWhite_soTheDarkGlyphKeepsItsContrast() {
        for available in [true, false] {
            let treatment = CallButtonGlassRule.treatment(for: .active, isLiquidGlassAvailable: available)
            XCTAssertEqual(treatment.surface, .liquidGlass)
            XCTAssertTrue(treatment.hasSolidWhiteBacking)
        }
    }

    func test_endButton_staysRed_onEveryOS() {
        for available in [true, false] {
            let treatment = CallButtonGlassRule.treatment(for: .destructive, isLiquidGlassAvailable: available)
            XCTAssertEqual(treatment.surface, .prominentRed, "Fin reste rouge, sur iOS 26 comme avant")
            XCTAssertFalse(treatment.hasSolidWhiteBacking)
        }
    }

    func test_onlyEndButton_isRed() {
        for kind in [CallPillButtonKind.normal, .active, .warning] {
            XCTAssertNotEqual(CallButtonGlassRule.treatment(for: kind, isLiquidGlassAvailable: true).surface, .prominentRed)
        }
    }

    func test_pressHighlight_isDrawnOnlyWhereTheGlassDoesNotReactItself() {
        for kind in allKinds {
            XCTAssertFalse(
                CallButtonGlassRule.treatment(for: kind, isLiquidGlassAvailable: true).drawsPressHighlight,
                "iOS 26 : le verre interactif réagit seul, comme l'en-tête de conversation"
            )
            XCTAssertTrue(
                CallButtonGlassRule.treatment(for: kind, isLiquidGlassAvailable: false).drawsPressHighlight,
                "iOS 16 à 25 : le verre dessiné s'éclaircit sous le doigt"
            )
        }
    }

    func test_pressScale_glassThatPressesItself_doesNotShrinkAgain() {
        XCTAssertEqual(CallPressFeedback.scale(isPressed: true, reduceMotion: false, glassPressesItself: true), 1)
        XCTAssertEqual(CallPressFeedback.scale(isPressed: true, reduceMotion: false, glassPressesItself: false), 0.88, accuracy: 0.0001)
        XCTAssertEqual(CallPressFeedback.scale(isPressed: true, reduceMotion: false), 0.88, accuracy: 0.0001)
    }
}
