import XCTest
@testable import MeeshyUI

/// Témoins de la recette de `MeeshyToggleRow` (K06). Rouges tant que le composant n'existe pas.
final class MeeshyToggleRowTests: XCTestCase {

    func test_resolve_toggleOn_usesTrackTint_andReadsOnValue() {
        let recipe = MeeshyToggleRowRecipe.resolve(
            accessory: .toggle(isOn: true),
            kind: .normal,
            tone: .deep,
            isDark: true,
            isEnabled: true,
            isPressed: false,
            isHovered: false,
            hasSubtitle: false,
            tint: nil
        )
        XCTAssertEqual(recipe.minimumHeight, 46)
        XCTAssertEqual(recipe.accessibilityValue, "Activé")
    }

    func test_resolve_disabled_dimsToSixtyTwoPercent_keepsReasonInk() {
        let recipe = MeeshyToggleRowRecipe.resolve(
            accessory: .none,
            kind: .normal,
            tone: .deep,
            isDark: true,
            isEnabled: false,
            isPressed: false,
            isHovered: false,
            hasSubtitle: true,
            tint: nil
        )
        XCTAssertEqual(recipe.contentOpacity, 0.62, accuracy: 0.001)
        XCTAssertEqual(recipe.subtitleOpacity, 0.70, accuracy: 0.001)
    }

    func test_resolve_pressed_differsFromRest() {
        let rest = MeeshyToggleRowRecipe.resolve(accessory: .chevron, kind: .normal, tone: .deep, isDark: true, isEnabled: true, isPressed: false, isHovered: false, hasSubtitle: false, tint: nil)
        let pressed = MeeshyToggleRowRecipe.resolve(accessory: .chevron, kind: .normal, tone: .deep, isDark: true, isEnabled: true, isPressed: true, isHovered: false, hasSubtitle: false, tint: nil)
        XCTAssertNotEqual(rest, pressed)
    }
}
