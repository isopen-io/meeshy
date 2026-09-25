import Testing
import SwiftUI
@testable import MeeshyUI

/// Le verre liquide « fait maison » d'avant iOS 26 (#7884).
///
/// Sur iOS 26, `adaptiveLiquidGlass` pose le vrai `glassEffect`. Avant, il
/// compose un verre à la main ; sa recette est une valeur pure, parce qu'un
/// `ViewModifier` ne s'inspecte pas. Ce qui la fait lire comme du VERRE et pas
/// comme un simple flou : un reflet en haut, un liseré plus clair côté lumière
/// que côté ombre, et une ombre portée qui décolle la surface du contenu.
@Suite("LiquidGlassFallbackRecipe")
struct LiquidGlassFallbackRecipeTests {

    @Test("sans teinte, aucun voile coloré ne se pose")
    func untinted_hasNoWash() {
        let recipe = LiquidGlassFallbackRecipe.resolve(isDark: false, isTinted: false)
        #expect(recipe.tintWash == 0)
    }

    @Test("une teinte se lit comme un voile, jamais comme un aplat opaque")
    func tinted_washIsVisibleButTranslucent() {
        let recipe = LiquidGlassFallbackRecipe.resolve(isDark: false, isTinted: true)
        #expect(recipe.tintWash > 0)
        #expect(recipe.tintWash < 0.5)
    }

    @Test("le reflet est plus discret en sombre qu'en clair")
    func sheen_isSofterInDarkMode() {
        let light = LiquidGlassFallbackRecipe.resolve(isDark: false, isTinted: false)
        let dark = LiquidGlassFallbackRecipe.resolve(isDark: true, isTinted: false)
        #expect(light.sheen > 0)
        #expect(dark.sheen > 0)
        #expect(dark.sheen < light.sheen)
    }

    @Test("le liseré est plus clair côté lumière que côté ombre", arguments: [false, true])
    func rim_isBrighterOnTheLitEdge(isDark: Bool) {
        let recipe = LiquidGlassFallbackRecipe.resolve(isDark: isDark, isTinted: false)
        #expect(recipe.rimLit > recipe.rimShade)
        #expect(recipe.rimShade > 0)
    }

    @Test("une ombre portée décolle la surface du contenu", arguments: [false, true])
    func shadow_liftsTheSurface(isDark: Bool) {
        let recipe = LiquidGlassFallbackRecipe.resolve(isDark: isDark, isTinted: false)
        #expect(recipe.shadowOpacity > 0)
        #expect(recipe.shadowRadius > 0)
    }
}
