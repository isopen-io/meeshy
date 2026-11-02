import SwiftUI
import UIKit
import MeeshySDK

// MARK: - BannerFrameRenderer (#10935)
//
// MIROIR de `packages/shared/utils/banner-frame-svg.ts` : la géométrie et le dessin
// d'un cadre de bannière (`BannerFrameDesign`, #10932), posé SUR la photo ou le fond.
// À la largeur LOGIQUE `W = largeur × 100 / hauteur` : la bordure et ses filets se
// tracent à `W` (jamais un chemin étiré), les pièces restent à leur ancrage, les
// frises répètent leur module (`repeat` : modules entiers centrés ; `justify` :
// module recalculé pour tomber juste). Les FRISES se peignent d'abord, les PIÈCES
// ensuite (#10936) : un coin, un cartouche couvrent la frise qui court dessous.
//
// Le centre transparent est garanti par la DÉCOUPE : le dessin fixe est peint sous
// `clipPath` (contexte découpé), et la racine des couches animées porte le même
// chemin en masque. Un chemin posé au milieu du trou ne s'y peint donc jamais.
// Un trait dont le dégradé est illisible (`nil`) retombe sur sa couleur.

public struct BannerFrameElement: Hashable {
    public let path: BannerFramePath
    /// `x' = tx + sx × x` : l'ancrage d'une pièce, la place (et l'échelle) d'un module de frise.
    public let tx: Double
    public let sx: Double
    public let bounds: CGRect?
}

public enum BannerFrameRenderer {
    nonisolated public static let height: Double = BannerFrameDesign.height
    nonisolated private static let templateWidth: Double = BannerFrameDesign.referenceWidth

    nonisolated public static func logicalWidth(_ size: CGSize) -> Double {
        size.height > 0 ? Double(size.width) * height / Double(size.height) : templateWidth
    }

    // MARK: Géométrie

    public static func elements(_ design: BannerFrameDesign, width: Double) -> [BannerFrameElement] {
        let pieces = design.pieces.flatMap { piece -> [BannerFrameElement] in
            let shift: Double
            switch piece.anchor {
            case .start: shift = 0
            case .center: shift = (width - templateWidth) / 2
            case .end: shift = width - templateWidth
            }
            return piece.paths.map { element($0, tx: shift, sx: 1) }
        }
        let friezes = design.friezes.flatMap { frieze in
            instances(frieze, width: width).flatMap { instance in frieze.paths.map { element($0, tx: instance.tx, sx: instance.sx) } }
        }
        return friezes + pieces
    }

    private static func instances(_ frieze: BannerFrameFrieze, width: Double) -> [(tx: Double, sx: Double)] {
        let span = width - frieze.from - frieze.to
        guard frieze.module > 0, span >= frieze.module else { return [] }
        switch frieze.fit {
        case .repeat:
            let count = Int(floor(span / frieze.module))
            let offset = (span - Double(count) * frieze.module) / 2
            return (0..<count).map { (offset + Double($0) * frieze.module, 1) }
        case .justify:
            let count = max(1, Int((span / frieze.module).rounded()))
            let scale = span / (Double(count) * frieze.module)
            return (0..<count).map { (frieze.from + Double($0) * frieze.module * scale - frieze.from * scale, scale) }
        }
    }

    private static func element(_ path: BannerFramePath, tx: Double, sx: Double) -> BannerFrameElement {
        let raw = SVGPathData.make(path.d).cgPath.boundingBoxOfPath
        let bounds = raw.isNull ? nil : CGRect(x: tx + sx * raw.minX, y: raw.minY, width: sx * raw.width, height: raw.height)
        return BannerFrameElement(path: path, tx: tx, sx: sx, bounds: bounds)
    }

    /// LA DÉCOUPE, à enroulement non nul : le pourtour horaire, le trou anti-horaire (il s'annule),
    /// les coins et le cartouche horaires. `scale` passe du repère du dessin aux points.
    nonisolated public static func clipPath(_ design: BannerFrameDesign, width: Double, scale: CGFloat) -> CGPath {
        let region = design.drawableRegion(width: width)
        let path = CGMutablePath()
        func rect(_ r: FrameRect) -> CGRect { CGRect(x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale) }
        func clockwise(_ r: CGRect) {
            path.move(to: CGPoint(x: r.minX, y: r.minY))
            path.addLine(to: CGPoint(x: r.maxX, y: r.minY))
            path.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
            path.addLine(to: CGPoint(x: r.minX, y: r.maxY))
            path.closeSubpath()
        }
        clockwise(rect(region.outer))
        let hole = rect(region.hole)
        path.move(to: CGPoint(x: hole.minX, y: hole.minY))
        path.addLine(to: CGPoint(x: hole.minX, y: hole.maxY))
        path.addLine(to: CGPoint(x: hole.maxX, y: hole.maxY))
        path.addLine(to: CGPoint(x: hole.maxX, y: hole.minY))
        path.closeSubpath()
        region.reserved.map(rect).forEach(clockwise)
        return path
    }

    static func placedPath(_ element: BannerFrameElement, scale: CGFloat) -> CGPath {
        var transform = CGAffineTransform(a: element.sx, b: 0, c: 0, d: 1, tx: element.tx, ty: 0)
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
        return SVGPathData.make(element.path.d).cgPath.copy(using: &transform) ?? CGMutablePath()
    }

    static func paint(_ design: BannerFrameDesign, color: Int, gradient: Int?) -> FramePaint {
        let readable = gradient.flatMap { design.gradients[safe: $0] ?? nil }
        return FramePaint(color: UIColor(Color(hex: design.palette[safe: color] ?? "#000000")), gradient: readable, palette: design.palette)
    }

    // MARK: Le dessin fixe

    /// Le cadre fixe dans `context` (repère UIKit, en points), tout son dessin sous la découpe ; `skipping`
    /// retire les éléments que portent les couches animées.
    public static func drawStatic(_ design: BannerFrameDesign, size: CGSize, skipping: Set<Int> = [], in context: CGContext) {
        let width = logicalWidth(size)
        let scale = size.height / CGFloat(height)
        context.saveGState()
        context.addPath(clipPath(design, width: width, scale: scale))
        context.clip(using: .winding)
        let border = design.border
        let band = CGMutablePath()
        band.addRect(CGRect(x: 0, y: 0, width: width * scale, height: height * scale))
        band.addRect(CGRect(x: border.width * scale, y: border.width * scale, width: (width - 2 * border.width) * scale, height: (height - 2 * border.width) * scale))
        fill(context, band, paint: paint(design, color: border.color, gradient: border.gradient), opacity: border.opacity, lineWidth: nil, evenOdd: true)
        for filet in border.filets {
            let rect = CGRect(x: filet.inset * scale, y: filet.inset * scale, width: (width - 2 * filet.inset) * scale, height: (height - 2 * filet.inset) * scale)
            fill(context, CGPath(rect: rect, transform: nil), paint: paint(design, color: filet.color, gradient: filet.gradient), opacity: filet.opacity, lineWidth: filet.width * scale, evenOdd: false)
        }
        for (index, element) in elements(design, width: width).enumerated() where !skipping.contains(index) {
            let path = element.path
            fill(context, placedPath(element, scale: scale), paint: paint(design, color: path.color, gradient: path.gradient),
                 opacity: path.opacity, lineWidth: path.width.map { $0 * scale }, evenOdd: path.fillRule == .evenodd)
        }
        context.restoreGState()
    }

    private static func fill(_ context: CGContext, _ path: CGPath, paint: FramePaint, opacity: Double, lineWidth: CGFloat?, evenOdd: Bool) {
        paint.fill(path, in: context, opacity: opacity, lineWidth: lineWidth, evenOdd: evenOdd)
    }

    public static func staticImage(_ design: BannerFrameDesign, size: CGSize, skipping: Set<Int> = [], screenScale: CGFloat) -> UIImage? {
        guard size.width > 0, size.height > 0 else { return nil }
        let format = UIGraphicsImageRendererFormat.preferred()
        format.scale = screenScale
        format.opaque = false
        return UIGraphicsImageRenderer(size: size, format: format).image { drawStatic(design, size: size, skipping: skipping, in: $0.cgContext) }
    }

    // MARK: Les couches animées

    public static func plan(_ design: BannerFrameDesign, size: CGSize) -> FrameMotionPlan {
        guard !design.motion.isEmpty else { return .still }
        let width = logicalWidth(size)
        return FrameMotionPlan.make(
            elements: elements(design, width: width).map { FrameMotionPlan.Element(group: $0.path.group, bounds: $0.bounds) },
            motions: design.motion,
            center: CGPoint(x: width / 2, y: height / 2)
        )
    }

    /// Les couches du plan, sous un masque à la région du cadre (en points).
    public static func motionContent(_ design: BannerFrameDesign, size: CGSize, plan: FrameMotionPlan) -> FrameMotionContent {
        let width = logicalWidth(size)
        let scale = size.height / CGFloat(height)
        let all = elements(design, width: width)
        let root = CALayer()
        root.frame = CGRect(origin: .zero, size: size)
        let mask = CAShapeLayer()
        mask.frame = root.bounds
        mask.path = clipPath(design, width: width, scale: scale)
        root.mask = mask
        var animations: [(layer: CALayer, animation: CAAnimation, delay: Double)] = []
        func shape(_ index: Int, white: Bool) -> CALayer {
            let element = all[index]
            let path = element.path
            let paint = white ? FramePaint(color: .white, gradient: nil, palette: []) : paint(design, color: path.color, gradient: path.gradient)
            return FrameMotionLayers.shape(placedPath(element, scale: scale), paint: paint, opacity: white ? 1 : path.opacity,
                                           lineWidth: path.width.map { $0 * scale }, evenOdd: path.fillRule == .evenodd)
        }
        for layer in plan.layers {
            let content = CALayer()
            layer.elements.forEach { content.addSublayer(shape($0, white: false)) }
            root.addSublayer(FrameMotionLayers.wrap(content, chain: layer.chain, size: size, scale: scale, into: &animations))
        }
        for sweep in plan.sweeps {
            let targets = CALayer()
            sweep.elements.forEach { targets.addSublayer(shape($0, white: true)) }
            root.addSublayer(FrameMotionLayers.sweep(sweep, mask: targets, size: size, into: &animations))
        }
        return FrameMotionContent(root: root, animations: animations)
    }
}

/// La région du cadre comme forme SwiftUI : découpe la couche Lottie d'un cadre à son pourtour.
nonisolated public struct BannerFrameRegion: Shape {
    public let design: BannerFrameDesign

    public init(design: BannerFrameDesign) {
        self.design = design
    }

    public func path(in rect: CGRect) -> Path {
        let scale = rect.height / CGFloat(BannerFrameRenderer.height)
        let path = BannerFrameRenderer.clipPath(design, width: BannerFrameRenderer.logicalWidth(rect.size), scale: scale)
        return Path(path).offsetBy(dx: rect.minX, dy: rect.minY)
    }
}
