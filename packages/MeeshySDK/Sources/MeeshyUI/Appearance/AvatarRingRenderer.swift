import SwiftUI
import UIKit
import MeeshySDK

// MARK: - AvatarRingRenderer — le contour FIXE, en Core Graphics
//
// LE dessin fixe d'un contour (`AvatarRingDesign`), sans SwiftUI : `AvatarRingView` le peint
// dans son `Canvas` (`withCGContext`), l'export vidéo d'une story le grave sur son interlude et
// sa carte de fin (`StoryExportIntro.drawIdentity`). Une seule peinture : le direct et l'export
// ne peuvent pas diverger (précédent : `BannerFrameRenderer.drawStatic`).
//
// Le viewBox 0 0 100 100 se pose au centre de la boîte remise, à l'échelle du plus petit côté ;
// l'avatar en occupe le cercle de rayon 42 (`AvatarRingGeometry.holeFraction`).
//
// Ce qu'il ne peint PAS : les mouvements (#10935, couches Core Animation de `AvatarRingView`,
// que `skipping` retire du dessin fixe quand elles tournent) et la couche Lottie
// (`PackLottieLayer`). Une image fixe — un export — porte donc le trait de base et tout
// l'ornement à leur pose de repos, jamais l'animation.

public enum AvatarRingRenderer {
    nonisolated static let box: Double = 100
    private static let dots = 28
    private static let dashes = 36
    private static let arcs = 24

    /// Le contour fixe dans `rect` (repère UIKit du contexte) ; `skipping` retire les traits
    /// d'ornement que portent les couches animées.
    public static func drawStill(_ design: AvatarRingDesign, in rect: CGRect, skipping: Set<Int> = [], context: CGContext) {
        guard rect.width > 0, rect.height > 0 else { return }
        let scale = min(rect.width, rect.height) / box
        context.saveGState()
        defer { context.restoreGState() }
        context.translateBy(x: rect.minX + (rect.width - box * scale) / 2, y: rect.minY + (rect.height - box * scale) / 2)
        context.scaleBy(x: scale, y: scale)
        drawBaseStroke(design, in: context)
        drawOrnament(design, skipping: skipping, in: context)
    }

    /// Le contour fixe en image, `side` × `side` pixels (échelle 1) — ce qu'un rendu image par
    /// image (la carte de fin d'un export) pose sans relire les chemins à chaque image.
    public static func stillImage(_ design: AvatarRingDesign, side: Int) -> CGImage? {
        guard side > 0 else { return nil }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = false
        let size = CGSize(width: side, height: side)
        return UIGraphicsImageRenderer(size: size, format: format).image { renderer in
            drawStill(design, in: CGRect(origin: .zero, size: size), context: renderer.cgContext)
        }.cgImage
    }

    // MARK: Le trait de base

    private static func drawBaseStroke(_ design: AvatarRingDesign, in context: CGContext) {
        let colors = design.stroke.colors
        guard let firstHex = colors.first else { return }
        let width = design.stroke.width * box
        let radius = box / 2 - width / 2
        let first = FramePaint.cgColor(firstHex)
        let second = FramePaint.cgColor(colors.count > 1 ? colors[1] : firstHex)
        context.saveGState()
        defer { context.restoreGState() }
        context.setLineWidth(width)

        switch design.stroke.style {
        case .solid:
            stroke(circle(radius), color: first, in: context)
        case .double:
            stroke(circle(radius), color: first, in: context)
            stroke(circle(radius - width * 2), color: second, in: context)
        case .dotted:
            context.setLineCap(.round)
            context.setLineDash(phase: 0, lengths: [0.001, CGFloat(2 * Double.pi * radius / Double(dots))])
            stroke(circle(radius), color: first, in: context)
        case .dashed:
            let step = 2 * Double.pi * radius / Double(dashes)
            context.setLineDash(phase: 0, lengths: [CGFloat(step * 0.6), CGFloat(step * 0.4)])
            stroke(circle(radius), color: first, in: context)
        case .gradient:
            for index in 0..<arcs {
                let from = Double(index) / Double(arcs) * 2 * Double.pi - Double.pi / 2
                let to = Double(index + 1) / Double(arcs) * 2 * Double.pi - Double.pi / 2 + 0.004
                let arc = CGMutablePath()
                arc.addArc(center: CGPoint(x: box / 2, y: box / 2), radius: radius,
                           startAngle: from, endAngle: to, clockwise: false)
                let hex = AvatarRingView.cyclicHex(colors, at: Double(index) / Double(arcs))
                stroke(arc, color: FramePaint.cgColor(hex), in: context)
            }
        case .none:
            break
        }
    }

    private static func circle(_ radius: Double) -> CGPath {
        CGPath(ellipseIn: CGRect(x: box / 2 - radius, y: box / 2 - radius, width: 2 * radius, height: 2 * radius), transform: nil)
    }

    private static func stroke(_ path: CGPath, color: CGColor, in context: CGContext) {
        context.addPath(path)
        context.setStrokeColor(color)
        context.strokePath()
    }

    // MARK: L'ornement

    private static func drawOrnament(_ design: AvatarRingDesign, skipping: Set<Int>, in context: CGContext) {
        let colors = design.stroke.colors
        for (index, stroke) in design.ornament.enumerated() where !skipping.contains(index) {
            let gradient = stroke.gradient.flatMap { design.gradients[safe: $0] ?? nil }
            let paint = FramePaint(color: UIColor(Color(hex: colors[safe: stroke.color] ?? "#000000")),
                                   gradient: gradient, palette: colors)
            paint.fill(SVGPathData.make(stroke.d).cgPath, in: context, opacity: stroke.opacity,
                       lineWidth: stroke.width.map { CGFloat($0) }, evenOdd: false)
        }
    }
}
