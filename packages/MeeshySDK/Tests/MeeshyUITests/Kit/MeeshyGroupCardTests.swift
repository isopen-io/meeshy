import Testing
import Foundation
@testable import MeeshyUI

/// K43 — la carte de groupe lue comme des VALEURS : surface, filets, états.
@Suite("MeeshyGroupCard")
struct MeeshyGroupCardTests {

    private static let file = "K43-MeeshyGroupCard"

    @Test("N enfants rendent N − 1 filets, en retrait de 18")
    func dividers_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "filets") {
            let children = try #require(row["enfants"] as? Int)
            #expect(MeeshyGroupCardRecipe.dividerCount(children: children) == row["filets"] as? Int, "\(row)")
        }
        #expect(MeeshyGroupCardRecipe.dividerCount(children: -3) == 0)
        let inset = try #require(try KitAtomVectors.load(Self.file)["retraitFilet"] as? Double)
        #expect(MeeshyGroupCardRecipe.resolve().dividerInset == inset)
    }

    @Test("les fonds suivent les vecteurs : rayon, bord, lavis, opacités")
    func surfaces_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "fonds") {
            let surface = try #require(MeeshyGroupCardSurface(rawValue: row["fond"] as? String ?? ""))
            let recipe = MeeshyGroupCardRecipe.resolve(surface: surface)
            #expect(recipe.cornerRadius == row["rayon"] as? Double, "\(row)")
            #expect(recipe.borderWidth == row["bord"] as? Double, "\(row)")
            #expect(recipe.washOpacity == row["lavis"] as? Double, "\(row)")
            if let border = row["opaciteBord"] as? Double { #expect(recipe.borderOpacity == border, "\(row)") }
            if let divider = row["opaciteFilet"] as? Double { #expect(recipe.dividerOpacity == divider, "\(row)") }
        }
    }

    @Test("dashed n'a pas de fond, solid une encre sombre, glass demande le verre au kit")
    func surfaces_roles() {
        #expect(!MeeshyGroupCardRecipe.resolve(surface: .dashed).hasFill)
        #expect(MeeshyGroupCardRecipe.resolve(surface: .dashed).isBorderDashed)
        #expect(MeeshyGroupCardRecipe.resolve(surface: .solid).usesDarkInk)
        #expect(!MeeshyGroupCardRecipe.resolve(surface: .raised).usesDarkInk)
        #expect(MeeshyGroupCardRecipe.resolve(surface: .glass).usesGlass)
        #expect(!MeeshyGroupCardRecipe.resolve(surface: .raised).usesGlass)
        #expect(MeeshyGroupCardRecipe.resolve(surface: .solid).borderWidth == 0)
    }

    @Test("les gabarits : action à 24 et 148 de haut, en-tête 44, rangées de 60, cartes voisines à 10")
    func layouts() {
        let action = MeeshyGroupCardRecipe.resolve(layout: .action)
        #expect(action.cornerRadius == 24)
        #expect(action.minHeight == 148)
        #expect(MeeshyGroupCardRecipe.resolve().headerHeight == 44)
        #expect(MeeshyGroupCardRecipe.resolve(layout: .group).rowMinHeight == 60)
        #expect(MeeshyGroupCardRecipe.resolve(layout: .group).verticalPadding == 6)
        #expect(MeeshyGroupCardRecipe.neighbourGap == 10)
        #expect(MeeshyGroupCardRecipe.resolve(layout: .preview, isBubble: true).bubbleCornerRadius == 8)
    }

    @Test("pressée seulement si toute la carte se touche ; verrouillée à 42 %, inerte")
    func states() throws {
        let pressed = MeeshyGroupCardRecipe.resolve(isPressable: true, isPressed: true)
        #expect(pressed.scale == 0.97)
        #expect(pressed.lighten == 0.12)
        let inert = MeeshyGroupCardRecipe.resolve(isPressable: false, isPressed: true)
        #expect(inert.scale == 1)
        let locked = MeeshyGroupCardRecipe.resolve(isLocked: true)
        let opacity = try #require(try KitAtomVectors.load(Self.file)["opaciteVerrouillee"] as? Double)
        #expect(locked.contentOpacity == opacity)
        #expect(!locked.isActive)
        #expect(MeeshyGroupCardRecipe.resolve(isFeatured: true).haloWidth == 4)
        #expect(MeeshyGroupCardRecipe.resolve(isFeatured: true).haloOpacity == 0.18)
        #expect(MeeshyGroupCardRecipe.resolve().haloWidth == 0)
    }

    @Test("sans en-tête ni pied, aucune marge ; l'en-tête n'existe qu'avec un sur-titre ou un accessoire")
    func emptySlots() {
        #expect(!MeeshyGroupCardRecipe.showsHeader(hasOverline: false, hasAccessory: false))
        #expect(MeeshyGroupCardRecipe.showsHeader(hasOverline: true, hasAccessory: false))
        #expect(MeeshyGroupCardRecipe.showsHeader(hasOverline: false, hasAccessory: true))
    }

    @Test("garde de source : aucun type du domaine, aucun singleton, aucun rayon hors de la recette")
    func source_isAgnostic() throws {
        let files = ["MeeshyGroupCard.swift", "MeeshyGroupCardRecipe.swift"]
        try KitAssemblyGuards.assertAgnostic(files)
        let view = try KitAtomVectors.code("MeeshyGroupCard.swift")
        #expect(!view.contains("cornerRadius: 2"), "rayon en dur")
        #expect(!view.contains("UIBlurEffect"))
    }
}
