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
                cgCtx.fill(rect)
            } else {
                // Hex OU gradient (C11) — parité canvas/miniatures pour les
                // covers composites (Prisme visuel des thumbnails).
                switch StoryBackgroundValue.parse(slide.effects.background ?? "1E1B4B") {
                case .gradient(let a, let b):
                    let c1 = (UIColor(hex: a) ?? .black).cgColor
                    let c2 = (UIColor(hex: b) ?? .black).cgColor
                    if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                                                 colors: [c1, c2] as CFArray,
                                                 locations: [0, 1]) {
                        cgCtx.drawLinearGradient(
                            gradient,
                            start: rect.origin,
                            end: CGPoint(x: rect.maxX, y: rect.maxY),
                            options: []
                        )
                    } else {
                        UIColor.black.setFill()
                        cgCtx.fill(rect)
                    }
                case .hex(let h):
                    (UIColor(hex: h) ?? .black).setFill()
                    cgCtx.fill(rect)
                }
            }

            // 2. Background image — aspect-fill (parité reader `StoryBackgroundLayer`
            //    `.resizeAspectFill`) au lieu d'un stretch. Un fond legacy non-9:16
            //    était squishé dans le cover/thumbHash alors que le reader le recadre
            //    en préservant ses proportions.
            if let bgImage {
                drawAspectFill(filterBackground(bgImage, effects: slide.effects), in: rect, ctx: cgCtx)
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
               let rawBgMediaImage = loadedImages[bgMedia.id] {
                let bgMediaImage = filterBackground(rawBgMediaImage, effects: slide.effects)
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
                    drawAspectFill(bgMediaImage, in: rect, ctx: cgCtx)
                    cgCtx.restoreGState()
                } else {
                    drawAspectFill(bgMediaImage, in: rect, ctx: cgCtx)
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

            // 5. Stickers — image intégrée si son bitmap est chargé, glyphe sinon.
            //    Le bitmap arrive par le MÊME `loadedImages` que les autres
            //    médias (étapes 2b et 4), sous l'id d'ÉLÉMENT.
            if let stickers = slide.effects.stickerObjects {
                for sticker in stickers {
                    drawSticker(sticker, image: loadedImages[sticker.id], in: size, ctx: cgCtx)
                }
            }

            // 5b. Pastilles de lieu — même source de vérité que le canvas et
            //     l'export : on configure une `StoryLocationLayer` puis on la
            //     rend dans le contexte. Redessiner le badge à la main ici
            //     rejouerait la divergence déjà payée sur les stickers (taille
            //     codée en dur, `baseSize` ignoré).
            for location in slide.locationObjects {
                drawLocationObject(location, in: size, ctx: cgCtx)
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

        // 7. Le filtre est cuit dans le BITMAP DU FOND (étapes 2 / 2b) via
        //    `StoryFilterProcessor`, exactement comme le lecteur
        //    (`StoryBackgroundLayer.stampFinalImage`). Plus de passe finale sur
        //    tout le composite : elle teintait textes et stickers — que le
        //    lecteur ne filtre jamais — et un fond UNI, que le lecteur laisse
        //    intact.
        // Le filtre est déjà cuit dans le BITMAP DU FOND (étapes 2 / 2b), à
        // parité avec le lecteur. Plus de passe finale sur tout le composite :
        // elle teintait aussi les textes et les stickers, que le lecteur ne
        // filtre jamais, et un fond UNI, que le lecteur laisse intact.
        return base
    }

    /// Applique au BITMAP DU FOND le filtre actif de la story, via
    /// `StoryFilterProcessor` — la source unique que la grille de choix et le
    /// lecteur (`StoryBackgroundLayer.stampFinalImage`) utilisent déjà.
    ///
    /// Le composite divergeait du lecteur sur QUATRE points à la fois :
    ///   1. il passait par `StoryFilterKind`, qui ne connaît que vintage/bw —
    ///      les six autres filtres n'étaient pas appliqués du tout ;
    ///   2. même pour ces deux-là il employait d'autres noyaux
    ///      (`sepiaTone`/`photoEffectMono` au lieu de
    ///      `CIPhotoEffectTransfer`/`CIPhotoEffectNoir`) ;
    ///   3. il filtrait un fond UNI, que le lecteur laisse intact
    ///      (`case .solidColor` pose `backgroundColor`, sans étampage) ;
    ///   4. il teintait les textes et stickers posés par-dessus, que le
    ///      lecteur ne filtre jamais.
    ///
    /// Résultat : la miniature de tray et le placeholder ThumbHash ne
    /// correspondaient pas à la story jouée — un saut de couleur au chargement.
    static func filterBackground(_ image: UIImage, effects: StoryEffects) -> UIImage {
        guard let raw = effects.filter, let filter = StoryFilter(rawValue: raw) else { return image }
        let intensity = Float(max(0.0, min(1.0, effects.filterIntensity ?? 1.0)))
        return StoryFilterProcessor.apply(filter, to: image, intensity: intensity)
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

        var attrs: [NSAttributedString.Key: Any] = [
            .font: compositeFont(for: textObj, fontSize: fontSize),
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

    /// Résolution de police du composite basse-fidélité (thumbHash + covers des autres
    /// utilisateurs dans le tray) — délègue à `StoryTextFontResolver`, la même source que
    /// le canvas pixel-parfait, pour honorer `fontFamily`/`textStyle` au lieu de
    /// l'ancienne approximation `.systemFont(weight: .bold)`. Extrait `static` pour rester
    /// testable en isolation, comme `compositeBackgroundColor`.
    static func compositeFont(for text: StoryTextObject, fontSize: CGFloat) -> UIFont {
        StoryTextFontResolver.resolveFont(forTextObject: text, size: fontSize)
    }

    /// Dessine un média foreground à PARITÉ avec le reader (`StoryMediaLayer`).
    ///
    /// Enveloppe = `StoryMediaLayer.baseMediaDesignSize(aspectRatio:) × scale`,
    /// projetée par le MÊME facteur largeur (`size.width / CanvasGeometry.designWidth`)
    /// que `CanvasGeometry` — réutilise la source de vérité unique, sans constante
    /// dupliquée. L'ancien `0.6×width` + aspect de l'image décodée divergeait du
    /// canvas (0.65×, carré 0.5×) → média ~8 % plus petit (non carré) / ~20 % plus
    /// grand (carré) dans le cover/thumbHash. L'image est ensuite **aspect-fill**
    /// (jamais étirée) et clippée aux coins arrondis (`cornerRadiusFraction`), avec
    /// un bord blanc 2px comme `applyForegroundFrames` du canvas.
    private static func drawMediaObject(_ obj: StoryMediaObject, image: UIImage, in size: CGSize, ctx: CGContext) {
        let designBox = StoryMediaLayer.baseMediaDesignSize(aspectRatio: obj.aspectRatio)
        let projection = size.width / CanvasGeometry.designWidth
        let boxW = designBox.width * CGFloat(obj.scale) * projection
        let boxH = designBox.height * CGFloat(obj.scale) * projection
        let boxRect = CGRect(
            x: size.width * CGFloat(obj.x) - boxW / 2,
            y: size.height * CGFloat(obj.y) - boxH / 2,
            width: boxW,
            height: boxH
        )
        let center = CGPoint(x: size.width * CGFloat(obj.x), y: size.height * CGFloat(obj.y))
        drawRotated(obj.rotation, around: center, in: ctx) {
            let radius = min(boxW, boxH) * StoryMediaLayer.cornerRadiusFraction
            let framePath = UIBezierPath(roundedRect: boxRect, cornerRadius: radius)
            ctx.saveGState()
            framePath.addClip()
            drawAspectFill(image, in: boxRect, ctx: ctx)
            ctx.restoreGState()
            // Bord blanc 2px (parité reader). Gardé sur les boîtes assez grandes :
            // sur le thumbHash ~100px la bordure serait sur-représentée (et le hash
            // ~28 octets la moyenne de toute façon) ; le cover (270×480) en profite.
            if min(boxW, boxH) >= 24 {
                UIColor.white.setStroke()
                framePath.lineWidth = 2
                framePath.stroke()
            }
        }
    }

    /// Dessine `image` en **aspect-fill** dans `rect` (recadré, jamais étiré),
    /// clippé à `rect` — équivalent raster de `contentsGravity = .resizeAspectFill`
    /// utilisé par `StoryBackgroundLayer` / `StoryMediaLayer` du reader.
    private static func drawAspectFill(_ image: UIImage, in rect: CGRect, ctx: CGContext) {
        let imgSize = image.size
        guard imgSize.width > 0, imgSize.height > 0, rect.width > 0, rect.height > 0 else {
            image.draw(in: rect)
            return
        }
        let scale = max(rect.width / imgSize.width, rect.height / imgSize.height)
        let drawW = imgSize.width * scale
        let drawH = imgSize.height * scale
        let drawRect = CGRect(
            x: rect.midX - drawW / 2,
            y: rect.midY - drawH / 2,
            width: drawW,
            height: drawH
        )
        ctx.saveGState()
        ctx.addRect(rect)
        ctx.clip()
        image.draw(in: drawRect)
        ctx.restoreGState()
    }

    /// Dessine la pastille de lieu en DÉLÉGUANT à `StoryLocationLayer` — la
    /// calque du canvas et de l'export : métriques, palette et libellé
    /// (`place.name` → `address` → « Ici ») restent définis une seule fois.
    /// `render(in:)` ignore `position`/`anchorPoint`/`transform` du layer, donc
    /// l'ancrage et la rotation sont appliqués ici au CTM, comme pour les
    /// textes et les médias.
    private static func drawLocationObject(_ location: StoryLocationObject, in size: CGSize, ctx: CGContext) {
        let layer = StoryLocationLayer()
        layer.configure(with: location, geometry: CanvasGeometry(renderSize: size), mode: .play)
        let box = layer.bounds.size
        guard box.width > 0, box.height > 0 else { return }
        let center = layer.position
        drawRotated(location.rotation, around: center, in: ctx) {
            ctx.saveGState()
            ctx.translateBy(x: center.x - box.width * location.anchor.x,
                            y: center.y - box.height * location.anchor.y)
            layer.render(in: ctx)
            ctx.restoreGState()
        }
    }

    /// Dessine un sticker : son IMAGE intégrée quand `image` est fournie, son
    /// glyphe sinon — même boîte, même centre, même échelle, même rotation.
    ///
    /// Le discriminant est la présence du BITMAP, pas `sticker.kind` : pendant
    /// la composition un sticker importé a encore un `postMediaId` vide (c'est
    /// le prédicat que lit la boucle d'upload), donc `kind` le dit `.emoji`
    /// alors que son image est déjà là. L'appelant lit ce bitmap dans le même
    /// `loadedImages` que les autres médias — le composer l'y pose sous l'id
    /// d'élément, le lecteur y charge le `PostMedia` publié sous ce même id.
    ///
    /// Sans bitmap on peint `wireEmoji` plutôt que `emoji` : un sticker image
    /// écrit ailleurs peut n'avoir aucun emoji, et peindre la chaîne vide
    /// laisserait un TROU là où l'auteur a posé quelque chose.
    private static func drawSticker(_ sticker: StorySticker, image: UIImage?, in size: CGSize, ctx: CGContext) {
        // `0.15` codé en dur ET `baseSize` ignoré : la miniature ne
        // correspondait ni au canvas ni à l'export. Règle partagée désormais.
        let side = CanvasGeometry.stickerFontSize(baseSize: sticker.baseSize,
                                                  scale: sticker.scale,
                                                  canvasWidth: size.width)
        let x = size.width * sticker.x - side / 2
        let y = size.height * sticker.y - side / 2
        let center = CGPoint(x: size.width * sticker.x, y: size.height * sticker.y)
        drawRotated(sticker.rotation, around: center, in: ctx) {
            guard let image else {
                // **Le second renderer doit connaître le gabarit** (#4718).
                // `StoryRenderer` (CALayer) et celui-ci (CGContext) sont deux
                // chemins de rendu distincts : n'en câbler qu'un donnerait une
                // décoration visible au canvas et absente de la miniature — ou
                // l'inverse. La couche est le SITE UNIQUE du dessin, ici comme
                // pour la pastille de lieu juste au-dessus.
                if sticker.kind == .template {
                    let layer = StoryStickerLayer()
                    layer.configure(with: sticker,
                                    geometry: CanvasGeometry(renderSize: size),
                                    mode: .play)
                    let boîte = layer.bounds.size
                    if boîte.width > 0, boîte.height > 0 {
                        ctx.saveGState()
                        ctx.translateBy(x: center.x - boîte.width * sticker.anchor.x,
                                        y: center.y - boîte.height * sticker.anchor.y)
                        layer.render(in: ctx)
                        ctx.restoreGState()
                        return
                    }
                }
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: side),
                ]
                (sticker.wireEmoji as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: attrs)
                return
            }
            drawAspectFit(image, in: CGRect(x: x, y: y, width: side, height: side))
        }
    }

    /// Dessine `image` **aspect-fit**, centrée dans `rect`. Un sticker est une
    /// image détourée : la recadrer (aspect-fill, ce que font le fond et les
    /// médias) amputerait le dessin, et l'étirer le déformerait.
    private static func drawAspectFit(_ image: UIImage, in rect: CGRect) {
        let imgSize = image.size
        guard imgSize.width > 0, imgSize.height > 0 else {
            image.draw(in: rect)
            return
        }
        let scale = min(rect.width / imgSize.width, rect.height / imgSize.height)
        let drawW = imgSize.width * scale
        let drawH = imgSize.height * scale
        image.draw(in: CGRect(x: rect.midX - drawW / 2,
                              y: rect.midY - drawH / 2,
                              width: drawW,
                              height: drawH))
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
