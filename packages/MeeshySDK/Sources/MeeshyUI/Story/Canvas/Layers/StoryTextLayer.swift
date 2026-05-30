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
public final class StoryTextLayer: CATextLayer, @unchecked Sendable {
    public private(set) nonisolated(unsafe) var textObject: StoryTextObject?

    /// Backing layer placed behind the text glyphs when `backgroundStyle` is
    /// non-`.none`. For `.solid` this is a tinted CALayer; for `.glass` this is
    /// a `StoryGlassBackdropLayer` which routes through `StoryBlurFilter`
    /// (`MPSImageGaussianBlur`, GPU) when a backdrop MTLTexture is supplied
    /// via `setBackdropTexture(_:)`, or falls back to a private `CAFilter`
    /// "gaussianBlur" attached to the layer's `filters` until then.
    private var backgroundFillLayer: CALayer?
    private var glassBackdropLayer: StoryGlassBackdropLayer?

    /// Chaînes attribuées mémorisées par `configure`, permettant à
    /// `setGlyphsHidden` de basculer les glyphes sans toucher `bounds` ni les
    /// sous-calques de fond.
    private var visibleString: NSAttributedString?
    private var hiddenString: NSAttributedString?
    public private(set) var glyphsHidden: Bool = false

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
        let maxDesignWidth = CanvasGeometry.designWidth * 0.88
        let designSize = designAttr.boundingRect(
            with: CGSize(width: maxDesignWidth, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            context: nil
        ).size
        // Symmetric pad in design pixels (16 design px ≈ ~6 px on iPhone, ~12 on iPad).
        let designBounds = CGSize(width: ceil(designSize.width) + 16,
                                  height: ceil(designSize.height) + 16)

        // Render-space bounds is the linear projection of the design bounds.
        let renderedBounds = geometry.render(designBounds)
        bounds = CGRect(origin: .zero, size: renderedBounds)

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
        let designCenterY = CGFloat(text.y) * CanvasGeometry.designHeight
        position = geometry.render(CGPoint(x: designCenterX, y: designCenterY))
        anchorPoint = text.anchor
        transform = CATransform3DMakeRotation(CGFloat(text.rotation) * .pi / 180, 0, 0, 1)
        zPosition = CGFloat(text.zIndex)
        name = text.id

        // Static text is a rasterization candidate during playback.
        shouldRasterize = mode == .play && text.isStatic
        if shouldRasterize { rasterizationScale = UIScreen.main.scale }

        // Install background fill / glass backdrop behind the text glyphs.
        // The CATextLayer renders its `string` into its own contents; the
        // background must live in a *sublayer* placed at zPosition < 0 so the
        // CATextLayer's own drawn glyphs paint above it.
        applyBackgroundStyle(text.resolvedBackgroundStyle, geometry: geometry)
    }

    /// Rend les glyphes invisibles (couleur de premier plan transparente) tout
    /// en conservant `bounds` et les sous-calques de fond (solide / glass).
    /// Utilisé pendant l'édition de texte en place : `StoryInlineTextEditor`
    /// peint les glyphes éditables par-dessus, le vrai fond reste visible.
    @MainActor
    public func setGlyphsHidden(_ hidden: Bool) {
        glyphsHidden = hidden
        string = hidden ? hiddenString : visibleString
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

        switch style {
        case .none:
            return

        case .solid(let hex):
            let fill = CALayer()
            fill.frame = bounds
            // Symmetric inset already baked into bounds via the +16 design-px pad.
            fill.cornerRadius = max(4, bounds.height * 0.15)
            fill.backgroundColor = (parseHexColor(hex) ?? .black.withAlphaComponent(0.5)).cgColor
            fill.zPosition = -1
            fill.contentsScale = UIScreen.main.scale
            addSublayer(fill)
            backgroundFillLayer = fill

        case .glass(let radius):
            let backdrop = StoryGlassBackdropLayer()
            backdrop.frame = bounds
            backdrop.cornerRadius = max(4, bounds.height * 0.15)
            backdrop.masksToBounds = true
            backdrop.zPosition = -1
            backdrop.contentsScale = UIScreen.main.scale
            // Sigma is design-px; project to render-px so the blur "feels" the
            // same on iPhone & iPad (consistent with CanvasGeometry.render).
            let renderedSigma = Float(geometry.render(CGFloat(radius)))
            backdrop.configure(sigma: renderedSigma)
            addSublayer(backdrop)
            glassBackdropLayer = backdrop
        }
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
