import CoreGraphics
import UIKit

/// Animated Meeshy watermark baked over every exported frame.
///
/// The watermark alternates corner every 5 s (bottom-right for the first window,
/// top-left for the next, and so on) with a short fade at each switch. The
/// three-dash logo is drawn procedurally per frame to reproduce
/// `AnimatedLogoView`: on entering a corner the dashes TRACE in (staggered
/// easeOut), then BREATHE continuously (subtle scale + per-dash opacity). The
/// wordmark "meeshy" and the optional "@handle" are pre-rendered once.
public struct StoryExportWatermark: @unchecked Sendable {
    /// `@unchecked Sendable` : `CGImage` is immutable/thread-safe and the struct
    /// only carries values.
    ///
    /// Pre-rendered white "meeshy" (+ optional "@handle" below) text block.
    let textImage: CGImage
    /// Width / height of the whole block (square logo + gap + text).
    let blockAspect: CGFloat
    /// Total block width as a fraction of the render width (clamped 0–1).
    let widthFraction: CGFloat
    /// Margin from the frame edges as a fraction of the render width.
    let marginFraction: CGFloat
    /// Base alpha, multiplied by the per-switch fade (clamped 0–1).
    let baseOpacity: CGFloat

    init(textImage: CGImage,
         blockAspect: CGFloat,
         widthFraction: CGFloat = 0.26,
         marginFraction: CGFloat = 0.045,
         baseOpacity: CGFloat = 0.9) {
        self.textImage = textImage
        self.blockAspect = max(1, blockAspect)
        self.widthFraction = min(1, max(0, widthFraction))
        self.marginFraction = min(0.5, max(0, marginFraction))
        self.baseOpacity = min(1, max(0, baseOpacity))
    }

    // MARK: - Animation constants

    /// Seconds spent in each corner before switching.
    public static let segmentDuration: Double = 12.0
    /// Fade-in / fade-out duration at each corner switch.
    static let fadeDuration: Double = 0.4
    /// Breathing cycle (full down-up), matching `AnimatedLogoView`'s 1.5 s
    /// autoreversing animation.
    static let breatheCycle: Double = 3.0
    /// Gap between logo and text, as a fraction of the (square) logo side.
    static let logoGapRatio: CGFloat = 0.18

    // MARK: - Layout (SSOT partagée)

    /// Coin occupé à l'instant `seconds` : bas-droite sur la première fenêtre,
    /// haut-gauche sur la suivante, et ainsi de suite.
    static func isBottomRight(at seconds: Double) -> Bool {
        Int(floor(seconds / segmentDuration)) % 2 == 0
    }

    /// Opacité effective à l'instant `seconds` — `baseOpacity` modulée par le
    /// fondu de chaque bascule de coin. `0` signifie « rien à peindre ».
    func alpha(at seconds: Double) -> CGFloat {
        let segment = floor(seconds / Self.segmentDuration)
        let local = seconds - segment * Self.segmentDuration
        let fadeIn = min(1, local / Self.fadeDuration)
        let fadeOut = min(1, (Self.segmentDuration - local) / Self.fadeDuration)
        return baseOpacity * max(0, min(fadeIn, fadeOut))
    }

    /// Rectangle du bloc (logo carré + gap + texte) à l'instant `seconds`.
    ///
    /// Source unique de la mise en page : `draw` peint dedans, et le bake
    /// vidéo hors-story (`MeeshyVideoWatermarkBaker`) s'en sert pour ne rendre
    /// QUE cette zone par frame au lieu d'une planche pleine taille.
    func blockRect(renderSize: CGSize, at seconds: Double) -> CGRect {
        let totalW = renderSize.width * widthFraction
        let totalH = totalW / blockAspect
        let margin = renderSize.width * marginFraction
        let origin = Self.isBottomRight(at: seconds)
            ? CGPoint(x: renderSize.width - margin - totalW,
                      y: renderSize.height - margin - totalH)
            : CGPoint(x: margin, y: margin)
        return CGRect(origin: origin, size: CGSize(width: totalW, height: totalH))
    }

    // MARK: - Drawing

    /// Draws the watermark for slide time `seconds` into `cg`, which the
    /// compositor has already flipped to UIKit top-down coordinates.
    @MainActor
    public func draw(in cg: CGContext, renderSize: CGSize, at seconds: Double) {
        let segment = Int(floor(seconds / Self.segmentDuration))
        let local = seconds - Double(segment) * Self.segmentDuration

        let opacity = alpha(at: seconds)
        guard opacity > 0.01 else { return }

        let block = blockRect(renderSize: renderSize, at: seconds)
        let totalW = block.width
        let totalH = block.height
        let origin = block.origin

        let logoSide = totalH
        let gap = logoSide * Self.logoGapRatio
        let logoRect = CGRect(x: origin.x, y: origin.y, width: logoSide, height: logoSide)
        let textRect = CGRect(x: origin.x + logoSide + gap, y: origin.y,
                              width: max(0, totalW - logoSide - gap), height: totalH)

        cg.saveGState()
        cg.setAlpha(opacity)
        cg.setShadow(offset: CGSize(width: 0, height: 2), blur: 6,
                     color: UIColor.black.withAlphaComponent(0.45).cgColor)
        Self.drawAnimatedLogo(in: cg, rect: logoRect, localTime: local, globalTime: seconds)
        Self.drawTextImage(textImage, in: textRect, cg: cg)
        cg.restoreGState()
    }

    // MARK: - Logo (procedural — mirrors AnimatedLogoView)

    /// Canonical three-dash geometry (1024 space of `MeeshyDashesShape`).
    private static let dashes: [(from: CGPoint, to: CGPoint)] = [
        (CGPoint(x: 262, y: 384), CGPoint(x: 762, y: 384)),
        (CGPoint(x: 262, y: 512), CGPoint(x: 662, y: 512)),
        (CGPoint(x: 262, y: 640), CGPoint(x: 562, y: 640)),
    ]
    private static let dashLineWidth: CGFloat = 112

    /// Colour of the animated logo dashes — Meeshy primary (indigo500 #6366F1).
    static let logoColor = UIColor(red: 99.0 / 255.0, green: 102.0 / 255.0,
                                   blue: 241.0 / 255.0, alpha: 1)
    /// Stagger between successive dashes tracing in.
    static let logoTraceStagger: Double = 0.6
    /// Duration of a single dash's draw-on. With 3 dashes staggered by 0.6 s,
    /// the whole logo is fully traced at 0.6*2 + 1.8 = 3 s.
    static let logoTraceBarDuration: Double = 1.8

    /// Draw-on progress (easeOut, 0…1) of dash `barIndex` at `elapsed` seconds
    /// into the current corner window. The whole logo is fully traced at
    /// `logoTraceStagger * (dashes.count - 1) + logoTraceBarDuration`.
    static func logoTraceProgress(elapsed: Double, barIndex: Int) -> CGFloat {
        let delay = Double(barIndex) * logoTraceStagger
        let raw = max(0, min(1, (elapsed - delay) / logoTraceBarDuration))
        return CGFloat(1 - pow(1 - raw, 2))   // easeOut
    }

    @MainActor
    private static func drawAnimatedLogo(in cg: CGContext, rect: CGRect,
                                         localTime: Double, globalTime: Double) {
        guard rect.width > 0, rect.height > 0 else { return }

        // Breathing: subtle scale + per-dash opacity, matching AnimatedLogoView.
        let breathe = (1 - cos(2 * Double.pi * globalTime / breatheCycle)) / 2   // 0…1
        let scale = CGFloat(1.0 + 0.05 * breathe)
        let opacities: [CGFloat] = [
            lerp(0.70, 1.00, breathe),
            lerp(1.00, 0.85, breathe),
            lerp(0.75, 1.00, breathe),
        ]

        let s = min(rect.width, rect.height) / 1024.0
        let xOffset = rect.minX + (rect.width - 1024 * s) / 2
        let yOffset = rect.minY + (rect.height - 1024 * s) / 2

        cg.saveGState()
        // Breathe scale about the logo centre.
        cg.translateBy(x: rect.midX, y: rect.midY)
        cg.scaleBy(x: scale, y: scale)
        cg.translateBy(x: -rect.midX, y: -rect.midY)
        // Place the 1024-space glyph into rect (centred, like MeeshyDashesShape).
        cg.translateBy(x: xOffset, y: yOffset)
        cg.scaleBy(x: s, y: s)

        cg.setLineCap(.round)
        cg.setLineWidth(dashLineWidth)
        for (index, dash) in dashes.enumerated() {
            let progress = logoTraceProgress(elapsed: localTime, barIndex: index)
            guard progress > 0.001 else { continue }
            cg.setStrokeColor(logoColor.withAlphaComponent(opacities[index]).cgColor)
            let xEnd = dash.from.x + (dash.to.x - dash.from.x) * progress
            cg.move(to: dash.from)
            cg.addLine(to: CGPoint(x: xEnd, y: dash.from.y))
            cg.strokePath()
        }
        cg.restoreGState()
    }

    /// Draws the pre-rendered text block into `rect`, left-aligned, height-fit,
    /// compensating the context's top-down flip (CGImage draws bottom-up).
    @MainActor
    private static func drawTextImage(_ image: CGImage, in rect: CGRect, cg: CGContext) {
        guard rect.width > 0, rect.height > 0, image.height > 0 else { return }
        let aspect = CGFloat(image.width) / CGFloat(image.height)
        let drawWidth = min(rect.height * aspect, rect.width)
        // Vertically centre the text within the (logo-height) block.
        let dst = CGRect(x: rect.minX,
                         y: rect.minY,
                         width: drawWidth,
                         height: rect.height)
        cg.saveGState()
        cg.translateBy(x: dst.minX, y: dst.minY + dst.height)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(image, in: CGRect(origin: .zero, size: dst.size))
        cg.restoreGState()
    }

    private static func lerp(_ a: CGFloat, _ b: CGFloat, _ t: Double) -> CGFloat {
        a + (b - a) * CGFloat(t)
    }
}

/// Product variant of the export watermark: the animated Meeshy dashes logo +
/// wordmark "meeshy" and, when provided, the author's "@handle" stacked below.
@MainActor
public enum MeeshyExportWatermark {

    /// Builds the watermark. The logo is drawn per frame by
    /// `StoryExportWatermark`; only the text block is pre-rendered here.
    /// `username` (without "@") is baked as "@username" below the wordmark.
    public static func make(username: String? = nil) -> StoryExportWatermark? {
        let wordFont = UIFont.systemFont(ofSize: 76, weight: .semibold).rounded()
        let word = "meeshy" as NSString
        let wordAttributes: [NSAttributedString.Key: Any] = [
            .font: wordFont,
            .foregroundColor: UIColor.white,
        ]
        let wordSize = word.size(withAttributes: wordAttributes)

        let handle: NSString?
        let handleAttributes: [NSAttributedString.Key: Any]
        let handleSize: CGSize
        if let username, !username.isEmpty {
            handle = "@\(username)" as NSString
            let handleFont = UIFont.systemFont(ofSize: 46, weight: .medium).rounded()
            handleAttributes = [
                .font: handleFont,
                .foregroundColor: UIColor.white.withAlphaComponent(0.92),
            ]
            handleSize = handle!.size(withAttributes: handleAttributes)
        } else {
            handle = nil
            handleAttributes = [:]
            handleSize = .zero
        }

        let lineGap: CGFloat = handle != nil ? 6 : 0
        let padding: CGFloat = 8
        let textWidth = max(wordSize.width, handleSize.width)
        let textHeight = wordSize.height + lineGap + handleSize.height
        let canvas = CGSize(width: ceil(textWidth) + padding * 2,
                            height: ceil(textHeight) + padding * 2)

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let rendered = UIGraphicsImageRenderer(size: canvas, format: format).image { context in
            let cg = context.cgContext
            cg.setShadow(offset: CGSize(width: 0, height: 2), blur: 6,
                         color: UIColor.black.withAlphaComponent(0.45).cgColor)
            word.draw(at: CGPoint(x: padding, y: padding), withAttributes: wordAttributes)
            if let handle {
                handle.draw(at: CGPoint(x: padding, y: padding + wordSize.height + lineGap),
                            withAttributes: handleAttributes)
            }
        }

        guard let textImage = rendered.cgImage else { return nil }
        let textAspect = CGFloat(textImage.width) / CGFloat(textImage.height)
        let blockAspect = 1 + StoryExportWatermark.logoGapRatio + textAspect
        return StoryExportWatermark(textImage: textImage, blockAspect: blockAspect)
    }
}

private extension UIFont {
    func rounded() -> UIFont {
        guard let descriptor = fontDescriptor.withDesign(.rounded) else { return self }
        return UIFont(descriptor: descriptor, size: pointSize)
    }
}
