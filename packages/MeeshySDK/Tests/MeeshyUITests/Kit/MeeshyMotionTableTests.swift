import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K26 — la table de mouvement lue comme des VALEURS : sept jetons, leur version
/// réduite, la cascade, l'avancement piloté, le retour haptique, et la garde de
/// source qui interdit un ressort écrit à la main dans les atomes du kit.
@Suite("MeeshyMotion — la table")
struct MeeshyMotionTableTests {

    private static let file = "K26-MeeshyMotion"

    @Test("les sept jetons rendent la recette des vecteurs")
    func recipe_followsTheVectors() throws {
        let rows = try KitAtomVectors.rows(Self.file, "jetons")
        #expect(rows.count == MeeshyMotionToken.allCases.count)
        for row in rows {
            let token = try #require(MeeshyMotionToken(rawValue: try #require(row["jeton"] as? String)))
            let recipe = MeeshyMotionRecipe.resolve(token: token)
            #expect(recipe.nature.rawValue == row["nature"] as? String, "\(row)")
            #expect(recipe.durationMilliseconds == row["duree"] as? Int, "\(row)")
            #expect(recipe.response == row["reponse"] as? Double, "\(row)")
            #expect(recipe.damping == row["amorti"] as? Double, "\(row)")
            #expect(recipe.delayStepMilliseconds == row["retard"] as? Int, "\(row)")
            #expect(recipe.haptic.rawValue == row["haptique"] as? String, "\(row)")
            #expect(recipe.isReduced == false, "\(row)")
        }
    }

    @Test("reduce : cinq jetons rendent le fondu de 160 ms, les deux boucles s'arrêtent, l'haptique reste")
    func recipe_reduced_isAFadeOrAStop() throws {
        let fade = try KitAtomVectors.load(Self.file)["fonduReduitMs"] as? Int
        for row in try KitAtomVectors.rows(Self.file, "jetons") {
            let token = try #require(MeeshyMotionToken(rawValue: try #require(row["jeton"] as? String)))
            let recipe = MeeshyMotionRecipe.resolve(token: token, reduce: true)
            let expectedHaptic = try #require(row["haptique"] as? String)
            #expect(recipe.isReduced, "\(row)")
            #expect(recipe.haptic.rawValue == expectedHaptic, "l'haptique reste : \(row)")
            switch row["reduit"] as? String {
            case "fade":
                #expect(recipe.reduced == .fade(milliseconds: fade ?? -1), "\(row)")
                #expect(recipe.effectiveDurationMilliseconds == fade, "\(row)")
                #expect(recipe.effectiveDelayStepMilliseconds == 0, "aucune cascade : \(row)")
            default:
                #expect(recipe.reduced == .stop, "\(row)")
                #expect(recipe.effectiveDurationMilliseconds == 0, "\(row)")
            }
        }
    }

    @Test("aucune durée hors boucle ne dépasse 600 ms, cascade de dix blocs comprise")
    func recipe_nonLoop_neverExceedsTheCeiling() throws {
        let ceiling = try #require(try KitAtomVectors.load(Self.file)["plafondHorsBoucleMs"] as? Int)
        #expect(MeeshyMotionRecipe.nonLoopCeilingMilliseconds == ceiling)
        for token in MeeshyMotionToken.allCases {
            let recipe = MeeshyMotionRecipe.resolve(token: token)
            guard recipe.nature != .loop else { continue }
            #expect(recipe.durationMilliseconds <= ceiling, "\(token)")
        }
        let rise = MeeshyMotionRecipe.resolve(token: .rise)
        let lastOfTen = MeeshyMotion.delayMilliseconds(index: 9) + rise.durationMilliseconds
        #expect(lastOfTen <= ceiling)
    }

    @Test("raideur Android = (2π / réponse)² pour chaque ressort")
    func recipe_androidStiffness_followsTheResponse() throws {
        for row in try KitAtomVectors.rows(Self.file, "jetons") {
            let token = try #require(MeeshyMotionToken(rawValue: try #require(row["jeton"] as? String)))
            let recipe = MeeshyMotionRecipe.resolve(token: token)
            guard let expected = row["raideurAndroid"] as? Double else {
                #expect(recipe.androidStiffness == nil, "\(row)")
                continue
            }
            let stiffness = try #require(recipe.androidStiffness)
            #expect(abs(stiffness - expected) < 1, "\(row)")
        }
    }

    @Test("le décalage d'une cascade : 80 ms par rang, rang borné à 3, négatif = 0")
    func cascade_delay_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "cascade") {
            let index = try #require(row["rang"] as? Int)
            let expected = try #require(row["retardMs"] as? Int)
            #expect(MeeshyMotion.delayMilliseconds(index: index) == expected, "\(row)")
            #expect(MeeshyMotion.delay(index: index) == Double(expected) / 1000, "\(row)")
        }
    }

    @Test("l'avancement piloté est borné à 0 et 1, et se reflète en lecture de droite à gauche")
    func progress_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "avancement") {
            let offset = try #require(row["decalage"] as? Double)
            let range = try #require(row["plage"] as? Double)
            #expect(MeeshyMotion.progress(offset: offset, range: 0...range) == row["avancement"] as? Double, "\(row)")
        }
        #expect(MeeshyMotion.progress(offset: 50, range: 0...0) == 1)
        #expect(MeeshyMotion.horizontalSign(isRightToLeft: true) == -1)
        #expect(MeeshyMotion.horizontalSign(isRightToLeft: false) == 1)
    }

    @Test("l'animation d'un jeton : ressort de la table, fondu réduit, boucle sans fin, rien en piloté")
    func animation_followsTheToken() {
        #expect(MeeshyMotion.animation(.morph, reduce: false) == .spring(response: 0.42, dampingFraction: 0.7))
        #expect(MeeshyMotion.animation(.travel, reduce: false) == .spring(response: 0.56, dampingFraction: 0.82))
        #expect(MeeshyMotion.animation(.morph, reduce: true) == .easeOut(duration: 0.16))
        #expect(MeeshyMotion.animation(.collapse, reduce: false) == nil)
        #expect(MeeshyMotion.animation(.float, reduce: true) == nil)
        #expect(MeeshyMotion.animation(.pulse, reduce: true) == nil)
        #expect(MeeshyMotion.animation(.float, reduce: false) != nil)
    }

    @Test("chaque jeton joue son retour une fois ; none et un hôte désactivé ne jouent rien")
    func haptic_isPlayedOnceOrNever() {
        #expect(MeeshyMotion.hapticToPlay(for: .morph) == .light)
        #expect(MeeshyMotion.hapticToPlay(for: .travel) == .medium)
        #expect(MeeshyMotion.hapticToPlay(for: .flip) == .rigid)
        #expect(MeeshyMotion.hapticToPlay(for: .rise) == nil)
        #expect(MeeshyMotion.hapticToPlay(for: .float) == nil)
        #expect(MeeshyMotion.hapticToPlay(for: .pulse) == nil)
        #expect(MeeshyMotion.hapticToPlay(for: .morph, override: MeeshyMotionHaptic.none) == nil)
        #expect(MeeshyMotion.hapticToPlay(for: .morph, override: .rigid) == .rigid)
        #expect(MeeshyMotion.hapticToPlay(for: .morph, isEnabled: false) == nil)
    }

    @Test("pulse : 1 à 3 anneaux ; les trois recettes nommées composent des jetons existants")
    func evolutions_composeTheSevenTokens() {
        #expect(MeeshyMotionRecipe.pulseRings(0) == 1)
        #expect(MeeshyMotionRecipe.pulseRings(2) == 2)
        #expect(MeeshyMotionRecipe.pulseRings(9) == 3)
        for name in MeeshyMotionNamed.allCases {
            let named = MeeshyMotionRecipe.named(name, reduce: false)
            #expect(!named.tokens.isEmpty, "\(name)")
            #expect(named.isReduced == false)
            #expect(MeeshyMotionRecipe.named(name, reduce: true).isReduced, "\(name)")
        }
    }

    @Test("garde de source : aucun ressort, courbe ni durée en clair dans les atomes qui appellent la table")
    func source_noHandWrittenMotionInTheAtoms() throws {
        let atoms = ["MeeshyButton.swift", "MeeshyBadge.swift", "MeeshyMeter.swift", "MeeshyMedallion.swift",
                     "MeeshyNote.swift", "MeeshyKeyHint.swift"]
        for file in atoms {
            let source = try KitAtomVectors.code(file)
            for forbidden in [".spring(", "cubic-bezier(", ".easeInOut(duration", ".easeOut(duration",
                              ".linear(duration", "withAnimation(.default"] {
                #expect(!source.contains(forbidden), "\(file) écrit \(forbidden) à la main")
            }
        }
    }
}
