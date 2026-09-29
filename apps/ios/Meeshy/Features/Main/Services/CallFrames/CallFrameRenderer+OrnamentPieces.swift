import CoreGraphics
import CoreText
import Foundation
import MeeshySDK
import UIKit

/// Les ornements qui demandent plus qu'un glyphe — ballons, pétales, rayons, couronne, ruban, adhésifs,
/// « REC », toiles, coulures, bougies. Suite de `CallFrameRenderer+Ornaments.swift`.
nonisolated extension CallFrameRenderer {
    /// Mélange deux `CGColor` RVB (0 = la première), alpha compris.
    static func mixColors(_ from: CGColor, _ to: CGColor, _ share: CGFloat) -> CGColor {
        func rgba(_ color: CGColor) -> [CGFloat] {
            let parts = color.components ?? [0, 0, 0, 1]
            return parts.count >= 4 ? Array(parts.prefix(4)) : [parts[0], parts[0], parts[0], parts.count > 1 ? parts[1] : 1]
        }
        let a = rgba(from)
        let b = rgba(to)
        let mixed = (0 ..< 4).map { a[$0] + (b[$0] - a[$0]) * share }
        return CGColor(red: mixed[0], green: mixed[1], blue: mixed[2], alpha: mixed[3])
    }

    static var whiteInk: CGColor { CGColor(gray: 1, alpha: 1) }
    static var blackInk: CGColor { CGColor(gray: 0, alpha: 1) }

    static func paintBalloon(_ context: CGContext, spot: Spot, hex: String, unit: CGFloat) {
        let x = spot.point.x, y = spot.point.y, r = spot.r
        let body = mixColors(color(hex), spot.draw % 2 == 0 ? whiteInk : blackInk, 0.12)
        let string = CGMutablePath()
        string.move(to: CGPoint(x: x, y: y + r * 1.2))
        string.addCurve(to: CGPoint(x: x - r * 0.1, y: y + r * 3.1), control1: CGPoint(x: x - r * 0.5, y: y + r * 1.9), control2: CGPoint(x: x + r * 0.5, y: y + r * 2.4))
        stroke(context, string, tint(hex, 0.55), width: max(0.6, unit * 0.0018))
        let shape = CGMutablePath()
        shape.addEllipse(in: CGRect(x: x - r, y: y - r * 1.2, width: r * 2, height: r * 2.4))
        context.saveGState()
        context.addPath(shape)
        context.clip()
        let colors = [mixColors(body, whiteInk, 0.55), body, mixColors(body, blackInk, 0.3)] as CFArray
        if let shade = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 0.4, 1]) {
            context.drawRadialGradient(shade, startCenter: CGPoint(x: x - r * 0.35, y: y - r * 0.45), startRadius: r * 0.1, endCenter: CGPoint(x: x, y: y), endRadius: r * 1.2, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        }
        context.restoreGState()
        fill(context, polygon([CGPoint(x: x, y: y + r * 1.15), CGPoint(x: x - r * 0.14, y: y + r * 1.34), CGPoint(x: x + r * 0.14, y: y + r * 1.34)]), mixColors(body, blackInk, 0.25))
    }

    static func paintPetal(_ context: CGContext, spot: Spot, hex: String, turn: CGFloat) {
        let r = spot.r
        context.saveGState()
        context.translateBy(x: spot.point.x, y: spot.point.y)
        context.rotate(by: turn)
        let petal = CGMutablePath()
        petal.move(to: CGPoint(x: 0, y: -r))
        petal.addCurve(to: CGPoint(x: 0, y: r), control1: CGPoint(x: r * 0.9, y: -r * 0.6), control2: CGPoint(x: r * 0.7, y: r * 0.8))
        petal.addCurve(to: CGPoint(x: 0, y: -r), control1: CGPoint(x: -r * 0.7, y: r * 0.8), control2: CGPoint(x: -r * 0.9, y: -r * 0.6))
        context.addPath(petal)
        context.clip()
        linear(context, colors: [mix(hex, "#FFFFFF", 0.4), color(hex)], from: CGPoint(x: 0, y: -r), to: CGPoint(x: 0, y: r))
        context.restoreGState()
    }

    static func paintLeaf(_ context: CGContext, spot: Spot, hex: String, turn: CGFloat, shade: Double) {
        let r = spot.r
        context.saveGState()
        context.translateBy(x: spot.point.x, y: spot.point.y)
        context.rotate(by: turn)
        let leaf = CGMutablePath()
        leaf.move(to: CGPoint(x: -r, y: 0))
        leaf.addQuadCurve(to: CGPoint(x: r, y: 0), control: CGPoint(x: 0, y: -r * 0.8))
        leaf.addQuadCurve(to: CGPoint(x: -r, y: 0), control: CGPoint(x: 0, y: r * 0.8))
        fill(context, leaf, mix(hex, "#000000", shade))
        let vein = CGMutablePath()
        vein.move(to: CGPoint(x: -r * 0.9, y: 0))
        vein.addLine(to: CGPoint(x: r * 0.85, y: 0))
        stroke(context, vein, mix(hex, "#FFFFFF", 0.35), width: max(0.5, r * 0.06))
        context.restoreGState()
    }

    static func paintRays(_ context: CGContext, hex: String, density: CallFrameDensity, seed: Double, size: CGSize, unit: CGFloat) {
        let origin = CGPoint(x: size.width * 0.5, y: -unit * 0.1)
        let reach = hypot(size.width, size.height)
        let rays = count(7, density)
        (0 ..< rays).forEach { index in
            let angle = CGFloat.pi / 2 + (CGFloat(index) - CGFloat(rays - 1) / 2) * (1.4 / CGFloat(rays)) + (rand(seed, Double(index)) - 0.5) * 0.08
            let spread = 0.035 + rand(seed + 1, Double(index)) * 0.05
            let beam = polygon([
                origin,
                CGPoint(x: origin.x + cos(angle - spread) * reach, y: origin.y + sin(angle - spread) * reach),
                CGPoint(x: origin.x + cos(angle + spread) * reach, y: origin.y + sin(angle + spread) * reach),
            ])
            context.saveGState()
            context.addPath(beam)
            context.clip()
            linear(context, colors: [tint(hex, 0.55), tint(hex, 0)], from: origin, to: CGPoint(x: origin.x + cos(angle) * reach, y: origin.y + sin(angle) * reach))
            context.restoreGState()
        }
    }

    static func paintCrown(_ context: CGContext, scene: CallFrameOrnamentStage, hex: String) {
        guard let hero = scene.slots.first?.rect else { return }
        let u = scene.unit
        let width = min(hero.width * 0.34, u * 0.16)
        let above = scene.slots.dropFirst().map(\.rect).filter { $0.maxY <= hero.minY && $0.minX < hero.maxX && hero.minX < $0.maxX }
        let ceiling = ([scene.inner.minY] + above.map(\.maxY)).max() ?? scene.inner.minY
        let room = hero.minY - ceiling
        let height = min(width * 0.62, room * 0.9)
        guard height >= u * 0.015 else { return }
        let cw = width * (height / (width * 0.62))
        let cx = hero.midX
        let base = hero.minY - room * 0.05
        let top = base - height
        let crown = polygon([
            CGPoint(x: cx - cw / 2, y: base), CGPoint(x: cx - cw / 2, y: top + height * 0.25), CGPoint(x: cx - cw / 4, y: top + height * 0.55),
            CGPoint(x: cx, y: top), CGPoint(x: cx + cw / 4, y: top + height * 0.55), CGPoint(x: cx + cw / 2, y: top + height * 0.25),
            CGPoint(x: cx + cw / 2, y: base),
        ])
        context.saveGState()
        context.addPath(crown)
        context.clip()
        linear(context, colors: [mix(hex, "#FFFFFF", 0.45), color(hex), mix(hex, "#000000", 0.25)], from: CGPoint(x: cx - cw / 2, y: top), to: CGPoint(x: cx + cw / 2, y: base))
        context.restoreGState()
        let jewels = CGMutablePath()
        [cx - cw / 2, cx, cx + cw / 2].enumerated().forEach { index, x in jewels.addCircle(x, index == 1 ? top : top + height * 0.25, cw * 0.06) }
        fill(context, jewels, color(hex))
        context.setFillColor(mix(hex, "#000000", 0.35))
        context.fill(CGRect(x: cx - cw / 2, y: base - height * 0.16, width: cw, height: height * 0.08))
    }

    static func paintRibbon(_ context: CGContext, scene: CallFrameOrnamentStage, hex: String) {
        let u = scene.unit
        let headline = scene.headline
        let zone = headline ?? (scene.top.height >= u * 0.05 ? scene.top : scene.bottom)
        guard zone.height >= u * 0.03 else { return }
        let band = headline == nil ? min(zone.height * 0.46, u * 0.1) : min(zone.height * 0.95, u * 0.12)
        let width = headline == nil ? zone.width * 0.8 : min(scene.inner.width * 0.94, zone.width + band * 2.2)
        let cx = zone.midX
        let cy = zone.midY
        let left = cx - width / 2
        let right = cx + width / 2
        let tail = band * 0.9
        let drop = band * 0.28
        let tails = CGMutablePath()
        ([-1, 1] as [CGFloat]).forEach { side in
            let edge = side < 0 ? left + tail * 0.35 : right - tail * 0.35
            let outer = edge + side * tail
            tails.addPath(polygon([
                CGPoint(x: edge, y: cy - band / 2 + drop), CGPoint(x: outer, y: cy - band / 2 + drop),
                CGPoint(x: outer - side * tail * 0.35, y: cy + drop), CGPoint(x: outer, y: cy + band / 2 + drop),
                CGPoint(x: edge, y: cy + band / 2 + drop),
            ]))
        }
        fill(context, tails, mix(hex, "#000000", 0.28))
        let folds = CGMutablePath()
        ([-1, 1] as [CGFloat]).forEach { side in
            let edge = side < 0 ? left + tail * 0.35 : right - tail * 0.35
            let start = side < 0 ? left + tail * 0.7 : right - tail * 0.7
            folds.addPath(polygon([CGPoint(x: start, y: cy + band / 2), CGPoint(x: edge, y: cy + band / 2 + drop), CGPoint(x: edge, y: cy + band / 2)]))
        }
        fill(context, folds, mix(hex, "#000000", 0.5))
        let cloth = CGRect(x: left + tail * 0.7, y: cy - band / 2, width: width - tail * 1.4, height: band)
        context.saveGState()
        context.clip(to: cloth)
        linear(context, colors: [mix(hex, "#FFFFFF", 0.2), mix(hex, "#000000", 0.12)], from: CGPoint(x: 0, y: cloth.minY), to: CGPoint(x: 0, y: cloth.maxY))
        context.restoreGState()
    }

    static func paintTape(_ context: CGContext, scene: CallFrameOrnamentStage, hex: String, seed: Double) {
        let u = scene.unit
        scene.slots.enumerated().forEach { index, box in
            let slot = box.rect
            inBox(context, box) {
                let length = min(slot.width * 0.3, u * 0.13)
                let thick = length * 0.3
                let pieces: [(CGPoint, CGFloat)] = [
                    (CGPoint(x: slot.minX + length * 0.12, y: slot.minY + thick * 0.2), -0.68),
                    (CGPoint(x: slot.maxX - length * 0.12, y: slot.minY + thick * 0.2), 0.68),
                ]
                pieces.enumerated().forEach { side, piece in
                    let turn = piece.1 + (rand(seed, Double(index * 2 + side)) - 0.5) * 0.2
                    let strip = CGMutablePath()
                    strip.addRect(CGRect(x: -length / 2, y: -thick / 2, width: length, height: thick), transform: CGAffineTransform(translationX: piece.0.x, y: piece.0.y).rotated(by: turn))
                    context.saveGState()
                    context.setShadow(offset: .zero, blur: u * 0.004, color: CGColor(gray: 0, alpha: 0.12))
                    fill(context, strip, tint(hex, 0.85))
                    context.restoreGState()
                }
            }
        }
    }

    static func paintRec(_ context: CGContext, scene: CallFrameOrnamentStage, ink: CGColor, fonts: CallFrameFontBook) {
        let u = scene.unit
        let px = u * 0.03
        let left = scene.inner.minX + u * 0.03
        let right = scene.inner.maxX - u * 0.03
        func isFree(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat) -> Bool {
            let probe = CGRect(x: x, y: y - px * 0.7, width: width, height: px * 1.4)
            return !scene.text.contains { $0.intersects(probe) }
        }
        let rows = [scene.inner.minY + u * 0.035, scene.inner.maxY - u * 0.035]
        guard let y = rows.first(where: { isFree(left, $0, px * 3.2) && isFree(right - px * 6.8, $0, px * 6.8) }) ?? rows.first(where: { isFree(left, $0, px * 3.2) }) else { return }
        let red = CGColor(red: 1, green: 59 / 255, blue: 48 / 255, alpha: 1)
        context.saveGState()
        context.setShadow(offset: .zero, blur: px * 0.5, color: CGColor(red: 1, green: 59 / 255, blue: 48 / 255, alpha: 0.7))
        let dot = CGMutablePath()
        dot.addCircle(left + px * 0.35, y, px * 0.35)
        fill(context, dot, red)
        context.restoreGState()
        let font = fonts.font(.typewriter, size: px, weight: .bold)
        drawText(context, "REC", font: font, color: ink, x: left + px * 0.95, y: y, align: .left, vertical: .middle)
        if isFree(right - px * 6.8, y, px * 6.8) {
            drawText(context, "00:12:47:09", font: font, color: ink, x: right, y: y, align: .right, vertical: .middle)
        }
    }

    static func paintCobwebs(_ context: CGContext, size: CGSize, unit: CGFloat, density: CallFrameDensity, ink: CGColor) {
        let span = unit * 0.24
        let all = [
            CallFrameCorner(x: 0, y: 0, sx: 1, sy: 1), CallFrameCorner(x: size.width, y: 0, sx: -1, sy: 1),
            CallFrameCorner(x: size.width, y: size.height, sx: -1, sy: -1), CallFrameCorner(x: 0, y: size.height, sx: 1, sy: -1),
        ]
        let chosen = all.prefix(density == .high ? 4 : density == .mid ? 2 : 1)
        chosen.forEach { corner in
            let spokes = (0 ..< 6).map { CGFloat($0) / 5 * (CGFloat.pi / 2) }
            func tip(_ angle: CGFloat, _ radius: CGFloat) -> CGPoint {
                CGPoint(x: corner.x + corner.sx * cos(angle) * radius, y: corner.y + corner.sy * sin(angle) * radius)
            }
            let web = CGMutablePath()
            spokes.forEach { angle in
                web.move(to: CGPoint(x: corner.x, y: corner.y))
                web.addLine(to: tip(angle, span))
            }
            ([0.25, 0.45, 0.65, 0.85] as [CGFloat]).forEach { share in
                spokes.dropFirst().enumerated().forEach { index, angle in
                    let from = tip(spokes[index], span * share)
                    let to = tip(angle, span * share)
                    let sag = tip((angle + spokes[index]) / 2, span * share * 0.86)
                    if index == 0 { web.move(to: from) }
                    web.addQuadCurve(to: to, control: sag)
                }
            }
            stroke(context, web, ink, width: max(0.5, unit * 0.0016))
        }
    }

    static func paintDrips(_ context: CGContext, width: CGFloat, unit: CGFloat, density: CallFrameDensity, seed: Double, ink: CGColor) {
        let total = count(12, density)
        let lip = unit * 0.018
        let path = CGMutablePath()
        path.move(to: .zero)
        path.addLine(to: CGPoint(x: 0, y: lip))
        (0 ..< total).forEach { index in
            let center = (CGFloat(index) + 0.5) / CGFloat(total) * width
            let radius = unit * (0.008 + rand(seed, Double(index)) * 0.01)
            let length = unit * (0.02 + rand(seed + 1, Double(index)) * 0.1)
            path.addLine(to: CGPoint(x: center - radius * 1.6, y: lip))
            path.addQuadCurve(to: CGPoint(x: center - radius, y: lip + length * 0.5), control: CGPoint(x: center - radius, y: lip))
            path.addLine(to: CGPoint(x: center - radius, y: lip + length))
            path.canvasArc(center, lip + length, radius, .pi, 0, anticlockwise: true)
            path.addLine(to: CGPoint(x: center + radius, y: lip + length * 0.5))
            path.addQuadCurve(to: CGPoint(x: center + radius * 1.6, y: lip), control: CGPoint(x: center + radius, y: lip))
        }
        path.addLine(to: CGPoint(x: width, y: lip))
        path.addLine(to: CGPoint(x: width, y: 0))
        path.closeSubpath()
        fill(context, path, ink)
    }

    static func paintCandles(_ context: CGContext, scene: CallFrameOrnamentStage, hex: String, density: CallFrameDensity, seed: Double) {
        let u = scene.unit
        let w = scene.size.width
        let h = scene.size.height
        let zone = scene.front ? scene.bottom : CGRect(x: 0, y: h * 0.8, width: w, height: h * 0.2)
        guard zone.height >= u * 0.04 else { return }
        let bodyWidth = u * 0.024
        let floor = zone.maxY - u * 0.01
        (0 ..< count(4, density)).forEach { index in
            let leftSide = index % 2 == 0
            let rank = CGFloat(index / 2)
            let x = leftSide ? zone.minX + bodyWidth * (1.2 + rank * 2.2) : zone.maxX - bodyWidth * (1.2 + rank * 2.2)
            let height = min(zone.height * 0.6, u * (0.05 + rand(seed, Double(index)) * 0.05))
            let top = floor - height
            let wax = CGRect(x: x - bodyWidth / 2, y: top, width: bodyWidth, height: height)
            context.saveGState()
            context.clip(to: wax)
            let waxColors = [color("#D9CBB0"), color("#F7F0E1"), color("#BFAF93")] as CFArray
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: waxColors, locations: [0, 0.45, 1]) {
                context.drawLinearGradient(gradient, start: CGPoint(x: wax.minX, y: 0), end: CGPoint(x: wax.maxX, y: 0), options: [])
            }
            context.restoreGState()
            glowDisc(context, x, top - bodyWidth * 0.9, bodyWidth * 2.6, hex, core: 0.5)
            let flame = CGMutablePath()
            flame.move(to: CGPoint(x: x, y: top - bodyWidth * 1.6))
            flame.addQuadCurve(to: CGPoint(x: x, y: top - bodyWidth * 0.12), control: CGPoint(x: x + bodyWidth * 0.42, y: top - bodyWidth * 0.5))
            flame.addQuadCurve(to: CGPoint(x: x, y: top - bodyWidth * 1.6), control: CGPoint(x: x - bodyWidth * 0.42, y: top - bodyWidth * 0.5))
            context.saveGState()
            context.addPath(flame)
            context.clip()
            linear(context, colors: [whiteInk, color(hex)], from: CGPoint(x: 0, y: top - bodyWidth * 1.5), to: CGPoint(x: 0, y: top))
            context.restoreGState()
        }
    }
}
