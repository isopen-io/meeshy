import Testing
import Foundation
@testable import MeeshyUI

/// K32 — l'action libellée et sa grille lues comme des VALEURS.
@Suite("MeeshyLabeledAction")
struct MeeshyLabeledActionTests {

    private static let file = "K32-MeeshyLabeledAction"

    @Test("la grille suit les vecteurs : colonnes, rangées, taille")
    func grid_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "grilles") {
            let width = try #require(row["largeur"] as? Double)
            let count = try #require(row["nombre"] as? Int)
            let grid = MeeshyActionGridRecipe.resolve(width: width, count: count)
            #expect(grid.rows == row["rangees"] as? [Int], "\(row)")
            #expect(Double(grid.size.rawValue) == row["taille"] as? Double, "\(row)")
        }
    }

    @Test("pour chaque largeur de 250 à 1024 et chaque compte de 1 à 12 : jamais une action seule, colonnes ≥ 76")
    func grid_neverLeavesALoneAction() {
        for width in stride(from: 250.0, through: 1024, by: 16) {
            for count in 1...12 {
                let grid = MeeshyActionGridRecipe.resolve(width: width, count: count)
                #expect(grid.rows.reduce(0, +) == count, "\(width) \(count)")
                #expect(grid.columnWidth >= 76, "\(width) \(count)")
                #expect(width >= 560 || grid.columns <= 4, "\(width) \(count)")
                if count > 1 { #expect(grid.rows.last != 1, "\(width) \(count) \(grid.rows)") }
                #expect(grid.rows.allSatisfy { $0 <= grid.columns }, "\(width) \(count)")
            }
        }
    }

    @Test("la grille perd une colonne en grande police plutôt que de couper un mot")
    func grid_losesAColumnWithBigText() {
        let normal = MeeshyActionGridRecipe.resolve(width: 390, count: 8)
        let big = MeeshyActionGridRecipe.resolve(width: 390, count: 8, textScale: 2)
        #expect(big.minColumn == 104)
        #expect(big.columns < normal.columns)
    }

    @Test("colonnes fixes : respectées ; zéro action : aucune rangée")
    func grid_fixedAndEmpty() {
        #expect(MeeshyActionGridRecipe.resolve(width: 390, count: 6, columns: .fixed(3)).rows == [3, 3])
        #expect(MeeshyActionGridRecipe.resolve(width: 390, count: 0).rows.isEmpty)
        #expect(MeeshyActionGridRecipe.resolve(width: 390, count: 5, columns: .adaptive(max: 2)).columns == 2)
    }

    @Test("le disque : 56, 60, 64, glyphe à 46 % arrondi aux vecteurs, et le mis en avant à 96")
    func disc_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "disques") {
            let size = try #require(MeeshyLabeledActionSize(rawValue: row["taille"] as? Int ?? 0))
            let recipe = MeeshyLabeledActionRecipe.resolve(size: size)
            #expect(recipe.diameter == Double(size.rawValue), "\(row)")
            #expect(recipe.glyphSize == row["glyphe"] as? Double, "\(row)")
            #expect(KitAssemblyGuards.close(recipe.faceScale, recipe.diameter / 48), "\(row)")
        }
        #expect(MeeshyLabeledActionRecipe.resolve(size: .s60, isFeatured: true).diameter == 96)
    }

    @Test("une cible d'au moins 76 × 88 ; libellé 12, écart 9 ; valeur 20, écart 6")
    func target_andMetrics() {
        let recipe = MeeshyLabeledActionRecipe.resolve()
        #expect(recipe.minTargetWidth == 76)
        #expect(recipe.minTargetHeight == 88)
        #expect(recipe.labelFontSize == 12)
        #expect(recipe.labelGap == 9)
        #expect(recipe.valueHeight == 20)
        #expect(recipe.valueGap == 6)
    }

    @Test("en attente ou désactivée : aucune action ; désactivée à 40 %, glyphe à 45 % en attente")
    func states() {
        #expect(MeeshyLabeledActionRecipe.resolve().isActionable)
        let pending = MeeshyLabeledActionRecipe.resolve(isPending: true)
        #expect(!pending.isActionable)
        #expect(pending.showsRing)
        #expect(pending.glyphOpacity == 0.45)
        let disabled = MeeshyLabeledActionRecipe.resolve(isEnabled: false)
        #expect(!disabled.isActionable)
        #expect(disabled.opacity == 0.4)
        #expect(MeeshyLabeledActionRecipe.resolve(kind: .destructive).isInDestructiveBand)
        #expect(MeeshyLabeledActionRecipe.resolve(kind: .destructive, size: .s64).diameter == 56)
    }

    @Test("la voix suit les vecteurs : attente, valeur, puis la pastille par son libellé, telle qu'elle se voit sinon")
    func speech_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "voix") {
            let said = MeeshyLabeledActionSpeech.value(pending: row["attente"] as? String, value: row["valeur"] as? String,
                                                       badge: row["pastille"] as? String,
                                                       badgeLabel: row["libellePastille"] as? String)
            #expect(said == row["dit"] as? String, "\(row)")
        }
    }

    @Test("garde de source : aucun verre dessiné, aucun type du domaine, aucun singleton")
    func source_isAgnostic() throws {
        let files = ["MeeshyLabeledAction.swift", "MeeshyLabeledActionRecipe.swift"]
        try KitAssemblyGuards.assertAgnostic(files)
        for file in files {
            let source = try KitAtomVectors.code(file)
            #expect(!source.contains(".meeshyGlass("), "\(file)")
            #expect(!source.contains("UIBlurEffect"), "\(file)")
        }
    }
}
