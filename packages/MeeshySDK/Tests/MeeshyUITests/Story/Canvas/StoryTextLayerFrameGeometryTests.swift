import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Géométrie des cadres path-based (losange / nuage / bulle BD) et résolution
/// de police pour les nouveaux styles. `frameMetrics` / `framePath` sont des
/// statics `nonisolated` — testables sans instancier de calque ni de vue.
/// `@MainActor` car `StoryTextFontResolver` vit dans MeeshyUI dont l'isolation
/// par défaut est MainActor (SE-0466) — même pattern que `StoryRenderer_RenderTests`.
@MainActor
final class StoryTextLayerFrameGeometryTests: XCTestCase {

    private let textSize = CGSize(width: 200, height: 60)
    private let oGlyph: CGFloat = 20

    // MARK: - frameMetrics

    func test_frameMetrics_cornerShapes_keepHistoricalPadding() {
        for shape in [StoryTextFrameShape.rounded, .pill, .rectangle] {
            let metrics = StoryTextLayer.frameMetrics(shape: shape, isFramed: true,
                                                      textSize: textSize, oGlyphWidth: oGlyph)
            XCTAssertEqual(metrics.bounds, CGSize(width: 240, height: 76))
            XCTAssertEqual(metrics.glyphRect, CGRect(x: 20, y: 8, width: 200, height: 60))
        }
    }

    func test_frameMetrics_unframed_ignoresShapeAndKeepsLegacyPad() {
        let metrics = StoryTextLayer.frameMetrics(shape: .diamond, isFramed: false,
                                                  textSize: textSize, oGlyphWidth: 0)
        XCTAssertEqual(metrics.bounds, CGSize(width: 216, height: 76))
    }

    func test_frameMetrics_diamond_inscribesTextRectExactly() {
        let metrics = StoryTextLayer.frameMetrics(shape: .diamond, isFramed: true,
                                                  textSize: textSize, oGlyphWidth: oGlyph)
        XCTAssertEqual(metrics.bounds, CGSize(width: 400, height: 120))
        // Glyphes centrés dans le rhombe.
        XCTAssertEqual(metrics.glyphRect.midX, metrics.bounds.width / 2, accuracy: 0.5)
        XCTAssertEqual(metrics.glyphRect.midY, metrics.bounds.height / 2, accuracy: 0.5)
        // Coin du texte exactement sur le bord du rhombe : w/W + h/H == 1.
        let ratio = textSize.width / metrics.bounds.width
            + textSize.height / metrics.bounds.height
        XCTAssertEqual(ratio, 1.0, accuracy: 0.01)
    }

    func test_frameMetrics_speech_reservesTailBandBelowGlyphs() {
        let metrics = StoryTextLayer.frameMetrics(shape: .speech, isFramed: true,
                                                  textSize: textSize, oGlyphWidth: oGlyph)
        XCTAssertEqual(metrics.bounds.height, 76 + StoryTextLayer.speechTailHeight)
        XCTAssertEqual(metrics.glyphRect, CGRect(x: 20, y: 8, width: 200, height: 60))
    }

    func test_frameMetrics_cloud_reservesPuffAndThoughtBands() {
        let metrics = StoryTextLayer.frameMetrics(shape: .cloud, isFramed: true,
                                                  textSize: textSize, oGlyphWidth: oGlyph)
        let puff = StoryTextLayer.cloudPuffRadius
        XCTAssertEqual(metrics.bounds.width, 240 + puff * 2)
        XCTAssertEqual(metrics.bounds.height,
                       76 + puff * 2 + StoryTextLayer.cloudThoughtHeight)
        XCTAssertEqual(metrics.glyphRect.origin, CGPoint(x: 20 + puff, y: 8 + puff))
    }

    // MARK: - framePath

    func test_framePath_nilForCornerShapes_pathForCustomShapes() {
        let rect = CGRect(x: 0, y: 0, width: 400, height: 160)
        XCTAssertNil(StoryTextLayer.framePath(shape: .rounded, in: rect))
        XCTAssertNil(StoryTextLayer.framePath(shape: .pill, in: rect))
        XCTAssertNil(StoryTextLayer.framePath(shape: .rectangle, in: rect))
        XCTAssertNotNil(StoryTextLayer.framePath(shape: .diamond, in: rect))
        XCTAssertNotNil(StoryTextLayer.framePath(shape: .cloud, in: rect))
        XCTAssertNotNil(StoryTextLayer.framePath(shape: .speech, in: rect))
    }

    func test_framePath_diamond_spansRectWithVerticesOnEdgeMidpoints() {
        let rect = CGRect(x: 0, y: 0, width: 400, height: 160)
        let path = StoryTextLayer.framePath(shape: .diamond, in: rect)!
        XCTAssertTrue(path.contains(CGPoint(x: rect.midX, y: rect.midY)))
        XCTAssertFalse(path.contains(CGPoint(x: 4, y: 4)),
                       "les coins du rect sont HORS du losange")
        XCTAssertEqual(path.boundingBoxOfPath, rect)
    }

    func test_framePath_speech_staysInsideRect_tailReachesBottom() {
        let rect = CGRect(x: 0, y: 0, width: 400, height: 160)
        let path = StoryTextLayer.framePath(shape: .speech, in: rect)!
        let box = path.boundingBoxOfPath
        XCTAssertTrue(rect.insetBy(dx: -0.5, dy: -0.5).contains(box),
                      "la bulle ne doit pas déborder de ses bounds")
        XCTAssertEqual(box.maxY, rect.maxY, accuracy: 0.5,
                       "la queue descend jusqu'au bas de la bande réservée")
    }

    func test_framePath_cloud_staysInsideRect() {
        let rect = CGRect(x: 0, y: 0, width: 400, height: 220)
        let path = StoryTextLayer.framePath(shape: .cloud, in: rect)!
        let box = path.boundingBoxOfPath
        XCTAssertTrue(rect.insetBy(dx: -0.5, dy: -0.5).contains(box),
                      "le nuage (bosses + bulles de pensée) reste dans ses bounds")
        XCTAssertTrue(path.contains(CGPoint(x: rect.midX, y: 80)))
    }

    // MARK: - Résolution de police (nouveaux styles + graisse visible)

    func test_resolveFont_newStyles_useTheirNamedFamily() {
        let expectations: [(StoryTextStyle, String)] = [
            (.calligraphy, "Zapfino"),
            (.cartoon, "Chalkboard"),
            (.futuristic, "Futura"),
            (.fantasy, "Papyrus"),
            (.tag, "Marker Felt")
        ]
        for (style, family) in expectations {
            var text = StoryTextObject(id: "f", text: "X")
            text.textStyle = style.rawValue
            let font = StoryTextFontResolver.resolveFont(forTextObject: text, size: 40)
            XCTAssertTrue(font.familyName.localizedCaseInsensitiveContains(family),
                          "\(style) devrait résoudre vers \(family), a résolu \(font.familyName)")
        }
    }

    func test_weightOverride_changesTheRenderedFace_onNamedFamilies() {
        // Chalkboard SE embarque Light / Regular / Bold : la graisse « fin »
        // doit sélectionner une face différente de « gras » — c'est ce qui
        // rend le changement visible sur le canvas (le trait `.weight` posé en
        // attribut sur une famille nommée ne changeait RIEN à l'écran).
        var text = StoryTextObject(id: "w", text: "X")
        text.textStyle = StoryTextStyle.cartoon.rawValue
        text.fontWeight = StoryTextWeight.thin.rawValue
        let thin = StoryTextFontResolver.resolveFont(forTextObject: text, size: 40)
        text.fontWeight = StoryTextWeight.bold.rawValue
        let bold = StoryTextFontResolver.resolveFont(forTextObject: text, size: 40)

        XCTAssertNotEqual(thin.fontName, bold.fontName,
                          "fin vs gras doivent rendre deux faces différentes")
        XCTAssertTrue(thin.familyName.localizedCaseInsensitiveContains("Chalkboard"))
        XCTAssertTrue(bold.familyName.localizedCaseInsensitiveContains("Chalkboard"))
    }

    func test_weightOverride_keepsSystemDesign_onSystemStyles() {
        // Style système (neon = rounded) : le chemin par traits est conservé —
        // la graisse change sans perdre le design rounded.
        var text = StoryTextObject(id: "s", text: "X")
        text.textStyle = StoryTextStyle.neon.rawValue
        text.fontWeight = StoryTextWeight.bold.rawValue
        let font = StoryTextFontResolver.resolveFont(forTextObject: text, size: 40)
        XCTAssertTrue(font.fontName.hasPrefix("."),
                      "un style système doit rester sur la famille système")
    }
}
