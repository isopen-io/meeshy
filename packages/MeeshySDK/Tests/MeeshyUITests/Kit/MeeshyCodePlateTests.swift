import Testing
import Foundation
@testable import MeeshyUI

/// K31 et le profil : la plaque de code extraite de la carte (`MeeshyCodePlate`), posée
/// à plat ailleurs. Mesures lues dans les vecteurs K31 partagés.
@Suite("MeeshyCodePlate")
struct MeeshyCodePlateTests {
    private static let file = "K31-MeeshyCodeCard.vectors.json"

    @Test("le côté va de 56 à 220")
    func plate_sideRange() throws {
        let row = try KitEvolutionVectors.object(Self.file, "plaqueCotes")
        #expect(MeeshyCodePlateRecipe.sideRange.lowerBound == row["min"] as? Double)
        #expect(MeeshyCodePlateRecipe.sideRange.upperBound == row["max"] as? Double)
    }

    @Test("marge, rayon, boîte, pastille et yeux suivent les vecteurs, côtés bornés")
    func plate_followsTheVectors() throws {
        for row in try KitEvolutionVectors.rows(Self.file, "plaque") {
            let recipe = MeeshyCodePlateRecipe.resolve(side: try #require(row["cote"] as? Double),
                                                       isThumbnail: try #require(row["miniature"] as? Bool))
            #expect(recipe.side == row["coteServi"] as? Double, "\(row)")
            #expect(recipe.margin == row["marge"] as? Double, "\(row)")
            #expect(recipe.radius == row["rayon"] as? Double, "\(row)")
            #expect(recipe.outerSide == row["boite"] as? Double, "\(row)")
            #expect(recipe.centerSide == row["pastille"] as? Double, "\(row)")
            #expect(recipe.tintsEyes == row["yeuxTeintes"] as? Bool, "\(row)")
        }
    }

    @Test("aux trois tailles de la carte, la plaque est celle de la carte", arguments: MeeshyCodeCardSize.allCases)
    func plate_matchesTheCard(size: MeeshyCodeCardSize) {
        let card = MeeshyCodeCardRecipe.resolve(style: .glass, size: size)
        let plate = MeeshyCodePlateRecipe.resolve(side: size.side, isThumbnail: false)
        #expect(plate.margin == card.plateMargin)
        #expect(plate.radius == card.plateRadius)
        #expect((plate.centerSide > 0) == card.hasCenter)
    }

    @Test("un côté illisible vaut le plus petit")
    func plate_nonFinite_isTheSmallest() {
        #expect(MeeshyCodePlateRecipe.resolve(side: .nan, isThumbnail: false).side == 56)
    }

    @Test("une seule plaque : la carte pose la plaque du kit ; ni encodeur, ni type du domaine, ni lecture du payload")
    func source_cardUsesThePlate() throws {
        try KitAssemblyGuards.assertAgnostic(["MeeshyCodePlate.swift"])
        let card = try KitEvolutionVectors.code("MeeshyCodeCard.swift")
        #expect(card.contains("MeeshyCodePlate("))
        #expect(!card.contains("MeeshyCodeMatrix("))
        let plate = try KitEvolutionVectors.code("MeeshyCodePlate.swift")
        for word in ["CIQRCodeGenerator", "print(", "accessibilityLabel(payload", "accessibilityValue(payload"] {
            #expect(!plate.contains(word), "MeeshyCodePlate.swift contient \(word)")
        }
    }
}
