import Testing
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// Le revers de la Meesh (#9540) : Mee et Meo y sont GRAVÉS dans le métal et COLORÉS — plus d'autocollants.
@MainActor
@Suite("Jeu Meeshy — Mee et Meo gravés au revers de la Meesh")
struct GameEngravedBirdsTests {

    private func probe<V: View>(_ view: V) throws -> GameRenderProbe {
        try #require(GameRenderProbe.render(view, width: 120, height: 120))
    }

    /// La part des pixels opaques ET franchement colorés (l'argent est gris : l'émail ne l'est pas).
    private func colourShare(_ probe: GameRenderProbe) -> Double {
        var colourful = 0
        for index in stride(from: 0, to: probe.rgba.count, by: 4) where probe.rgba[index + 3] > 200 {
            let channels = [Int(probe.rgba[index]), Int(probe.rgba[index + 1]), Int(probe.rgba[index + 2])]
            if (channels.max() ?? 0) - (channels.min() ?? 0) > 55 { colourful += 1 }
        }
        return Double(colourful) / Double(probe.width * probe.height)
    }

    @Test("le revers porte de l'émail coloré ; l'avers, d'argent, n'en porte pas")
    func theReverseCarriesColouredEnamel() throws {
        let reverse = try probe(MeeshCoinView(face: .reverse(number: 13, year: 2026), figures: nil))
        let obverse = try probe(MeeshCoinView(face: .obverse, figures: nil))
        #expect(colourShare(reverse) > 0.04, "Mee et Meo sont COLORÉS : \(colourShare(reverse))")
        #expect(colourShare(obverse) < 0.01)
    }

    @Test("la pièce porte ses figures quelle que soit la demande : le revers EST Mee et Meo")
    func theReverseAlwaysEngravesBothBirds() throws {
        let asked = try probe(MeeshCoinView(face: .reverse(number: 13, year: 2026), figures: .standard))
        let none = try probe(MeeshCoinView(face: .reverse(number: 13, year: 2026), figures: nil))
        #expect(asked.distance(to: none) < 0.01, "le paramètre ne change plus rien : aucun sticker n'est posé")
    }

    @Test("Mee et Meo se distinguent : le dessin, les couleurs et le côté")
    func theTwoBirdsAreNotTheSameDrawing() throws {
        func render(_ bird: GameEngravedBirds.Bird) throws -> GameRenderProbe {
            try probe(Canvas { context, _ in
                GameEngravedBirds.draw(bird, in: &context, origin: .zero, scale: 120 / GameEngravedBirds.box)
            })
        }
        let mee = try render(.meeJoy)
        let meo = try render(.meoOpen)
        #expect(mee.coverage > 0.2)
        #expect(meo.coverage > 0.2)
        #expect(mee.distance(to: meo) > 3)
    }

    @Test("le relief : l'ombre est BASSE, la lumière HAUTE — pas un contour blanc tout autour")
    func theReliefIsLightAboveAndShadeBelow() throws {
        #expect(GameEngravedBirds.shadeOffset > 0, "l'ombre tombe vers le bas")
        #expect(GameEngravedBirds.lightOffset < 0, "la lumière accroche le bord haut")
        #expect(GameEngravedBirds.shadeOpacity < GameEngravedBirds.lightOpacity)
        let outline = GameEngravedBirds.silhouette(of: GameEngravedBirds.meeJoy)
        #expect(outline.boundingRect.width > 40, "la silhouette couvre le colibri")
    }

    @Test("les reflets blancs dans le corps ne font pas partie de la silhouette")
    func highlightsAreNotPartOfTheSilhouette() {
        let highlights = GameEngravedBirds.meeJoy.filter(\.isHighlight)
        #expect(highlights.count == 2)
    }

    @Test("la pièce ne pose plus d'autocollant : ni film de sticker, ni contour découpé")
    func theCoinPutsNoStickerOnItsReverse() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(
            contentsOf: root.appendingPathComponent("Sources/MeeshyUI/Game/MeeshCoinView.swift"), encoding: .utf8
        )
        #expect(!source.contains("GameTenantsLayer"))
        #expect(!source.contains("MeeStickerFilmView"))
        #expect(source.contains("GameEngravedBirds.draw"))
    }
}
