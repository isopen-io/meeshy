import UIKit
import PencilKit
import CoreImage
import CoreImage.CIFilterBuiltins
import MeeshySDK

/// Renders a story slide composite to a UIImage for thumbHash computation.
/// Produces a low-resolution (~100x178) image combining background + text + foreground
/// media + drawing + stickers — i.e. ALL visual layers, so the blur placeholder
/// reflects the whole story (image + texte + dessin).
/// Not pixel-perfect — sufficient for thumbHash blur placeholders (~28 bytes).
public enum StorySlideRenderer {

    /// Shared Core Image context for filter rasterisation. `CIContext` is the
    /// most expensive Core Image object to build (it sets up the GPU render
    /// context) and is documented thread-safe + reusable, yet a new one was
    /// created per filtered slide composite. Build it once.
    private static let filterContext = CIContext()

    /// Render a complete slide composite: background (color/image) + text overlays + foreground images.
    /// Returns nil only if rendering fails (shouldn't happen).
    public static func renderComposite(
        slide: StorySlide,
        bgImage: UIImage?,
        loadedImages: [String: UIImage] = [:],
        size: CGSize = CGSize(width: 100, height: 178)
    ) -> UIImage? {
        // Default ~100x178 (9:16) is enough for a ThumbHash (~32x32 avg colours).
        // Callers needing a crisp preview — the story-tray cover thumbnail that must
        // show ALL composer layers (text + drawing + media) — pass a larger `size`.
        // Every layer draw scales relative to `size`, so geometry stays correct.

        let renderer = UIGraphicsImageRenderer(size: size)
        let base = renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: size)
            let cgCtx = ctx.cgContext

            // 1. Background color — UNIQUEMENT sans fond visuel de fond. Avec un fond
            // média (image/vidéo via mediaObjects, ou legacy `bgImage`), pas de fond
            // coloré (user 2026-06-03) : base neutre noire, le média est dessiné par
            // dessus (étapes 2 / 2b). D'autant plus nécessaire qu'un fond zoomé/pané ne
            // remplit plus le rect (transform it.50) → la couleur fuirait en bandes.
            let hasVisualBg = (bgImage != nil) || slide.effects.hasVisualBackgroundMedia
            if hasVisualBg {
                UIColor.black.setFill()
            } else {
                let bgHex = slide.effects.background ?? "1E1B4B"
                let bgColor = UIColor(hex: bgHex) ?? .black
                bgColor.setFill()
            }
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
            //     Vaut pour les fonds IMAGE **et VIDÉO** : une vidéo de fond porte sa
            //     poster frame dans `loadedImages[bgMedia.id]` (même frame que le
            //     canvas / mini-preview) ; sans ce dessin le thumbnail/thumbHash d'une
            //     story à fond vidéo perdait le fond (bgColor + overlays seulement) →
            //     le « thumbnail de TOUTE la story » manquait la couche dominante.
            if bgImage == nil,
               let bgMedia = slide.effects.resolvedBackgroundMedia,
               let bgMediaImage = loadedImages[bgMedia.id] {
                // Transform du fond (zoom/pan/rotation) — parité avec `SlideMiniPreview`
                // (référence non-ambiguë : `.scaleEffect(scale)` + `.rotationEffect(rotation)`
                // autour du centre, puis `.position(x·w, y·h)`) et le canvas. Sans ça un fond
                // zoomé/pané/pivoté par l'user apparaissait DROIT & full-bleed dans le
                // cover/thumbHash (it.50). scale+rotation autour du centre (commutent, scale
                // uniforme) ; pan en screen-space (centre → (x·w, y·h)). No-op aux défauts
                // (scale 1, x=y=0.5, rotation 0) → chemin commun préservé. Base `draw(in:rect)`
                // = stretch (≈ aspectFill pour un fond 9:16 ; aspect non-9:16 = parité partielle).
                let isTransformed = abs(bgMedia.scale - 1) > 0.001
                    || abs(bgMedia.x - 0.5) > 0.001 || abs(bgMedia.y - 0.5) > 0.001
                    || abs(bgMedia.rotation) > 0.01
                if isTransformed {
                    let cx = size.width / 2, cy = size.height / 2
                    let panX = (CGFloat(bgMedia.x) - 0.5) * size.width
                    let panY = (CGFloat(bgMedia.y) - 0.5) * size.height
                    cgCtx.saveGState()
                    cgCtx.translateBy(x: cx + panX, y: cy + panY)
                    cgCtx.rotate(by: CGFloat(bgMedia.rotation) * .pi / 180)
                    cgCtx.scaleBy(x: CGFloat(bgMedia.scale), y: CGFloat(bgMedia.scale))
                    cgCtx.translateBy(x: -cx, y: -cy)
                    bgMediaImage.draw(in: rect)
                    cgCtx.restoreGState()
                } else {
                    bgMediaImage.draw(in: rect)
                }
            }

            // 3. Text overlays
            for textObj in slide.effects.textObjects {
                drawTextObject(textObj, in: size, ctx: cgCtx)
            }

            // 4. Foreground media — EXCLUT le média de fond (résolu en 2b), sinon
            //    double-dessin + occlusion du texte (cf. 2b). Dessine tout média
            //    foreground qui a une frame chargée : IMAGE **et VIDÉO** (poster frame
            //    dans `loadedImages`), à parité avec `SlideMiniPreview` (qui ne filtre
            //    pas par kind). Sans la vidéo foreground, un clip placé sur le slide
            //    manquait au thumbnail/thumbHash. L'audio (pas de frame chargée) est
            //    naturellement ignoré (le `if let img` échoue).
            for obj in slide.effects.resolvedForegroundMediaObjects {
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

        // 7. Filter — applied over the WHOLE composite, mirroring the canvas which
        //    runs its kernel on the captured (background + items) texture. Gated on
        //    the SAME `StoryFilteredLayer.Kind(storyFilter:)` bridge the canvas uses,
        //    so the thumbHash reflects exactly what the viewer renders: vintage/bw
        //    (the only kernels that exist) are applied; kernel-less filters
        //    (warm/cool/…) leave the composite untouched, just as the viewer leaves
        //    them unfiltered — no placeholder→story colour pop. CoreImage approximates
        //    the Metal look (sepia for vintage, mono for bw); exact parity is
        //    unnecessary for a ~28-byte blur placeholder (only the average-colour
        //    direction is encoded).
        return applyActiveFilter(to: base, effects: slide.effects)
    }

    /// Applies the active story filter to the rendered composite, gated on the same
    /// `StoryFilteredLayer.Kind` bridge the canvas/viewer use so coverage stays in
    /// lock-step (today: vintage + bw; the six kernel-less filters return the image
    /// unchanged). Returns the input untouched on any CoreImage failure.
    static func applyActiveFilter(to image: UIImage, effects: StoryEffects) -> UIImage {
        guard let kind = StoryFilteredLayer.Kind(storyFilter: effects.filter),
              let input = CIImage(image: image) else { return image }
        let intensity = Float(max(0.0, min(1.0, effects.filterIntensity ?? 1.0)))

        let output: CIImage?
        switch kind {
        case .vintage:
            let f = CIFilter.sepiaTone()
            f.inputImage = input
            f.intensity = intensity
            output = f.outputImage
        case .bwContrast:
            let f = CIFilter.photoEffectMono()
            f.inputImage = input
            output = f.outputImage
        }

        guard let out = output,
              let cg = Self.filterContext.createCGImage(out, from: input.extent) else { return image }
        return UIImage(cgImage: cg, scale: image.scale, orientation: image.imageOrientation)
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

    /// Applique une rotation (degrés, sens horaire UIKit — parité `CATransform3DMakeRotation`
    /// du canvas) autour de `center` le temps de `body`, puis restaure le CTM. No-op si
    /// `degrees ≈ 0` pour préserver le chemin commun (zéro surcoût sur les éléments non pivotés).
    /// Le contexte courant (UIGraphicsImageRenderer) est `ctx`, donc transformer son CTM
    /// affecte `NSString.draw` / `UIImage.draw` exécutés dans `body`.
    private static func drawRotated(_ degrees: Double, around center: CGPoint, in ctx: CGContext, _ body: () -> Void) {
        guard abs(degrees) > 0.01 else { body(); return }
        ctx.saveGState()
        ctx.translateBy(x: center.x, y: center.y)
        ctx.rotate(by: CGFloat(degrees) * .pi / 180)
        ctx.translateBy(x: -center.x, y: -center.y)
        body()
        ctx.restoreGState()
    }

    private static func drawTextObject(_ textObj: StoryTextObject, in size: CGSize, ctx: CGContext) {
        // `resolvedSize` (= fontSize) est en pixels DESIGN (référentiel 1080), donc
        // projeté par `size.width / 1080` — parité avec le canvas réel (`StoryTextLayer`)
        // et `SlideMiniPreview`. L'ancien diviseur `390` (largeur device) rendait le
        // texte ~2,77× trop gros dans le composite ThumbHash.
        // `resolvedSize × scale` = `designFontSize` du canvas (`StoryTextLayer` : `fontSize * scale`).
        // Le pinch écrit `text.scale` (StoryCanvasUIView.updateScale, 0.3…4.0) — sans le `× scale`
        // ici, un texte agrandi/réduit au doigt s'affichait à sa taille de BASE dans le cover/thumbHash
        // (incohérence avec le canvas). Parité avec `drawMediaObject`/`drawSticker` qui appliquent déjà scale.
        let designFontSize = textObj.resolvedSize * textObj.scale
        let fontSize = max(6, size.width * CGFloat(designFontSize / Double(CanvasGeometry.designWidth)))
        let textColor = UIColor(hex: textObj.textColor ?? "FFFFFF") ?? .white

        let style = NSMutableParagraphStyle()
        switch textObj.textAlign {
        case "left": style.alignment = .left
        case "right": style.alignment = .right
        default: style.alignment = .center
        }
        style.lineBreakMode = .byWordWrapping

        // Honor an explicit weight override; otherwise keep the bold approximation
        // historically used for the low-fidelity thumbHash composite.
        let compositeWeight = textObj.parsedFontWeight?.uiFontWeight ?? .bold
        var attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: fontSize, weight: compositeWeight),
            .foregroundColor: textColor,
            .paragraphStyle: style,
        ]

        // Fond du texte — dérivé de `resolvedBackgroundStyle` (et NON du seul champ
        // legacy `textBg`). Le contrôle « Fond du texte » écrit aujourd'hui
        // `backgroundStyle = .solid/.glass` avec `textBg = nil`, donc lire `textBg`
        // seul ratait la boîte → thumbHash sans le fond du texte (bug 2026-06-01).
        if let bg = compositeBackgroundColor(for: textObj) {
            attrs[.backgroundColor] = bg
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

        // Rotation autour du centre — parité canvas (`StoryTextLayer`). Sans ça un texte
        // pivoté apparaissait DROIT dans le composite cover/thumbHash (≠ ce que l'auteur voit).
        drawRotated(textObj.rotation, around: CGPoint(x: centerX, y: centerY), in: ctx) {
            (textObj.text as NSString).draw(in: textRect, withAttributes: attrs)
        }
    }

    /// Couleur de fond composite (thumbHash) d'un texte, dérivée du
    /// `resolvedBackgroundStyle` — source de vérité partagée avec le canvas
    /// (`StoryTextLayer`) — et NON du seul champ legacy `textBg`. Retourne `nil`
    /// pour `.none`. `.solid` rend la couleur hex (opaque comme sur le canvas) ;
    /// `.glass` est approximé par un blanc translucide (le blur GPU n'existe pas
    /// dans le composite raster). Extrait `static` (testable via `@MainActor`).
    static func compositeBackgroundColor(for text: StoryTextObject) -> UIColor? {
        switch text.resolvedBackgroundStyle {
        case .none:
            return nil
        case .solid(let hex):
            return UIColor(hex: hex)
        case .glass:
            return UIColor.white.withAlphaComponent(0.25)
        }
    }

    private static func drawMediaObject(_ obj: StoryMediaObject, image: UIImage, in size: CGSize, ctx: CGContext) {
        let imgW = size.width * obj.scale * 0.6
        let imgH = imgW * (image.size.height / max(1, image.size.width))
        let x = size.width * obj.x - imgW / 2
        let y = size.height * obj.y - imgH / 2
        let center = CGPoint(x: size.width * obj.x, y: size.height * obj.y)
        drawRotated(obj.rotation, around: center, in: ctx) {
            image.draw(in: CGRect(x: x, y: y, width: imgW, height: imgH))
        }
    }

    private static func drawSticker(_ sticker: StorySticker, in size: CGSize, ctx: CGContext) {
        let fontSize = max(8, size.width * sticker.scale * 0.15)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: fontSize),
        ]
        let x = size.width * sticker.x - fontSize / 2
        let y = size.height * sticker.y - fontSize / 2
        let center = CGPoint(x: size.width * sticker.x, y: size.height * sticker.y)
        drawRotated(sticker.rotation, around: center, in: ctx) {
            (sticker.emoji as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: attrs)
        }
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
