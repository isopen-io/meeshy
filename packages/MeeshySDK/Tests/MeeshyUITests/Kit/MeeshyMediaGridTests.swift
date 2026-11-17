import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K49 — la grille de médias : écart, rapport des tuiles, loi de placement de la
/// maçonnerie, tuiles qui s'ouvrent ou non, gardes de source.
@Suite("MeeshyMediaGrid")
struct MeeshyMediaGridTests {

    private static let file = "K49-MeeshyMediaGrid"

    private static func shape(_ name: String) -> MeeshyMediaTileShape {
        switch name {
        case "tall": return .tall
        case "free": return .free
        default: return .square
        }
    }

    @Test("l'écart vaut 6 ou 8, et 14 au-delà de 700 de large")
    func spacing_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "ecarts") {
            let spacing: MeeshyMediaGridSpacing = (row["ecart"] as? String) == "tight" ? .tight : .regular
            let width = try #require(row["largeur"] as? Double)
            #expect(MeeshyMediaGridRecipe.spacingValue(spacing, width: width) == row["valeur"] as? Double, "\(row)")
        }
    }

    @Test("le rapport d'une tuile : carré 1, haut 2:3, libre lu dans aspect borné de 0,5 à 2")
    func aspect_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "formes") {
            let name = try #require(row["forme"] as? String)
            let aspect = row["aspect"] as? Double
            let ratio = MeeshyMediaGridRecipe.aspectRatio(shape: Self.shape(name), aspect: aspect)
            #expect(abs(ratio - (row["rapport"] as? Double ?? 0)) < 0.001, "\(row)")
        }
    }

    @Test("les colonnes sont ramenées à 2 ou 3")
    func columns_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "colonnes") {
            let asked = try #require(row["demande"] as? Int)
            #expect(MeeshyMediaGridRecipe.columns(asked) == row["colonnes"] as? Int, "\(row)")
        }
    }

    @Test("la maçonnerie pose chaque tuile dans la colonne la plus courte, à égalité la première")
    func masonry_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "maconnerie") {
            let columns = try #require(row["colonnes"] as? Int)
            let aspects = try #require(row["aspects"] as? [Double])
            let expected = try #require(row["rangs"] as? [[Int]])
            let placed = MeeshyMediaGridPlacement.columns(aspects: aspects, count: columns, spacing: 8, width: 350)
            #expect(placed == expected, "\(row)")
        }
    }

    @Test("toute tuile est placée une fois, dans l'ordre de l'hôte")
    func masonry_placesEveryTileOnce() {
        let aspects = (0..<17).map { 0.6 + Double($0 % 5) * 0.3 }
        let placed = MeeshyMediaGridPlacement.columns(aspects: aspects, count: 3, spacing: 6, width: 342)
        #expect(placed.flatMap { $0 }.sorted() == Array(0..<17))
        for column in placed { #expect(column == column.sorted()) }
    }

    @Test("la largeur d'une colonne : la largeur moins les écarts, partagée")
    func columnWidth() {
        #expect(abs(MeeshyMediaGridPlacement.columnWidth(columns: 3, spacing: 8, width: 350) - 111.3333) < 0.001)
        #expect(MeeshyMediaGridPlacement.columnWidth(columns: 3, spacing: 8, width: 0) == 0)
    }

    @Test("seules les tuiles média et texte s'ouvrent ; un fantôme ou un squelette ne rendent aucun identifiant")
    func opening() {
        let recipe: (MeeshyMediaTileKind) -> MeeshyMediaGridRecipe = {
            MeeshyMediaGridRecipe.resolve(layout: .regular, shape: .tall, columns: 3, spacing: .regular, kind: $0,
                                          isPressed: false, reduceMotion: false)
        }
        #expect(recipe(.media).isOpenable)
        #expect(recipe(.text).isOpenable)
        #expect(!recipe(.ghost).isOpenable)
        #expect(!recipe(.skeleton).isOpenable)
    }

    @Test("rayon de 18, filet de 1, doigt posé : 0,97 (immobile sous mouvement réduit)")
    func tile_metrics() {
        let rest = MeeshyMediaGridRecipe.resolve(layout: .regular, shape: .square, columns: 2, spacing: .tight,
                                                 kind: .media, isPressed: false, reduceMotion: false)
        #expect(rest.cornerRadius == 18 && rest.borderWidth == 1 && rest.pressScale == 1)
        let pressed = MeeshyMediaGridRecipe.resolve(layout: .regular, shape: .square, columns: 2, spacing: .tight,
                                                    kind: .media, isPressed: true, reduceMotion: false)
        #expect(pressed.pressScale == 0.97)
        let reduced = MeeshyMediaGridRecipe.resolve(layout: .regular, shape: .square, columns: 2, spacing: .tight,
                                                    kind: .media, isPressed: true, reduceMotion: true)
        #expect(reduced.pressScale == 1)
    }

    @Test("la rangée coupe à columns éléments")
    func row_cutsAtColumns() {
        let items = (0..<8).map { MeeshyMediaGridItem(id: "i\($0)", kind: .media, label: "i\($0)") }
        #expect(MeeshyMediaGridRecipe.visibleItems(items, layout: .row, columns: 3).map(\.id) == ["i0", "i1", "i2"])
        #expect(MeeshyMediaGridRecipe.visibleItems(items, layout: .regular, columns: 3).count == 8)
    }

    @Test("la dernière ligne approche : le chargement de la suite se demande une fois")
    func reachEnd() {
        #expect(MeeshyMediaGridRecipe.shouldReachEnd(index: 18, count: 20, columns: 3))
        #expect(!MeeshyMediaGridRecipe.shouldReachEnd(index: 3, count: 20, columns: 3))
    }

    @Test("la suite se demande UNE fois par page : les tuiles des deux dernières lignes ne la redemandent pas")
    func reachEnd_firesOncePerPage() {
        let first = MeeshyMediaGridRecipe.reachEndRequest(index: 15, count: 20, columns: 3, lastRequestedCount: nil)
        #expect(first == 20)
        let again = (14..<20).compactMap {
            MeeshyMediaGridRecipe.reachEndRequest(index: $0, count: 20, columns: 3, lastRequestedCount: first)
        }
        #expect(again.isEmpty, "\(again)")
        #expect(MeeshyMediaGridRecipe.reachEndRequest(index: 38, count: 40, columns: 3, lastRequestedCount: 20) == 40)
        #expect(MeeshyMediaGridRecipe.reachEndRequest(index: 2, count: 40, columns: 3, lastRequestedCount: 20) == nil)
    }

    @Test("garde de source : aucune publication, réel, story ni pièce jointe dans les signatures")
    func source_isAnAgnosticAtom() throws {
        try KitAssemblyGuards.assertAgnostic(["MeeshyMediaGrid.swift", "MeeshyMediaGridRecipe.swift"])
    }
}
