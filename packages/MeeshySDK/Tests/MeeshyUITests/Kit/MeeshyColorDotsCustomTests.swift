import Testing
import Foundation
@testable import MeeshyUI

/// K07 et le profil : la pastille « autre couleur » (spectre, pipette, sélecteur du
/// système) et la variante `swatch` (vignettes peintes par l'hôte). Mesures lues dans
/// les vecteurs K07 partagés.
@Suite("MeeshyColorDots — autre couleur et vignettes")
struct MeeshyColorDotsCustomTests {
    private static let file = "K07-MeeshyColorDots.vectors.json"

    @Test("la pastille « autre couleur » : pipette, spectre de sept teintes de rouge à rouge")
    func custom_followsTheVectors() throws {
        let row = try KitEvolutionVectors.object(Self.file, "autreCouleur")
        #expect(MeeshyColorDotsCustomRecipe.glyph == row["glyphe"] as? String)
        #expect(MeeshyColorDotsCustomRecipe.systemWellDiameter == row["puitsSysteme"] as? Double)
        #expect(MeeshyColorDotsCustomRecipe.hueStops == row["teintes"] as? [Double])
        #expect(MeeshyColorDotsCustomRecipe.spectrumSaturation == row["saturation"] as? Double)
        #expect(MeeshyColorDotsCustomRecipe.spectrumBrightness == row["luminosite"] as? Double)
        #expect(MeeshyColorDotsCustomRecipe.spectrum.count == MeeshyColorDotsCustomRecipe.hueStops.count)
    }

    @Test("le puits du système s'agrandit jusqu'à couvrir la cellule ; une cellule illisible ne l'agrandit pas")
    func custom_pickerScale_coversTheCell() throws {
        for row in try KitEvolutionVectors.rows(Self.file, "autreCouleurEchelle") {
            let cell = try #require(row["cellule"] as? Double)
            #expect(MeeshyColorDotsCustomRecipe.pickerScale(cell: cell) == row["echelle"] as? Double, "\(row)")
        }
        #expect(MeeshyColorDotsCustomRecipe.pickerScale(cell: .nan) == 1)
    }

    @Test("la pastille est un disque du kit : nommée, dégradée, pipette au centre")
    func custom_dot_isAKitDisc() {
        let dot = MeeshyColorDotsCustomRecipe.dot(name: "Autre couleur")
        #expect(dot.name == "Autre couleur")
        #expect(dot.systemImage == "eyedropper")
        guard case .gradient(let colors) = dot.fill else {
            Issue.record("la pastille « autre couleur » est un spectre")
            return
        }
        #expect(colors.count == 7)
    }

    @Test("une vignette : 64 × 44, coins 12, cernée de 2,5 à 3 du bord, 8 entre deux")
    func swatch_followsTheVectors() throws {
        let row = try KitEvolutionVectors.object(Self.file, "swatch")
        #expect(MeeshyColorDotsCustomRecipe.swatchWidth == row["largeur"] as? Double)
        #expect(MeeshyColorDotsCustomRecipe.swatchHeight == row["hauteur"] as? Double)
        #expect(MeeshyColorDotsCustomRecipe.swatchCornerRadius == row["coins"] as? Double)
        #expect(MeeshyColorDotsCustomRecipe.swatchRingGap == row["ecartCercle"] as? Double)
        #expect(MeeshyColorDotsCustomRecipe.swatchRingWidth == row["traitCercle"] as? Double)
        #expect(MeeshyColorDotsCustomRecipe.swatchSpacing == row["espacement"] as? Double)
        #expect(MeeshyColorDotsCustomRecipe.swatchRingCornerRadius == row["coinsCercle"] as? Double)
        #expect(MeeshyColorDotsCustomRecipe.swatchHeight >= 44)
    }

    @Test("le sélecteur est celui du système, sous le disque du kit qui ne prend pas le toucher")
    func source_customDelegatesToTheSystemPicker() throws {
        let code = try KitEvolutionVectors.code("MeeshyColorDotsCustom.swift")
        #expect(code.contains("ColorPicker(label, selection: $color, supportsOpacity: false)"))
        #expect(code.contains(".allowsHitTesting(false)"))
        #expect(code.contains("MeeshyColorDotDisc("))
        #expect(code.contains(".accessibilityAddTraits(isSelected ? .isSelected : [])"))
        for word in ["Color(hex:", "Color.white", "Color.black", "UIColorPickerViewController"] {
            #expect(!code.contains(word), "MeeshyColorDotsCustom.swift contient \(word)")
        }
    }
}
