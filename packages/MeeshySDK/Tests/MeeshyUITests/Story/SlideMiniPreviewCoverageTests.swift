import XCTest
@testable import MeeshyUI

/// #4743 — **la vignette de slide montre TOUT ce que la slide porte.**
///
/// Son doc-comment promettait « all layers » et il en manquait trois : ni
/// `locationObjects`, ni `audioPlayerObjects`, et un sticker GABARIT y
/// paraissait sous son repli emoji au lieu de son dessin. Un auteur qui avait
/// posé un lieu ne le voyait pas dans la bande de slides.
///
/// Garde de SOURCE : `SlideMiniPreview` est une vue SwiftUI que XCTest ne monte
/// pas. Ce qui se vérifie ici est la COMPOSITION — que chaque couche entre dans
/// le corps — et l'absence du repli qui masquait les décorations.
final class SlideMiniPreviewCoverageTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/SlideMiniPreview.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        // Les commentaires partent : celui qui explique le trou NOMME les
        // couches manquantes et ferait passer la garde tout seul.
        return brut.split(separator: "\n", omittingEmptySubsequences: false)
            .map { ligne -> String in
                guard let borne = ligne.range(of: "//") else { return String(ligne) }
                return String(ligne[ligne.startIndex..<borne.lowerBound])
            }
            .joined(separator: "\n")
    }

    /// **L'inventaire des couches.** Il énumère — et c'est assumé : une vue a
    /// un nombre FINI de couches, et le jour où une septième famille d'objet
    /// existe, `MeeshySceneObject` refusera de compiler avant que ce témoin
    /// n'ait tort.
    func test_thePreviewComposes_everyLayerOfTheSlide() throws {
        let code = try source()
        for couche in ["backgroundLayers(in:", "foregroundMediaLayer(in:", "textLayer(in:",
                       "stickerLayer(in:", "locationLayer(in:", "audioLayer(in:", "drawingLayer"] {
            XCTAssertTrue(code.contains(couche),
                          "La vignette ne compose pas `\(couche)` — elle ment sur la slide.")
        }
    }

    /// **Une décoration se DESSINE dans la vignette.** Peindre son emoji de
    /// repli y montrait ce que voit un lecteur qui ne sait PAS la rendre — pas
    /// ce que l'auteur a posé.
    func test_aTemplateSticker_isDrawnInThePreview_notFalledBackToItsEmoji() throws {
        let code = try source()
        XCTAssertTrue(code.contains("sticker.kind == .template"),
                      "La vignette ne distingue pas une décoration d'un glyphe.")
        XCTAssertTrue(code.contains("StickerTemplateRenderer.image("),
                      "La vignette doit passer par le moteur qui dessine la scène.")
    }

    /// La pastille de lieu passe par le même moteur — la vignette et le canvas
    /// ne peuvent pas diverger sur son allure.
    func test_theLocationPill_goesThroughTheSameEngineAsTheScene() throws {
        let code = try source()
        XCTAssertTrue(code.contains("StoryLocationLayer.resolvedTemplateID"),
                      "La vignette doit résoudre le gabarit comme la scène, styleId compris.")
        XCTAssertTrue(code.contains("StoryLocationLayer.templateSlots(for:"),
                      "Et remplir ses emplacements par le même dépouillement du lieu.")
    }
}
