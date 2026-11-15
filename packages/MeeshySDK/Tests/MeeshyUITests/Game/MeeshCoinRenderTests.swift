import Testing
import Foundation
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// La Meesh PEINTE (épopée § 6, #11176) : l'or est pur jusqu'au centre, l'argent reste froid, et plus rien de la pièce
/// ne dépend de la langue.
@MainActor
@Suite("Jeu Meeshy — la Meesh peinte, édition par édition")
struct MeeshCoinRenderTests {

    private func probe(_ face: MeeshCoinView.Face, _ edition: MeeshEdition) throws -> GameRenderProbe {
        try #require(GameRenderProbe.render(MeeshCoinView(face: face, edition: edition, figures: nil), width: 120, height: 120))
    }

    /// Le pixel du point (x, y) du repère 120 × 120 de la pièce, rendu au double.
    private func pixel(_ probe: GameRenderProbe, x: Int, y: Int) -> (r: Int, g: Int, b: Int) {
        let index = ((y * 2) * probe.width + x * 2) * 4
        return (Int(probe.rgba[index]), Int(probe.rgba[index + 1]), Int(probe.rgba[index + 2]))
    }

    @Test("l'or est PUR, centre compris ; le champ de l'argent reste d'argent")
    func theGoldFieldIsGold() throws {
        let gold = pixel(try probe(.reverse(number: 100, year: 2026), .gold), x: 20, y: 64)
        let silver = pixel(try probe(.reverse(number: 13, year: 2026), .silver), x: 20, y: 64)
        #expect(gold.r - gold.b > 60, "le champ de l'or est doré : \(gold)")
        #expect(silver.b >= silver.r - 4, "le champ de l'argent reste froid : \(silver)")
    }

    @Test("chaque édition a sa pièce, sur chaque face")
    func everyEditionDiffersOnBothFaces() throws {
        let faces: [MeeshCoinView.Face] = [.obverse, .reverse(number: 1000, year: 2026)]
        for face in faces {
            let silver = try probe(face, .silver)
            let gold = try probe(face, .gold)
            let prism = try probe(face, .prism)
            #expect(silver.coverage > 0.6 && silver.cornerIsTransparent)
            #expect(silver.distance(to: gold) > 5)
            #expect(gold.distance(to: prism) > 5)
        }
    }

    @Test("la pièce ne porte plus aucun texte localisé : ni « UNE MEESH », ni « N° »")
    func theCoinCarriesNoLocalizedText() throws {
        let game = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Game")
        let sources = try ["MeeshCoinView.swift", "MeeshCoinFaces.swift", "MeeshCoinPainter.swift"].map {
            try String(contentsOf: game.appendingPathComponent($0), encoding: .utf8)
        }
        for source in sources {
            #expect(!source.contains("\"MEESHY · UNE MEESH"))
            #expect(!source.contains("Text(\"N° "))
            #expect(!source.contains("String(localized:"))
        }
    }
}
