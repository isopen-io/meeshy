import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le texte en feu brûle SUR les lettres** (#17112, L10 — retour porteur du
/// 2026-11-08 : « les flammes doivent être sur les lettres pour le texte en
/// feu »). Les flammes naissent de la silhouette de chaque glyphe et montent
/// au-dessus de lui ; elles ne descendent jamais et ne forment pas une bande
/// posée derrière le texte.
@MainActor
final class StoryFlameTextRendererTests: XCTestCase {

    // MARK: - Fabriques

    private func fireText(_ value: String = "Feu", effect: String? = "fire",
                          backgroundStyle: StoryTextBackgroundStyle? = nil) -> StoryTextObject {
        StoryTextObject(id: "t1", text: value, fontSize: 120, textStyle: "bold",
                        textColor: "FFFFFF", textAlign: "center",
                        backgroundStyle: backgroundStyle, textEffect: effect)
    }

    private let geometry = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))

    /// Un « glyphe » carré au milieu d'un cadre : colonnes 6..<14, rangées
    /// `top..<bottom`. Le reste est vide.
    private func block(width: Int = 20, height: Int = 40, top: Int, bottom: Int) -> [UInt8] {
        (0..<(width * height)).map { index in
            let x = index % width, y = index / width
            return (6..<14).contains(x) && (top..<bottom).contains(y) ? 255 : 0
        }
    }

    private func row(_ bytes: [UInt8], _ y: Int, width: Int = 20) -> ArraySlice<UInt8> {
        bytes[(y * width)..<((y + 1) * width)]
    }

    // MARK: - La silhouette : les flammes montent des lettres

    func test_silhouette_keepsTheLettersFullyInside() {
        let flames = StoryFlameTextRenderer.flameSilhouette(
            coverage: block(top: 20, bottom: 30), width: 20, height: 40, lickRows: 18)
        XCTAssertEqual(flames[25 * 20 + 10], 255, "l'intérieur du glyphe reste plein")
    }

    func test_silhouette_licksUpAboveTheLetters_fadingAsItRises() {
        let flames = StoryFlameTextRenderer.flameSilhouette(
            coverage: block(top: 20, bottom: 30), width: 20, height: 40, lickRows: 18)
        let near = flames[17 * 20 + 10], far = flames[8 * 20 + 10]
        XCTAssertGreaterThan(near, 0, "une flamme lèche juste au-dessus de la lettre")
        XCTAssertGreaterThan(near, far, "la flamme s'éteint en montant")
    }

    func test_silhouette_neverLicksDownwards() {
        let flames = StoryFlameTextRenderer.flameSilhouette(
            coverage: block(top: 15, bottom: 22), width: 20, height: 40, lickRows: 18)
        for y in 23..<40 {
            XCTAssertTrue(row(flames, y).allSatisfy { $0 == 0 }, "rangée \(y) sous la lettre allumée")
        }
    }

    /// Une bande derrière le texte allumerait aussi les colonnes VIDES ; la
    /// flamme, elle, naît des lettres et laisse les bords du cadre éteints.
    func test_silhouette_isShapedByTheLetters_notABandBehindThem() {
        let flames = StoryFlameTextRenderer.flameSilhouette(
            coverage: block(top: 20, bottom: 30), width: 20, height: 40, lickRows: 18)
        XCTAssertEqual(flames[25 * 20 + 0], 0)
        XCTAssertEqual(flames[25 * 20 + 19], 0)
    }

    func test_silhouette_isDeterministic() {
        let coverage = block(top: 20, bottom: 30)
        XCTAssertEqual(
            StoryFlameTextRenderer.flameSilhouette(coverage: coverage, width: 20, height: 40, lickRows: 12),
            StoryFlameTextRenderer.flameSilhouette(coverage: coverage, width: 20, height: 40, lickRows: 12))
    }

    func test_silhouette_withoutLick_isTheGlyphsThemselves() {
        let coverage = block(top: 20, bottom: 30)
        XCTAssertEqual(
            StoryFlameTextRenderer.flameSilhouette(coverage: coverage, width: 20, height: 40, lickRows: 0),
            coverage)
    }

    // MARK: - Le feu : une texture qui monte en boucle sans couture

    func test_noise_isVerticallyTileable_soTheRiseLoopsWithoutASeam() {
        let period = StoryFlameTextRenderer.texturePeriod
        for x in stride(from: 0, to: StoryFlameTextRenderer.textureWidth, by: 7) {
            XCTAssertEqual(StoryFlameTextRenderer.fireIntensity(px: x, py: 3, seed: 11),
                           StoryFlameTextRenderer.fireIntensity(px: x, py: 3 + period, seed: 11),
                           accuracy: 1e-9)
        }
    }

    func test_texture_isDeterministic_andNotFlat() {
        let a = StoryFlameTextRenderer.textureAlpha(seed: 7)
        XCTAssertEqual(a, StoryFlameTextRenderer.textureAlpha(seed: 7))
        XCTAssertEqual(a.count, StoryFlameTextRenderer.textureWidth * StoryFlameTextRenderer.texturePeriod * 2)
        XCTAssertGreaterThan(Set(a).count, 8, "un feu uniforme ne lèche pas")
        XCTAssertTrue(a.contains(0), "des trous entre les langues de feu")
    }

    func test_phase_wrapsOnTheCycle() {
        let d = StoryFlameTextRenderer.cycleDuration
        XCTAssertEqual(StoryFlameTextRenderer.phase(atElapsed: 0, duration: d), 0, accuracy: 1e-9)
        XCTAssertEqual(StoryFlameTextRenderer.phase(atElapsed: d * 2.25, duration: d), 0.25, accuracy: 1e-9)
        XCTAssertEqual(StoryFlameTextRenderer.phase(atElapsed: -d * 0.25, duration: d), 0.75, accuracy: 1e-9)
    }

    /// Chaud à la base des lettres, rouge et transparent à la pointe.
    func test_heatStops_runFromTheTipToTheBase() {
        let stops = StoryFlameTextRenderer.heatStops(lickFraction: 0.4)
        XCTAssertEqual(stops.first?.location, 0)
        XCTAssertEqual(stops.last?.location, 1)
        XCTAssertEqual(stops.map(\.location), stops.map(\.location).sorted())
        XCTAssertEqual(stops.first?.alpha, 0, "la pointe s'éteint")
        XCTAssertTrue(stops.contains { $0.location == 0.4 }, "un arrêt sur le sommet des lettres")
    }

    // MARK: - La calque de flamme

    func test_flameLayer_animates_whenMotionIsAllowed() {
        let flame = StoryFlameLayer()
        flame.configure(glyphFrame: CGRect(x: 0, y: 0, width: 200, height: 80), fontSize: 60,
                        key: StoryFlameGlyphKey(glyphs: NSAttributedString(string: "A"),
                                                size: CGSize(width: 200, height: 80), scale: 1),
                        animates: true) { ctx in
            ctx.setFillColor(UIColor.white.cgColor)
            ctx.fill(CGRect(x: 80, y: 10, width: 40, height: 60))
        }
        XCTAssertTrue(flame.isAnimating)
        XCTAssertNotNil(flame.mask, "le feu est masqué par la silhouette des lettres")
    }

    /// Mouvement réduit : une image fixe, déterministe, sans aucune animation.
    func test_flameLayer_underReduceMotion_isAStillFrame() {
        let flame = StoryFlameLayer()
        flame.configure(glyphFrame: CGRect(x: 0, y: 0, width: 200, height: 80), fontSize: 60,
                        key: StoryFlameGlyphKey(glyphs: NSAttributedString(string: "A"),
                                                size: CGSize(width: 200, height: 80), scale: 1),
                        animates: false) { _ in }
        XCTAssertFalse(flame.isAnimating)
        XCTAssertTrue(flame.allAnimationKeys.isEmpty)
    }

    func test_flameLayer_risesAboveTheGlyphFrame() {
        let flame = StoryFlameLayer()
        flame.configure(glyphFrame: CGRect(x: 10, y: 20, width: 200, height: 80), fontSize: 60,
                        key: StoryFlameGlyphKey(glyphs: NSAttributedString(string: "A"),
                                                size: CGSize(width: 200, height: 80), scale: 1),
                        animates: false) { _ in }
        XCTAssertEqual(flame.frame.maxY, 100, accuracy: 0.001, "la base reste celle des lettres")
        XCTAssertEqual(flame.frame.minY, 20 - StoryFlameTextRenderer.lickHeight(fontSize: 60), accuracy: 0.001)
    }

    // MARK: - Le canvas

    func test_textLayer_withFlame_burnsOverItsGlyphs() throws {
        let layer = StoryTextLayer()
        layer.configure(with: fireText(), geometry: geometry, mode: .edit, renderScale: 2)
        let flame = try XCTUnwrap(layer.flameLayer)
        XCTAssertTrue(flame.superlayer === layer)
        XCTAssertLessThan(flame.frame.minY, 0, "les flammes dépassent au-dessus du texte")
        XCTAssertFalse(layer.shouldRasterize, "une calque rasterisée figerait le feu")
    }

    func test_textLayer_otherEffects_lightNoFire() {
        let layer = StoryTextLayer()
        layer.configure(with: fireText(effect: "neon"), geometry: geometry, mode: .edit, renderScale: 2)
        XCTAssertNil(layer.flameLayer)
    }

    func test_textLayer_leavingTheFlame_putsTheFireOut() {
        let layer = StoryTextLayer()
        layer.configure(with: fireText(), geometry: geometry, mode: .edit, renderScale: 2)
        layer.configure(with: fireText(effect: "gold"), geometry: geometry, mode: .edit, renderScale: 2)
        XCTAssertNil(layer.flameLayer)
        XCTAssertFalse(layer.sublayers?.contains { $0 is StoryFlameLayer } ?? false)
    }

    /// Pendant l'édition en place, le champ peint ses propres flammes : celles
    /// du calque, taillées sur l'ancien texte, se cachent.
    func test_textLayer_hidingItsGlyphs_hidesTheFire() throws {
        let layer = StoryTextLayer()
        layer.configure(with: fireText(), geometry: geometry, mode: .edit, renderScale: 2)
        layer.setGlyphsHidden(true)
        XCTAssertTrue(try XCTUnwrap(layer.flameLayer).isHidden)
        layer.setGlyphsHidden(false)
        XCTAssertFalse(try XCTUnwrap(layer.flameLayer).isHidden)
    }

    func test_textLayer_inPlayback_keepsBurning() throws {
        let layer = StoryTextLayer()
        layer.configure(with: fireText(), geometry: geometry, mode: .play, renderScale: 2)
        XCTAssertNotNil(layer.flameLayer)
        XCTAssertFalse(layer.shouldRasterize)
    }

    /// **Un rendu « en un coup » (`layer.render(in:)` — vignette, export) peint
    /// les flammes sur les lettres, pas une boîte de feu** : entre deux lettres
    /// éloignées, à mi-hauteur des flammes, rien ne brûle.
    func test_textLayer_renderedInOneShot_burnsOnTheLettersNotABox() throws {
        let layer = StoryTextLayer()
        layer.configure(with: fireText("I        I"), geometry: geometry, mode: .edit, renderScale: 1)
        let flame = try XCTUnwrap(layer.flameLayer)
        let lick = -flame.frame.minY
        let size = CGSize(width: layer.bounds.width, height: layer.bounds.height + lick)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            ctx.cgContext.translateBy(x: 0, y: lick)
            layer.render(in: ctx.cgContext)
        }
        let pixels = try XCTUnwrap(RGBAPixels(image))
        let gap = pixels.at(x: Int(size.width / 2), y: Int(lick * 0.6))
        XCTAssertEqual(gap.a, 0, "le feu ne remplit pas l'espace entre les lettres")
        let band = (Int(lick * 0.5)..<Int(lick)).flatMap { y in
            (0..<Int(size.width)).map { pixels.at(x: $0, y: y) }
        }
        XCTAssertTrue(band.contains { $0.a > 0 }, "des flammes au-dessus des lettres")
    }

    // MARK: - L'éditeur en ligne

    func test_inlineEditor_burnsWhileTyping() {
        let editor = StoryInlineTextEditor()
        editor.bounds = CGRect(x: 0, y: 0, width: 300, height: 120)
        editor.apply(textObject: fireText(), geometry: geometry, setText: true)
        XCTAssertTrue(editor.layer.sublayers?.contains { $0 is StoryFlameLayer } ?? false)
        editor.apply(textObject: fireText(effect: "shadow"), geometry: geometry, setText: false)
        XCTAssertFalse(editor.layer.sublayers?.contains { $0 is StoryFlameLayer } ?? false)
    }

    // MARK: - L'image fixe (couverture, thumbHash, export)

    func test_still_paintsWarmFlamesAboveTheLetters_andNothingBelow() throws {
        let size = CGSize(width: 200, height: 200)
        let glyphRect = CGRect(x: 40, y: 100, width: 120, height: 60)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            StoryFlameTextRenderer.drawStill(in: ctx.cgContext, glyphRect: glyphRect, fontSize: 60) { glyphs in
                glyphs.setFillColor(UIColor.white.cgColor)
                glyphs.fill(CGRect(x: 30, y: 0, width: 60, height: 60))
            }
        }
        let pixels = try XCTUnwrap(RGBAPixels(image))
        let above = (50..<100).flatMap { y in (70..<130).map { pixels.at(x: $0, y: y) } }
        XCTAssertTrue(above.contains { $0.a > 20 && $0.r > $0.b }, "des flammes chaudes au-dessus des lettres")
        let beside = (50..<100).flatMap { y in (42..<58).map { pixels.at(x: $0, y: y) } }
        XCTAssertTrue(beside.allSatisfy { $0.a == 0 }, "aucune flamme loin des lettres : pas une bande")
        let below = (165..<200).flatMap { y in (0..<200).map { pixels.at(x: $0, y: y) } }
        XCTAssertTrue(below.allSatisfy { $0.a == 0 }, "rien sous les lettres")
    }

    // MARK: - La graisse : un segment, pas un curseur

    func test_weightSegment_readsAndWritesTheWeight() {
        var obj = StoryTextObject(id: "t1", text: "X")
        XCTAssertEqual(TextEditToolOptions.weightSegment(for: obj), .normal)
        TextEditToolOptions.applyingWeightSegment(.bold, to: &obj)
        XCTAssertEqual(obj.parsedFontWeight, .bold)
        XCTAssertEqual(TextEditToolOptions.weightSegment(for: obj), .bold)
    }

    // MARK: - Les noms

    /// Cinq vignettes, cinq noms : VoiceOver ne doit jamais annoncer deux
    /// choix du sélecteur par le même mot.
    func test_thePickerChoices_carryDistinctNames() {
        let titles = StoryTextEffect.pickerChoices.map { TextEditLabels.title(for: $0) }
        XCTAssertEqual(Set(titles).count, titles.count)
        XCTAssertTrue(titles.allSatisfy { !$0.isEmpty })
    }
}

/// Lecture des pixels RGBA 8 bits d'une image rendue, pour les témoins.
private struct RGBAPixels {
    struct Pixel { let r: UInt8; let g: UInt8; let b: UInt8; let a: UInt8 }
    let bytes: [UInt8]
    let width: Int

    init?(_ image: UIImage) {
        guard let cg = image.cgImage else { return nil }
        let w = cg.width, h = cg.height
        var buffer = [UInt8](repeating: 0, count: w * h * 4)
        let drawn = buffer.withUnsafeMutableBytes { raw -> Bool in
            guard let ctx = CGContext(data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8,
                                      bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard drawn else { return nil }
        bytes = buffer
        width = w
    }

    func at(x: Int, y: Int) -> Pixel {
        let i = (y * width + x) * 4
        return Pixel(r: bytes[i], g: bytes[i + 1], b: bytes[i + 2], a: bytes[i + 3])
    }
}
