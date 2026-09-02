import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **L'axe EFFET se rend sur les trois moteurs UIKit d'un texte** (#4870) —
/// `NSShadow` pour TextKit (éditeur en ligne, composite cover), ombre
/// `CALayer` pour le canvas — depuis UN site de conversion, et sur la calque
/// qui PEINT les glyphes, jamais sur la boîte.
@MainActor
final class StoryTextEffectRenderingTests: XCTestCase {

    private func text(effect: String?,
                      backgroundStyle: StoryTextBackgroundStyle? = nil,
                      frameShape: String? = nil) -> StoryTextObject {
        StoryTextObject(
            id: "t1", text: "Bonjour",
            fontSize: 96,
            textStyle: "bold",
            textColor: "FF0000",
            textAlign: "center",
            backgroundStyle: backgroundStyle,
            frameShape: frameShape,
            textEffect: effect
        )
    }

    private let geometry = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))

    // MARK: - NSShadow (TextKit)

    func test_nsShadow_withoutEffect_isNil() {
        XCTAssertNil(StoryTextEffectRendering.nsShadow(for: text(effect: nil),
                                                       fontSize: 40, textColor: .red))
    }

    /// La lueur est un HALO de la couleur du texte : centrée, dans sa teinte.
    func test_nsShadow_forGlow_isCenteredInTheTextColour() throws {
        let shadow = try XCTUnwrap(StoryTextEffectRendering.nsShadow(
            for: text(effect: "glow"), fontSize: 40, textColor: .red))
        XCTAssertEqual(shadow.shadowOffset, .zero)
        XCTAssertGreaterThan(shadow.shadowBlurRadius, 0)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        XCTAssertTrue((shadow.shadowColor as? UIColor)?.getRed(&r, green: &g, blue: &b, alpha: &a) == true)
        XCTAssertEqual(r, 1, accuracy: 0.001)
        XCTAssertEqual(g, 0, accuracy: 0.001)
    }

    /// L'ombre portée est noire et décalée vers le BAS (y positif, la
    /// convention d'UIKit, de CSS et de Compose) ; le relief est net.
    func test_nsShadow_forShadowAndRelief_areBlackAndOffsetDownwards() throws {
        let shadow = try XCTUnwrap(StoryTextEffectRendering.nsShadow(
            for: text(effect: "shadow"), fontSize: 100, textColor: .red))
        let relief = try XCTUnwrap(StoryTextEffectRendering.nsShadow(
            for: text(effect: "relief"), fontSize: 100, textColor: .red))
        XCTAssertGreaterThan(shadow.shadowOffset.height, 0)
        XCTAssertGreaterThan(relief.shadowOffset.height, 0)
        XCTAssertGreaterThan(shadow.shadowBlurRadius, 0)
        XCTAssertEqual(relief.shadowBlurRadius, 0)
        var r: CGFloat = 1, g: CGFloat = 1, b: CGFloat = 1, a: CGFloat = 1
        XCTAssertTrue((relief.shadowColor as? UIColor)?.getRed(&r, green: &g, blue: &b, alpha: &a) == true)
        XCTAssertEqual(r + g + b, 0, accuracy: 0.001, "noir, pas la couleur du texte")
        XCTAssertLessThan(a, 1, "à l'opacité de la table, jamais opaque")
    }

    /// La table est en em : l'ombre suit la taille de police RENDUE.
    func test_nsShadow_scalesWithTheFontSize() throws {
        let small = try XCTUnwrap(StoryTextEffectRendering.nsShadow(
            for: text(effect: "shadow"), fontSize: 50, textColor: .white))
        let large = try XCTUnwrap(StoryTextEffectRendering.nsShadow(
            for: text(effect: "shadow"), fontSize: 100, textColor: .white))
        XCTAssertEqual(large.shadowOffset.height, small.shadowOffset.height * 2, accuracy: 0.0001)
        XCTAssertEqual(large.shadowBlurRadius, small.shadowBlurRadius * 2, accuracy: 0.0001)
    }

    // MARK: - CALayer

    func test_apply_thenClear_leavesNoShadowBehind() {
        let layer = CALayer()
        StoryTextEffectRendering.apply(.glow, to: layer, fontSize: 40,
                                       textColor: .white, rasterizationScale: 2)
        XCTAssertEqual(layer.shadowOpacity, 1)
        XCTAssertGreaterThan(layer.shadowRadius, 0)
        XCTAssertTrue(layer.shouldRasterize, "une ombre sans tracé se rasterise, sinon elle se recalcule à chaque image")
        XCTAssertEqual(layer.rasterizationScale, 2)

        StoryTextEffectRendering.clear(layer)
        XCTAssertEqual(layer.shadowOpacity, 0)
        XCTAssertEqual(layer.shadowRadius, 0)
        XCTAssertNil(layer.shadowColor)
    }

    // MARK: - StoryTextLayer — sur la calque qui PEINT les glyphes

    private func glyphSublayers(of layer: StoryTextLayer) -> [CATextLayer] {
        (layer.sublayers ?? []).compactMap { $0 as? CATextLayer }
    }

    /// Texte nu : les glyphes sont le seul contenu de la calque, l'ombre est
    /// donc la leur — chemin historique, aucune sous-calque ajoutée.
    func test_bareText_carriesTheShadowOnItself() {
        let layer = StoryTextLayer()
        layer.configure(with: text(effect: "glow"), geometry: geometry, mode: .edit)
        XCTAssertEqual(layer.shadowOpacity, 1)
        XCTAssertGreaterThan(layer.shadowRadius, 0)
        XCTAssertTrue(glyphSublayers(of: layer).isEmpty,
                      "un texte nu n'a pas besoin de sous-calque pour porter son ombre")
    }

    /// Texte dans une BOÎTE (fond solide) : l'ombre posée sur la calque
    /// ombrerait la boîte — elle migre avec les glyphes dans leur sous-calque.
    func test_framedText_carriesTheShadowOnTheGlyphSublayer_notOnTheBox() throws {
        let layer = StoryTextLayer()
        layer.configure(with: text(effect: "shadow",
                                   backgroundStyle: .solid(hex: "000000"),
                                   frameShape: "rounded"),
                        geometry: geometry, mode: .edit)
        XCTAssertEqual(layer.shadowOpacity, 0, "la boîte ne porte aucune ombre")
        let glyphs = try XCTUnwrap(glyphSublayers(of: layer).first,
                                   "un effet sur une boîte force la sous-calque de glyphes")
        XCTAssertEqual(glyphs.shadowOpacity, 1)
        XCTAssertGreaterThan(glyphs.shadowOffset.height, 0)
    }

    /// **Fond solide + forme « Aucun »** : `hasFrameBox` est faux, mais le fond
    /// est quand même peint sur `backgroundColor` de la calque — l'ombre doit
    /// encore migrer avec les glyphes, sinon c'est la boîte qui brille (revue
    /// adverse du lot, 2026-09-02). La question est « qu'est-ce que `self`
    /// peint ? », pas « y a-t-il une boîte ? ».
    func test_solidBackgroundWithoutFrameShape_stillCarriesTheShadowOnTheGlyphs() throws {
        let layer = StoryTextLayer()
        layer.configure(with: text(effect: "glow",
                                   backgroundStyle: .solid(hex: "000000"),
                                   frameShape: "none"),
                        geometry: geometry, mode: .edit)
        XCTAssertEqual(layer.shadowOpacity, 0, "le fond solide ne porte aucune ombre")
        let glyphs = try XCTUnwrap(glyphSublayers(of: layer).first)
        XCTAssertEqual(glyphs.shadowOpacity, 1)
    }

    /// Une calque REconfigurée sans effet ne garde pas l'ombre d'avant —
    /// `configure` est idempotent.
    func test_reconfiguringWithoutEffect_clearsTheShadow() {
        let layer = StoryTextLayer()
        layer.configure(with: text(effect: "relief"), geometry: geometry, mode: .edit)
        XCTAssertEqual(layer.shadowOpacity, 1)
        layer.configure(with: text(effect: nil), geometry: geometry, mode: .edit)
        XCTAssertEqual(layer.shadowOpacity, 0)
        XCTAssertEqual(layer.shadowRadius, 0)
    }

    /// Sans effet, un texte dans une boîte garde le chemin historique : aucune
    /// sous-calque de glyphes n'est ajoutée pour rien.
    func test_framedText_withoutEffect_keepsTheHistoricalPath() {
        let layer = StoryTextLayer()
        layer.configure(with: text(effect: nil,
                                   backgroundStyle: .solid(hex: "000000"),
                                   frameShape: "rounded"),
                        geometry: geometry, mode: .edit)
        XCTAssertTrue(glyphSublayers(of: layer).isEmpty)
    }

    // MARK: - Composite cover / thumbHash

    /// Le composite pose le MÊME `NSShadow` que l'éditeur en ligne — un seul
    /// site de conversion, sinon la cover montrerait un texte plat là où la
    /// scène brille.
    func test_compositeRenderer_usesTheSharedShadow() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/StorySlideRenderer.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        XCTAssertTrue(source.contains("StoryTextEffectRendering.nsShadow("),
                      "le composite doit passer par le site unique de conversion (#4870)")
        let editorURL = sourceURL.deletingLastPathComponent()
            .appendingPathComponent("Canvas/StoryInlineTextEditor.swift")
        let editor = try String(contentsOf: editorURL, encoding: .utf8)
        XCTAssertTrue(editor.contains("StoryTextEffectRendering.nsShadow("),
                      "l'éditeur en ligne aussi — le texte qu'on tape brille comme le texte posé")
    }
}
