import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K54 — le tracé de carte : la loi pure du chemin (longueur, fraction des arrêts,
/// tête de lecture), la recette par genre, gardes de source.
@Suite("MeeshyMapTrace")
struct MeeshyMapTraceTests {

    private static let file = "K54-MeeshyMapTrace"

    private static func points(_ raw: [[Double]]) -> [CGPoint] {
        raw.map { CGPoint(x: $0[0], y: $0[1]) }
    }

    private static func kind(_ name: String) -> MeeshyMapTraceKind {
        switch name {
        case "link": return .link
        case "history": return .history
        default: return .route
        }
    }

    @Test("la longueur : somme des segments, link ne lit que le premier et le dernier point, un point seul n'est pas un chemin")
    func length_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "longueur") {
            let raw = try #require(row["points"] as? [[Double]])
            let kind = Self.kind(try #require(row["genre"] as? String))
            let path = MeeshyMapTracePath.resolve(points: Self.points(raw), kind: kind)
            #expect(path?.length == row["longueur"] as? Double, "\(row)")
        }
    }

    @Test("la fraction d'un arrêt : la distance parcourue jusqu'à son point, sur la longueur totale")
    func stopFractions_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "arrets") {
            let raw = try #require(row["points"] as? [[Double]])
            let index = try #require(row["indice"] as? Int)
            let path = try #require(MeeshyMapTracePath.resolve(points: Self.points(raw), kind: .route))
            let fraction = try #require(path.fraction(ofPointAt: index))
            #expect(abs(fraction - (row["fraction"] as? Double ?? -1)) < 0.0001, "\(row)")
        }
        let path = try #require(MeeshyMapTracePath.resolve(points: [.zero, CGPoint(x: 3, y: 4)], kind: .route))
        #expect(path.fraction(ofPointAt: 5) == nil)
    }

    @Test("la tête de lecture se tient à la fraction donnée, bornée de 0 à 1")
    func head_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "tete") {
            let raw = try #require(row["points"] as? [[Double]])
            let fraction = try #require(row["fraction"] as? Double)
            let path = try #require(MeeshyMapTracePath.resolve(points: Self.points(raw), kind: .route))
            let head = path.point(atFraction: fraction)
            #expect(abs(head.x - (row["x"] as? Double ?? -1)) < 0.0001, "\(row)")
            #expect(abs(head.y - (row["y"] as? Double ?? -1)) < 0.0001, "\(row)")
        }
    }

    @Test("des points confondus donnent un chemin de longueur nulle, sans division par zéro")
    func degeneratePath() throws {
        let path = try #require(MeeshyMapTracePath.resolve(points: [.zero, .zero], kind: .route))
        #expect(path.length == 0)
        #expect(path.point(atFraction: 0.5) == .zero)
        #expect(path.fraction(ofPointAt: 1) == 1)
    }

    @Test("trait et liseré par genre et par poids")
    func weights_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "traits") {
            let kind = Self.kind(try #require(row["genre"] as? String))
            let weight: MeeshyMapTraceWeight = (row["poids"] as? String) == "large" ? .large : .regular
            let recipe = MeeshyMapTraceRecipe.resolve(kind: kind, weight: weight, progress: nil, isStale: false,
                                                      onLightMap: false, isAnimated: true, reduceMotion: false)
            #expect(recipe.strokeWidth == row["trait"] as? Double, "\(row)")
            #expect(recipe.casingWidth == row["liseré"] as? Double, "\(row)")
        }
    }

    @Test("le liseré garde le contraste : 55 %, 70 % sur une carte claire")
    func casing_followsTheMap() throws {
        for row in try KitAtomVectors.rows(Self.file, "fond") {
            let light = try #require(row["carte_claire"] as? Bool)
            let recipe = MeeshyMapTraceRecipe.resolve(kind: .route, weight: .regular, progress: nil, isStale: false,
                                                      onLightMap: light, isAnimated: true, reduceMotion: false)
            #expect(recipe.casingOpacity == row["liseré"] as? Double, "\(row)")
        }
    }

    @Test("les points défilent en route et en link, jamais en history ; ni périmé, ni réduit, ni figé")
    func flow_rules() {
        func flows(_ kind: MeeshyMapTraceKind, stale: Bool = false, animated: Bool = true, reduce: Bool = false) -> Bool {
            MeeshyMapTraceRecipe.resolve(kind: kind, weight: .regular, progress: nil, isStale: stale,
                                         onLightMap: false, isAnimated: animated, reduceMotion: reduce).dotsFlow
        }
        #expect(flows(.route) && flows(.link))
        #expect(!flows(.history))
        #expect(!flows(.route, stale: true))
        #expect(!flows(.route, animated: false))
        #expect(!flows(.route, reduce: true))
    }

    @Test("progress est borné ; sa tête n'existe que s'il est donné, même périmé")
    func progress_and_head() {
        let none = MeeshyMapTraceRecipe.resolve(kind: .history, weight: .regular, progress: nil, isStale: false,
                                                onLightMap: false, isAnimated: true, reduceMotion: false)
        #expect(none.progress == nil && !none.showsHead)
        let over = MeeshyMapTraceRecipe.resolve(kind: .history, weight: .regular, progress: 3, isStale: true,
                                                onLightMap: false, isAnimated: true, reduceMotion: false)
        #expect(over.progress == 1 && over.showsHead)
        let under = MeeshyMapTraceRecipe.resolve(kind: .history, weight: .regular, progress: -1, isStale: false,
                                                 onLightMap: false, isAnimated: true, reduceMotion: false)
        #expect(under.progress == 0)
    }

    @Test("périmé : désaturé, à 60 %")
    func stale() {
        let recipe = MeeshyMapTraceRecipe.resolve(kind: .route, weight: .regular, progress: nil, isStale: true,
                                                  onLightMap: false, isAnimated: true, reduceMotion: false)
        #expect(recipe.isDesaturated && recipe.opacity == 0.6)
        let live = MeeshyMapTraceRecipe.resolve(kind: .route, weight: .regular, progress: nil, isStale: false,
                                                onLightMap: false, isAnimated: true, reduceMotion: false)
        #expect(!live.isDesaturated && live.opacity == 1)
    }

    @Test("garde de source : le tracé ne calcule aucun itinéraire et ne connaît ni fournisseur ni coordonnée géographique")
    func source_isAnAgnosticAtom() throws {
        try KitAssemblyGuards.assertAgnostic(["MeeshyMapTrace.swift", "MeeshyMapTraceRecipe.swift", "MeeshyMapTracePath.swift"])
        for file in ["MeeshyMapTrace.swift", "MeeshyMapTraceRecipe.swift", "MeeshyMapTracePath.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in ["import MapKit", "CLLocation", "MKDirections", "latitude", "longitude"] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
    }
}
