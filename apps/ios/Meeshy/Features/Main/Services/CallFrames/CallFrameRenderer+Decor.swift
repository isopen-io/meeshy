import CoreGraphics
import Foundation

/// Le fond, les quatorze motifs et les quatorze bordures (§ 4.3) — le port de `frame-paint-decor.ts`.
/// Tout se mesure en `unit` : une vignette de 108 × 192 et une capture de 1080 × 1920 montrent le même dessin.
nonisolated extension CallFrameRenderer {
    static let accentFallback = CallFrameAccent(primary: "#6366F1", secondary: "#4338CA")

    // MARK: - Fond

    static func paintBackground(_ context: CGContext, stage: CallFrameStage) {
        let bounds = stage.bounds
        context.saveGState()
        context.setFillColor(CGColor(gray: 0, alpha: 1))
        context.fill(bounds)
        switch stage.look.background {
        case let .solid(hex):
            context.setFillColor(color(hex))
            context.fill(bounds)
        case let .linear(colors, angle):
            let radians = CGFloat(angle) * .pi / 180
            let direction = CGPoint(x: sin(radians), y: cos(radians))
            let half = (abs(bounds.width * direction.x) + abs(bounds.height * direction.y)) / 2
            let center = CGPoint(x: bounds.midX, y: bounds.midY)
            linear(
                context,
                colors: colors.map { color($0) },
                from: CGPoint(x: center.x - direction.x * half, y: center.y - direction.y * half),
                to: CGPoint(x: center.x + direction.x * half, y: center.y + direction.y * half)
            )
        case let .radial(colors):
            radial(context, colors: colors.map { color($0) }, center: CGPoint(x: bounds.midX, y: bounds.midY), radius: hypot(bounds.width, bounds.height) / 2)
        case .accent:
            let accent = stage.texts.accentHex ?? accentFallback
            linear(context, colors: [mix(accent.primary, "#FFFFFF", 0.08), color(accent.primary), color(accent.secondary)], from: .zero, to: CGPoint(x: bounds.maxX, y: bounds.maxY))
            let light = CGPoint(x: bounds.width * 0.22, y: bounds.height * 0.1)
            radial(context, colors: [CGColor(gray: 1, alpha: 0.18), CGColor(gray: 1, alpha: 0)], center: light, radius: hypot(bounds.width, bounds.height) * 0.6, extend: false)
        }
        context.restoreGState()
    }

    static func gradient(_ colors: [CGColor]) -> CGGradient? {
        guard !colors.isEmpty else { return nil }
        let stops = colors.count == 1 ? [colors[0], colors[0]] : colors
        let locations = stops.indices.map { CGFloat($0) / CGFloat(stops.count - 1) }
        return CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: stops as CFArray, locations: locations)
    }

    static func linear(_ context: CGContext, colors: [CGColor], from: CGPoint, to: CGPoint) {
        guard let shading = gradient(colors) else { return }
        context.drawLinearGradient(shading, start: from, end: to, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
    }

    static func radial(_ context: CGContext, colors: [CGColor], center: CGPoint, radius: CGFloat, extend: Bool = true) {
        guard let shading = gradient(colors) else { return }
        context.drawRadialGradient(shading, startCenter: center, startRadius: 0, endCenter: center, endRadius: radius, options: extend ? [.drawsAfterEndLocation] : [])
    }

    // MARK: - Motifs

    static func fourPointStar(_ path: CGMutablePath, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat) {
        let center = CGPoint(x: x, y: y)
        path.move(to: CGPoint(x: x, y: y - r))
        path.addQuadCurve(to: CGPoint(x: x + r, y: y), control: center)
        path.addQuadCurve(to: CGPoint(x: x, y: y + r), control: center)
        path.addQuadCurve(to: CGPoint(x: x - r, y: y), control: center)
        path.addQuadCurve(to: CGPoint(x: x, y: y - r), control: center)
        path.closeSubpath()
    }

    static func damaskMotif(_ path: CGMutablePath, _ x: CGFloat, _ y: CGFloat, _ s: CGFloat) {
        func p(_ dx: CGFloat, _ dy: CGFloat) -> CGPoint { CGPoint(x: x + s * dx, y: y + s * dy) }
        path.move(to: p(0, -1))
        path.addCurve(to: p(0, 0), control1: p(0.55, -0.55), control2: p(0.2, -0.1))
        path.addCurve(to: p(0, -1), control1: p(-0.2, -0.1), control2: p(-0.55, -0.55))
        path.move(to: p(0, 1))
        path.addCurve(to: p(0, 0), control1: p(0.55, 0.55), control2: p(0.2, 0.1))
        path.addCurve(to: p(0, 1), control1: p(-0.2, 0.1), control2: p(-0.55, 0.55))
        path.move(to: p(-0.9, 0))
        path.addCurve(to: p(0, 0), control1: p(-0.45, -0.35), control2: p(-0.15, -0.12))
        path.addCurve(to: p(-0.9, 0), control1: p(-0.15, 0.12), control2: p(-0.45, 0.35))
        path.move(to: p(0.9, 0))
        path.addCurve(to: p(0, 0), control1: p(0.45, -0.35), control2: p(0.15, -0.12))
        path.addCurve(to: p(0.9, 0), control1: p(0.15, 0.12), control2: p(0.45, 0.35))
    }

    static func paintPattern(_ context: CGContext, stage: CallFrameStage) {
        guard let pattern = stage.look.pattern else { return }
        let size = stage.size
        let unit = stage.unit
        let w = size.width
        let h = size.height
        let ink = color(pattern.color)
        let path = CGMutablePath()
        context.saveGState()
        context.setAlpha(CGFloat(pattern.opacity))
        context.setFillColor(ink)
        context.setStrokeColor(ink)
        context.setLineCap(.round)
        func fill() {
            context.addPath(path)
            context.fillPath()
        }
        func stroke() {
            context.addPath(path)
            context.strokePath()
        }
        switch pattern.kind {
        case .dots:
            let step = unit * 0.045
            lattice(size, step: step, stagger: true).forEach { path.addCircle($0.x, $0.y, step * 0.11) }
            fill()
        case .stripes:
            let step = unit * 0.06
            let reach = w + h
            (0 ... Int((reach / step).rounded(.up))).map { CGFloat($0) * step - h }.forEach { x in
                path.move(to: CGPoint(x: x, y: h))
                path.addLine(to: CGPoint(x: x + step * 0.4, y: h))
                path.addLine(to: CGPoint(x: x + step * 0.4 + h, y: 0))
                path.addLine(to: CGPoint(x: x + h, y: 0))
                path.closeSubpath()
            }
            fill()
        case .grid:
            let step = unit * 0.06
            context.setLineWidth(max(0.5, unit * 0.0016))
            (0 ... Int((w / step).rounded(.up))).map { CGFloat($0) * step }.forEach { x in
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: h))
            }
            (0 ... Int((h / step).rounded(.up))).map { CGFloat($0) * step }.forEach { y in
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: w, y: y))
            }
            stroke()
        case .checker:
            let step = unit * 0.08
            lattice(size, step: step, stagger: false)
                .filter { ($0.row + $0.col) % 2 == 0 }
                .forEach { path.addRect(CGRect(x: $0.x - step / 2, y: $0.y - step / 2, width: step, height: step)) }
            fill()
        case .halftone:
            let step = unit * 0.028
            lattice(size, step: step, stagger: true).forEach { point in
                let r = step * 0.46 * max(0, min(1, (point.y / h) * 1.15 - 0.1))
                guard r >= 0.3 else { return }
                path.addCircle(point.x, point.y, r)
            }
            fill()
        case .scanlines:
            let step = max(2, unit * 0.008)
            (0 ..< Int((h / step).rounded(.up))).forEach { path.addRect(CGRect(x: 0, y: CGFloat($0) * step, width: w, height: step * 0.4)) }
            fill()
        case .grain:
            let dot = max(0.6, unit * 0.0022)
            (0 ..< 2600).forEach { index in
                path.addRect(CGRect(x: rand(301, Double(index)) * w, y: rand(302, Double(index)) * h, width: dot, height: dot))
            }
            fill()
        case .stars:
            (0 ..< 70).forEach { index in
                fourPointStar(path, rand(311, Double(index)) * w, rand(312, Double(index)) * h, unit * (0.004 + rand(313, Double(index)) * 0.012))
            }
            fill()
        case .confetti:
            (0 ..< 80).forEach { index in
                let center = CGPoint(x: rand(321, Double(index)) * w, y: rand(322, Double(index)) * h)
                let piece = CGRect(x: -unit * 0.009, y: -unit * 0.004, width: unit * 0.018, height: unit * 0.008)
                let turn = CGAffineTransform(translationX: center.x, y: center.y).rotated(by: rand(323, Double(index)) * tau)
                path.addRect(piece, transform: turn)
            }
            fill()
        case .sunburst:
            let cx = w / 2
            let cy = h * 0.42
            let reach = hypot(w, h)
            (0 ..< 18).forEach { index in
                let from = CGFloat(index) / 18 * tau
                let to = from + tau / 36
                path.move(to: CGPoint(x: cx, y: cy))
                path.addLine(to: CGPoint(x: cx + cos(from) * reach, y: cy + sin(from) * reach))
                path.addLine(to: CGPoint(x: cx + cos(to) * reach, y: cy + sin(to) * reach))
                path.closeSubpath()
            }
            fill()
        case .waves:
            let step = unit * 0.05
            let amplitude = unit * 0.012
            let wavelength = unit * 0.16
            let pitch = wavelength / 8
            context.setLineWidth(max(0.6, unit * 0.0022))
            (0 ... Int((h / step).rounded(.up))).map { CGFloat($0) * step }.forEach { y in
                path.move(to: CGPoint(x: 0, y: y))
                (0 ... Int((w / pitch).rounded(.up))).map { CGFloat($0) * pitch }.forEach { x in
                    path.addLine(to: CGPoint(x: x, y: y + sin(x / wavelength * tau) * amplitude))
                }
            }
            stroke()
        case .circuit:
            let step = unit * 0.05
            context.setLineWidth(max(0.6, unit * 0.002))
            let pads = (0 ..< 46).flatMap { index -> [CGPoint] in
                let draw = Double(index)
                let x0 = (rand(331, draw) * w / step).rounded() * step
                let y0 = (rand(332, draw) * h / step).rounded() * step
                let run = (1 + (rand(333, draw) * 4).rounded(.down)) * step
                let turn = (1 + (rand(334, draw) * 3).rounded(.down)) * step * (rand(335, draw) > 0.5 ? 1 : -1)
                let across = rand(336, draw) > 0.5
                let first = across ? CGPoint(x: x0 + run, y: y0) : CGPoint(x: x0, y: y0 + run)
                let second = across ? CGPoint(x: first.x + abs(turn) * 0.7, y: first.y + turn) : CGPoint(x: first.x + turn, y: first.y + abs(turn) * 0.7)
                path.move(to: CGPoint(x: x0, y: y0))
                path.addLine(to: first)
                path.addLine(to: second)
                return [CGPoint(x: x0, y: y0), second]
            }
            stroke()
            let dots = CGMutablePath()
            pads.forEach { dots.addCircle($0.x, $0.y, unit * 0.006) }
            context.addPath(dots)
            context.fillPath()
        case .damask:
            let step = unit * 0.16
            lattice(size, step: step, stagger: true).forEach { damaskMotif(path, $0.x, $0.y, step * 0.32) }
            fill()
        case .hearts:
            let step = unit * 0.09
            lattice(size, step: step, stagger: true).forEach { point in
                path.addPath(heartPath(CGRect(x: point.x - step * 0.14, y: point.y - step * 0.13, width: step * 0.28, height: step * 0.26)))
            }
            fill()
        }
        context.restoreGState()
    }

    // MARK: - Bordures

    static func bandPath(_ outer: CGRect, _ inner: CGRect) -> CGPath {
        let path = CGMutablePath()
        path.addRect(outer)
        path.addRect(inner)
        return path
    }

    static func jagged(_ path: CGMutablePath, _ frame: CGRect, depth: CGFloat) {
        perimeter(frame, step: depth * 1.6).enumerated().forEach { index, point in
            let push = (rand(401, Double(index)) - 0.35) * depth
            let nx: CGFloat = point.side == 1 ? -1 : point.side == 3 ? 1 : 0
            let ny: CGFloat = point.side == 0 ? 1 : point.side == 2 ? -1 : 0
            let target = CGPoint(x: point.x + nx * push, y: point.y + ny * push)
            if index == 0 { path.move(to: target) } else { path.addLine(to: target) }
        }
        path.closeSubpath()
    }

    static func paintBorder(_ context: CGContext, stage: CallFrameStage) {
        guard let border = stage.look.border else { return }
        let size = stage.size
        let unit = stage.unit
        let width = max(0.75, CGFloat(border.width) * unit)
        let edge = inset(stage.bounds, CGFloat(border.inset) * unit)
        let frame = inset(edge, width / 2)
        let ink = color(border.color)
        context.saveGState()
        context.setStrokeColor(ink)
        context.setFillColor(ink)
        context.setLineWidth(width)
        context.setLineCap(.round)
        context.setLineJoin(.round)
        switch border.kind {
        case .hairline:
            context.stroke(frame)
        case .double:
            context.stroke(frame)
            context.setLineWidth(width * 0.5)
            context.stroke(inset(frame, width * 2.6))
        case .deco:
            paintDecoBorder(context, frame: frame, width: width, unit: unit)
        case .baroque:
            paintBaroqueBorder(context, frame: frame, width: width, unit: unit)
        case .filmstrip:
            paintFilmstrip(context, edge: edge, border: border, width: width, unit: unit, portrait: size.height >= size.width)
        case .ticket:
            paintTicketBorder(context, frame: frame, width: width, unit: unit)
        case .perforated:
            let step = max(width * 2.4, unit * 0.018)
            let holes = CGMutablePath()
            perimeter(frame, step: step).forEach { holes.addCircle($0.x, $0.y, width * 0.7) }
            context.addPath(holes)
            context.fillPath()
        case .neon:
            let rounded = CGMutablePath()
            rounded.addRoundedRect(frame, radius: unit * 0.035)
            context.setShadow(offset: .zero, blur: unit * 0.035, color: ink)
            context.addPath(rounded)
            context.strokePath()
            context.setShadow(offset: .zero, blur: unit * 0.012, color: ink)
            context.setStrokeColor(mix(border.color, "#FFFFFF", 0.65))
            context.setLineWidth(width * 0.4)
            context.addPath(rounded)
            context.strokePath()
        case .brackets:
            let arm = unit * 0.075
            let path = CGMutablePath()
            corners(frame).forEach { corner in
                path.move(to: CGPoint(x: corner.x, y: corner.y + corner.sy * arm))
                path.addLine(to: CGPoint(x: corner.x, y: corner.y))
                path.addLine(to: CGPoint(x: corner.x + corner.sx * arm, y: corner.y))
            }
            context.addPath(path)
            context.strokePath()
        case .torn:
            let path = CGMutablePath()
            path.addRect(stage.bounds)
            jagged(path, inset(edge, width), depth: max(width, unit * 0.012))
            context.setShadow(offset: .zero, blur: unit * 0.012, color: CGColor(gray: 0, alpha: 0.28))
            context.addPath(path)
            context.fillPath(using: .evenOdd)
        case .mourning:
            let inner = inset(edge, width)
            context.addPath(bandPath(edge, inner))
            context.fillPath(using: .evenOdd)
            context.setLineWidth(max(0.75, unit * 0.0025))
            context.stroke(inset(inner, unit * 0.012))
        case .vines:
            paintVines(context, frame: frame, border: border, width: width, unit: unit)
        case .bulbs:
            let r = max(width, unit * 0.011)
            perimeter(frame, step: unit * 0.075).forEach { point in
                let center = CGPoint(x: point.x, y: point.y)
                CallMontageRenderer.glow(context, center: center, radius: r * 3.2, color: tint(border.color, 0.55))
                if let bulb = gradient([CGColor(gray: 1, alpha: 1), ink]) {
                    context.drawRadialGradient(bulb, startCenter: CGPoint(x: center.x - r * 0.3, y: center.y - r * 0.3), startRadius: 0, endCenter: center, endRadius: r, options: [])
                }
            }
        case .polaroid:
            let foot = width * 3.2
            let inner = CGRect(x: edge.minX + width, y: edge.minY + width, width: edge.width - width * 2, height: edge.height - width - foot)
            context.addPath(bandPath(edge, inner))
            context.fillPath(using: .evenOdd)
            context.setStrokeColor(CGColor(gray: 0, alpha: 0.12))
            context.setLineWidth(max(0.5, unit * 0.0015))
            context.stroke(inner)
        }
        context.restoreGState()
    }

    static func paintDecoBorder(_ context: CGContext, frame: CGRect, width: CGFloat, unit: CGFloat) {
        context.setLineWidth(width * 0.6)
        context.stroke(frame)
        let arm = unit * 0.13
        let step = max(width * 2.2, unit * 0.012)
        context.setLineWidth(width)
        let steps = CGMutablePath()
        corners(frame).forEach { corner in
            [1, 2, 3].forEach { level in
                let offset = step * CGFloat(level)
                let length = arm * (1 - CGFloat(level) * 0.22)
                steps.move(to: CGPoint(x: corner.x + corner.sx * offset, y: corner.y + corner.sy * (offset + length)))
                steps.addLine(to: CGPoint(x: corner.x + corner.sx * offset, y: corner.y + corner.sy * offset))
                steps.addLine(to: CGPoint(x: corner.x + corner.sx * (offset + length), y: corner.y + corner.sy * offset))
            }
        }
        context.addPath(steps)
        context.strokePath()
        let gems = CGMutablePath()
        corners(frame).forEach { corner in
            let cx = corner.x + corner.sx * step * 4.6
            let cy = corner.y + corner.sy * step * 4.6
            let r = step * 0.9
            gems.addPath(polygon([CGPoint(x: cx, y: cy - r), CGPoint(x: cx + r, y: cy), CGPoint(x: cx, y: cy + r), CGPoint(x: cx - r, y: cy)]))
        }
        context.addPath(gems)
        context.fillPath()
    }

    static func paintBaroqueBorder(_ context: CGContext, frame: CGRect, width: CGFloat, unit: CGFloat) {
        context.setLineWidth(width * 0.7)
        context.stroke(frame)
        context.setLineWidth(width * 0.4)
        context.stroke(inset(frame, unit * 0.018))
        let s = unit * 0.075
        context.setLineWidth(width)
        let curls = CGMutablePath()
        corners(frame).forEach { c in
            func p(_ dx: CGFloat, _ dy: CGFloat) -> CGPoint { CGPoint(x: c.x + c.sx * s * dx, y: c.y + c.sy * s * dy) }
            curls.move(to: p(1.9, 0))
            curls.addCurve(to: p(0.45, 0.55), control1: p(1.1, 0.1), control2: p(0.9, 0.9))
            curls.addCurve(to: p(0.6, 0.3), control1: p(0.15, 0.3), control2: p(0.4, 0.05))
            curls.move(to: p(0, 1.9))
            curls.addCurve(to: p(0.55, 0.45), control1: p(0.1, 1.1), control2: p(0.9, 0.9))
            curls.addCurve(to: p(0.3, 0.6), control1: p(0.3, 0.15), control2: p(0.05, 0.4))
        }
        context.addPath(curls)
        context.strokePath()
        let pearls = CGMutablePath()
        corners(frame).forEach { c in pearls.addCircle(c.x + c.sx * s * 0.72, c.y + c.sy * s * 0.72, s * 0.12) }
        context.addPath(pearls)
        context.fillPath()
    }

    static func paintFilmstrip(_ context: CGContext, edge: CGRect, border: CallFrameBorder, width: CGFloat, unit: CGFloat, portrait: Bool) {
        let band = max(width, unit * 0.045)
        let strips = portrait
            ? [CGRect(x: edge.minX, y: edge.minY, width: band, height: edge.height), CGRect(x: edge.maxX - band, y: edge.minY, width: band, height: edge.height)]
            : [CGRect(x: edge.minX, y: edge.minY, width: edge.width, height: band), CGRect(x: edge.minX, y: edge.maxY - band, width: edge.width, height: band)]
        strips.forEach { context.fill($0) }
        let hole = band * 0.42
        let holeColor = perceived(border.color) > 0.5
            ? CGColor(red: 20 / 255, green: 20 / 255, blue: 20 / 255, alpha: 0.85)
            : CGColor(red: 246 / 255, green: 240 / 255, blue: 226 / 255, alpha: 0.92)
        let holes = CGMutablePath()
        strips.forEach { strip in
            let length = portrait ? strip.height : strip.width
            let count = max(2, Int((length / (hole * 2.1)).rounded(.down)))
            (0 ..< count).map { length / CGFloat(count) * (CGFloat($0) + 0.5) }.forEach { at in
                let x = portrait ? strip.minX + (band - hole * 0.8) / 2 : strip.minX + at - hole / 2
                let y = portrait ? strip.minY + at - hole / 2 : strip.minY + (band - hole * 0.8) / 2
                let rect = portrait ? CGRect(x: x, y: y, width: hole * 0.8, height: hole) : CGRect(x: x, y: y, width: hole, height: hole * 0.8)
                holes.addRoundedRect(rect, radius: hole * 0.18)
            }
        }
        context.setFillColor(holeColor)
        context.addPath(holes)
        context.fillPath()
    }

    static func paintTicketBorder(_ context: CGContext, frame: CGRect, width: CGFloat, unit: CGFloat) {
        let notch = unit * 0.045
        let x = frame.minX, y = frame.minY, w = frame.width, h = frame.height
        let path = CGMutablePath()
        path.move(to: CGPoint(x: x + notch, y: y))
        path.addLine(to: CGPoint(x: x + w - notch, y: y))
        path.canvasArc(x + w, y, notch, .pi, .pi / 2, anticlockwise: true)
        path.addLine(to: CGPoint(x: x + w, y: y + h / 2 - notch * 0.7))
        path.canvasArc(x + w, y + h / 2, notch * 0.7, -.pi / 2, .pi / 2, anticlockwise: true)
        path.addLine(to: CGPoint(x: x + w, y: y + h - notch))
        path.canvasArc(x + w, y + h, notch, -.pi / 2, -.pi, anticlockwise: true)
        path.addLine(to: CGPoint(x: x + notch, y: y + h))
        path.canvasArc(x, y + h, notch, 0, -.pi / 2, anticlockwise: true)
        path.addLine(to: CGPoint(x: x, y: y + h / 2 + notch * 0.7))
        path.canvasArc(x, y + h / 2, notch * 0.7, .pi / 2, -.pi / 2, anticlockwise: true)
        path.addLine(to: CGPoint(x: x, y: y + notch))
        path.canvasArc(x, y, notch, .pi / 2, 0, anticlockwise: true)
        path.closeSubpath()
        context.addPath(path)
        context.strokePath()
        context.saveGState()
        context.setLineDash(phase: 0, lengths: [width * 1.5, width * 2.5])
        context.setLineWidth(width * 0.6)
        context.setAlpha(0.35)
        context.move(to: CGPoint(x: x + notch * 0.9, y: y + h / 2))
        context.addLine(to: CGPoint(x: x + w - notch * 0.9, y: y + h / 2))
        context.strokePath()
        context.restoreGState()
    }

    static func paintVines(_ context: CGContext, frame: CGRect, border: CallFrameBorder, width: CGFloat, unit: CGFloat) {
        let amplitude = unit * 0.012
        let wavelength = unit * 0.12
        context.setLineWidth(max(0.75, width * 0.6))
        let points = perimeter(frame, step: wavelength / 6)
        let stem = CGMutablePath()
        points.enumerated().forEach { index, point in
            let wave = sin(CGFloat(index) / 6 * tau) * amplitude
            let x = point.x + (point.side == 1 || point.side == 3 ? wave : 0)
            let y = point.y + (point.side == 0 || point.side == 2 ? wave : 0)
            if index == 0 { stem.move(to: CGPoint(x: x, y: y)) } else { stem.addLine(to: CGPoint(x: x, y: y)) }
        }
        stem.closeSubpath()
        context.addPath(stem)
        context.strokePath()
        let leaves = CGMutablePath()
        points.enumerated().filter { $0.offset % 3 == 1 }.map { $0.element }.enumerated().forEach { index, point in
            let length = unit * (0.012 + rand(411, Double(index)) * 0.008)
            let turn = CGAffineTransform(translationX: point.x, y: point.y).rotated(by: rand(412, Double(index)) * tau)
            let leaf = CGMutablePath()
            leaf.move(to: .zero)
            leaf.addQuadCurve(to: CGPoint(x: length * 2, y: 0), control: CGPoint(x: length, y: -length * 0.9))
            leaf.addQuadCurve(to: .zero, control: CGPoint(x: length, y: length * 0.9))
            leaves.addPath(leaf, transform: turn)
        }
        context.addPath(leaves)
        context.fillPath()
    }
}
