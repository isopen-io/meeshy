import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

@MainActor
final class ThemePaletteTests: XCTestCase {

    private let modes: [ThemeMode] = [.dark, .light]

    func test_initColorScheme_dark_resolvesDarkMode() {
        XCTAssertEqual(ThemePalette(colorScheme: .dark).mode, .dark)
    }

    func test_initColorScheme_light_resolvesLightMode() {
        XCTAssertEqual(ThemePalette(colorScheme: .light).mode, .light)
    }

    func test_isDark_followsMode() {
        XCTAssertTrue(ThemePalette(mode: .dark).isDark)
        XCTAssertFalse(ThemePalette(mode: .light).isDark)
    }

    func test_textAndBackgroundColors_matchMeeshyColorsForEachMode() {
        for mode in modes {
            let palette = ThemePalette(mode: mode)
            let isDark = mode.isDark
            XCTAssertEqual(palette.textPrimary, MeeshyColors.textPrimary(isDark: isDark))
            XCTAssertEqual(palette.textSecondary, MeeshyColors.textSecondary(isDark: isDark))
            XCTAssertEqual(palette.textMuted, MeeshyColors.textMuted(isDark: isDark))
            XCTAssertEqual(palette.backgroundPrimary, MeeshyColors.backgroundPrimary(isDark: isDark))
            XCTAssertEqual(palette.backgroundSecondary, MeeshyColors.backgroundSecondary(isDark: isDark))
        }
    }

    func test_inputBackground_perMode() {
        XCTAssertEqual(ThemePalette(mode: .dark).inputBackground, Color(hex: "16142A"))
        XCTAssertEqual(ThemePalette(mode: .light).inputBackground, Color(hex: "F5F3FF"))
    }

    func test_buttonShadow_opacityPerMode() {
        XCTAssertEqual(ThemePalette(mode: .dark).buttonShadow(color: "6366F1"), Color(hex: "6366F1").opacity(0.5))
        XCTAssertEqual(ThemePalette(mode: .light).buttonShadow(color: "6366F1"), Color(hex: "6366F1").opacity(0.3))
    }

    func test_ambientOrbs_opacityPerMode() {
        XCTAssertEqual(ThemePalette(mode: .dark).ambientOrbs.map(\.opacity), [0.10, 0.10, 0.08, 0.06])
        XCTAssertEqual(ThemePalette(mode: .light).ambientOrbs.map(\.opacity), [0.05, 0.05, 0.04, 0.03])
    }

    func test_surface_defaultIntensityHalvedInLight() {
        XCTAssertEqual(ThemePalette(mode: .dark).surface(tint: "6366F1"), Color(hex: "6366F1").opacity(0.15))
        XCTAssertEqual(ThemePalette(mode: .light).surface(tint: "6366F1"), Color(hex: "6366F1").opacity(0.075))
    }

    func test_accentText_matchesDynamicColorGenerator() {
        for mode in modes {
            let expected = Color(hex: DynamicColorGenerator.adaptedColor("6366F1", for: mode))
            XCTAssertEqual(ThemePalette(mode: mode).accentText("6366F1"), expected)
        }
    }

    func test_equatable_comparesMode() {
        XCTAssertEqual(ThemePalette(mode: .dark), ThemePalette(colorScheme: .dark))
        XCTAssertNotEqual(ThemePalette(mode: .dark), ThemePalette(mode: .light))
    }

    func test_themeManager_readsDelegateToPalette() {
        let manager = ThemeManager.shared
        let palette = manager.palette
        XCTAssertEqual(palette.mode, manager.mode)
        XCTAssertEqual(manager.textPrimary, palette.textPrimary)
        XCTAssertEqual(manager.backgroundPrimary, palette.backgroundPrimary)
        XCTAssertEqual(manager.inputBackground, palette.inputBackground)
        XCTAssertEqual(manager.inputBorder, palette.inputBorder)
    }
}
