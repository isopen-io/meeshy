import XCTest
import QuartzCore
import CoreText
@testable import MeeshyUI
@testable import MeeshySDK

/// Régression : un texte long doit **passer à la ligne** dans la largeur du
/// canvas, pas déborder ni être tronqué avec « … ». `configure` mesurait le
/// texte en mono-ligne (`NSAttributedString.size()`), produisant des largeurs
/// hors-canvas.
@MainActor
final class StoryTextLayerWrappingTests: XCTestCase {

    private let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))

    private func configured(_ text: String) -> StoryTextLayer {
        let obj = StoryTextObject(id: "t", text: text)
        let layer = StoryTextLayer()
        layer.configure(with: obj, geometry: geometry, mode: .edit)
        return layer
    }

    func test_configure_longText_wrapsWithinCanvasWidth() {
        let short = configured("Court")
        let long = configured("Un message vraiment tres long qui doit absolument "
            + "passer a la ligne sur plusieurs lignes du canvas au lieu de "
            + "deborder largement ou d'etre tronque avec des points de suspension")

        // Le texte long reste dans la largeur du canvas (il wrappe).
        XCTAssertLessThanOrEqual(long.bounds.width, geometry.renderSize.width)
        // Et il est nettement plus haut que le texte court — plusieurs lignes.
        XCTAssertGreaterThan(long.bounds.height, short.bounds.height * 2)
    }

    func test_configure_neverTruncates() {
        let long = configured("Un message long qui doit passer a la ligne proprement")
        XCTAssertEqual(long.truncationMode, .none,
                       "le texte ne doit jamais être tronqué avec « … »")
    }

    // MARK: - Hauteur réellement exigée par CoreText (repro 2026-08 emoji multi-lignes)

    /// Régression repro prod : un texte multi-lignes se terminant par des
    /// emojis dimensionne ses `bounds` avec TextKit (`NSAttributedString.
    /// boundingRect`), moteur qui ne rend PAS le texte. Le rendu réel passe
    /// par CoreText via `CATextLayer`, qui a besoin de PLUS de hauteur pour
    /// les mêmes lignes (Apple Color Emoji a un ascent/descent supérieur à la
    /// police du texte, non compté par `.usesFontLeading`). Quand les bounds
    /// posés sont trop courts, `CATextLayer` ne coupe JAMAIS verticalement :
    /// il réduit le nombre de lignes affichées et AGGLOMÈRE le texte restant
    /// sur la dernière ligne visible, que `alignmentMode = .center` rogne à
    /// gauche ET à droite — panne totalement silencieuse (`truncationMode =
    /// .none` supprime même l'ellipse qui aurait signalé le problème).
    ///
    /// L'ancienne version de ce test comparait `bounds.height` à
    /// `CTFramesetterSuggestFrameSizeWithConstraints` — mais cette API
    /// SOUS-ESTIME elle-même la hauteur réelle quand la DERNIÈRE ligne
    /// wrappée est composée UNIQUEMENT d'emoji, posée avec une police de base
    /// à fort descent (SavoyeLetPlain ici, `textStyle: "curve"`) :
    /// `CATextLayer` réserve AU MOINS le descent de sa police de base pour
    /// CHAQUE ligne, y compris celle-ci, ce que
    /// `CTFramesetterSuggestFrameSizeWithConstraints` ignore (il ne rapporte
    /// que le max des runs RÉELLEMENT présents sur la ligne — ici seulement
    /// le run emoji substitué, à descent plus petit). Ce test compare donc
    /// `bounds.height` à un ORACLE INDÉPENDANT de toute formule : le rendu
    /// PIXEL d'un vrai `CATextLayer`, à la même chaîne et à la même largeur
    /// de wrap que celle RÉELLEMENT utilisée pour peindre les glyphes (la
    /// sous-calque de glyphes de `layer` quand elle existe — Panne 2 —,
    /// sinon `layer` lui-même), rendu à une hauteur généreusement
    /// surdimensionnée pour ne RIEN perdre. Si `bounds.height` est
    /// insuffisant, le rendu à cette hauteur diffère PIXEL PAR PIXEL du rendu
    /// de référence sur leur fenêtre commune — CATextLayer a dû
    /// réorganiser/rogner ses lignes pour tenir dans l'espace disponible.
    func test_configure_multilineTextEndingInEmoji_boundsCoverTheRealCoreTextRender() throws {
        var text = StoryTextObject(
            id: "emoji-repro",
            text: "Mettre à jour à la dernière version pour profiter des dernières "
                + "nouveautés Meeshy 🥰😍❣️"
        )
        text.fontSize = 56
        text.scale = 2.29
        text.textStyle = StoryTextStyle.curve.rawValue
        text.textAlign = "center"

        let geometry = CanvasGeometry(renderSize: CGSize(width: 402, height: 874))
        let layer = StoryTextLayer()
        layer.configure(with: text, geometry: geometry, mode: .edit)

        guard let attributed = layer.string as? NSAttributedString else {
            XCTFail("layer.string devrait être un NSAttributedString après configure")
            return
        }

        // Largeur de wrap et chaîne RÉELLEMENT utilisées pour peindre les
        // glyphes : la sous-calque de glyphes insérée par
        // `applyBackgroundStyle` quand une réserve d'encre existe (Panne 2),
        // sinon `layer` lui-même (chemin historique).
        let glyphSublayer = (layer.sublayers ?? []).first { $0 is CATextLayer } as? CATextLayer
        let paintWidth = glyphSublayer?.bounds.width ?? layer.bounds.width
        let paintString = (glyphSublayer?.string as? NSAttributedString) ?? attributed
        let width = Int(ceil(paintWidth))

        func renderAlpha(height: Int) throws -> [UInt8] {
            let probe = CATextLayer()
            probe.string = paintString
            probe.isWrapped = true
            probe.truncationMode = .none
            probe.alignmentMode = layer.alignmentMode
            probe.fontSize = layer.fontSize
            probe.bounds = CGRect(x: 0, y: 0, width: paintWidth, height: CGFloat(height))
            var pixels = [UInt8](repeating: 0, count: max(1, width * height))
            let ctx = try XCTUnwrap(CGContext(
                data: &pixels, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width,
                space: CGColorSpaceCreateDeviceGray(),
                bitmapInfo: CGImageAlphaInfo.alphaOnly.rawValue))
            // `CGContext(data:...)` est nativement Quartz (origine bas-gauche,
            // Y croissant vers le haut) alors que `CATextLayer` pose son
            // contenu en espace UIKit (origine haut-gauche, Y croissant vers
            // le bas). Sans ce flip, la ligne 0 du buffer ANCRE sur le BAS du
            // texte — un ancrage qui se déplace avec `height`, cassant toute
            // comparaison entre deux hauteurs différentes (quasi 100% des
            // lignes diffèrent, indépendamment du bug recherché). Avec le
            // flip, la ligne 0 du buffer ancre TOUJOURS sur le HAUT du texte
            // (première ligne), quelle que soit `height` — d'où la stabilité
            // de préfixe qu'exploite la comparaison ci-dessous.
            ctx.translateBy(x: 0, y: CGFloat(height))
            ctx.scaleBy(x: 1, y: -1)
            probe.render(in: ctx)
            return pixels
        }

        let realHeight = Int(ceil(layer.bounds.height))
        let oversizedHeight = realHeight * 2   // garanti suffisant pour tout peindre.

        let realPixels = try renderAlpha(height: realHeight)
        let oversizedPixels = try renderAlpha(height: oversizedHeight)

        var mismatchRows = 0
        for y in 0..<realHeight {
            for x in 0..<width where realPixels[y * width + x] != oversizedPixels[y * width + x] {
                mismatchRows += 1
                break
            }
        }

        XCTAssertEqual(mismatchRows, 0,
            "\(mismatchRows) ligne(s) de pixels diffèrent entre le rendu à bounds.height "
            + "(\(realHeight)pt, largeur \(width)pt) et un rendu de référence surdimensionné "
            + "— bounds.height est trop court : CATextLayer réorganise/rogne ses lignes."
        )
    }
}
