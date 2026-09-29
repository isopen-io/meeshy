import CoreGraphics
import CoreText
import Foundation

/// Tout ce qu'un ornement sait de la scène où il se pose (`OrnamentStage` du web).
nonisolated struct CallFrameOrnamentStage {
    let size: CGSize
    let unit: CGFloat
    let zones: [CGRect]
    let avoid: [CGRect]
    let top: CGRect
    let bottom: CGRect
    let inner: CGRect
    let slots: [CallFrameSlotBox]
    let front: Bool
    /// L'encombrement des textes des réserves : aucun ornement semé ne s'y pose, au fond comme devant.
    let text: [CGRect]
    /// Le titre (ou, à défaut, le sous-titre) — ce que le ruban habille.
    let headline: CGRect?
}

/// Les trente-quatre ornements (§ 4.4) — le port de `frame-paint-ornaments.ts`. Placement DÉTERMINISTE
/// (graine = rang de l'ornement dans le cadre) : l'aperçu ne scintille pas. Un ornement `back` dispose de
/// toute la toile ; un ornement `front` ne se pose que dans les marges et les réserves de texte, sauf
/// ceux qui HABILLENT une case sans toucher au visage (couronne, rubans adhésifs).
nonisolated extension CallFrameRenderer {
    typealias Spot = (point: CGPoint, r: CGFloat, draw: Int)

    static func ornamentStage(_ stage: CallFrameStage, front: Bool, text: CallFrameTextLayout? = nil) -> CallFrameOrnamentStage {
        CallFrameOrnamentStage(
            size: stage.size,
            unit: stage.unit,
            zones: ornamentZones(stage, front: front),
            avoid: stage.footprints,
            top: stage.areas.top,
            bottom: stage.areas.bottom,
            inner: stage.areas.inner,
            slots: stage.boxes,
            front: front,
            text: text?.boxes ?? [],
            headline: text?.headline
        )
    }

    static func paintOrnaments(_ context: CGContext, stage: CallFrameStage, layer: CallFrameLayer, text: CallFrameTextLayout, fonts: CallFrameFontBook) {
        let scene = ornamentStage(stage, front: layer == .front, text: text)
        stage.look.ornaments.enumerated()
            .filter { $0.element.layer == layer }
            .forEach { rank, ornament in paintOrnament(context, ornament: ornament, scene: scene, rank: rank, fonts: fonts) }
    }

    // MARK: - Glyphes

    static func star5(_ path: CGMutablePath, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat, turn: CGFloat = 0) {
        path.addPath(polygon((0 ..< 10).map { index in
            let angle = -CGFloat.pi / 2 + turn + CGFloat(index) * .pi / 5
            let radius = index % 2 == 0 ? r : r * 0.45
            return CGPoint(x: x + cos(angle) * radius, y: y + sin(angle) * radius)
        }))
    }

    static func sparkle(_ path: CGMutablePath, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat) {
        path.move(to: CGPoint(x: x, y: y - r))
        path.addQuadCurve(to: CGPoint(x: x + r, y: y), control: CGPoint(x: x + r * 0.12, y: y - r * 0.12))
        path.addQuadCurve(to: CGPoint(x: x, y: y + r), control: CGPoint(x: x + r * 0.12, y: y + r * 0.12))
        path.addQuadCurve(to: CGPoint(x: x - r, y: y), control: CGPoint(x: x - r * 0.12, y: y + r * 0.12))
        path.addQuadCurve(to: CGPoint(x: x, y: y - r), control: CGPoint(x: x - r * 0.12, y: y - r * 0.12))
        path.closeSubpath()
    }

    static func glowDisc(_ context: CGContext, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat, _ hex: String, core: Double = 0.55) {
        glowDisc(context, x, y, r, ink: color(hex), core: core)
    }

    /// Un disque lumineux : `ink` à `core` au centre, s'éteignant vers le bord.
    static func glowDisc(_ context: CGContext, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat, ink: CGColor, core: Double) {
        guard r > 0 else { return }
        let base = ink.alpha
        let colors = [core, core * 0.45, 0].map { ink.copy(alpha: base * CGFloat($0)) ?? ink } as CFArray
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.45, 1]) else { return }
        let center = CGPoint(x: x, y: y)
        context.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: r, options: [])
    }

    static func fill(_ context: CGContext, _ path: CGPath, _ ink: CGColor, rule: CGPathFillRule = .winding) {
        context.setFillColor(ink)
        context.addPath(path)
        context.fillPath(using: rule)
    }

    static func stroke(_ context: CGContext, _ path: CGPath, _ ink: CGColor, width: CGFloat) {
        context.setStrokeColor(ink)
        context.setLineWidth(width)
        context.addPath(path)
        context.strokePath()
    }

    /// Les glyphes des runes : des traits dans un carré unité (x, y de 0 à 1).
    static let runes: [[(CGFloat, CGFloat, CGFloat, CGFloat)]] = [
        [(0.5, 0, 0.5, 1), (0.5, 0.15, 0.85, 0.4), (0.5, 0.4, 0.85, 0.65)],
        [(0.3, 0, 0.3, 1), (0.3, 0.2, 0.75, 0.5), (0.75, 0.5, 0.3, 0.8)],
        [(0.5, 0, 0.5, 1), (0.2, 0.3, 0.8, 0.7), (0.8, 0.3, 0.2, 0.7)],
        [(0.25, 0, 0.25, 1), (0.75, 0, 0.75, 1), (0.25, 0.25, 0.75, 0.6)],
        [(0.5, 0, 0.2, 0.5), (0.2, 0.5, 0.5, 1), (0.5, 0, 0.8, 0.5), (0.8, 0.5, 0.5, 1)],
        [(0.3, 0, 0.3, 1), (0.3, 0.1, 0.8, 0.35), (0.3, 0.55, 0.8, 0.35)],
        [(0.5, 0, 0.5, 1), (0.15, 0.2, 0.5, 0.5), (0.85, 0.2, 0.5, 0.5)],
        [(0.2, 1, 0.5, 0), (0.5, 0, 0.8, 1), (0.35, 0.55, 0.65, 0.55)],
    ]

    static func note(_ context: CGContext, _ x: CGFloat, _ y: CGFloat, _ s: CGFloat, double: Bool, ink: CGColor) {
        func head(_ hx: CGFloat, _ hy: CGFloat) {
            let ellipse = CGMutablePath()
            ellipse.addEllipse(in: CGRect(x: -s * 0.32, y: -s * 0.22, width: s * 0.64, height: s * 0.44), transform: CGAffineTransform(translationX: hx, y: hy).rotated(by: -0.35))
            fill(context, ellipse, ink)
        }
        head(x, y)
        let stem = CGMutablePath()
        stem.move(to: CGPoint(x: x + s * 0.28, y: y - s * 0.05))
        stem.addLine(to: CGPoint(x: x + s * 0.28, y: y - s * 1.1))
        if double {
            head(x + s * 0.75, y - s * 0.15)
            stem.move(to: CGPoint(x: x + s * 1.03, y: y - s * 0.2))
            stem.addLine(to: CGPoint(x: x + s * 1.03, y: y - s * 1.25))
            stroke(context, stem, ink, width: s * 0.08)
            fill(context, polygon([
                CGPoint(x: x + s * 0.24, y: y - s * 1.1), CGPoint(x: x + s * 1.07, y: y - s * 1.25),
                CGPoint(x: x + s * 1.07, y: y - s * 1.05), CGPoint(x: x + s * 0.24, y: y - s * 0.9),
            ]), ink)
            return
        }
        stroke(context, stem, ink, width: s * 0.08)
        let flag = CGMutablePath()
        flag.move(to: CGPoint(x: x + s * 0.28, y: y - s * 1.1))
        flag.addCurve(to: CGPoint(x: x + s * 0.7, y: y - s * 0.35), control1: CGPoint(x: x + s * 0.4, y: y - s * 0.75), control2: CGPoint(x: x + s * 0.85, y: y - s * 0.75))
        stroke(context, flag, ink, width: s * 0.08)
    }

    static func bat(_ path: CGMutablePath, _ x: CGFloat, _ y: CGFloat, _ s: CGFloat) {
        func p(_ dx: CGFloat, _ dy: CGFloat) -> CGPoint { CGPoint(x: x + s * dx, y: y + s * dy) }
        path.move(to: p(0, -0.12))
        path.addLine(to: p(-0.08, -0.3))
        path.addLine(to: p(-0.1, -0.12))
        path.addQuadCurve(to: p(-1, -0.15), control: p(-0.45, -0.4))
        path.addQuadCurve(to: p(-0.72, 0.12), control: p(-0.8, -0.05))
        path.addQuadCurve(to: p(-0.45, 0.15), control: p(-0.6, 0.02))
        path.addQuadCurve(to: p(-0.16, 0.22), control: p(-0.3, 0.05))
        path.addQuadCurve(to: p(0.16, 0.22), control: p(0, 0.1))
        path.addQuadCurve(to: p(0.45, 0.15), control: p(0.3, 0.05))
        path.addQuadCurve(to: p(0.72, 0.12), control: p(0.6, 0.02))
        path.addQuadCurve(to: p(1, -0.15), control: p(0.8, -0.05))
        path.addQuadCurve(to: p(0.1, -0.12), control: p(0.45, -0.4))
        path.addLine(to: p(0.08, -0.3))
        path.closeSubpath()
    }

    static func skull(_ path: CGMutablePath, _ x: CGFloat, _ y: CGFloat, _ s: CGFloat) {
        func p(_ dx: CGFloat, _ dy: CGFloat) -> CGPoint { CGPoint(x: x + s * dx, y: y + s * dy) }
        path.move(to: p(-0.5, 0.05))
        path.addCurve(to: p(0.5, 0.05), control1: p(-0.62, -0.75), control2: p(0.62, -0.75))
        path.addQuadCurve(to: p(0.3, 0.32), control: p(0.45, 0.28))
        path.addLine(to: p(0.3, 0.55))
        path.addQuadCurve(to: p(-0.3, 0.55), control: p(0, 0.66))
        path.addLine(to: p(-0.3, 0.32))
        path.addQuadCurve(to: p(-0.5, 0.05), control: p(-0.45, 0.28))
        path.closeSubpath()
        path.addEllipse(in: CGRect(x: x - s * 0.34, y: y - s * 0.13, width: s * 0.26, height: s * 0.3))
        path.addEllipse(in: CGRect(x: x + s * 0.08, y: y - s * 0.13, width: s * 0.26, height: s * 0.3))
        path.addPath(polygon([p(0, 0.18), p(0.07, 0.3), p(-0.07, 0.3)]))
        [-0.15, 0, 0.15].forEach { dx in path.addRect(CGRect(x: x + s * CGFloat(dx) - s * 0.02, y: y + s * 0.4, width: s * 0.04, height: s * 0.14)) }
    }

    static func rose(_ context: CGContext, _ x: CGFloat, _ y: CGFloat, _ s: CGFloat, hex: String) {
        ([-0.6, 0.6] as [CGFloat]).forEach { side in
            let leaf = CGMutablePath()
            leaf.move(to: CGPoint(x: x + side * s * 0.5, y: y + s * 0.3))
            leaf.addQuadCurve(to: CGPoint(x: x + side * s * 1.35, y: y + s * 0.55), control: CGPoint(x: x + side * s * 1.15, y: y + s * 0.05))
            leaf.addQuadCurve(to: CGPoint(x: x + side * s * 0.5, y: y + s * 0.3), control: CGPoint(x: x + side * s * 0.9, y: y + s * 0.75))
            fill(context, leaf, color("#3F6B45"))
        }
        context.saveGState()
        let bloom = CGMutablePath()
        bloom.addCircle(x, y, s * 0.72)
        context.addPath(bloom)
        context.clip()
        if let shading = gradient([mix(hex, "#FFFFFF", 0.25), mix(hex, "#000000", 0.25)]) {
            context.drawRadialGradient(shading, startCenter: CGPoint(x: x - s * 0.2, y: y - s * 0.25), startRadius: s * 0.1, endCenter: CGPoint(x: x, y: y), endRadius: s, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        }
        context.restoreGState()
        let spiral = CGMutablePath()
        (0 ..< 40).forEach { index in
            let angle = CGFloat(index) * 0.42
            let radius = s * 0.04 + CGFloat(index) * s * 0.0155
            let point = CGPoint(x: x + cos(angle) * radius, y: y + sin(angle) * radius * 0.92)
            if index == 0 { spiral.move(to: point) } else { spiral.addLine(to: point) }
        }
        stroke(context, spiral, mix(hex, "#000000", 0.45), width: max(0.6, s * 0.07))
    }

    // MARK: - L'ornement

    static func paintOrnament(_ context: CGContext, ornament: CallFrameOrnament, scene: CallFrameOrnamentStage, rank: Int, fonts: CallFrameFontBook) {
        let u = scene.unit
        let w = scene.size.width
        let h = scene.size.height
        let hex = ornament.color
        let ink = color(hex)
        let seed = Double(1000 + rank * 131)
        func between(_ draw: Int, _ low: CGFloat, _ high: CGFloat) -> CGFloat { u * (low + rand(seed + 5, Double(draw)) * (high - low)) }
        func scattered(_ base: Double, size: (Int) -> CGFloat, _ body: (Spot) -> Void) {
            spots(zones: scene.zones, avoid: scene.avoid, text: scene.text, front: scene.front, seed: seed, count: count(base, ornament.density), radius: size).forEach(body)
        }
        let dressing = ornament.kind == .crown || ornament.kind == .tape
        context.saveGState()
        if !dressing { clip(context, to: scene.zones, front: scene.front) }
        context.setFillColor(ink)
        context.setStrokeColor(ink)
        context.setLineCap(.round)
        context.setLineJoin(.round)
        switch ornament.kind {
        case .sparkles:
            scattered(14, size: { between($0, 0.012, 0.034) }) { spot in
                glowDisc(context, spot.point.x, spot.point.y, spot.r * 1.5, hex, core: 0.35)
                let path = CGMutablePath()
                sparkle(path, spot.point.x, spot.point.y, spot.r)
                fill(context, path, ink)
            }
        case .bokeh:
            scattered(9, size: { between($0, 0.04, 0.12) }) { spot in
                let colors = [tint(hex, 0.7), tint(hex, 0.45), tint(hex, 0)] as CFArray
                guard let disc = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.75, 1]) else { return }
                context.drawRadialGradient(disc, startCenter: spot.point, startRadius: 0, endCenter: spot.point, endRadius: spot.r, options: [])
            }
        case .confetti:
            scattered(34, size: { between($0, 0.006, 0.011) }) { spot in
                let turn = CGAffineTransform(translationX: spot.point.x, y: spot.point.y).rotated(by: rand(seed + 7, Double(spot.draw)) * tau)
                let piece = CGMutablePath()
                if spot.draw % 3 == 0 {
                    piece.addEllipse(in: CGRect(x: -spot.r * 0.7, y: -spot.r * 0.7, width: spot.r * 1.4, height: spot.r * 1.4), transform: turn)
                } else {
                    piece.addRect(CGRect(x: -spot.r, y: -spot.r * 0.45, width: spot.r * 2, height: spot.r * 0.9), transform: turn)
                }
                fill(context, piece, mix(hex, "#FFFFFF", Double(rand(seed + 8, Double(spot.draw))) * 0.45))
            }
        case .balloons:
            scattered(4, size: { between($0, 0.035, 0.055) }) { spot in paintBalloon(context, spot: spot, hex: hex, unit: u) }
        case .stars:
            scattered(16, size: { between($0, 0.008, 0.022) }) { spot in
                let path = CGMutablePath()
                star5(path, spot.point.x, spot.point.y, spot.r, turn: rand(seed + 9, Double(spot.draw)) * 0.6)
                fill(context, path, ink)
            }
        case .hearts:
            scattered(12, size: { between($0, 0.012, 0.026) }) { spot in
                let turn = CGAffineTransform(translationX: spot.point.x, y: spot.point.y).rotated(by: (rand(seed + 9, Double(spot.draw)) - 0.5) * 0.7)
                let path = CGMutablePath()
                path.addPath(heartPath(CGRect(x: -spot.r, y: -spot.r * 0.9, width: spot.r * 2, height: spot.r * 1.85)), transform: turn)
                context.saveGState()
                context.setAlpha(0.65 + rand(seed + 10, Double(spot.draw)) * 0.35)
                fill(context, path, ink)
                context.restoreGState()
            }
        case .fireflies:
            scattered(22, size: { between($0, 0.003, 0.006) }) { spot in
                glowDisc(context, spot.point.x, spot.point.y, spot.r * 6, hex, core: 0.5)
                let dot = CGMutablePath()
                dot.addCircle(spot.point.x, spot.point.y, spot.r)
                fill(context, dot, mix(hex, "#FFFFFF", 0.6))
            }
        case .petals:
            scattered(16, size: { between($0, 0.01, 0.02) }) { spot in paintPetal(context, spot: spot, hex: hex, turn: rand(seed + 9, Double(spot.draw)) * tau) }
        case .leaves:
            scattered(12, size: { between($0, 0.014, 0.026) }) { spot in
                paintLeaf(context, spot: spot, hex: hex, turn: rand(seed + 9, Double(spot.draw)) * tau, shade: Double(rand(seed + 10, Double(spot.draw))) * 0.25)
            }
        case .bubbles:
            scattered(12, size: { between($0, 0.01, 0.03) }) { spot in
                let ring = CGMutablePath()
                ring.addCircle(spot.point.x, spot.point.y, spot.r)
                fill(context, ring, tint(hex, 0.12))
                stroke(context, ring, ink, width: max(0.6, spot.r * 0.08))
                let shine = CGMutablePath()
                shine.canvasArc(spot.point.x, spot.point.y, spot.r * 0.68, .pi * 1.1, .pi * 1.45)
                stroke(context, shine, CGColor(gray: 1, alpha: 0.75), width: max(0.6, spot.r * 0.08))
            }
        case .snow:
            scattered(48, size: { $0 % 7 == 0 ? between($0, 0.01, 0.016) : between($0, 0.002, 0.007) }) { spot in
                context.saveGState()
                context.setAlpha(0.55 + rand(seed + 9, Double(spot.draw)) * 0.45)
                if spot.draw % 7 != 0 {
                    let flake = CGMutablePath()
                    flake.addCircle(spot.point.x, spot.point.y, spot.r)
                    fill(context, flake, ink)
                } else {
                    let arms = CGMutablePath()
                    (0 ..< 6).map { CGFloat($0) * .pi / 3 }.forEach { angle in
                        let x = spot.point.x, y = spot.point.y, r = spot.r
                        arms.move(to: CGPoint(x: x, y: y))
                        arms.addLine(to: CGPoint(x: x + cos(angle) * r, y: y + sin(angle) * r))
                        arms.move(to: CGPoint(x: x + cos(angle) * r * 0.55, y: y + sin(angle) * r * 0.55))
                        arms.addLine(to: CGPoint(x: x + cos(angle + 0.5) * r * 0.8, y: y + sin(angle + 0.5) * r * 0.8))
                    }
                    stroke(context, arms, ink, width: max(0.6, spot.r * 0.12))
                }
                context.restoreGState()
            }
        case .rays:
            paintRays(context, hex: hex, density: ornament.density, seed: seed, size: scene.size, unit: u)
        case .glitch:
            (0 ..< count(10, ornament.density)).forEach { index in
                let draw = Double(index)
                let y = rand(seed, draw) * h
                let x = rand(seed + 1, draw) * w * 0.8
                let width = u * (0.08 + rand(seed + 2, draw) * 0.4)
                let height = u * (0.003 + rand(seed + 3, draw) * 0.014)
                context.setFillColor(tint(hex, 0.7))
                context.fill(CGRect(x: x, y: y, width: width, height: height))
                context.setFillColor(index % 2 == 0 ? CGColor(red: 0, green: 1, blue: 240 / 255, alpha: 0.35) : CGColor(red: 1, green: 0, blue: 170 / 255, alpha: 0.35))
                context.fill(CGRect(x: x + u * 0.012, y: y + height, width: width * 0.6, height: height * 0.6))
            }
        case .scanlines:
            let step = max(2, u * 0.006)
            let lines = CGMutablePath()
            (0 ..< Int((h / step).rounded(.up))).forEach { lines.addRect(CGRect(x: 0, y: CGFloat($0) * step, width: w, height: step * 0.35)) }
            fill(context, lines, ink)
        case .grain:
            let dot = max(0.6, u * 0.002)
            let grains = CGMutablePath()
            (0 ..< count(1400, ornament.density)).forEach { index in
                grains.addRect(CGRect(x: rand(seed, Double(index)) * w, y: rand(seed + 1, Double(index)) * h, width: dot, height: dot))
            }
            fill(context, grains, ink)
        case .vignette:
            let reach = hypot(w, h) / 2
            let strength: Double = ornament.density == .high ? 1 : ornament.density == .mid ? 0.8 : 0.55
            if let shade = gradient([tint(hex, 0), tint(hex, strength)]) {
                let center = CGPoint(x: w / 2, y: h / 2)
                context.drawRadialGradient(shade, startCenter: center, startRadius: reach * 0.42, endCenter: center, endRadius: reach, options: [.drawsAfterEndLocation])
            }
        case .lightleak:
            context.setBlendMode(.screen)
            glowDisc(context, 0, 0, u * 0.95, hex, core: 0.75)
            glowDisc(context, w, h * 0.62, u * 0.6, ink: mix(hex, "#FFFFFF", 0.3), core: 0.45)
            if ornament.density != .low { glowDisc(context, w * 0.2, h, u * 0.5, hex, core: 0.35) }
        case .crown:
            paintCrown(context, scene: scene, hex: hex)
        case .ribbon:
            paintRibbon(context, scene: scene, hex: hex)
        case .tape:
            paintTape(context, scene: scene, hex: hex, seed: seed)
        case .rec:
            paintRec(context, scene: scene, ink: ink, fonts: fonts)
        case .crosshair:
            scattered(4, size: { between($0, 0.018, 0.03) }) { spot in
                let x = spot.point.x, y = spot.point.y, r = spot.r
                let sight = CGMutablePath()
                sight.addCircle(x, y, r * 0.6)
                sight.move(to: CGPoint(x: x - r, y: y))
                sight.addLine(to: CGPoint(x: x - r * 0.25, y: y))
                sight.move(to: CGPoint(x: x + r * 0.25, y: y))
                sight.addLine(to: CGPoint(x: x + r, y: y))
                sight.move(to: CGPoint(x: x, y: y - r))
                sight.addLine(to: CGPoint(x: x, y: y - r * 0.25))
                sight.move(to: CGPoint(x: x, y: y + r * 0.25))
                sight.addLine(to: CGPoint(x: x, y: y + r))
                stroke(context, sight, ink, width: max(0.75, u * 0.002))
            }
        case .orbits:
            (0 ..< count(3, ornament.density)).forEach { index in
                let rx = u * (0.42 + CGFloat(index) * 0.16)
                let ry = rx * 0.32
                let turn = CGAffineTransform(translationX: w / 2, y: h / 2).rotated(by: -0.35 + CGFloat(index) * 0.55)
                let ring = CGMutablePath()
                ring.addEllipse(in: CGRect(x: -rx, y: -ry, width: rx * 2, height: ry * 2), transform: turn)
                context.saveGState()
                context.setAlpha(0.7)
                stroke(context, ring, ink, width: max(0.6, u * 0.0022))
                context.restoreGState()
                let at = rand(seed, Double(index)) * tau
                let moon = CGMutablePath()
                moon.addEllipse(in: CGRect(x: cos(at) * rx - u * 0.009, y: sin(at) * ry - u * 0.009, width: u * 0.018, height: u * 0.018), transform: turn)
                fill(context, moon, ink)
            }
        case .runes:
            scattered(10, size: { between($0, 0.012, 0.022) }) { spot in
                let glyph = runes[min(runes.count - 1, Int(rand(seed + 9, Double(spot.draw)) * CGFloat(runes.count)))]
                let x = spot.point.x, y = spot.point.y, r = spot.r
                let strokes = CGMutablePath()
                glyph.forEach { segment in
                    strokes.move(to: CGPoint(x: x - r * 0.6 + segment.0 * r * 1.2, y: y - r + segment.1 * r * 2))
                    strokes.addLine(to: CGPoint(x: x - r * 0.6 + segment.2 * r * 1.2, y: y - r + segment.3 * r * 2))
                }
                context.saveGState()
                context.setShadow(offset: .zero, blur: r * 0.6, color: ink)
                stroke(context, strokes, ink, width: max(0.75, r * 0.14))
                context.restoreGState()
            }
        case .cobwebs:
            paintCobwebs(context, size: scene.size, unit: u, density: ornament.density, ink: ink)
        case .drips:
            paintDrips(context, width: w, unit: u, density: ornament.density, seed: seed, ink: ink)
        case .lightning:
            scattered(3, size: { between($0, 0.04, 0.07) }) { spot in
                let x = spot.point.x, y = spot.point.y, r = spot.r
                let bolt = CGMutablePath()
                (0 ..< 6).forEach { index in
                    let side: CGFloat = index % 2 == 0 ? -1 : 1
                    let point = CGPoint(x: x + side * r * 0.25 * (0.5 + rand(seed + 9, Double(spot.draw * 6 + index))), y: y - r + CGFloat(index) * r * 2 / 5)
                    if index == 0 { bolt.move(to: point) } else { bolt.addLine(to: point) }
                }
                context.saveGState()
                context.setShadow(offset: .zero, blur: r * 0.35, color: ink)
                stroke(context, bolt, ink, width: max(1, r * 0.09))
                stroke(context, bolt, CGColor(gray: 1, alpha: 0.9), width: max(0.5, r * 0.035))
                context.restoreGState()
            }
        case .notes:
            scattered(8, size: { between($0, 0.018, 0.03) }) { spot in
                note(context, spot.point.x, spot.point.y + spot.r * 0.5, spot.r, double: spot.draw % 3 == 0, ink: ink)
            }
        case .candles:
            paintCandles(context, scene: scene, hex: hex, density: ornament.density, seed: seed)
        case .moon:
            let candidates = ([1, 0.75] as [CGFloat]).flatMap { scale -> [(x: CGFloat, y: CGFloat, r: CGFloat)] in
                let radius = u * 0.055 * scale
                return [scene.inner.maxX - radius * 1.6, scene.inner.minX + radius * 1.6].map { (x: $0, y: scene.inner.minY + radius * 1.5, r: radius) }
            }
            guard let moon = candidates.first(where: { spot in
                !scene.text.contains { $0.intersects(CGRect(x: spot.x - spot.r * 1.1, y: spot.y - spot.r * 1.1, width: spot.r * 2.2, height: spot.r * 2.2)) }
            }) else { break }
            let x = moon.x, y = moon.y, r = moon.r
            glowDisc(context, x, y, r * 2.6, hex, core: 0.35)
            let crescent = CGMutablePath()
            crescent.addCircle(x, y, r)
            crescent.addCircle(x - r * 0.42, y - r * 0.22, r * 0.86)
            fill(context, crescent, ink, rule: .evenOdd)
        case .clouds:
            scattered(4, size: { between($0, 0.04, 0.07) }) { spot in
                let x = spot.point.x, y = spot.point.y, r = spot.r
                let puff = CGMutablePath()
                let lobes: [(CGFloat, CGFloat, CGFloat)] = [(-0.55, 0.12, 0.42), (-0.12, -0.12, 0.55), (0.4, 0.02, 0.45), (0.05, 0.2, 0.4)]
                lobes.forEach { lobe in puff.addCircle(x + lobe.0 * r, y + lobe.1 * r, lobe.2 * r) }
                context.saveGState()
                context.setShadow(offset: CGSize(width: 0, height: -r * 0.08), blur: r * 0.3, color: CGColor(gray: 0, alpha: 0.08))
                fill(context, puff, ink)
                context.restoreGState()
            }
        case .bats:
            scattered(6, size: { between($0, 0.022, 0.04) }) { spot in
                let path = CGMutablePath()
                bat(path, spot.point.x, spot.point.y, spot.r)
                fill(context, path, ink)
            }
        case .skulls:
            scattered(3, size: { between($0, 0.028, 0.042) }) { spot in
                let path = CGMutablePath()
                skull(path, spot.point.x, spot.point.y, spot.r)
                fill(context, path, ink, rule: .evenOdd)
            }
        case .roses:
            scattered(4, size: { between($0, 0.022, 0.036) }) { spot in rose(context, spot.point.x, spot.point.y, spot.r, hex: hex) }
        }
        context.restoreGState()
    }
}
