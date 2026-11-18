import Testing
import Foundation
@testable import MeeshyUI

/// K33 en disposition `ladder` (profil) : l'échelle verticale, le plus haut niveau en
/// haut, des nœuds reliés, le niveau courant plein et cerné, ceux au-dessus en tirets.
/// Mesures lues dans les vecteurs K33 partagés.
@Suite("MeeshyCircleScale — échelle verticale")
struct MeeshyCircleScaleLadderTests {
    private static let file = "K33-MeeshyCircleScale.vectors.json"

    @Test("les quatre formes, nommées comme les vecteurs")
    func forms_followTheVectors() throws {
        let names = try #require(try KitEvolutionVectors.json(Self.file)["formes"] as? [String])
        #expect(MeeshyCircleScaleForm.allCases.map(\.rawValue) == names)
    }

    @Test("nœud 26, écart 5, trait 2, halo 4")
    func ladder_measures() throws {
        let row = try KitEvolutionVectors.object(Self.file, "echelle")
        #expect(MeeshyCircleScaleRecipe.ladderNodeDiameter == row["noeud"] as? Double)
        #expect(MeeshyCircleScaleRecipe.ladderRowGap == row["ecart"] as? Double)
        #expect(MeeshyCircleScaleRecipe.ladderLineWidth == row["trait"] as? Double)
        #expect(MeeshyCircleScaleRecipe.ladderHaloWidth == row["halo"] as? Double)
    }

    @Test("le plus haut niveau se lit en haut")
    func ladder_order_topFirst() throws {
        for row in try KitEvolutionVectors.rows(Self.file, "echelleOrdre") {
            let count = try #require(row["niveaux"] as? Int)
            #expect(MeeshyCircleScaleRecipe.ladderOrder(count: count) == row["ordre"] as? [Int], "\(row)")
        }
        #expect(MeeshyCircleScaleRecipe.ladderOrder(count: -2).isEmpty)
    }

    @Test("atteint en dessous, courant, à venir au-dessus ; sans niveau courant, rien ne s'allume")
    func ladder_nodes_followTheVectors() throws {
        for row in try KitEvolutionVectors.rows(Self.file, "echelleNoeuds") {
            let level = try #require(row["niveau"] as? Int)
            let node = MeeshyCircleScaleRecipe.ladderNode(level: level, current: row["courant"] as? Int)
            #expect(node.rawValue == row["etat"] as? String, "\(row)")
        }
    }

    @Test("l'échelle est dessinée dans le fichier de K33, sans couleur en dur ni geste propre")
    func source_ladderStaysInTheScale() throws {
        let code = try KitEvolutionVectors.code("MeeshyCircleScale.swift")
        #expect(code.contains("case .ladder: ladder(recipe: recipe)"))
        #expect(code.contains("MeeshyCircleScaleRecipe.ladderOrder(count: levels.count)"))
        for word in ["Color(hex:", "Color(red:", "onTapGesture", "DragGesture"] {
            #expect(!code.contains(word), "MeeshyCircleScale.swift contient \(word)")
        }
    }
}
