import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K33 — l'échelle de proximité lue comme des VALEURS : la loi d'intensité comptée
/// depuis le haut, les bornes du rang courant, les tailles de pilule, les mots dits,
/// puis les gardes de source (aucune valeur d'intensité hors de la recette).
@Suite("MeeshyCircleScale")
struct MeeshyCircleScaleTests {

    private static let file = "K33-MeeshyCircleScale"

    @Test("chaque rang rend l'intensité du tableau, comptée depuis le haut ; trois niveaux ou moins sautent un cran")
    func intensity_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "intensite") {
            let count = try #require(row["niveaux"] as? Int)
            let expected = try #require(row["intensites"] as? [Double])
            let rendered = (0..<count).map { MeeshyCircleScaleRecipe.intensity(level: $0, of: count) }
            #expect(rendered == expected, "\(row)")
        }
    }

    @Test("le même nom garde sa place relative : le plus haut est toujours plein")
    func intensity_topIsAlwaysFull() {
        for count in 2...8 {
            #expect(MeeshyCircleScaleRecipe.intensity(level: count - 1, of: count) == 1)
            #expect(MeeshyCircleScaleRecipe.intensity(level: count - 2, of: count) < 1)
        }
    }

    @Test("un rang hors bornes est ramené ; un niveau seul vaut zéro")
    func current_isClamped() throws {
        for row in try KitAtomVectors.rows(Self.file, "bornes") {
            let count = try #require(row["niveaux"] as? Int)
            let current = try #require(row["courant"] as? Int)
            #expect(MeeshyCircleScaleRecipe.clamped(current, count: count) == row["attendu"] as? Int, "\(row)")
        }
        #expect(MeeshyCircleScaleRecipe.clamped(nil, count: 4) == nil)
    }

    @Test("le nombre de niveaux est borné de 2 à 8 ; sinon rien n'est rendu")
    func recipe_levelCount() {
        #expect(!Self.recipe(count: 1).isRendered)
        #expect(Self.recipe(count: 2).isRendered)
        #expect(Self.recipe(count: 8).isRendered)
        #expect(!Self.recipe(count: 9).isRendered)
    }

    @Test("la pilule fait 26, 34 ou 44 ; les mesures sont celles de la fiche")
    func recipe_sizes_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "tailles") {
            let name = try #require(row["taille"] as? String)
            let size = try #require(MeeshyCircleScaleSize(rawValue: name))
            #expect(Self.recipe(form: .pill, size: size).pillHeight == row["pilule"] as? Double, "\(row)")
        }
        let measures = try #require(try KitAtomVectors.load(Self.file)["mesures"] as? [String: Double])
        let recipe = Self.recipe()
        #expect(recipe.dotDiameter == measures["pastille"])
        #expect(Self.recipe(size: .compact).stepHeight == measures["cran"])
        #expect(recipe.ringStroke == measures["traitAnneau"])
        #expect(recipe.litRingStroke == measures["traitAllume"])
        #expect(recipe.ringGap == measures["ecartAnneaux"])
        #expect(Self.recipe(isPressed: true).pressedScale == measures["pressedScale"])
        #expect(recipe.pressedScale == 1)
        #expect(Self.recipe(isEnabled: false).opacity == measures["disabledOpacity"])
        #expect(recipe.opacity == 1)
    }

    @Test("le rang courant est le seul allumé ; sans courant, aucun")
    func recipe_litLevel() {
        let lit = Self.recipe(current: 2)
        #expect(lit.litLevel == 2)
        #expect(Self.recipe(current: nil).litLevel == nil)
        #expect(Self.recipe(current: 40).litLevel == 5)
    }

    @Test("pilule : seul le rang courant s'affiche ; anneaux : le second rang est en tirets, ignoré par la pilule")
    func recipe_otherLevel() {
        #expect(Self.recipe(current: 4, other: 5, form: .rings).otherLevel == 5)
        #expect(Self.recipe(current: 4, other: 5, form: .pill).otherLevel == nil)
        #expect(Self.recipe(current: 4, other: 99, form: .rings).otherLevel == 5)
    }

    @Test("l'encre est sombre dès que le fond est assez plein ; elle suit l'intensité, pas la teinte")
    func recipe_ink() {
        #expect(MeeshyCircleScaleRecipe.usesDarkInk(intensity: 1))
        #expect(MeeshyCircleScaleRecipe.usesDarkInk(intensity: 0.52))
        #expect(!MeeshyCircleScaleRecipe.usesDarkInk(intensity: 0.32))
        #expect(!MeeshyCircleScaleRecipe.usesDarkInk(intensity: 0))
    }

    @Test("les comptes de même longueur que les niveaux sont gardés, sinon ignorés")
    func counts_sameLength() {
        #expect(MeeshyCircleScaleRecipe.validCounts([1, 2, 3], levelCount: 3) == [1, 2, 3])
        #expect(MeeshyCircleScaleRecipe.validCounts([1, 2], levelCount: 3) == nil)
        #expect(MeeshyCircleScaleRecipe.validCounts([1, -2, 3], levelCount: 3) == [1, 0, 3])
        #expect(MeeshyCircleScaleRecipe.validCounts(nil, levelCount: 3) == nil)
    }

    @Test("zéro s'écrit « 0 » : un niveau sans personne garde sa pastille")
    func counts_zeroIsAnAnswer() {
        let locale = Locale(identifier: "fr")
        #expect(MeeshyCircleScaleRecipe.countText(0, locale: locale) == "0")
        #expect(MeeshyCircleScaleRecipe.countText(128, locale: locale)
            .replacingOccurrences(of: "\u{202F}", with: "").replacingOccurrences(of: "\u{00A0}", with: "") == "128")
    }

    @Test("le niveau est toujours dit en mots : « Proche, 5 sur 6 » ; un compte se dit avec son nom")
    @MainActor
    func words_areSpoken() throws {
        let fr = try KitAtomVectors.lproj("fr", bundle: .module)
        let locale = Locale(identifier: "fr")
        #expect(MeeshyCircleScaleWords.spokenValue(title: "Proche", level: 4, of: 6, bundle: fr, locale: locale) == "Proche, 5 sur 6")
        #expect(MeeshyCircleScaleWords.spokenCount(title: "Ami", count: 3, locale: locale) == "Ami, 3")
        let en = try KitAtomVectors.lproj("en", bundle: .module)
        #expect(MeeshyCircleScaleWords.spokenValue(title: "Close", level: 4, of: 6, bundle: en, locale: Locale(identifier: "en")) == "Close, 5 of 6")
    }

    @Test("garde de source : aucun type du domaine, aucun singleton, aucune intensité hors de la recette, aucune couleur par niveau")
    func source_isAnAgnosticAtom() throws {
        for file in ["MeeshyCircleScale.swift", "MeeshyCircleScaleRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in [".shared", "MeeshyUser", "MeeshyConversation", "RelationLevel", "ThemeManager",
                              "CircleLevelColor", "Color(hex:", ".shadow(", ".blur("] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
        let view = try KitAtomVectors.code("MeeshyCircleScale.swift")
        for literal in ["0.52", "0.32", "0.18", "0.08"] {
            #expect(!view.contains(literal), "la vue réécrit l'intensité \(literal)")
        }
    }

    private static func recipe(count: Int = 6,
                               current: Int? = 3,
                               other: Int? = nil,
                               form: MeeshyCircleScaleForm = .dots,
                               size: MeeshyCircleScaleSize = .regular,
                               isPressed: Bool = false,
                               isEnabled: Bool = true) -> MeeshyCircleScaleRecipe {
        MeeshyCircleScaleRecipe.resolve(count: count, current: current, other: other, form: form, size: size,
                                        isPressed: isPressed, isEnabled: isEnabled)
    }
}
