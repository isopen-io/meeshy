import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K48 — le groupe d'avatars : détourage et chevauchement par taille, débordement
/// « +N », grille de deux rangées, loi de sélection par rang, nom dit.
@Suite("MeeshyAvatarGroup")
struct MeeshyAvatarGroupTests {

    private static let file = "K48-MeeshyAvatarGroup"

    @Test("détourage et chevauchement suivent la taille")
    func sizes_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "tailles") {
            let raw = try #require(row["taille"] as? Int)
            let size = try #require(MeeshyAvatarGroupSize(rawValue: raw))
            #expect(MeeshyAvatarGroupRecipe.ringWidth(size) == row["detourage"] as? Double, "\(row)")
            #expect(MeeshyAvatarGroupRecipe.overlap(size) == row["chevauchement"] as? Double, "\(row)")
        }
    }

    @Test("la pile : de 2 à 5 cellules, le reste dit « +N », jamais « +0 », « 99+ » au-delà de 99")
    func stack_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "pile") {
            let count = try #require(row["compte"] as? Int)
            let max = try #require(row["max"] as? Int)
            let recipe = MeeshyAvatarGroupRecipe.resolve(layout: .stack, size: .s40, count: count, max: max)
            #expect(recipe.visibleCount == row["visibles"] as? Int, "\(row)")
            #expect(recipe.overflowCount == row["reste"] as? Int, "\(row)")
            #expect(recipe.overflowText == row["texte"] as? String, "\(row)")
        }
    }

    @Test("la grille : deux rangées au plus, la dernière case porte le « +N »")
    func grid_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "grille") {
            let columns = try #require(row["colonnes"] as? Int)
            let count = try #require(row["compte"] as? Int)
            let max = try #require(row["max"] as? Int)
            let recipe = MeeshyAvatarGroupRecipe.resolve(layout: .grid(columns: columns), size: .s44, count: count, max: max)
            #expect(recipe.visibleCount == row["visibles"] as? Int, "\(row)")
            #expect(recipe.overflowCount == row["reste"] as? Int, "\(row)")
            #expect(recipe.columns == Swift.min(Swift.max(columns, 2), 4), "\(row)")
        }
    }

    @Test("zéro membre : le groupe ne rend rien")
    func empty_rendersNothing() {
        #expect(MeeshyAvatarGroupRecipe.resolve(layout: .stack, size: .s40, count: 0, max: 4).rendersNothing)
        #expect(!MeeshyAvatarGroupRecipe.resolve(layout: .stack, size: .s40, count: 1, max: 4).rendersNothing)
    }

    @Test("le duo exige deux membres, sinon il devient une pile ; la rangée défile sans débordement")
    func duo_and_rail() {
        #expect(MeeshyAvatarGroupRecipe.resolve(layout: .duo, size: .s72, count: 2, max: 4).effectiveLayout == .duo)
        #expect(MeeshyAvatarGroupRecipe.resolve(layout: .duo, size: .s72, count: 3, max: 4).effectiveLayout == .stack)
        let rail = MeeshyAvatarGroupRecipe.resolve(layout: .rail, size: .s56, count: 30, max: 4)
        #expect(rail.visibleCount == 30)
        #expect(rail.overflowCount == 0)
    }

    @Test("sélection unique : un seul choisi, retoucher le choisi le garde")
    func selection_single() {
        let law = MeeshyAvatarGroupSelectionLaw.self
        #expect(law.apply(.single(nil), tapped: 2, isEnabled: nil) == .single(2))
        #expect(law.apply(.single(2), tapped: 4, isEnabled: nil) == .single(4))
        #expect(law.apply(.single(2), tapped: 2, isEnabled: nil) == .single(2))
    }

    @Test("sélection multiple : on coche et on décoche ; une cellule éteinte sort de l'ordre")
    func selection_multiple() {
        let law = MeeshyAvatarGroupSelectionLaw.self
        #expect(law.apply(.multiple([0]), tapped: 2, isEnabled: nil) == .multiple([0, 2]))
        #expect(law.apply(.multiple([0, 2]), tapped: 0, isEnabled: nil) == .multiple([2]))
        #expect(law.apply(.multiple([0]), tapped: 3, isEnabled: { $0 != 3 }) == .multiple([0]))
        #expect(law.apply(.none, tapped: 1, isEnabled: nil) == MeeshyAvatarGroupSelection.none)
    }

    @Test("une cellule éteinte est à 40 % ; le nom dit est le libellé, sinon le résumé")
    func dimming_and_label() {
        #expect(MeeshyAvatarGroupRecipe.disabledOpacity == 0.4)
        #expect(MeeshyAvatarGroupRecipe.spokenLabel(label: "Mina et Léo", summary: "x") == "Mina et Léo")
        #expect(MeeshyAvatarGroupRecipe.spokenLabel(label: nil, summary: "Mina, Kwame et 10 autres") == "Mina, Kwame et 10 autres")
        #expect(MeeshyAvatarGroupRecipe.spokenLabel(label: "", summary: nil) == nil)
    }

    @Test("garde de source : aucun utilisateur, membre, ami ni cercle dans les signatures")
    func source_isAnAgnosticAtom() throws {
        try KitAssemblyGuards.assertAgnostic(["MeeshyAvatarGroup.swift", "MeeshyAvatarGroupRecipe.swift"])
    }
}
