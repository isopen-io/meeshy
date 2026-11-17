import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K47 — les tuiles de choix : colonnes ramenées dans 2 à 4, loi de sélection
/// (unique qui ne se relâche pas, multiple plafonnée), état des tuiles, gardes de source.
@Suite("MeeshyChoiceTiles")
struct MeeshyChoiceTilesTests {

    private static let file = "K47-MeeshyChoiceTiles"

    private static func item(_ id: String, state: MeeshyChoiceItemState = .enabled) -> MeeshyChoiceItem {
        MeeshyChoiceItem(id: id, title: id, state: state)
    }

    @Test("les colonnes sont ramenées dans la plage de 2 à 4")
    func columns_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "colonnes") {
            let asked = try #require(row["demande"] as? Int)
            #expect(MeeshyChoiceTilesRecipe.columns(asked) == row["colonnes"] as? Int, "\(row)")
        }
    }

    @Test("sélection unique : changer de tuile sélectionne, retoucher la choisie ne la relâche pas")
    func single_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "unique") {
            let chosen = row["choisi"] as? String
            let tapped = try #require(row["touche"] as? String)
            let allowsEmpty = try #require(row["vide"] as? Bool)
            let outcome = MeeshyChoiceTilesRecipe.outcome(
                selection: .single(chosen), tapped: Self.item(tapped), allowsEmpty: allowsEmpty, maxSelected: nil)
            switch row["issue"] as? String {
            case "select": #expect(outcome == .select(try #require(row["id"] as? String)), "\(row)")
            case "deselect": #expect(outcome == .deselect(try #require(row["id"] as? String)), "\(row)")
            default: #expect(outcome == .ignored, "\(row)")
            }
        }
    }

    @Test("sélection multiple : on coche, on décoche, le plafond refuse la tuile libre")
    func multiple_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "multiple") {
            let chosen = Set(try #require(row["choisis"] as? [String]))
            let tapped = try #require(row["touche"] as? String)
            let ceiling = try #require(row["plafond"] as? Int)
            let outcome = MeeshyChoiceTilesRecipe.outcome(
                selection: .multiple(chosen), tapped: Self.item(tapped), allowsEmpty: true, maxSelected: ceiling)
            switch row["issue"] as? String {
            case "select": #expect(outcome == .select(tapped), "\(row)")
            case "deselect": #expect(outcome == .deselect(tapped), "\(row)")
            default: #expect(outcome == .ignored, "\(row)")
            }
        }
    }

    @Test("au plafond, les tuiles libres passent en désactivées, les choisies restent actives")
    func ceiling_disablesFreeTiles() {
        let selection = MeeshyChoiceSelection.multiple(["a", "b"])
        #expect(MeeshyChoiceTilesRecipe.isDisabled(Self.item("c"), selection: selection, maxSelected: 2))
        #expect(!MeeshyChoiceTilesRecipe.isDisabled(Self.item("a"), selection: selection, maxSelected: 2))
        #expect(!MeeshyChoiceTilesRecipe.isDisabled(Self.item("c"), selection: selection, maxSelected: nil))
        #expect(MeeshyChoiceTilesRecipe.isDisabled(Self.item("a", state: .disabled), selection: selection, maxSelected: nil))
    }

    @Test("une tuile verrouillée ne se choisit pas, elle annonce son verrou")
    func locked_tile() {
        let locked = Self.item("x", state: .locked(key: "circle.close"))
        #expect(MeeshyChoiceTilesRecipe.outcome(selection: .single(nil), tapped: locked, allowsEmpty: false, maxSelected: nil)
            == .locked("x"))
    }

    @Test("une tuile disabled ne répond pas")
    func disabled_tile() {
        let disabled = Self.item("x", state: .disabled)
        #expect(MeeshyChoiceTilesRecipe.outcome(selection: .single(nil), tapped: disabled, allowsEmpty: false, maxSelected: nil)
            == .ignored)
    }

    @Test("le chiffre de tête fait 40, 30 en quatre colonnes")
    func valueSize_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "chiffre") {
            let columns = try #require(row["colonnes"] as? Int)
            #expect(MeeshyChoiceTilesRecipe.valueFontSize(columns: columns) == row["corps"] as? Double, "\(row)")
        }
    }

    @Test("spansRow rend l'option wide dans une grille carrée ; sans effet pour un autre format")
    func spansRow_widensTheTile() {
        let spanning = MeeshyChoiceItem(id: "w", title: "w", spansRow: true)
        #expect(MeeshyChoiceTilesRecipe.format(for: spanning, base: .square) == .wide)
        #expect(MeeshyChoiceTilesRecipe.format(for: Self.item("n"), base: .square) == .square)
        #expect(MeeshyChoiceTilesRecipe.format(for: spanning, base: .compact) == .compact)
    }

    @Test("la recette d'une tuile : choisie, désactivée à 40 %, tonale ou verre")
    func tileRecipe() {
        let chosen = MeeshyChoiceTilesRecipe.resolve(content: .option, format: .square, surface: .tonal, columns: 2,
                                                     isSelected: true, isPressed: false, state: .enabled)
        #expect(chosen.isSelected && chosen.isInteractive && chosen.opacity == 1)
        let off = MeeshyChoiceTilesRecipe.resolve(content: .option, format: .square, surface: .glass, columns: 2,
                                                  isSelected: false, isPressed: false, state: .disabled)
        #expect(!off.isInteractive && off.opacity == 0.4 && off.usesGlass)
        let locked = MeeshyChoiceTilesRecipe.resolve(content: .option, format: .square, surface: .tonal, columns: 2,
                                                     isSelected: false, isPressed: false, state: .locked(key: "k"))
        #expect(locked.isLocked && locked.isInteractive)
    }

    @Test("le compte dit en multiple vient de l'hôte, jamais de la tuile")
    func countLabel() {
        let label: (Int, Int) -> String = { "\($0) sur \($1)" }
        #expect(MeeshyChoiceTilesRecipe.countText(selection: .multiple(["a"]), maxSelected: 3, label: label) == "1 sur 3")
        #expect(MeeshyChoiceTilesRecipe.countText(selection: .single("a"), maxSelected: 3, label: label) == nil)
        #expect(MeeshyChoiceTilesRecipe.countText(selection: .multiple([]), maxSelected: nil, label: nil) == nil)
    }

    @Test("garde de source : aucune durée, aucun cercle, aucune adresse dans les signatures")
    func source_isAnAgnosticAtom() throws {
        try KitAssemblyGuards.assertAgnostic(["MeeshyChoiceTiles.swift", "MeeshyChoiceTilesRecipe.swift"])
    }
}
