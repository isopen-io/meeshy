import Foundation
import QuartzCore
import CoreText
import UIKit
import Metal
import MeeshySDK

/// `CATextLayer` subclass that renders a `StoryTextObject` with crisp
/// design-pixel typography across all device sizes.
///
/// `fontSize` is interpreted in design-space pixels (1080-référentiel) and is
/// scaled through `CanvasGeometry.render(_:)` so two devices of different
/// physical size show typography at identical visual proportions.
public final class StoryTextLayer: CATextLayer {
    public private(set) nonisolated(unsafe) var textObject: StoryTextObject?

    /// Backing layer placed behind the text glyphs when `backgroundStyle` is
    /// non-`.none`. For `.solid` this is a tinted CALayer; for `.glass` this is
    /// a `StoryGlassBackdropLayer` which routes through `StoryBlurFilter`
    /// (`MPSImageGaussianBlur`, GPU) when a backdrop MTLTexture is supplied
    /// via `setBackdropTexture(_:)`, or falls back to a private `CAFilter`
    /// "gaussianBlur" attached to the layer's `filters` until then.
    private var backgroundFillLayer: CALayer?
    private var glassBackdropLayer: StoryGlassBackdropLayer?

    /// Sous-calque de glyphes utilisée UNIQUEMENT pour le fond `.glass`. Un
    /// `CATextLayer` peint son `string` dans son propre contenu, lequel passe
    /// SOUS tout sous-calque (donc sous le backdrop glass). Pour garder les
    /// glyphes lisibles, on les rend dans cette sous-calque posée AU-DESSUS du
    /// backdrop, et on rend les glyphes propres du parent transparents. `nil`
    /// pour `.none` / `.solid` (le parent peint alors lui-même ses glyphes).
    private var glyphLayer: CATextLayer?

    /// Chaînes attribuées mémorisées par `configure`, permettant à
    /// `setGlyphsHidden` de basculer les glyphes sans toucher `bounds` ni les
    /// sous-calques de fond.
    private var visibleString: NSAttributedString?
    private var hiddenString: NSAttributedString?
    public private(set) var glyphsHidden: Bool = false

    /// Tracé (render-space) du cadre pour les formes path-based (losange /
    /// nuage / bulle BD), calculé par `configure`. `nil` pour les formes à
    /// coins (rounded / pill / rectangle) qui passent par `cornerRadius`.
    private var pathFramePath: CGPath?
    /// Frame (render-space) de la sous-calque de glyphes pour les formes
    /// path-based — le texte y est centré dans la région de contenu de la
    /// forme (hors queue de bulle / bulles de pensée).
    private var pathGlyphFrame: CGRect?

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryTextLayer does not support NSCoder")
    }

    @MainActor
    public func configure(with text: StoryTextObject,
                          geometry: CanvasGeometry,
                          mode: RenderMode) {
        self.textObject = text

        // Cross-device parity invariant: every render-space dimension MUST be a
        // linear function of `geometry.scaleFactor`. Therefore we measure the
        // text bounding box at the DESIGN font size and project the whole
        // bounding box through `geometry.render(_:)` once. If we measured in
        // render space (e.g. `attributed.size()` at the rendered font), font
        // hinting + sub-pixel rounding would break the iPhone↔iPad linearity
        // contract enforced by `CrossDeviceEquivalenceTests`.
        let designFontSize = CGFloat(text.fontSize * text.scale)
        // `resolveFont(forTextObject:...)` respecte le `textStyle` (bold / neon
        // / typewriter / handwriting / classic) en plus de la `fontFamily`.
        // Auparavant `resolveFont(family:size:)` ignorait textStyle, donc le
        // panel d'édition affichait le bon style mais le canvas restait dans
        // le default semibold system font.
        let designFont = StoryTextFontResolver.resolveFont(forTextObject: text, size: designFontSize)
        let color = parseHexColor(text.textColor) ?? UIColor.white

        let alignment = parseAlignment(text.textAlign)
        let para = NSMutableParagraphStyle()
        para.alignment = alignment
        para.baseWritingDirection = .natural   // RTL auto-detect for Arabic/Hebrew

        // Outline / contour : `.strokeWidth` est un pourcentage de la taille de
        // police ; une valeur NÉGATIVE remplit ET contoure (positif = texte
        // creux). `borderWidth` est en design-px absolus → le diviser par la
        // taille de police design donne un pourcentage indépendant de la
        // résolution ET de l'échelle (le contour garde la même épaisseur design
        // quel que soit `text.scale`).
        let strokeAttrs = Self.strokeAttributes(for: text, designFontSize: designFontSize)

        // Measure in design space.
        let designAttr = NSAttributedString(string: text.text, attributes: [
            .font: designFont,
            .foregroundColor: color.cgColor,
            .paragraphStyle: para
        ].merging(strokeAttrs) { _, new in new })
        // Mesure AVEC retour à la ligne : la largeur est plafonnée à ~88 % de la
        // largeur design (marge symétrique) pour qu'un texte long wrappe sur
        // plusieurs lignes au lieu de déborder du canvas. `size()` mesurait en
        // mono-ligne, ce qui forçait des largeurs hors-canvas et un rendu tronqué.
        // Le losange double l'encombrement du texte (rect inscrit dans le
        // rhombe) — sa largeur de mesure est plafonnée à 44 % pour que la forme
        // complète tienne dans le canvas.
        let isFramed = text.resolvedBackgroundStyle != .none
        let frameShape = text.parsedFrameShape
        let widthFraction: CGFloat = (isFramed && frameShape == .diamond) ? 0.44 : 0.88
        let maxDesignWidth = CanvasGeometry.designWidth * widthFraction
        let designSize = designAttr.boundingRect(
            with: CGSize(width: maxDesignWidth, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            context: nil
        ).size
        // Symmetric pad in design pixels. Horizontally, a FRAMED text (solid /
        // glass background) reserves at least the advance width of one "o" glyph
        // before the first and after the last character so the framing box never
        // hugs the glyphs (bug #7 : "padding automatique ≥ 1 caractère 'o'").
        // Unframed text keeps the historical 8 px-per-side inset so existing
        // layout/snapshot expectations are unchanged. Les formes path-based
        // (losange / nuage / bulle BD) réservent en plus l'espace de la forme
        // (pointes du rhombe, bosses du nuage, queue de la bulle) — voir
        // `frameMetrics`.
        let oGlyphWidth = isFramed
            ? ceil(("o" as NSString).size(withAttributes: [.font: designFont]).width)
            : 0
        // Les bounds doivent couvrir ce que CATextLayer POSE réellement, pas
        // seulement la projection linéaire de la mesure design (repro user
        // 2026-07-11 : « La timeline vit » serif centré rendu « vi1 ») :
        // 1. Fontes OPTIQUES (New York = system serif) : les métriques ne sont
        //    PAS linéaires en taille — à 36 pt la ligne pose ~7 % plus large
        //    que 96 px design × scaleFactor. On mesure donc AUSSI à la taille
        //    rendue et on garde le max reconverti en design.
        // 2. L'ENCRE des glyphes (empattements, terminaisons) déborde des
        //    avances typographiques — marge d'encre par côté.
        // Conséquence contractuelle : la TAILLE d'un texte est « ≥ la
        // projection linéaire » (le CENTRE, lui, reste strictement linéaire) —
        // cf. CrossDeviceEquivalenceTests, assertions texte assouplies.
        let renderedProbeFont = StoryTextFontResolver.resolveFont(
            forTextObject: text, size: geometry.render(designFontSize))
        let renderedProbe = NSAttributedString(string: text.text, attributes: [
            .font: renderedProbeFont,
            .paragraphStyle: para
        ].merging(strokeAttrs) { _, new in new })
        let renderedNeed = renderedProbe.boundingRect(
            with: CGSize(width: maxDesignWidth * geometry.scaleFactor,
                         height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            context: nil
        ).size
        let scaleFactor = max(geometry.scaleFactor, 0.0001)
        let inkPad = Self.maxInkOverhangPerSide(of: designAttr, wrappedTo: maxDesignWidth)
        let effectiveDesignSize = CGSize(
            width: max(designSize.width, renderedNeed.width / scaleFactor) + inkPad * 2,
            height: max(designSize.height, renderedNeed.height / scaleFactor)
        )
        let metrics = Self.frameMetrics(shape: frameShape,
                                        isFramed: isFramed,
                                        textSize: effectiveDesignSize,
                                        oGlyphWidth: oGlyphWidth)

        // Render-space bounds is the linear projection of the design bounds.
        let renderedBounds = geometry.render(metrics.bounds)
        bounds = CGRect(origin: .zero, size: renderedBounds)

        // Formes path-based : tracé + zone de glyphes projetés en render-space
        // (projection uniforme — `CanvasGeometry.scaleFactor` est le même en x
        // et y). Consommés par `applyBackgroundStyle`.
        if isFramed, frameShape.usesCustomPath {
            let designPath = Self.framePath(shape: frameShape,
                                            in: CGRect(origin: .zero, size: metrics.bounds))
            var scaleTransform = CGAffineTransform(scaleX: geometry.scaleFactor,
                                                   y: geometry.scaleFactor)
            pathFramePath = designPath?.copy(using: &scaleTransform)
            pathGlyphFrame = CGRect(origin: geometry.render(metrics.glyphRect.origin),
                                    size: geometry.render(metrics.glyphRect.size))
        } else {
            pathFramePath = nil
            pathGlyphFrame = nil
        }

        // Render-space font for actual painting — applique aussi le textStyle.
        let renderedFontSize = geometry.render(designFontSize)
        let renderedFont = StoryTextFontResolver.resolveFont(forTextObject: text, size: renderedFontSize)
        let renderedAttr = NSAttributedString(string: text.text, attributes: [
            .font: renderedFont,
            .foregroundColor: color.cgColor,
            .paragraphStyle: para
        ].merging(strokeAttrs) { _, new in new })
        string = renderedAttr
        visibleString = renderedAttr
        hiddenString = NSAttributedString(string: text.text, attributes: [
            .font: renderedFont,
            .foregroundColor: UIColor.clear.cgColor,
            .paragraphStyle: para
        ])
        if glyphsHidden { string = hiddenString }
        // Mirror the rendered font size on the CATextLayer property so callers
        // (and tests) can read it directly without unwrapping the attributed string.
        fontSize = renderedFontSize
        alignmentMode = caTextAlignment(from: alignment)
        contentsScale = UIScreen.main.scale
        isWrapped = true
        // Jamais de troncature « … » : la mesure ci-dessus dimensionne `bounds`
        // pour contenir tout le texte wrappé. `.none` garantit l'absence
        // d'ellipse même si la mesure et le layout CATextLayer divergent d'un px.
        truncationMode = .none

        let designCenterX = geometry.designLength(forNormalized: CGFloat(text.x))
        let designCenterY = geometry.designHeightLength(forNormalized: CGFloat(text.y))
        position = geometry.render(CGPoint(x: designCenterX, y: designCenterY))
        anchorPoint = text.anchor
        transform = CATransform3DMakeRotation(CGFloat(text.rotation) * .pi / 180, 0, 0, 1)
        zPosition = CGFloat(text.zIndex)
        name = text.id

        // Static text is a rasterization candidate during playback.
        shouldRasterize = mode == .play && text.isStatic
        if shouldRasterize { rasterizationScale = UIScreen.main.scale }

        // Install background fill / glass backdrop behind the text glyphs.
        // The CATextLayer renders its `string` into its OWN contents. Un
        // sous-calque composite TOUJOURS au-dessus du contenu propre du parent
        // (son `zPosition` n'ordonne que les sous-calques entre eux, il ne le
        // pousse PAS derrière les glyphes) — c'est pourquoi un fond SOLIDE doit
        // être posé sur `backgroundColor` de la calque (peint avant le contenu),
        // tandis que le GLASS reste un sous-calque (il fait du blur GPU).
        applyBackgroundStyle(text.resolvedBackgroundStyle, geometry: geometry)
    }

    /// Rend les glyphes invisibles (couleur de premier plan transparente) tout
    /// en conservant `bounds` et les sous-calques de fond (solide / glass).
    /// Utilisé pendant l'édition de texte en place : `StoryInlineTextEditor`
    /// peint les glyphes éditables par-dessus, le vrai fond reste visible.
    @MainActor
    public func setGlyphsHidden(_ hidden: Bool) {
        glyphsHidden = hidden
        if let glyphLayer {
            // Cas `.glass` : les glyphes visibles vivent dans la sous-calque
            // au-dessus du backdrop. Le parent reste transparent en permanence.
            glyphLayer.string = hidden ? hiddenString : visibleString
        } else {
            string = hidden ? hiddenString : visibleString
        }
    }

    // MARK: - Background style

    @MainActor
    private func applyBackgroundStyle(_ style: StoryTextBackgroundStyle,
                                      geometry: CanvasGeometry) {
        // Tear down previous background layers — `configure` is idempotent.
        backgroundFillLayer?.removeFromSuperlayer()
        backgroundFillLayer = nil
        glassBackdropLayer?.removeFromSuperlayer()
        glassBackdropLayer = nil
        glyphLayer?.removeFromSuperlayer()
        glyphLayer = nil
        // Reset le fond propre de la calque (cas `.none` / `.glass`, ou
        // réutilisation d'instance) — sinon un ancien `backgroundColor` solide
        // survivrait à un passage vers `.none`.
        backgroundColor = nil
        cornerRadius = 0

        switch style {
        case .none:
            return

        case .solid(let hex):
            let fillColor = parseHexColor(hex) ?? .black.withAlphaComponent(0.5)
            if let framePath = pathFramePath {
                // Forme path-based (losange / nuage / bulle BD) : le fond est
                // un `CAShapeLayer` sous-calque. Un sous-calque composite
                // TOUJOURS au-dessus du contenu propre du parent — les glyphes
                // visibles passent donc dans une sous-calque dédiée posée
                // au-dessus de la forme (même pattern que `.glass`) et les
                // glyphes propres du parent deviennent transparents.
                let shape = CAShapeLayer()
                shape.frame = CGRect(origin: .zero, size: bounds.size)
                shape.path = framePath
                shape.fillColor = fillColor.cgColor
                shape.zPosition = -1
                shape.contentsScale = UIScreen.main.scale
                addSublayer(shape)
                backgroundFillLayer = shape
                installGlyphSublayer(frame: pathGlyphFrame ?? bounds)
                return
            }
            // Fond solide posé sur le `backgroundColor` de la calque ELLE-MÊME
            // (peint AVANT le contenu → les glyphes s'affichent par-dessus), et
            // NON en sous-calque (qui composerait au-dessus des glyphes et les
            // masquerait — régression « boîte noire vide » du 2026-06-01).
            // L'inset symétrique est déjà intégré dans `bounds` via le pad de
            // +16 design-px. `masksToBounds` reste false : `cornerRadius`
            // arrondit le fond sans rogner les glyphes (le contenu n'est clippé
            // que si `masksToBounds == true`).
            backgroundColor = fillColor.cgColor
            cornerRadius = frameCornerRadius(height: bounds.height)

        case .glass(let radius):
            let backdrop = StoryGlassBackdropLayer()
            backdrop.frame = bounds
            if let framePath = pathFramePath {
                // Le blur épouse la forme : masque CAShapeLayer au lieu du
                // couple cornerRadius + masksToBounds des formes à coins.
                let mask = CAShapeLayer()
                mask.frame = CGRect(origin: .zero, size: bounds.size)
                mask.path = framePath
                backdrop.mask = mask
            } else {
                backdrop.cornerRadius = frameCornerRadius(height: bounds.height)
                backdrop.masksToBounds = true
            }
            backdrop.zPosition = -1
            backdrop.contentsScale = UIScreen.main.scale
            // Sigma is design-px; project to render-px so the blur "feels" the
            // same on iPhone & iPad (consistent with CanvasGeometry.render).
            let renderedSigma = Float(geometry.render(CGFloat(radius)))
            backdrop.configure(sigma: renderedSigma)
            addSublayer(backdrop)
            glassBackdropLayer = backdrop

            // Z-order (suite de 104ff0387) : le backdrop ci-dessus est un
            // sous-calque, donc composé AU-DESSUS du contenu propre du parent
            // (ses glyphes). Pour rester lisibles, les glyphes visibles sont
            // peints dans une sous-calque posée APRÈS le backdrop (sibling
            // au-dessus, `zPosition` 0 > -1), et les glyphes propres du parent
            // sont rendus transparents — sinon ils peindraient une 2e fois SOUS
            // le verre, ré-introduisant le « blanc sur black » hors édition.
            installGlyphSublayer(frame: pathGlyphFrame ?? bounds)
        }
    }

    /// Sous-calque de glyphes posée au-dessus du fond (backdrop glass ou forme
    /// path-based) ; les glyphes propres du parent sont rendus transparents.
    /// Pour les formes path-based, `frame` est la zone de contenu centrée de
    /// la forme (`pathGlyphFrame`) ; pour le glass à coins, la calque couvre
    /// tout `bounds` (comportement historique inchangé).
    @MainActor
    private func installGlyphSublayer(frame: CGRect) {
        let glyphs = CATextLayer()
        glyphs.frame = frame
        glyphs.contentsScale = UIScreen.main.scale
        glyphs.alignmentMode = alignmentMode
        glyphs.isWrapped = true
        glyphs.truncationMode = .none
        glyphs.zPosition = 0
        glyphs.string = glyphsHidden ? hiddenString : visibleString
        addSublayer(glyphs)
        glyphLayer = glyphs
        string = hiddenString
    }

    /// Owner hook : when the parent canvas (`StoryCanvasUIView` / compositor) has
    /// a snapshot of the canvas region *behind* this text layer rendered into an
    /// `MTLTexture`, it can pass it here. The glass backdrop will run
    /// `StoryBlurFilter.apply` (MPSImageGaussianBlur on the shared command queue)
    /// and present the blurred result. When no texture is supplied, the glass
    /// layer falls back to a `CAFilter` "gaussianBlur" on its own filters chain
    /// — visually similar but operating on whatever CALayer compositing places
    /// behind it (which is the canvas, transitively).
    @MainActor
    public func setBackdropTexture(_ texture: MTLTexture?) {
        glassBackdropLayer?.setBackdropTexture(texture)
    }

    // MARK: - Helpers

    /// Corner radius of the framing box, derived from the text object's
    /// `frameShape`. `.rounded` ≈ 15 % of height (legacy), `.pill` = full
    /// capsule, `.rectangle` = near-square corners. Les formes path-based ne
    /// passent jamais ici (fond via `pathFramePath`) — la valeur `.rounded`
    /// est un défaut défensif.
    private func frameCornerRadius(height: CGFloat) -> CGFloat {
        switch textObject?.parsedFrameShape ?? .rounded {
        case .rounded, .diamond, .cloud, .speech: return max(4, height * 0.15)
        case .pill:      return height / 2
        case .rectangle: return max(2, height * 0.04)
        }
    }

    // MARK: - Frame geometry (path-based shapes)

    /// Hauteur (design px) de la bande réservée à la queue de la bulle BD.
    nonisolated static let speechTailHeight: CGFloat = 40
    /// Rayon (design px) des bosses du nuage.
    nonisolated static let cloudPuffRadius: CGFloat = 26
    /// Hauteur (design px) de la bande réservée aux bulles de pensée du nuage.
    nonisolated static let cloudThoughtHeight: CGFloat = 48

    /// Encombrement design-space du cadre + zone de glyphes pour une forme.
    nonisolated struct FrameMetrics: Equatable {
        let bounds: CGSize
        let glyphRect: CGRect
    }

    /// Calcule l'encombrement du cadre et la zone où les glyphes sont peints,
    /// en design px. Formes à coins : pad horizontal ≥ 1 'o' (framé) ou 8 px,
    /// +16 vertical — comportement historique inchangé. Formes path-based :
    /// - losange : rect w×h inscrit dans un rhombe de diagonales (2w, 2h) —
    ///   les coins du texte touchent exactement les bords, glyphes centrés ;
    /// - bulle BD : corps arrondi + bande basse pour la queue ;
    /// - nuage : bosses tout autour + bande basse pour les bulles de pensée.
    ///
    /// `nonisolated static` pour être testable sans instancier de calque.
    /// Débord d'encre maximal (design px) d'un côté ou de l'autre des lignes
    /// wrappées : différence entre les bounds de TRACÉ des glyphes
    /// (`.useGlyphPathBounds` — l'encre réellement peinte) et la largeur
    /// typographique (somme des avances) que mesure `boundingRect`. Les
    /// empattements/terminaisons serif dépassent l'avance ; sans cette marge,
    /// CATextLayer rogne le premier/dernier glyphe.
    nonisolated static func maxInkOverhangPerSide(of attributed: NSAttributedString,
                                                  wrappedTo maxWidth: CGFloat) -> CGFloat {
        guard attributed.length > 0 else { return 0 }
        let framesetter = CTFramesetterCreateWithAttributedString(attributed)
        let path = CGPath(rect: CGRect(x: 0, y: 0, width: maxWidth, height: 1_000_000),
                          transform: nil)
        let frame = CTFramesetterCreateFrame(framesetter,
                                             CFRange(location: 0, length: 0), path, nil)
        guard let lines = CTFrameGetLines(frame) as? [CTLine], !lines.isEmpty else { return 0 }
        var overhang: CGFloat = 0
        for line in lines {
            let typographic = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
            let ink = CTLineGetBoundsWithOptions(line, [.useGlyphPathBounds])
            overhang = max(overhang, ink.maxX - typographic, -ink.minX)
        }
        return max(0, ceil(overhang))
    }

    nonisolated static func frameMetrics(shape: StoryTextFrameShape,
                                         isFramed: Bool,
                                         textSize: CGSize,
                                         oGlyphWidth: CGFloat) -> FrameMetrics {
        let w = ceil(textSize.width)
        let h = ceil(textSize.height)
        let hPad = max(8, oGlyphWidth)
        guard isFramed, shape.usesCustomPath else {
            return FrameMetrics(bounds: CGSize(width: w + hPad * 2, height: h + 16),
                                glyphRect: CGRect(x: hPad, y: 8, width: w, height: h))
        }
        switch shape {
        case .rounded, .pill, .rectangle:
            // Couvert par le guard (usesCustomPath == false) — jamais atteint.
            return FrameMetrics(bounds: CGSize(width: w + hPad * 2, height: h + 16),
                                glyphRect: CGRect(x: hPad, y: 8, width: w, height: h))
        case .diamond:
            let width = max(w * 2, w + hPad * 2)
            let height = max(h * 2, h + 16)
            return FrameMetrics(bounds: CGSize(width: width, height: height),
                                glyphRect: CGRect(x: (width - w) / 2,
                                                  y: (height - h) / 2,
                                                  width: w, height: h))
        case .speech:
            return FrameMetrics(bounds: CGSize(width: w + hPad * 2,
                                               height: h + 16 + speechTailHeight),
                                glyphRect: CGRect(x: hPad, y: 8, width: w, height: h))
        case .cloud:
            let puff = cloudPuffRadius
            return FrameMetrics(bounds: CGSize(width: w + hPad * 2 + puff * 2,
                                               height: h + 16 + puff * 2 + cloudThoughtHeight),
                                glyphRect: CGRect(x: hPad + puff, y: 8 + puff,
                                                  width: w, height: h))
        }
    }

    /// Tracé design-space du cadre pour les formes path-based ; `nil` pour les
    /// formes à coins (rendues par `cornerRadius`). Les sous-tracés se
    /// chevauchent volontairement : un fill nonzero peint chaque pixel UNE
    /// seule fois, donc pas de couture ni de sur-opacité même avec un fond
    /// translucide (hex "…A6").
    nonisolated static func framePath(shape: StoryTextFrameShape, in rect: CGRect) -> CGPath? {
        switch shape {
        case .rounded, .pill, .rectangle:
            return nil

        case .diamond:
            let path = CGMutablePath()
            path.move(to: CGPoint(x: rect.midX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
            path.closeSubpath()
            return path

        case .speech:
            let body = CGRect(x: rect.minX, y: rect.minY,
                              width: rect.width,
                              height: max(1, rect.height - speechTailHeight))
            let radius = max(0, min(body.height * 0.3, body.width * 0.2))
            let path = CGMutablePath()
            path.addRoundedRect(in: body, cornerWidth: radius, cornerHeight: radius)
            // Queue pointée bas-gauche, chevauchant le corps de 2 px.
            let baseX = body.minX + body.width * 0.20
            let baseWidth = min(body.width * 0.30, speechTailHeight * 1.6)
            path.move(to: CGPoint(x: baseX, y: body.maxY - 2))
            path.addLine(to: CGPoint(x: baseX + baseWidth, y: body.maxY - 2))
            path.addLine(to: CGPoint(x: max(rect.minX, baseX - speechTailHeight * 0.25),
                                     y: rect.maxY))
            path.closeSubpath()
            return path

        case .cloud:
            let puff = cloudPuffRadius
            let body = CGRect(x: rect.minX, y: rect.minY,
                              width: rect.width,
                              height: max(1, rect.height - cloudThoughtHeight))
            let inner = body.insetBy(dx: puff, dy: puff)
            guard inner.width > 0, inner.height > 0 else {
                return CGPath(ellipseIn: body, transform: nil)
            }
            let path = CGMutablePath()
            let radius = max(0, min(inner.height, inner.width) * 0.25)
            path.addRoundedRect(in: inner, cornerWidth: radius, cornerHeight: radius)
            addCloudPuffs(to: path, around: inner, radius: puff)
            // Bulles de pensée en cascade vers le bas-gauche, contenues dans
            // la bande `cloudThoughtHeight`.
            let large = puff * 0.6
            let small = puff * 0.35
            let cx = max(inner.minX + puff, inner.minX + inner.width * 0.15)
            path.addEllipse(in: CGRect(x: cx - large, y: body.maxY - large * 0.4,
                                       width: large * 2, height: large * 2))
            path.addEllipse(in: CGRect(x: cx - puff * 0.8 - small,
                                       y: body.maxY + large * 1.4,
                                       width: small * 2, height: small * 2))
            return path
        }
    }

    /// Ajoute une rangée de cercles (rayon `radius`) centrés sur le périmètre
    /// de `rect` — les bosses du nuage. Espacement ~1.5 rayon pour un
    /// chevauchement moelleux sans trous.
    private nonisolated static func addCloudPuffs(to path: CGMutablePath,
                                                  around rect: CGRect,
                                                  radius: CGFloat) {
        func addAlong(from a: CGPoint, to b: CGPoint) {
            let distance = hypot(b.x - a.x, b.y - a.y)
            let steps = max(1, Int(ceil(distance / (radius * 1.5))))
            for i in 0...steps {
                let t = CGFloat(i) / CGFloat(steps)
                let center = CGPoint(x: a.x + (b.x - a.x) * t,
                                     y: a.y + (b.y - a.y) * t)
                path.addEllipse(in: CGRect(x: center.x - radius,
                                           y: center.y - radius,
                                           width: radius * 2,
                                           height: radius * 2))
            }
        }
        addAlong(from: CGPoint(x: rect.minX, y: rect.minY), to: CGPoint(x: rect.maxX, y: rect.minY))
        addAlong(from: CGPoint(x: rect.maxX, y: rect.minY), to: CGPoint(x: rect.maxX, y: rect.maxY))
        addAlong(from: CGPoint(x: rect.maxX, y: rect.maxY), to: CGPoint(x: rect.minX, y: rect.maxY))
        addAlong(from: CGPoint(x: rect.minX, y: rect.maxY), to: CGPoint(x: rect.minX, y: rect.minY))
    }

    /// Calcule les attributs de stroke (`strokeColor`, `strokeWidth`) pour un
    /// `StoryTextObject`. Retourne un dictionnaire VIDE si aucun stroke ne doit
    /// être rendu :
    /// - `borderColor == nil` → pas de couleur définie
    /// - couleur invalide (hex non parsable) → on skip
    /// - `borderWidth == nil` OU `borderWidth == 0` → 0 pixel ⇒ rien à dessiner
    ///
    /// Extracted as `nonisolated static` pour permettre tests unitaires sans
    /// instancier de `StoryTextLayer` (qui requiert un context UIKit/CATransaction).
    nonisolated static func strokeAttributes(
        for text: StoryTextObject,
        designFontSize: CGFloat
    ) -> [NSAttributedString.Key: Any] {
        var attrs: [NSAttributedString.Key: Any] = [:]
        guard
            let borderHex = text.borderColor,
            let borderColor = parseHexColorNonisolated(borderHex)
        else { return attrs }
        let widthPx = CGFloat(text.borderWidth ?? 0)
        guard widthPx > 0 else { return attrs }
        attrs[.strokeColor] = borderColor.cgColor
        attrs[.strokeWidth] = -(widthPx / max(designFontSize, 1)) * 100.0
        return attrs
    }

    @MainActor
    private func resolveFont(family: String, size: CGFloat) -> UIFont {
        if family == "system" {
            return UIFont.systemFont(ofSize: size, weight: .semibold)
        }
        if let custom = UIFont(name: family, size: size) {
            return custom
        }
        return UIFont.systemFont(ofSize: size, weight: .semibold)
    }

    private nonisolated func parseAlignment(_ raw: String?) -> NSTextAlignment {
        // RTL behavior: when the user explicitly picks "left" or "right", that
        // wins. Otherwise default to .natural so Arabic/Hebrew text is naturally
        // right-aligned and Latin/Cyrillic stays left/centered.
        switch raw?.lowercased() {
        case "left":   return .left
        case "right":  return .right
        case "center": return .center
        case "natural", nil: return .natural
        default:       return .natural
        }
    }

    private nonisolated func caTextAlignment(from alignment: NSTextAlignment) -> CATextLayerAlignmentMode {
        // CATextLayer has no .natural — pick a sensible projection. Real BiDi
        // resolution lives in NSAttributedString's baseWritingDirection, so
        // CATextLayer alignment is mostly cosmetic for our wrapped lines.
        switch alignment {
        case .left:    return .left
        case .right:   return .right
        case .justified: return .justified
        case .natural, .center: return .center
        @unknown default: return .center
        }
    }

    @MainActor
    private func parseHexColor(_ hex: String?) -> UIColor? {
        return Self.parseHexColorNonisolated(hex)
    }

    /// Variante `nonisolated` du parser hex pour usage depuis les statics testables.
    /// Logique identique à l'ancien `parseHexColor` MainActor.
    nonisolated static func parseHexColorNonisolated(_ hex: String?) -> UIColor? {
        guard let hex else { return nil }
        var trimmed = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("#") { trimmed.removeFirst() }
        guard trimmed.count == 6 || trimmed.count == 8 else { return nil }
        var rgb: UInt64 = 0
        guard Scanner(string: trimmed).scanHexInt64(&rgb) else { return nil }
        let r, g, b, a: CGFloat
        if trimmed.count == 8 {
            r = CGFloat((rgb & 0xFF000000) >> 24) / 255
            g = CGFloat((rgb & 0x00FF0000) >> 16) / 255
            b = CGFloat((rgb & 0x0000FF00) >> 8) / 255
            a = CGFloat(rgb & 0x000000FF) / 255
        } else {
            r = CGFloat((rgb & 0xFF0000) >> 16) / 255
            g = CGFloat((rgb & 0x00FF00) >> 8) / 255
            b = CGFloat(rgb & 0x0000FF) / 255
            a = 1.0
        }
        return UIColor(red: r, green: g, blue: b, alpha: a)
    }
}
