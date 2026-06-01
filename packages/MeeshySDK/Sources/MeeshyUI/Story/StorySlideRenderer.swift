import UIKit
import PencilKit
import MeeshySDK

/// Renders a story slide composite to a UIImage for thumbHash computation.
/// Produces a low-resolution (~100x178) image combining background + text + foreground
/// media + drawing + stickers — i.e. ALL visual layers, so the blur placeholder
/// reflects the whole story (image + texte + dessin).
/// Not pixel-perfect — sufficient for thumbHash blur placeholders (~28 bytes).
public enum StorySlideRenderer {

    /// Render a complete slide composite: background (color/image) + text overlays + foreground images.
    /// Returns nil only if rendering fails (shouldn't happen).
    public static func renderComposite(
        slide: StorySlide,
        bgImage: UIImage?,
        loadedImages: [String: UIImage] = [:]
    ) -> UIImage? {
        // ThumbHash only encodes ~32x32 average colors — low res is fine
        let w: CGFloat = 100
        let h: CGFloat = 178  // ~9:16 story aspect ratio
        let size = CGSize(width: w, height: h)

        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: size)
            let cgCtx = ctx.cgContext

            // 1. Background color
            let bgHex = slide.effects.background ?? "1E1B4B"
            let bgColor = UIColor(hex: bgHex) ?? .black
            bgColor.setFill()
            cgCtx.fill(rect)

            // 2. Background image (fill, respecting aspect ratio)
            if let bgImage {
                bgImage.draw(in: rect)
            }

            // 2b. Background MEDIA object (story moderne) — rempli PLEIN CADRE, à
            //     parité avec `StoryBackgroundLayer` (reader) et `SlideMiniPreview`.
            //     Le fond moderne n'est pas un `bgImage` legacy séparé mais un
            //     `StoryMediaObject(isBackground: true)` dans `mediaObjects` ; sans
            //     ce dessin il n'apparaissait que via la boucle foreground en petite
            //     image 0.6× centrée — et, dessinée APRÈS le texte, elle l'occultait.
            //     On ne dessine que si aucun `bgImage` legacy n'a déjà rempli le cadre.
            if bgImage == nil,
               let bgMedia = slide.effects.resolvedBackgroundMedia,
               bgMedia.kind == .image,
               let bgMediaImage = loadedImages[bgMedia.id] {
                bgMediaImage.draw(in: rect)
            }

            // 3. Text overlays
            for textObj in slide.effects.textObjects {
                drawTextObject(textObj, in: size, ctx: cgCtx)
            }

            // 4. Foreground media images — EXCLUT le média de fond (résolu en 2b),
            //    sinon double-dessin + occlusion du texte (cf. 2b).
            for obj in slide.effects.resolvedForegroundMediaObjects where obj.kind == .image {
                if let img = loadedImages[obj.id] {
                    drawMediaObject(obj, image: img, in: size, ctx: cgCtx)
                }
            }

            // 5. Sticker emojis (draw as text)
            if let stickers = slide.effects.stickerObjects {
                for sticker in stickers {
                    drawSticker(sticker, in: size, ctx: cgCtx)
                }
            }

            // 6. Drawing layer — TOPMOST (modern strokes preferred, legacy PKDrawing
            // fallback). Mirrors `StoryRenderer` where the drawing overlay sits at
            // zPosition 9999 above every item (text/media/stickers). Without this
            // the thumbHash placeholder ignored the drawing entirely (spec user
            // 2026-06-01 : ThumbHash de TOUTE la story avec toutes les couches :
            // image, texte ET dessin). Strokes are rasterised at design size
            // (1080x1920) then stretched into the composite rect — the same
            // design→bounds mapping the live `MeeshyStrokeCanvas` uses.
            if let strokes = slide.effects.drawingStrokes, !strokes.isEmpty {
                StoryStrokeRasterizer.image(strokes: strokes, scale: 1)?.draw(in: rect)
            } else if let data = slide.effects.drawingData,
                      let drawing = try? PKDrawing(data: data), !drawing.bounds.isEmpty {
                drawing.image(from: drawing.bounds, scale: 1).draw(in: rect)
            }
        }
    }

    /// Compute thumbHash for a complete slide composite.
    public static func computeThumbHash(
        slide: StorySlide,
        bgImage: UIImage?,
        loadedImages: [String: UIImage] = [:]
    ) -> String? {
        renderComposite(slide: slide, bgImage: bgImage, loadedImages: loadedImages)?.toThumbHash()
    }

    // MARK: - Private Drawing

    private static func drawTextObject(_ textObj: StoryTextObject, in size: CGSize, ctx: CGContext) {
        // `resolvedSize` (= fontSize) est en pixels DESIGN (référentiel 1080), donc
        // projeté par `size.width / 1080` — parité avec le canvas réel (`StoryTextLayer`)
        // et `SlideMiniPreview`. L'ancien diviseur `390` (largeur device) rendait le
        // texte ~2,77× trop gros dans le composite ThumbHash.
        let fontSize = max(6, size.width * CGFloat(textObj.resolvedSize / Double(CanvasGeometry.designWidth)))
        let textColor = UIColor(hex: textObj.textColor ?? "FFFFFF") ?? .white

        let style = NSMutableParagraphStyle()
        switch textObj.textAlign {
        case "left": style.alignment = .left
        case "right": style.alignment = .right
        default: style.alignment = .center
        }
        style.lineBreakMode = .byWordWrapping

        var attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: fontSize, weight: .bold),
            .foregroundColor: textColor,
            .paragraphStyle: style,
        ]

        // Text background
        if let bgHex = textObj.textBg {
            attrs[.backgroundColor] = UIColor(hex: bgHex)?.withAlphaComponent(0.7)
        }

        let textWidth = size.width * 0.85
        let centerX = size.width * CGFloat(textObj.x)
        let centerY = size.height * CGFloat(textObj.y)
        let textRect = CGRect(
            x: centerX - textWidth / 2,
            y: centerY - fontSize,
            width: textWidth,
            height: fontSize * 3
        )

        (textObj.text as NSString).draw(in: textRect, withAttributes: attrs)
    }

    private static func drawMediaObject(_ obj: StoryMediaObject, image: UIImage, in size: CGSize, ctx: CGContext) {
        let imgW = size.width * obj.scale * 0.6
        let imgH = imgW * (image.size.height / max(1, image.size.width))
        let x = size.width * obj.x - imgW / 2
        let y = size.height * obj.y - imgH / 2
        image.draw(in: CGRect(x: x, y: y, width: imgW, height: imgH))
    }

    private static func drawSticker(_ sticker: StorySticker, in size: CGSize, ctx: CGContext) {
        let fontSize = max(8, size.width * sticker.scale * 0.15)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: fontSize),
        ]
        let x = size.width * sticker.x - fontSize / 2
        let y = size.height * sticker.y - fontSize / 2
        (sticker.emoji as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: attrs)
    }
}

// MARK: - UIColor hex init (standalone for MeeshyUI context)

private extension UIColor {
    convenience init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")
        guard hexSanitized.count == 6, let rgb = UInt64(hexSanitized, radix: 16) else { return nil }
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255.0,
            green: CGFloat((rgb >> 8) & 0xFF) / 255.0,
            blue: CGFloat(rgb & 0xFF) / 255.0,
            alpha: 1.0
        )
    }
}
