import XCTest
import QuartzCore
import CoreText
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Pincer un texte agrandit son CADRE entier : la taille et la coupe des
/// lignes restent celles de l'édition** (#9139, demande porteur 2026-10-02).
///
/// La taille définie à l'édition (`fontSize`) fige le texte ET sa forme. Le
/// pincement (`scale`) n'agrandit pas la police contre une largeur de coupe
/// fixe — ce qui recoupait les lignes au lâcher —, il agrandit le cadre
/// entier, uniformément. Un témoin écrit sur un texte d'UNE ligne ne peut pas
/// tomber : la fixture coupe sur trois lignes au moins à l'échelle 1.
@MainActor
final class StoryTextFrameScaleTests: XCTestCase {

    private static let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))
    private static let scales: [Double] = [0.5, 1, 2, 4]
    private static let texte = "Le cadre grandit avec le doigt, mais les lignes restent celles qu'on a écrites"

    private func posé(scale: Double, rotation: Double = 0, renderScale: CGFloat = 3) -> StoryTextLayer {
        let layer = StoryTextLayer()
        layer.configure(with: StoryTextObject(id: "t", text: Self.texte, x: 0.5, y: 0.5,
                                              scale: scale, rotation: rotation, fontSize: 96),
                        geometry: Self.geometry, mode: .edit, renderScale: renderScale)
        return layer
    }

    /// Les plages de caractères de chaque ligne, telles que CoreText — le
    /// moteur du `CATextLayer` — les pose dans la boîte du calque.
    private func lignes(of layer: StoryTextLayer) -> [NSRange] {
        guard let attributed = layer.string as? NSAttributedString else { return [] }
        let framesetter = CTFramesetterCreateWithAttributedString(attributed)
        let path = CGPath(rect: CGRect(x: 0, y: 0, width: layer.bounds.width, height: 1_000_000),
                          transform: nil)
        let frame = CTFramesetterCreateFrame(framesetter, CFRange(location: 0, length: 0), path, nil)
        let lines = (CTFrameGetLines(frame) as? [CTLine]) ?? []
        return lines.map {
            let r = CTLineGetStringRange($0)
            return NSRange(location: r.location, length: r.length)
        }
    }

    // MARK: - La règle pure

    func test_sceneTransform_aLEchelle1_nestQueLaRotation() {
        let t = StoryTextLayer.sceneTransform(rotationDegrees: 0, scale: 1)
        XCTAssertTrue(CATransform3DIsIdentity(t), "À l'échelle 1, le rendu est strictement inchangé")
    }

    func test_sceneTransform_agranditLeCadreUniformement() {
        let t = StoryTextLayer.sceneTransform(rotationDegrees: 0, scale: 2.5)
        XCTAssertEqual(t.m11, 2.5, accuracy: 0.0001)
        XCTAssertEqual(t.m22, 2.5, accuracy: 0.0001)
    }

    func test_sceneTransform_composeRotationEtEchelle() {
        let t = StoryTextLayer.sceneTransform(rotationDegrees: 90, scale: 2)
        XCTAssertEqual(t.m11, 0, accuracy: 0.0001)
        XCTAssertEqual(t.m12, 2, accuracy: 0.0001)
    }

    func test_sceneTransform_echelleInvalide_rotationSeule() {
        let t = StoryTextLayer.sceneTransform(rotationDegrees: 0, scale: 0)
        XCTAssertTrue(CATransform3DIsIdentity(t), "Une échelle ≤ 0 ne doit ni écraser ni retourner le cadre")
    }

    func test_rasterScale_suitLEchellePourResterNet() {
        XCTAssertEqual(StoryTextLayer.rasterScale(renderScale: 3, objectScale: 1, longestSide: 300), 3)
        XCTAssertEqual(StoryTextLayer.rasterScale(renderScale: 3, objectScale: 2, longestSide: 300), 6)
        XCTAssertEqual(StoryTextLayer.rasterScale(renderScale: 3, objectScale: 0.5, longestSide: 300), 1.5)
    }

    func test_rasterScale_bornéParLaTailleDeTexture_jamaisSousLaDensitéDeBase() {
        let borné = StoryTextLayer.rasterScale(renderScale: 3, objectScale: 4, longestSide: 1000)
        XCTAssertEqual(borné * 1000, StoryTextLayer.maxRasterSide, accuracy: 0.001)
        XCTAssertEqual(StoryTextLayer.rasterScale(renderScale: 3, objectScale: 4, longestSide: 5000), 3,
                       "Le plafond ne fait jamais descendre sous la densité de l'écran")
    }

    // MARK: - Le comportement

    func test_lesRupturesDeLigne_sontLesMemesAToutesLesEchelles() {
        let référence = lignes(of: posé(scale: 1))
        XCTAssertGreaterThanOrEqual(référence.count, 3, "La fixture doit couper sur plusieurs lignes")
        for scale in Self.scales {
            XCTAssertEqual(lignes(of: posé(scale: scale)), référence,
                           "À l'échelle \(scale), les lignes doivent être celles de l'édition")
        }
    }

    func test_lePincement_agranditLeCadreEntier() {
        let base = posé(scale: 1)
        for scale in Self.scales {
            let layer = posé(scale: scale)
            XCTAssertEqual(layer.bounds.size, base.bounds.size,
                           "La boîte posée est celle de l'édition")
            XCTAssertEqual(layer.fontSize, base.fontSize, "La police posée est celle de l'édition")
            XCTAssertEqual(layer.frame.width, base.frame.width * CGFloat(scale), accuracy: 0.01,
                           "Le cadre visible grandit de \(scale)× en largeur")
            XCTAssertEqual(layer.frame.height, base.frame.height * CGFloat(scale), accuracy: 0.01,
                           "… et en hauteur, la forme intacte")
        }
    }

    func test_unTexteAgrandi_estRasteriséNet_pasUnBitmapEtiré() {
        XCTAssertEqual(posé(scale: 1, renderScale: 3).contentsScale, 3)
        XCTAssertEqual(posé(scale: 2, renderScale: 3).contentsScale, 6)
    }

    func test_unTexteTourné_gardeSaRotationSousLEchelle() {
        let layer = posé(scale: 2, rotation: 90)
        XCTAssertEqual(layer.transform.m12, 2, accuracy: 0.0001)
    }

    // MARK: - L'éditeur en ligne

    /// Ouvre la saisie d'un texte à l'échelle donnée et rend la taille de
    /// police du champ et ses plages de lignes.
    private func saisie(scale: Double) throws -> (pointSize: CGFloat, lignes: [NSRange]) {
        let text = StoryTextObject(id: "t1", text: Self.texte, x: 0.5, y: 0.5, scale: scale, fontSize: 96)
        let canvas = StoryCanvasUIView(slide: StorySlide(id: "s1", effects: StoryEffects(textObjects: [text])),
                                       mode: .edit)
        canvas.frame = CGRect(x: 0, y: 0, width: 390, height: 693)
        canvas.layoutIfNeeded()
        canvas.beginInlineTextEdit(textId: "t1")
        let editor = try XCTUnwrap(canvas.inlineEditor)
        editor.layoutIfNeeded()
        let manager = editor.layoutManager
        manager.ensureLayout(for: editor.textContainer)
        var plages: [NSRange] = []
        manager.enumerateLineFragments(forGlyphRange: NSRange(location: 0, length: manager.numberOfGlyphs)) { _, _, _, glyphs, _ in
            plages.append(manager.characterRange(forGlyphRange: glyphs, actualGlyphRange: nil))
        }
        return (editor.font?.pointSize ?? 0, plages)
    }

    /// Rouvrir la saisie d'un texte AGRANDI montre la coupe de son édition :
    /// même taille de police, mêmes lignes qu'à l'échelle 1. Avant le #9139 le
    /// champ écrivait à `fontSize × scale` contre la même largeur, et la
    /// saisie recoupait le texte que l'on venait d'agrandir.
    func test_rouvrirLaSaisie_dUnTexteAgrandi_montreLaCoupeDeLEdition() throws {
        let édition = try saisie(scale: 1)
        XCTAssertGreaterThanOrEqual(édition.lignes.count, 2, "La fixture doit couper en saisie")
        for scale in [0.5, 2, 4] {
            let agrandi = try saisie(scale: scale)
            XCTAssertEqual(agrandi.pointSize, édition.pointSize, accuracy: 0.001,
                           "À l'échelle \(scale), le champ écrit à la taille de l'édition")
            XCTAssertEqual(agrandi.lignes, édition.lignes,
                           "À l'échelle \(scale), la saisie coupe comme à l'édition")
        }
    }
}
