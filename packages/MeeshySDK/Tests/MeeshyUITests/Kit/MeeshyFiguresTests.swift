import Testing
import Foundation
@testable import MeeshyUI

/// K34 — le chiffre, la bande, la mini-courbe et la rangée de part lus comme des VALEURS.
@Suite("MeeshyFigures")
struct MeeshyFiguresTests {

    private static let file = "K34-MeeshyFigures"

    @Test("les polices suivent les vecteurs : 48, 34 et 24")
    func fontSizes() throws {
        for row in try KitAtomVectors.rows(Self.file, "tailles") {
            let size = try #require(MeeshyFigureSize(rawValue: row["taille"] as? String ?? ""))
            #expect(MeeshyFiguresRecipe.resolve(size: size).fontSize == row["police"] as? Double, "\(row)")
        }
    }

    @Test("les bandes suivent les vecteurs : filets entre deux chiffres, compact sous 360")
    func bands() throws {
        for row in try KitAtomVectors.rows(Self.file, "bandes") {
            let count = try #require(row["nombre"] as? Int)
            let width = try #require(row["largeur"] as? Double)
            let recipe = MeeshyFiguresRecipe.resolve(size: .large, count: count, width: width)
            #expect(recipe.separatorCount == row["filets"] as? Int, "\(row)")
            #expect(recipe.size.rawValue == row["taille"] as? String, "\(row)")
        }
    }

    @Test("empilée aux grandes tailles : les filets se couchent, aucun n'est vertical")
    func stacked() {
        let recipe = MeeshyFiguresRecipe.resolve(size: .large, count: 3, width: 390, isStacked: true)
        #expect(recipe.separatorsAreHorizontal)
        #expect(!MeeshyFiguresRecipe.resolve(size: .large, count: 3, width: 390).separatorsAreHorizontal)
    }

    @Test("la courbe reste dans son cadre : 0, 1, 2, 7 et 31 points, valeurs égales, nulles ou négatives")
    func spark_followsTheVectorsAndStaysInFrame() throws {
        for row in try KitAtomVectors.rows(Self.file, "courbes") {
            let points = (row["points"] as? [Any] ?? []).compactMap { ($0 as? NSNumber)?.doubleValue }
            let width = try #require(row["largeur"] as? Double)
            let height = try #require(row["hauteur"] as? Double)
            let drawn = MeeshyFiguresRecipe.sparkPoints(points, width: width, height: height)
            let expected = (row["y"] as? [Any] ?? []).compactMap { ($0 as? NSNumber)?.doubleValue }
            #expect(drawn.map(\.y) == expected, "\(row)")
        }
        for series in [[], [1], [1, 2], [-3, -1, -2, 0, 4, 2, 9], [0, 0, 0], Array(repeating: 5.0, count: 31),
                       (0..<31).map { Double($0 % 7) - 3 }, [.nan, 1, .infinity]] as [[Double]] {
            for point in MeeshyFiguresRecipe.sparkPoints(series, width: 72, height: 28) {
                #expect(point.x >= 0 && point.x <= 72, "\(series)")
                #expect(point.y >= 3 && point.y <= 25, "\(series)")
                #expect(point.x.isFinite && point.y.isFinite, "\(series)")
            }
        }
        #expect(MeeshyFiguresRecipe.sparkPoints([1], width: 72, height: 28).isEmpty)
    }

    @Test("la rangée de part : bornée de 0 à 1, jamais sous 4 quand elle existe, quatre rangées au plus")
    func shareBar() throws {
        for row in try KitAtomVectors.rows(Self.file, "parts") {
            let share = try #require(row["part"] as? Double)
            let width = try #require(row["largeur"] as? Double)
            #expect(MeeshyFiguresRecipe.shareFill(share: share, width: width) == row["rempli"] as? Double, "\(row)")
        }
        #expect(MeeshyFiguresRecipe.shareFill(share: .nan, width: 100) == 0)
        #expect(MeeshyFiguresRecipe.shareRowLimit == 4)
        #expect(MeeshyFiguresRecipe.visibleShareRows(7) == 4)
    }

    @Test("le chiffre roule : seuls les chiffres qui diffèrent, alignés à la fin, jamais à l'apparition")
    func rolling() {
        #expect(MeeshyFiguresRecipe.changedPositions(from: "1 284", to: "1 285") == [4])
        #expect(MeeshyFiguresRecipe.changedPositions(from: "999", to: "1 000").count == 4)
        #expect(MeeshyFiguresRecipe.changedPositions(from: "12", to: "12").isEmpty)
        #expect(MeeshyFiguresRecipe.changedPositions(from: nil, to: "12").isEmpty)
    }

    @Test("trois états, une forme : sans valeur « — », un vrai zéro s'écrit 0, le squelette cède à la valeur")
    func states() {
        #expect(MeeshyFiguresRecipe.displayedValue(nil) == "—")
        #expect(MeeshyFiguresRecipe.displayedValue("0") == "0")
        #expect(MeeshyFiguresRecipe.resolve(size: .large, isLoading: true, isEmpty: false).showsSkeleton)
        #expect(!MeeshyFiguresRecipe.resolve(size: .large, isLoading: true, isEmpty: false, hasValue: true).showsSkeleton)
        #expect(MeeshyFiguresRecipe.resolve(size: .large, isEmpty: true).isEmpty)
    }

    @Test("la phrase dite : valeur puis unité ; vide : le mot de l'hôte")
    func spoken() {
        #expect(MeeshyFiguresRecipe.spoken(value: "1 284", unit: "clics", emptyLabel: "aucune donnée") == "1 284 clics")
        #expect(MeeshyFiguresRecipe.spoken(value: nil, unit: "clics", emptyLabel: "aucune donnée") == "aucune donnée clics")
        #expect(MeeshyFiguresRecipe.spokenBand(["1 284 clics", "912 visiteurs uniques"]) == "1 284 clics, 912 visiteurs uniques")
    }

    @Test("garde de source : aucun type du domaine, aucun singleton, aucune mise en forme de nombre")
    func source_isAgnostic() throws {
        let files = ["MeeshyFigures.swift", "MeeshyFiguresRecipe.swift"]
        try KitAssemblyGuards.assertAgnostic(files)
        for file in files {
            let source = try KitAtomVectors.code(file)
            #expect(!source.contains("NumberFormatter"), "\(file)")
            #expect(!source.contains("formatted("), "\(file)")
        }
    }
}
