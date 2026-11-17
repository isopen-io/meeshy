import Testing
import Foundation
@testable import MeeshyUI

/// La seconde série d'atomes (K33, K35, K37, K38 squelette, K51, K53) tient la même
/// loi que la première : les deux moitiés de « réduire les animations » (celle du
/// système et celle que l'app impose), et aucun mouvement posé hors de la table.
@Suite("Atomes du kit, seconde série : réduction et mouvement")
struct KitAtomsSecondSeriesTests {

    private static let views = ["MeeshyCircleScale.swift", "MeeshyWavePlayer.swift", "MeeshyWaveBars.swift",
                                "MeeshyLockedRow.swift", "MeeshyTranslationMark.swift", "MeeshyStepper.swift",
                                "MeeshySkeleton.swift"]

    @Test("chaque vue lit la réduction du système ET celle que l'app impose, et les combine")
    func reduceMotion_readsBothHalves() throws {
        for file in Self.views {
            let source = try KitAtomVectors.code(file)
            let system = source.components(separatedBy: "@Environment(\\.accessibilityReduceMotion)").count - 1
            let forced = source.components(separatedBy: "@Environment(\\.meeshyForceReduceMotion)").count - 1
            #expect(system > 0, "\(file) ne lit pas la réduction")
            #expect(system == forced, "\(file) : \(system) lecture(s) système, \(forced) lecture(s) forcée(s)")
            #expect(source.contains("MeeshyMotion.shouldReduce("), "\(file) ne combine pas les deux moitiés")
        }
    }

    @Test("aucune animation ni aucun ressort écrit à la main : tout passe par la table de mouvement")
    func motion_comesFromTheTable() throws {
        for file in Self.views {
            let source = try KitAtomVectors.code(file)
            for forbidden in [".spring(", ".easeInOut(", ".easeOut(", "withAnimation(.default", ".linear(duration"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }
}
