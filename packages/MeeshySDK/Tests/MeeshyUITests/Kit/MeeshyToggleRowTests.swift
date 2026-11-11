import SwiftUI
import XCTest
@testable import MeeshyUI

/// Témoins de comportement de `MeeshyToggleRow` (K06), lus par la recette en valeurs.
final class MeeshyToggleRowTests: XCTestCase {

    // MARK: - Hauteur et contenu

    func test_resolve_anyAccessory_keepsMinimumHeightOf46Points() {
        let recipe = Self.recipe(accessory: .none)
        XCTAssertEqual(recipe.minimumHeight, 46)
    }

    func test_resolve_enabled_keepsFullContentOpacity() {
        XCTAssertEqual(Self.recipe(accessory: .chevron).contentOpacity, 1)
    }

    func test_resolve_disabled_dimsContentToSixtyTwoPercent() {
        let recipe = Self.recipe(accessory: .chevron, isEnabled: false)
        XCTAssertEqual(recipe.contentOpacity, 0.62, accuracy: 0.001)
    }

    // MARK: - Appui et survol

    func test_resolve_pressed_showsVeilOfFifteenPercent() {
        let recipe = Self.recipe(accessory: .chevron, isPressed: true)
        XCTAssertEqual(recipe.veilOpacity, MeeshyOpacity.light, accuracy: 0.001)
    }

    func test_resolve_hovered_showsHalfVeilOfEightPercent() {
        let recipe = Self.recipe(accessory: .chevron, isHovered: true)
        XCTAssertEqual(recipe.veilOpacity, MeeshyOpacity.subtle, accuracy: 0.001)
    }

    func test_resolve_restingRow_hasNoVeil() {
        XCTAssertEqual(Self.recipe(accessory: .chevron).veilOpacity, 0)
    }

    func test_resolve_disabledAndPressed_hasNoVeil() {
        let recipe = Self.recipe(accessory: .chevron, isEnabled: false, isPressed: true)
        XCTAssertEqual(recipe.veilOpacity, 0)
    }

    // MARK: - Variantes et encres

    func test_resolve_destructiveOnLightTheme_usesErrorInk() {
        let recipe = Self.recipe(accessory: .none, kind: .destructive, tone: .theme, isDark: false)
        XCTAssertEqual(recipe.titleColor, MeeshyColors.errorInk)
    }

    func test_resolve_destructiveOnMedia_usesError() {
        let recipe = Self.recipe(accessory: .none, kind: .destructive, tone: .deep, isDark: false)
        XCTAssertEqual(recipe.titleColor, MeeshyColors.error)
    }

    func test_resolve_accentWithoutTint_usesMentionColor() {
        let recipe = Self.recipe(accessory: .none, kind: .accent, tone: .deep, isDark: true)
        XCTAssertEqual(recipe.titleColor, MeeshyColors.mentionColor(isDark: true))
    }

    func test_resolve_accentWithTint_usesTheConversationTint() {
        let recipe = Self.recipe(accessory: .none, kind: .accent, tone: .deep, isDark: true, tint: MeeshyColors.success)
        XCTAssertEqual(recipe.titleColor, MeeshyColors.success)
    }

    func test_resolve_openToggle_paintsTrackWithTint() {
        let recipe = Self.recipe(accessory: .toggle(isOn: true), tint: MeeshyColors.success)
        XCTAssertEqual(recipe.trackOnColor, MeeshyColors.success)
    }

    func test_resolve_openToggleWithoutTint_paintsTrackWithBrand() {
        let recipe = Self.recipe(accessory: .toggle(isOn: true))
        XCTAssertEqual(recipe.trackOnColor, MeeshyColors.brandPrimary)
    }

    // MARK: - Lecture par l'accessibilité

    func test_accessibilityLabel_withSubtitle_joinsTitleAndSubtitle() {
        XCTAssertEqual(
            MeeshyToggleRowRecipe.accessibilityLabel(title: "Tendances", subtitle: "Monde"),
            "Tendances, Monde"
        )
    }

    func test_accessibilityLabel_withBlankSubtitle_dropsTheComma() {
        XCTAssertEqual(
            MeeshyToggleRowRecipe.accessibilityLabel(title: "Tendances", subtitle: "   "),
            "Tendances"
        )
    }

    func test_valueFor_toggle_readsItsState() {
        XCTAssertEqual(MeeshyToggleRowRecipe.valueFor(accessory: .toggle(isOn: false)), .toggle(isOn: false))
    }

    func test_valueFor_check_readsSelection() {
        XCTAssertEqual(MeeshyToggleRowRecipe.valueFor(accessory: .check(isSelected: true)), .selected(true))
    }

    func test_valueFor_value_readsTheText() {
        XCTAssertEqual(MeeshyToggleRowRecipe.valueFor(accessory: .value("Wolof")), .text("Wolof"))
    }

    func test_isChosen_uncheckedChoice_isNotChosen() {
        XCTAssertFalse(MeeshyToggleRowRecipe.isChosen(.check(isSelected: false)))
    }

    // MARK: - Fabrique

    private static func recipe(
        accessory: MeeshyToggleRowAccessory,
        kind: MeeshyToggleRowKind = .normal,
        tone: MeeshyGlassTone? = .deep,
        isDark: Bool = true,
        isEnabled: Bool = true,
        isPressed: Bool = false,
        isHovered: Bool = false,
        tint: Color? = nil
    ) -> MeeshyToggleRowRecipe {
        MeeshyToggleRowRecipe.resolve(
            accessory: accessory,
            kind: kind,
            tone: tone,
            isDark: isDark,
            isEnabled: isEnabled,
            isPressed: isPressed,
            isHovered: isHovered,
            tint: tint
        )
    }
}
