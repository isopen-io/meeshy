import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K38 (l'atome squelette) — la loi « squelette seulement si le cache est vide »,
/// les silhouettes par forme, le délai du reflet, puis les gardes de source.
@Suite("MeeshySkeleton")
struct MeeshySkeletonTests {

    private static let file = "K38-MeeshySkeleton"

    @Test("le squelette n'existe qu'au tout premier chargement : jamais sur un cache, même périmé")
    func law_followsTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "loi") {
            let shows = MeeshySkeletonLaw.shows(isLoading: try #require(row["chargement"] as? Bool),
                                                hasCachedData: try #require(row["cache"] as? Bool))
            #expect(shows == row["affiche"] as? Bool, "\(row)")
        }
    }

    @Test("la silhouette de chaque forme suit ses mesures ; un ratio hors bornes est ramené")
    func shapes_followTheVectors() throws {
        for row in try KitAtomVectors.rows(Self.file, "formes") {
            let shape = try Self.shape(row)
            let size = MeeshySkeletonRecipe.size(of: shape, availableWidth: row["largeur"] as? Double ?? 0)
            #expect(size.height == row["hauteur"] as? Double, "\(row)")
            if let expected = row["attendue"] as? Double {
                #expect(size.width == expected, "\(row)")
            }
        }
    }

    @Test("le reflet passe en 1,6 s et n'apparaît qu'après 150 ms : une réponse rapide ne clignote pas")
    func sheen_measures() throws {
        let measures = try #require(try KitAtomVectors.load(Self.file)["mesures"] as? [String: Double])
        #expect(MeeshySkeletonRecipe.sheenDuration == measures["reflet"])
        let delay = try #require(measures["delaiMs"])
        #expect(MeeshySkeletonRecipe.sheenDelayMilliseconds == Int(delay))
        #expect(MeeshySkeletonRecipe.sheenBandFraction == measures["bande"])
        #expect(MeeshySkeletonRecipe.sheenAngleDegrees == measures["angle"])
    }

    @Test("sous mouvement réduit : aplat fixe, sans reflet")
    func sheen_reducedMotion() {
        #expect(MeeshySkeletonRecipe.sheenAnimates(reduceMotion: false, hasWaitedDelay: true))
        #expect(!MeeshySkeletonRecipe.sheenAnimates(reduceMotion: true, hasWaitedDelay: true))
        #expect(!MeeshySkeletonRecipe.sheenAnimates(reduceMotion: false, hasWaitedDelay: false))
    }

    @Test("le squelette est caché au lecteur d'écran : il ne dit rien et ne contient aucun texte ni icône")
    func source_isASilentShape() throws {
        for file in ["MeeshySkeleton.swift", "MeeshySkeletonRecipe.swift", "MeeshySkeletonColumn.swift"] {
            let source = try KitAtomVectors.code(file)
            for forbidden in ["Text(", "Image(", ".shared", "MeeshyUser", "ThemeManager", "Color(hex:", ".shadow(", ".blur("] {
                #expect(!source.contains(forbidden), "\(file) contient \(forbidden)")
            }
        }
        let view = try KitAtomVectors.code("MeeshySkeleton.swift")
        #expect(view.contains("accessibilityHidden(true)"))
    }

    @Test("une liste au premier chargement répète la même silhouette : trois par défaut, bornée de 1 à 6, écart 8")
    func column_followsTheVectors() throws {
        let column = try #require(try KitAtomVectors.load(Self.file)["colonne"] as? [String: Double])
        let lower = try #require(column["min"])
        let upper = try #require(column["max"])
        #expect(Double(MeeshySkeletonRecipe.defaultColumnCount) == column["defaut"])
        #expect(Double(MeeshySkeletonRecipe.columnCount(0)) == lower)
        #expect(Double(MeeshySkeletonRecipe.columnCount(-3)) == lower)
        #expect(Double(MeeshySkeletonRecipe.columnCount(40)) == upper)
        #expect(MeeshySkeletonRecipe.columnCount(4) == 4)
        #expect(MeeshySkeletonRecipe.columnSpacing == column["ecart"])
    }

    @Test("la colonne n'est faite que de l'atome : aucune roue, aucune forme redessinée")
    func column_isMadeOfTheAtom() throws {
        let source = try KitAtomVectors.code("MeeshySkeletonColumn.swift")
        #expect(source.contains("MeeshySkeleton(shape: shape)"))
        #expect(source.contains("MeeshySkeletonRecipe.columnCount(count)"))
        for forbidden in ["ProgressView", "RoundedRectangle", "Capsule(", "Circle("] {
            #expect(!source.contains(forbidden), "la colonne contient \(forbidden)")
        }
    }

    private static func shape(_ row: [String: Any]) throws -> MeeshySkeletonShape {
        switch try #require(row["forme"] as? String) {
        case "line": return .line(widthRatio: try #require(row["ratio"] as? Double))
        case "circle": return .circle(diameter: try #require(row["diametre"] as? Double))
        case "pill": return .pill(width: try #require(row["largeur"] as? Double))
        case "card": return .card(aspect: try #require(row["aspect"] as? Double), radius: 16)
        default: throw KitVectorError.unknownShape
        }
    }

    private enum KitVectorError: Error { case unknownShape }
}
