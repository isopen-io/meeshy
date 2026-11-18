import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K50 — le graphique : la loi pure `MeeshyChartScale` (normalisé, graduations,
/// pic, parts, arcs) et les hauteurs par genre ; la voix dit chaque valeur.
@Suite("MeeshyChart")
struct MeeshyChartTests {

    private static let file = "K50-MeeshyChart"

    private static func close(_ lhs: [Double], _ rhs: [Double]) -> Bool {
        lhs.count == rhs.count && zip(lhs, rhs).allSatisfy { abs($0 - $1) < 0.0001 }
    }

    @Test("normalisé : une valeur négative vaut zéro, la plus grande vaut 1")
    func normalized_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "normalise") {
            let values = try #require(row["valeurs"] as? [Double])
            let expected = try #require(row["attendu"] as? [Double])
            #expect(Self.close(MeeshyChartScale.normalized(values), expected), "\(row)")
        }
        #expect(MeeshyChartScale.normalized([.nan, 2]) == [0, 1])
    }

    @Test("le pic est le premier maximum strictement positif")
    func peak_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "pic") {
            let values = try #require(row["valeurs"] as? [Double])
            #expect(MeeshyChartScale.peak(values) == row["indice"] as? Int, "\(row)")
        }
    }

    @Test("les graduations tombent sur 1, 2 ou 5 fois une puissance de dix, du zéro au-delà du maximum")
    func niceTicks_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "graduations") {
            let maximum = try #require(row["max"] as? Double)
            let count = try #require(row["nombre"] as? Int)
            let expected = try #require(row["attendu"] as? [Double])
            #expect(Self.close(MeeshyChartScale.niceTicks(max: maximum, count: count), expected), "\(row)")
        }
    }

    @Test("les parts d'un ensemble somment 1, ou zéro partout quand tout est nul")
    func segments_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "parts") {
            let values = try #require(row["valeurs"] as? [Double])
            let expected = try #require(row["attendu"] as? [Double])
            #expect(Self.close(MeeshyChartScale.segments(values), expected), "\(row)")
        }
    }

    @Test("les arcs partent du haut, tournent dans le sens des aiguilles, et bouclent sur 360 degrés")
    func arcs() {
        let arcs = MeeshyChartScale.arcs([0.25, 0.25, 0.5])
        #expect(arcs.count == 3)
        #expect(abs(arcs[0].start - (-90)) < 0.0001)
        #expect(abs(arcs[0].end - 0) < 0.0001)
        #expect(abs(arcs[2].end - 270) < 0.0001)
        #expect(MeeshyChartScale.arcs([]).isEmpty)
    }

    @Test("la hauteur de tracé dépend du genre : 26 pour la bande, 104 pour l'anneau, 52 par étage d'entonnoir")
    func heights_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "hauteurs") {
            let kindName = try #require(row["genre"] as? String)
            let kind = try #require(MeeshyChartKind(rawValue: kindName))
            let sizeName = try #require(row["taille"] as? String)
            let size = try #require(MeeshyChartSize(rawValue: sizeName))
            let count = try #require(row["points"] as? Int)
            let recipe = MeeshyChartRecipe.resolve(kind: kind, size: size, pointCount: count)
            #expect(recipe.plotHeight == row["hauteur"] as? Double, "\(row)")
        }
    }

    @Test("sans point, le graphique est un état sans donnée ; un point seul se choisit")
    func emptyState() {
        #expect(MeeshyChartRecipe.resolve(kind: .bars, size: .regular, pointCount: 0).isEmpty)
        #expect(!MeeshyChartRecipe.resolve(kind: .bars, size: .regular, pointCount: 1).isEmpty)
    }

    @Test("une valeur négative est servie à zéro ; la valeur dite d'un point est celle de l'hôte")
    func points() {
        let point = MeeshyChartPoint(id: "p", value: -5, label: "3", spoken: "3 novembre, 214 clics")
        #expect(point.servedValue == 0)
        #expect(MeeshyChartScale.accessibilityValues([point, MeeshyChartPoint(id: "q", value: 2, label: "4", spoken: "")])
            == ["3 novembre, 214 clics", "4"])
    }

    @Test("les repères : today marque le dernier point, band deux identifiants, peak le sommet")
    func markers() {
        let ids = ["a", "b", "c", "d"]
        #expect(MeeshyChartRecipe.markedIndexes(.today, ids: ids, values: [1, 2, 3, 4]) == [3])
        #expect(MeeshyChartRecipe.markedIndexes(.peak, ids: ids, values: [1, 9, 3, 4]) == [1])
        #expect(MeeshyChartRecipe.markedIndexes(.band(from: "b", to: "c"), ids: ids, values: [1, 2, 3, 4]) == [1, 2])
        #expect(MeeshyChartRecipe.markedIndexes(.band(from: "z", to: "c"), ids: ids, values: [1, 2, 3, 4]) == [])
    }

    @Test("le point sous un doigt : l'abscisse rapportée à la largeur, bornée aux points existants")
    func indexUnderFinger() {
        #expect(MeeshyChartRecipe.index(forX: 0, width: 100, count: 4) == 0)
        #expect(MeeshyChartRecipe.index(forX: 60, width: 100, count: 4) == 2)
        #expect(MeeshyChartRecipe.index(forX: 500, width: 100, count: 4) == 3)
        #expect(MeeshyChartRecipe.index(forX: -9, width: 100, count: 4) == 0)
        #expect(MeeshyChartRecipe.index(forX: 10, width: 0, count: 4) == nil)
        #expect(MeeshyChartRecipe.index(forX: 10, width: 100, count: 0) == nil)
    }

    @Test("sans selection, le graphique ne prend aucun geste : le défilement de l'hôte passe à travers")
    func gesture_onlyWithASelection() {
        #expect(!MeeshyChartRecipe.armsSelectionGesture(hasSelection: false))
        #expect(MeeshyChartRecipe.armsSelectionGesture(hasSelection: true))
    }

    @Test("une bulle va de 34 à 78 de diamètre, son aire suit la part, hors bornes elle reste dans 34…78")
    func bubbleDiameter_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "bulles") {
            let share = try #require(row["part"] as? Double)
            let expected = try #require(row["diametre"] as? Double)
            #expect(KitAssemblyGuards.close(MeeshyChartRecipe.bubbleDiameter(fraction: share), expected), "\(row)")
        }
        #expect(MeeshyChartRecipe.bubbleDiameter(fraction: .nan) == MeeshyChartRecipe.bubbleMinDiameter)
    }

    @Test("le chiffre d'une bulle va de 12 à 20 selon son diamètre")
    func bubbleFont_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "chiffres") {
            let diameter = try #require(row["diametre"] as? Double)
            let expected = try #require(row["taille"] as? Double)
            #expect(KitAssemblyGuards.close(MeeshyChartRecipe.bubbleFontSize(diameter: diameter), expected), "\(row)")
        }
    }

    @Test("le centre d'une bulle est posé par l'hôte en deux dimensions, et la bulle reste entière dans le tracé")
    func bubbleCenter_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "centres") {
            let position = try #require(row["position"] as? Double)
            let diameter = try #require(row["diametre"] as? Double)
            let width = try #require(row["largeur"] as? Double)
            let height = try #require(row["hauteur"] as? Double)
            let expectedX = try #require(row["x"] as? Double)
            let expectedY = try #require(row["y"] as? Double)
            let center = MeeshyChartRecipe.bubbleCenter(position: position, elevation: row["elevation"] as? Double,
                                                        diameter: diameter, width: width, height: height)
            #expect(KitAssemblyGuards.close(Double(center.x), expectedX), "\(row)")
            #expect(KitAssemblyGuards.close(Double(center.y), expectedY), "\(row)")
        }
    }

    @Test("seules les bulles prennent la hauteur de l'hôte, qui pose son fond dessous")
    func bubbles_fillTheHostHeight() {
        #expect(MeeshyChartRecipe.fillsHostHeight(.bubbles))
        for kind in MeeshyChartKind.allCases where kind != .bubbles {
            #expect(!MeeshyChartRecipe.fillsHostHeight(kind), "\(kind)")
        }
    }

    @Test("un point porte son élévation, absente par défaut")
    func point_carriesItsElevation() {
        #expect(MeeshyChartPoint(id: "a", value: 1, label: "1", spoken: "1").elevation == nil)
        #expect(MeeshyChartPoint(id: "a", value: 1, label: "1", spoken: "1", position: 0.2, elevation: 0.7).elevation == 0.7)
    }

    @Test("garde de source : aucun clic, lien, pays, filleul ni cercle dans les signatures")
    func source_isAnAgnosticAtom() throws {
        try KitAssemblyGuards.assertAgnostic(["MeeshyChart.swift", "MeeshyChart+Shapes.swift", "MeeshyChartRecipe.swift", "MeeshyChartScale.swift"])
    }

    @Test("un passage d'entonnoir se montre entre deux étages s'il a un texte, jamais sous le dernier")
    func funnelHops_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "passages") {
            let raw = try #require(row["passages"] as? [Any])
            let hops: [String?] = raw.map { $0 as? String }
            let shown = try #require(row["montres"] as? [Bool])
            #expect(MeeshyChartRecipe.shownHops(hops) == shown, "\(row)")
        }
    }

    @Test("chaque passage montré ajoute 24 à la hauteur de l'entonnoir")
    func funnelHops_addTheirHeight() throws {
        for row in try KitAtomVectors.rows(Self.file, "hauteursPassages") {
            let count = try #require(row["points"] as? Int)
            let hopCount = try #require(row["passages"] as? Int)
            let recipe = MeeshyChartRecipe.resolve(kind: .funnel, size: .regular, pointCount: count, hopCount: hopCount)
            #expect(recipe.plotHeight == row["hauteur"] as? Double, "\(row)")
        }
    }

    @Test("le passage d'un étage est porté par son point, et un point sans passage n'en a pas")
    func funnelHop_isCarriedByThePoint() {
        let stage = MeeshyChartPoint(id: "v", value: 38, label: "Visites 38", spoken: "Visites, 38", hop: "45 %")
        #expect(stage.hop == "45 %")
        #expect(MeeshyChartPoint(id: "a", value: 14, label: "Actifs 14", spoken: "").hop == nil)
    }
}

