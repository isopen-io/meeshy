import Testing
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("ResolvedThemePalette")
struct ResolvedThemePaletteTests {

    @Test("la palette injectée l'emporte sur le colorScheme local")
    func injectedPaletteWinsOverLocalColorScheme() {
        let resolved = ThemePalette.resolved(injected: ThemePalette(mode: .dark), colorScheme: .light)

        #expect(resolved.isDark)
    }

    @Test("sans injection, la palette suit le colorScheme")
    func fallsBackToColorSchemeWithoutInjection() {
        let resolved = ThemePalette.resolved(injected: nil, colorScheme: .dark)

        #expect(resolved == ThemePalette(colorScheme: .dark))
    }

    @Test("l'environnement n'injecte aucune palette par défaut")
    @MainActor
    func environmentDefaultIsNil() {
        #expect(EnvironmentValues().themePalette == nil)
    }

    @Test("meeshyThemeRoot injecte la palette du gestionnaire")
    @MainActor
    func meeshyThemeRootInjectsPalette() {
        var environment = EnvironmentValues()

        environment.themePalette = ThemeManager.shared.palette

        #expect(environment.themePalette?.mode == ThemeManager.shared.mode)
    }
}
