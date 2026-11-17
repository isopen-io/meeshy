import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K53 — le pas-à-pas lu comme des VALEURS : la loi du pas (bornée, rend aussi la
/// butée), l'échelle de pas qui grandit, le remplissage de la piste, le nombre
/// d'arrêts, les mots dits, puis les gardes de source.
@Suite("MeeshyStepper")
struct MeeshyStepperTests {

    private static let file = "K53-MeeshyStepper"

    @Test("le pas est borné et rend la butée quand il dépasse")
    func rule_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "pas") {
            let range = try #require(row["min"] as? Int)...(try #require(row["max"] as? Int))
            let step = MeeshyStepperRule.next(value: try #require(row["valeur"] as? Int),
                                              delta: try #require(row["delta"] as? Int),
                                              range: range, step: try #require(row["pas"] as? Int))
            #expect(step.value == row["resultat"] as? Int, "\(row)")
            #expect(step.hitBound == row["butee"] as? Bool, "\(row)")
        }
    }

    @Test("un pas nul ou négatif vaut un pas de un ; la valeur de départ est ramenée dans les bornes")
    func rule_degenerateInputs() {
        #expect(MeeshyStepperRule.next(value: 5, delta: 1, range: 1...10, step: 0).value == 6)
        #expect(MeeshyStepperRule.next(value: 5, delta: 1, range: 1...10, step: -3).value == 6)
        #expect(MeeshyStepperRule.next(value: 99, delta: 0, range: 1...10, step: 1).value == 10)
    }

    @Test("l'échelle de pas grandit avec la valeur : le dernier palier atteint gagne")
    func ladder_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "echelle") {
            let ladder = (try #require(row["paliers"] as? [[String: Int]])).compactMap { rung -> MeeshyStepperRule.Rung? in
                guard let from = rung["depuis"], let step = rung["pas"] else { return nil }
                return MeeshyStepperRule.Rung(from: from, step: step)
            }
            let step = MeeshyStepperRule.step(forValue: try #require(row["valeur"] as? Int),
                                              base: try #require(row["base"] as? Int), ladder: ladder)
            #expect(step == row["pas"] as? Int, "\(row)")
        }
    }

    @Test("l'appui long accélère sans jamais descendre sous le plancher")
    func hold_acceleratesToAFloor() {
        let delays = (0..<40).map { MeeshyStepperRecipe.holdDelayMilliseconds(tick: $0) }
        #expect(delays[0] > delays[1])
        #expect(zip(delays, delays.dropFirst()).allSatisfy { $0 >= $1 })
        #expect(delays.last == MeeshyStepperRecipe.holdFloorMilliseconds)
        #expect(MeeshyStepperRecipe.holdDelayMilliseconds(tick: -5) == delays[0])
    }

    @Test("les mesures de la fiche : capsule 50, marge 3, écart 4, disques de 44 ou 36, cible toujours 44")
    func recipe_measures() throws {
        let measures = try #require(try KitAtomVectors.load(Self.file)["mesures"] as? [String: Double])
        let regular = Self.recipe(kind: .buttons)
        #expect(regular.capsuleHeight == measures["capsule"])
        #expect(regular.capsuleInset == measures["marge"])
        #expect(regular.capsuleGap == measures["ecart"])
        #expect(regular.discDiameter == measures["disque"])
        #expect(Self.recipe(kind: .buttons, size: .compact).discDiameter == measures["disqueCompact"])
        #expect(Self.recipe(kind: .buttons, size: .compact).tapTarget == measures["cible"])
        #expect(regular.valueMinWidth == measures["valeurLargeurMin"])
        #expect(regular.trackHeight == measures["piste"])
        #expect(regular.markCellSize == measures["case"])
        #expect(regular.milestoneTraceHeight == measures["traceJalons"])
    }

    @Test("à la butée, le bouton s'atténue à 36 %")
    func recipe_dimmedAtTheBound() throws {
        let measures = try #require(try KitAtomVectors.load(Self.file)["mesures"] as? [String: Double])
        let atMin = Self.recipe(kind: .buttons, value: 1, range: 1...10)
        #expect(atMin.minusOpacity == measures["dimmed"])
        #expect(atMin.plusOpacity == 1)
        let atMax = Self.recipe(kind: .buttons, value: 10, range: 1...10)
        #expect(atMax.plusOpacity == measures["dimmed"])
        #expect(atMax.minusOpacity == 1)
        let off = Self.recipe(kind: .buttons, value: 5, range: 1...10, isEnabled: false)
        #expect(off.minusOpacity < 1 && off.plusOpacity < 1)
    }

    @Test("piste et jalons : 2 à 5 arrêts, sinon rien n'est rendu")
    func recipe_stopCount() throws {
        for row in try KitAtomVectors.rows(Self.file, "arrets") {
            let count = try #require(row["nombre"] as? Int)
            for kind in [MeeshyStepperKind.track, .milestones] {
                #expect(Self.recipe(kind: kind, stopCount: count).isRendered == row["rendu"] as? Bool, "\(row)")
            }
        }
        #expect(Self.recipe(kind: .buttons, stopCount: 0).isRendered)
    }

    @Test("le remplissage va du premier arrêt au cran choisi ; le choix est ramené dans les bornes")
    func recipe_fill() throws {
        for row in try KitAtomVectors.rows(Self.file, "remplissage") {
            let recipe = Self.recipe(kind: .track, value: try #require(row["choisi"] as? Int),
                                     stopCount: try #require(row["nombre"] as? Int))
            let fraction = try #require(row["fraction"] as? Double)
            #expect(abs(recipe.fillFraction - fraction) < 0.0001, "\(row)")
        }
    }

    @Test("les repères ont une taille donnée par l'hôte, bornée de 10 à 56")
    func recipe_markSizes() throws {
        let measures = try #require(try KitAtomVectors.load(Self.file)["mesures"] as? [String: Double])
        #expect(MeeshyStepperRecipe.markDiameter(requested: 2) == measures["reperMin"])
        #expect(MeeshyStepperRecipe.markDiameter(requested: 99) == measures["reperMax"])
        #expect(MeeshyStepperRecipe.markDiameter(requested: 30) == 30)
        #expect(MeeshyStepperRecipe.markDiameter(requested: nil) == measures["reperMin"])
    }

    @Test("les jalons ne se touchent jamais : ils ne reçoivent aucun geste")
    func recipe_milestonesAreReadOnly() {
        #expect(!Self.recipe(kind: .milestones, stopCount: 4).acceptsGesture)
        #expect(Self.recipe(kind: .track, stopCount: 3).acceptsGesture)
        #expect(Self.recipe(kind: .buttons).acceptsGesture)
        #expect(!Self.recipe(kind: .buttons, isEnabled: false).acceptsGesture)
    }

    @Test("en RTL, la trace et le remplissage partent du bord de début")
    func recipe_layoutDirection() {
        #expect(Self.recipe(kind: .track, stopCount: 3, layoutDirection: .rightToLeft).fillsFromTrailingEdge)
        #expect(!Self.recipe(kind: .track, stopCount: 3, layoutDirection: .leftToRight).fillsFromTrailingEdge)
    }

    @Test("la voix annonce la valeur, pas le geste : le texte de l'hôte, sinon le nombre ou le titre de l'arrêt")
    @MainActor
    func words_areSpoken() throws {
        let fr = try KitAtomVectors.lproj("fr", bundle: .module)
        let locale = Locale(identifier: "fr")
        #expect(MeeshyStepperWords.spokenValue(spoken: "50 entrées", value: 50, stopTitle: nil, locale: locale) == "50 entrées")
        #expect(MeeshyStepperWords.spokenValue(spoken: nil, value: 7, stopTitle: nil, locale: locale) == "7")
        #expect(MeeshyStepperWords.spokenValue(spoken: nil, value: 1, stopTitle: "Quartier", locale: locale) == "Quartier")
        #expect(MeeshyStepperWords.stopPosition(index: 1, of: 3, bundle: fr, locale: locale) == "2 sur 3")
        #expect(MeeshyStepperWords.milestoneState(.done, bundle: fr, locale: locale) == "fait")
        #expect(MeeshyStepperWords.milestoneState(.current, bundle: fr, locale: locale) == "en cours")
        #expect(MeeshyStepperWords.milestoneState(.todo, bundle: fr, locale: locale) == "à faire")
    }

    @Test("garde de source : aucun type du domaine, aucun singleton, aucune ombre ni flou")
    func source_isAnAgnosticAtom() throws {
        for file in ["MeeshyStepper.swift", "MeeshyStepperRecipe.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in [".shared", "MeeshyUser", "MeeshyConversation", "RelationLevel", "ThemeManager",
                              "Color(hex:", ".shadow(", ".blur("] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }

    private static func recipe(kind: MeeshyStepperKind = .buttons,
                               size: MeeshyStepperSize = .regular,
                               value: Int = 3,
                               range: ClosedRange<Int> = 1...10,
                               stopCount: Int = 0,
                               isPressed: Bool = false,
                               isEnabled: Bool = true,
                               layoutDirection: LayoutDirection = .leftToRight,
                               reduceMotion: Bool = false) -> MeeshyStepperRecipe {
        MeeshyStepperRecipe.resolve(kind: kind, size: size, value: value, range: range, stopCount: stopCount,
                                    isPressed: isPressed, isEnabled: isEnabled, layoutDirection: layoutDirection,
                                    reduceMotion: reduceMotion)
    }
}
