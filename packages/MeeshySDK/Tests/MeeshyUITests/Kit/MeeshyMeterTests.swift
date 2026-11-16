import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K42 — la jauge lue comme des VALEURS : la loi de la fraction (bornée, jamais
/// de division par zéro), les crans, la recette par hauteur, le genre de la
/// jauge pleine, l'état périmé, la valeur dite, puis les gardes de source.
@Suite("MeeshyMeter")
struct MeeshyMeterTests {

    private static let file = "K42-MeeshyMeter"

    @Test("la fraction est bornée de 0 à 1 ; un total nul ou négatif ne rend aucune vue")
    func fraction_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "fraction") {
            let value = try #require(row["valeur"] as? Double)
            let total = try #require(row["total"] as? Double)
            let result = MeeshyMeterFraction.resolve(value: value, total: total)
            if let expected = row["fraction"] as? Double {
                #expect(abs(try #require(result) - expected) < 0.0001, "\(row)")
            } else {
                #expect(result == nil, "\(row)")
            }
        }
        #expect(MeeshyMeterFraction.resolve(value: .nan, total: 10) == 0)
        #expect(MeeshyMeterFraction.resolve(value: 5, total: .infinity) == nil)
    }

    @Test("chaque cran allumé est une étape faite")
    func segments_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "crans") {
            let count = try #require(row["total"] as? Int)
            let fraction = try #require(row["fraction"] as? Double)
            #expect(MeeshyMeterRecipe.filledSegments(fraction: fraction, count: count) == row["allumes"] as? Int, "\(row)")
        }
        #expect(MeeshyMeterRecipe.filledSegments(fraction: 0.5, count: 0) == 0)
    }

    @Test("hauteurs 5, 8 et 12 ; la piste est une capsule")
    func recipe_sizes_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "tailles") {
            let raw = try #require(row["taille"] as? Int)
            let size = try #require(MeeshyMeterSize(rawValue: raw))
            let recipe = Self.recipe(size: size)
            #expect(recipe.height == row["hauteur"] as? Double, "\(row)")
            #expect(recipe.cornerRadius == recipe.height / 2, "\(row)")
        }
    }

    @Test("à la fraction 1, fullKind s'applique ; périmé l'emporte sur tout genre")
    func recipe_kind_followsTheFraction() {
        #expect(Self.recipe(kind: .accent, fullKind: .ok, fraction: 0.4).kind == .accent)
        #expect(Self.recipe(kind: .accent, fullKind: .ok, fraction: 1).kind == .ok)
        #expect(Self.recipe(kind: .accent, fullKind: nil, fraction: 1).kind == .accent)
        let stale = Self.recipe(kind: .err, fullKind: .ok, fraction: 1, isStale: true)
        #expect(stale.isDesaturated)
        #expect(stale.kind == .err)
        #expect(!Self.recipe(kind: .err, fraction: 0.5).isDesaturated)
    }

    @Test("une fraction absente (total nul) ne rend aucune vue ; indéterminé en rend une sans valeur")
    func recipe_rendering() {
        #expect(!Self.recipe(fraction: nil).isRendered)
        #expect(Self.recipe(fraction: 0).isRendered)
        let indeterminate = Self.recipe(form: .indeterminate, fraction: nil)
        #expect(indeterminate.isRendered)
        #expect(indeterminate.fillFraction == nil)
        #expect(Self.recipe(fraction: 0.46).fillFraction == 0.46)
    }

    @Test("stepped : le nombre de crans est borné de 1 à 12, l'écart suit la hauteur")
    func recipe_stepped() {
        let stepped = Self.recipe(form: .stepped(count: 5), fraction: 0.8)
        #expect(stepped.segmentCount == 5)
        #expect(stepped.filledSegmentCount == 4)
        #expect(Self.recipe(form: .stepped(count: 0), fraction: 0.5).segmentCount == 1)
        #expect(Self.recipe(form: .stepped(count: 99), fraction: 0.5).segmentCount == 12)
        #expect(stepped.stepGap > 0)
    }

    @Test("les repères : fractions de 0 à 1, ignorés en stepped")
    func recipe_marks() {
        #expect(MeeshyMeterRecipe.visibleMarks([-1, 0.5, 2, .nan], form: .continuous) == [0, 0.5, 1])
        #expect(MeeshyMeterRecipe.visibleMarks([0.5], form: .stepped(count: 4)) == [])
    }

    @Test("la valeur dite : le texte de l'hôte, sinon le pourcentage de la langue")
    func spoken_value() {
        let locale = Locale(identifier: "fr")
        #expect(MeeshyMeterRecipe.spokenValue(spoken: "23 sur 50", fraction: 0.46, locale: locale) == "23 sur 50")
        #expect(MeeshyMeterRecipe.spokenValue(spoken: nil, fraction: 0.46, locale: locale)
            .replacingOccurrences(of: "\u{202F}", with: " ").replacingOccurrences(of: "\u{00A0}", with: " ") == "46 %")
        #expect(MeeshyMeterRecipe.spokenValue(spoken: "", fraction: 0.5, locale: locale) != "")
    }

    @Test("l'entrée se joue une fois par valeur vue, jamais sous mouvement réduit")
    func entry_animation() {
        #expect(MeeshyMeterRecipe.entryAnimation(reduce: false, animatesOnAppear: true) != nil)
        #expect(MeeshyMeterRecipe.entryAnimation(reduce: true, animatesOnAppear: true) == nil)
        #expect(MeeshyMeterRecipe.entryAnimation(reduce: false, animatesOnAppear: false) == nil)
    }

    @Test("garde de source : aucun ProgressView(value:), aucune ombre, aucun flou, aucun type du domaine")
    func source_isAnAgnosticAtom() throws {
        for file in ["MeeshyMeter.swift", "MeeshyMeterRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in ["ProgressView(value", ".shadow(", ".blur(", "Color(hex:", ".shared",
                              "MeeshyUser", "MeeshyConversation", "ThemeManager"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    private static func recipe(form: MeeshyMeterForm = .continuous,
                               kind: MeeshyMeterKind = .accent,
                               fullKind: MeeshyMeterKind? = nil,
                               size: MeeshyMeterSize = .s8,
                               fraction: Double? = 0.5,
                               isStale: Bool = false) -> MeeshyMeterRecipe {
        MeeshyMeterRecipe.resolve(form: form, kind: kind, fullKind: fullKind, size: size,
                                  fraction: fraction, isStale: isStale)
    }
}
