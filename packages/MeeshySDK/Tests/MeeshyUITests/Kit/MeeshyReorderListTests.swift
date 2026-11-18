import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K52 — la liste réordonnable : le déplacement pur (mêmes bornes pour le glisser,
/// la voix et le clavier), la cible d'un glisser, les actions disponibles, la poignée.
@Suite("MeeshyReorderList")
struct MeeshyReorderListTests {

    private static let file = "K52-MeeshyReorderList"

    @Test("déplacer rend l'ordre rangé ; un index hors bornes est ramené, rien ne change sans mouvement")
    func move_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "deplacer") {
            let ids = try #require(row["ids"] as? [String])
            let from = try #require(row["de"] as? Int)
            let to = try #require(row["vers"] as? Int)
            #expect(MeeshyReorder.move(ids, from: from, to: to) == row["attendu"] as? [String], "\(row)")
        }
    }

    @Test("la cible d'un glisser est la rangée dont le centre est le plus proche du centre déplacé")
    func targetIndex_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "cible") {
            let from = try #require(row["de"] as? Int)
            let offset = try #require(row["decalage"] as? Double)
            let heights = try #require(row["hauteurs"] as? [Double])
            let spacing = try #require(row["ecart"] as? Double)
            #expect(MeeshyReorder.targetIndex(from: from, offset: offset, heights: heights, spacing: spacing)
                == row["vers"] as? Int, "\(row)")
        }
        #expect(MeeshyReorder.targetIndex(from: 0, offset: 40, heights: [], spacing: 8) == 0)
    }

    @Test("monter et descendre n'existent qu'à l'intérieur des bornes, jamais avec une seule rangée")
    func actions_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "actions") {
            let index = try #require(row["index"] as? Int)
            let count = try #require(row["nombre"] as? Int)
            #expect(MeeshyReorder.canMoveUp(index: index, count: count) == row["monter"] as? Bool, "\(row)")
            #expect(MeeshyReorder.canMoveDown(index: index, count: count) == row["descendre"] as? Bool, "\(row)")
        }
    }

    @Test("monter et descendre appellent le même déplacement que le glisser")
    func voiceActions_shareTheMove() {
        #expect(MeeshyReorder.destination(forIndex: 2, direction: .up) == 1)
        #expect(MeeshyReorder.destination(forIndex: 0, direction: .down) == 1)
    }

    @Test("la voix n'offre que les directions possibles : ni « monter » en tête, ni « descendre » en queue, rien d'éteint ni d'en attente")
    func voiceDirections_areOnlyThePossibleOnes() {
        #expect(MeeshyReorder.voiceDirections(index: 0, count: 3, isActive: true, isPending: false) == [.down])
        #expect(MeeshyReorder.voiceDirections(index: 1, count: 3, isActive: true, isPending: false) == [.up, .down])
        #expect(MeeshyReorder.voiceDirections(index: 2, count: 3, isActive: true, isPending: false) == [.up])
        #expect(MeeshyReorder.voiceDirections(index: 1, count: 3, isActive: false, isPending: false).isEmpty)
        #expect(MeeshyReorder.voiceDirections(index: 1, count: 3, isActive: true, isPending: true).isEmpty)
    }

    @Test("la pastille de rang : plein au premier, 34 % au deuxième, 16 % ensuite")
    func rankPill_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "pastille") {
            let position = try #require(row["position"] as? Int)
            #expect(MeeshyReorderListRecipe.rankOpacity(position: position) == row["opacite"] as? Double, "\(row)")
        }
    }

    @Test("la poignée fait 44 × 44, 32 × 44 sur le bord de début")
    func handle_metrics() {
        let wide = MeeshyReorderListRecipe.resolve(phase: .rest, rank: .hidden, isFirst: false, isEnabled: true,
                                                   isPending: false, handleEdge: .trailing, reduceMotion: false)
        #expect(wide.handleWidth == 44 && wide.handleHeight == 44)
        let narrow = MeeshyReorderListRecipe.resolve(phase: .rest, rank: .hidden, isFirst: false, isEnabled: true,
                                                     isPending: false, handleEdge: .leading, reduceMotion: false)
        #expect(narrow.handleWidth == 32 && narrow.handleHeight == 44)
    }

    @Test("saisie : rangée penchée de 2°, ombre forte, au-dessus de tout ; sous mouvement réduit, sans inclinaison")
    func lifted_row() {
        let rest = MeeshyReorderListRecipe.resolve(phase: .rest, rank: .hidden, isFirst: false, isEnabled: true,
                                                   isPending: false, handleEdge: .trailing, reduceMotion: false)
        #expect(!rest.isLifted && rest.tiltDegrees == 0 && rest.zIndex == 0)
        let grabbed = MeeshyReorderListRecipe.resolve(phase: .grabbed, rank: .hidden, isFirst: false, isEnabled: true,
                                                      isPending: false, handleEdge: .trailing, reduceMotion: false)
        #expect(grabbed.isLifted && grabbed.tiltDegrees == 2 && grabbed.zIndex > 0)
        let reduced = MeeshyReorderListRecipe.resolve(phase: .flying, rank: .hidden, isFirst: false, isEnabled: true,
                                                      isPending: false, handleEdge: .trailing, reduceMotion: true)
        #expect(reduced.isLifted && reduced.tiltDegrees == 0)
    }

    @Test("la liste est éteinte si isEnabled est faux ou s'il y a moins de deux rangées")
    func activity() {
        #expect(MeeshyReorderListRecipe.isActive(isEnabled: true, count: 2))
        #expect(!MeeshyReorderListRecipe.isActive(isEnabled: true, count: 1))
        #expect(!MeeshyReorderListRecipe.isActive(isEnabled: false, count: 5))
    }

    @Test("emphasizesFirst : bord d'accent sur la rangée de tête seulement ; la pastille suit la position")
    func emphasis_and_rank() {
        let first = MeeshyReorderListRecipe.resolve(phase: .rest, rank: .ordinal, isFirst: true, isEnabled: true,
                                                    isPending: false, handleEdge: .trailing, reduceMotion: false)
        #expect(first.showsRank)
        #expect(MeeshyReorderListRecipe.accentBorderOpacity(emphasizesFirst: true, isFirst: true) == 0.5)
        #expect(MeeshyReorderListRecipe.accentBorderOpacity(emphasizesFirst: true, isFirst: false) == 0)
        #expect(MeeshyReorderListRecipe.accentBorderOpacity(emphasizesFirst: false, isFirst: true) == 0)
    }

    @Test("une rangée en attente de confirmation ne se saisit pas")
    func pending_rowIsNotGrabbable() {
        let pending = MeeshyReorderListRecipe.resolve(phase: .rest, rank: .hidden, isFirst: false, isEnabled: true,
                                                      isPending: true, handleEdge: .trailing, reduceMotion: false)
        #expect(!pending.isGrabbable)
    }

    @Test("garde de source : aucune langue, adresse, conversation ni pack dans les signatures")
    func source_isAnAgnosticAtom() throws {
        try KitAssemblyGuards.assertAgnostic(["MeeshyReorderList.swift", "MeeshyReorderListRecipe.swift"])
    }
}
