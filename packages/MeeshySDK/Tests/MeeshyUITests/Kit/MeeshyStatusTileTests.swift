import Testing
@testable import MeeshyUI

/// K34, la tuile d'état : ce qui change quand elle porte un média, quand elle date, et ce qu'elle dit au lecteur
/// d'écran — lus comme des VALEURS.
@Suite("MeeshyStatusTile")
struct MeeshyStatusTileTests {

    @Test("en direct, la tuile garde son trait plein et la teinte de son glyphe")
    func live_keepsSolidBorderAndTint() {
        let recipe = MeeshyStatusTileRecipe.resolve(kind: .ok)
        #expect(recipe.borderDash.isEmpty)
        #expect(recipe.glyphKind == .ok)
        #expect(recipe.mediaOpacity == 1)
        #expect(!recipe.mediaIsDesaturated)
    }

    @Test("périmée, elle passe en pointillé, son glyphe perd sa teinte et son média se désature")
    func stale_dashesAndMutes() {
        let recipe = MeeshyStatusTileRecipe.resolve(kind: .ok, isStale: true, hasMedia: true)
        #expect(recipe.borderDash == MeeshyStatusTileRecipe.staleDash)
        #expect(recipe.glyphKind == .neutral)
        #expect(recipe.mediaIsDesaturated)
        #expect(recipe.mediaOpacity < 1)
    }

    @Test("avec un média, la tuile prend la hauteur d'une miniature et un chiffre plus court")
    func media_setsMinimumHeight() {
        let plain = MeeshyStatusTileRecipe.resolve(kind: .accent)
        let withMedia = MeeshyStatusTileRecipe.resolve(kind: .accent, hasMedia: true)
        #expect(plain.minHeight == 0)
        #expect(withMedia.minHeight == MeeshyStatusTileRecipe.mediaMinHeight)
        #expect(withMedia.valueFontSize < plain.valueFontSize)
    }

    @Test("le lecteur d'écran lit le titre, la valeur puis le détail, en une phrase")
    func spoken_joinsTitleValueDetail() {
        #expect(MeeshyStatusTileRecipe.spoken(title: "Batterie", value: "64 %", detail: "Peut avoir changé")
                == "Batterie, 64 %, Peut avoir changé")
        #expect(MeeshyStatusTileRecipe.spoken(title: "Téléphone", value: "Joignable", detail: nil)
                == "Téléphone, Joignable")
        #expect(MeeshyStatusTileRecipe.spoken(title: "Position", value: "Alfama", detail: "",
                                              label: "Position : Alfama. Ouvrir la carte")
                == "Position : Alfama. Ouvrir la carte")
    }
}
