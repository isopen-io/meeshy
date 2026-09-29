import CoreGraphics
import CoreText
import Foundation

nonisolated extension CallMontageRenderer {
    typealias Placed = [(CallMontageSlot, CallMontagePortrait)]

    // MARK: - Couverture

    static func drawCover(_ context: CGContext, bounds: CGRect, placed: Placed, caption: CallMontageCaption, unit: CGFloat) {
        fill(context, bounds, color: rgb(0.96, 0.94, 0.9))
        guard let hero = placed.first else { return }
        drawPortrait(context, hero.1, in: hero.0)
        let frame = hero.0.frame
        linearGradient(context, CGRect(x: frame.minX, y: frame.maxY - frame.height * 0.4, width: frame.width, height: frame.height * 0.4), top: CGColor(gray: 0, alpha: 0), bottom: CGColor(gray: 0, alpha: 0.6))
        if let band = CallMontageLayout.captionBand(style: .cover, canvas: bounds.size) {
            drawText(context, caption.title.uppercased(), font: "Didot-Bold", size: band.height * 0.82, color: rgb(0.82, 0.08, 0.18), centerX: band.midX, baseline: band.minY + band.height * 0.84, maxWidth: band.width * 0.92)
            drawText(context, caption.subtitle.uppercased(), font: "AvenirNext-DemiBold", size: 26 * unit, color: rgb(0.2, 0.2, 0.24), left: frame.minX, baseline: band.maxY + 18 * unit, maxWidth: frame.width * 0.6)
        }
        let left = frame.minX + frame.width * 0.05
        drawText(context, hero.1.name.uppercased(), font: "AvenirNext-Heavy", size: 84 * unit, color: white(1), left: left, baseline: frame.maxY - frame.height * 0.2, maxWidth: frame.width * 0.9)
        let others = placed.dropFirst().map { $0.1.name }.filter { !$0.isEmpty }
        if !others.isEmpty {
            drawText(context, "& " + others.joined(separator: " · "), font: "AvenirNext-DemiBold", size: 40 * unit, color: rgb(1, 0.84, 0.3), left: left, baseline: frame.maxY - frame.height * 0.13, maxWidth: frame.width * 0.9)
        }
        drawBarcode(context, in: CGRect(x: left, y: frame.maxY - frame.height * 0.1, width: frame.width * 0.2, height: frame.height * 0.07), unit: unit)
        placed.dropFirst().forEach { slot, portrait in
            drawPortrait(context, portrait, in: slot)
            stroke(context, slot, color: white(1), width: 6 * unit)
        }
    }

    static func drawBarcode(_ context: CGContext, in rect: CGRect, unit: CGFloat) {
        fill(context, rect, color: white(1))
        let bars = rect.insetBy(dx: rect.width * 0.08, dy: rect.height * 0.12)
        let pattern: [CGFloat] = [2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2]
        let step = bars.width / pattern.reduce(0) { $0 + $1 + 1 }
        context.setFillColor(CGColor(gray: 0, alpha: 1))
        _ = pattern.reduce(bars.minX) { x, width in
            context.fill(CGRect(x: x, y: bars.minY, width: width * step, height: bars.height))
            return x + (width + 1) * step
        }
    }

    // MARK: - Or

    static func drawGold(_ context: CGContext, bounds: CGRect, placed: Placed, caption: CallMontageCaption, unit: CGFloat) {
        linearGradient(context, bounds, top: rgb(0.22, 0.13, 0.05), bottom: rgb(0.06, 0.03, 0.02))
        CallFaceEffectGeometry.embers(count: 28, time: 0, canvas: bounds, seed: 0x47_4F_4C_44).forEach { ember in
            glow(context, center: ember.center, radius: ember.radius * 9, color: CGColor(red: 1, green: 0.78, blue: 0.35, alpha: 0.18 + ember.opacity * 0.25))
        }
        placed.forEach { slot, portrait in
            context.saveGState()
            context.setShadow(offset: .zero, blur: 50 * unit, color: CGColor(red: 1, green: 0.75, blue: 0.3, alpha: 0.7))
            stroke(context, slot, color: rgb(0.83, 0.64, 0.28), width: 22 * unit)
            context.restoreGState()
            drawPortrait(context, portrait, in: slot)
            stroke(context, slot, color: rgb(0.98, 0.86, 0.55), width: 5 * unit)
        }
        if let band = CallMontageLayout.captionBand(style: .gold, canvas: bounds.size) {
            drawText(context, caption.title, font: "Didot-Italic", size: band.height * 0.6, color: rgb(0.98, 0.84, 0.5), centerX: band.midX, baseline: band.minY + band.height * 0.62, maxWidth: band.width * 0.8)
        }
    }

    // MARK: - Tapis rouge

    static func drawRedCarpet(_ context: CGContext, bounds: CGRect, placed: Placed, caption: CallMontageCaption, unit: CGFloat) {
        linearGradient(context, bounds, top: rgb(0.42, 0.02, 0.07), bottom: rgb(0.16, 0, 0.03))
        let fold = bounds.width / 14
        stride(from: CGFloat(0), to: bounds.width, by: fold * 2).forEach { x in
            fill(context, CGRect(x: x, y: 0, width: fold, height: bounds.height), color: CGColor(gray: 0, alpha: 0.14))
        }
        let carpet = CGMutablePath()
        carpet.move(to: CGPoint(x: bounds.width * 0.3, y: bounds.height * 0.7))
        carpet.addLine(to: CGPoint(x: bounds.width * 0.7, y: bounds.height * 0.7))
        carpet.addLine(to: CGPoint(x: bounds.maxX, y: bounds.maxY))
        carpet.addLine(to: CGPoint(x: bounds.minX, y: bounds.maxY))
        carpet.closeSubpath()
        context.addPath(carpet)
        context.setFillColor(rgb(0.78, 0.05, 0.12))
        context.fillPath()
        CallFaceEffectGeometry.embers(count: 12, time: 0, canvas: bounds, seed: 0x46_4C_41_53_48).forEach { flash in
            glow(context, center: flash.center, radius: bounds.width * 0.07, color: CGColor(gray: 1, alpha: 0.35 + flash.opacity * 0.4))
            drawSparkle(context, at: flash.center, radius: bounds.width * 0.035, unit: unit)
        }
        placed.forEach { slot, portrait in
            context.saveGState()
            context.setShadow(offset: CGSize(width: 0, height: 12 * unit), blur: 30 * unit, color: CGColor(gray: 0, alpha: 0.6))
            context.addPath(CGPath(roundedRect: slot.frame, cornerWidth: slot.cornerRadius, cornerHeight: slot.cornerRadius, transform: nil))
            context.setFillColor(CGColor(gray: 0, alpha: 1))
            context.fillPath()
            context.restoreGState()
            drawPortrait(context, portrait, in: slot)
            stroke(context, slot, color: rgb(0.95, 0.8, 0.45), width: 4 * unit)
        }
        if let band = CallMontageLayout.captionBand(style: .redcarpet, canvas: bounds.size) {
            drawText(context, caption.title.uppercased(), font: "Didot-Bold", size: band.height * 0.55, color: white(1), centerX: band.midX, baseline: band.minY + band.height * 0.55, maxWidth: band.width * 0.86)
            drawText(context, caption.subtitle, font: "AvenirNext-DemiBold", size: band.height * 0.2, color: rgb(0.98, 0.84, 0.5), centerX: band.midX, baseline: band.minY + band.height * 0.88, maxWidth: band.width * 0.8)
        }
    }

    static func drawSparkle(_ context: CGContext, at center: CGPoint, radius: CGFloat, unit: CGFloat) {
        context.saveGState()
        context.setStrokeColor(white(0.9))
        context.setLineWidth(max(1, 3 * unit))
        context.move(to: CGPoint(x: center.x - radius, y: center.y))
        context.addLine(to: CGPoint(x: center.x + radius, y: center.y))
        context.move(to: CGPoint(x: center.x, y: center.y - radius))
        context.addLine(to: CGPoint(x: center.x, y: center.y + radius))
        context.strokePath()
        context.restoreGState()
    }

    // MARK: - Pellicule

    static func drawFilm(_ context: CGContext, bounds: CGRect, placed: Placed, unit: CGFloat) {
        fill(context, bounds, color: rgb(0.06, 0.05, 0.05))
        CallMontageLayout.filmStrips(count: placed.count, canvas: bounds.size).forEach { strip in
            fill(context, strip, color: rgb(0.16, 0.12, 0.08))
            let hole = CGSize(width: strip.width * 0.055, height: strip.width * 0.038)
            let pitch = hole.height * 2.1
            stride(from: pitch / 2, to: strip.maxY, by: pitch).forEach { y in
                [strip.minX + strip.width * 0.05, strip.maxX - strip.width * 0.05 - hole.width].forEach { x in
                    let rect = CGRect(x: x, y: y, width: hole.width, height: hole.height)
                    context.addPath(CGPath(roundedRect: rect, cornerWidth: hole.height * 0.25, cornerHeight: hole.height * 0.25, transform: nil))
                    context.setFillColor(rgb(0.93, 0.91, 0.86))
                    context.fillPath()
                }
            }
        }
        placed.enumerated().forEach { index, pair in
            let (slot, portrait) = pair
            drawPortrait(context, portrait, in: slot)
            stroke(context, slot, color: CGColor(gray: 0, alpha: 1), width: 4 * unit)
            drawText(context, "\(index + 1)A", font: "Courier-Bold", size: 26 * unit, color: rgb(1, 0.62, 0.2), left: slot.frame.minX, baseline: slot.frame.maxY + 24 * unit, maxWidth: slot.frame.width * 0.3)
        }
    }

    // MARK: - Néon

    static func drawNeon(_ context: CGContext, bounds: CGRect, placed: Placed, caption: CallMontageCaption, unit: CGFloat) {
        linearGradient(context, bounds, top: rgb(0.07, 0.03, 0.14), bottom: rgb(0.02, 0.01, 0.05))
        let tubes = [rgb(1, 0.2, 0.7), rgb(0.1, 0.9, 1)]
        placed.enumerated().forEach { index, pair in
            let (slot, portrait) = pair
            let tube = tubes[index % tubes.count]
            context.saveGState()
            context.setShadow(offset: .zero, blur: 45 * unit, color: tube)
            stroke(context, slot, color: tube, width: 12 * unit)
            context.restoreGState()
            drawPortrait(context, portrait, in: slot)
            stroke(context, slot, color: tube, width: 8 * unit)
            stroke(context, slot, color: white(0.9), width: 2.5 * unit)
        }
        if let band = CallMontageLayout.captionBand(style: .neon, canvas: bounds.size) {
            context.saveGState()
            context.setShadow(offset: .zero, blur: 40 * unit, color: tubes[0])
            drawText(context, caption.title.uppercased(), font: "AvenirNext-Heavy", size: band.height * 0.62, color: rgb(1, 0.72, 0.9), centerX: band.midX, baseline: band.minY + band.height * 0.72, maxWidth: band.width * 0.8)
            context.restoreGState()
        }
    }

    // MARK: - Noir et blanc

    static func drawNoir(_ context: CGContext, bounds: CGRect, placed: Placed, caption: CallMontageCaption, unit: CGFloat) {
        fill(context, bounds, gray: 0.06)
        placed.forEach { slot, portrait in
            drawPortrait(context, portrait, in: slot)
            context.saveGState()
            context.addPath(path(for: slot))
            context.clip()
            context.setBlendMode(.saturation)
            fill(context, slot.frame, gray: 0.5)
            context.restoreGState()
            stroke(context, slot, color: white(0.85), width: 3 * unit)
        }
        drawGrain(context, in: bounds, unit: unit)
        vignette(context, bounds)
        if let band = CallMontageLayout.captionBand(style: .noir, canvas: bounds.size) {
            drawText(context, caption.title.uppercased() + "  ·  " + caption.subtitle, font: "Didot", size: band.height * 0.36, color: white(0.9), centerX: band.midX, baseline: band.minY + band.height * 0.6, maxWidth: band.width * 0.86)
        }
    }

    static func drawGrain(_ context: CGContext, in bounds: CGRect, unit: CGFloat) {
        let side = max(1, 2 * unit)
        (0 ..< 1400).forEach { index in
            let x = grainUnit(index, salt: 0x9E37) * bounds.width
            let y = grainUnit(index, salt: 0x7F4A) * bounds.height
            let light = grainUnit(index, salt: 0x3C6E) > 0.5
            context.setFillColor(CGColor(gray: light ? 1 : 0, alpha: 0.12))
            context.fill(CGRect(x: x, y: y, width: side, height: side))
        }
    }

    static func grainUnit(_ index: Int, salt: UInt64) -> CGFloat {
        var value = UInt64(truncatingIfNeeded: index) &* 0x9E37_79B9_7F4A_7C15 &+ salt
        value ^= value >> 31
        value &*= 0xBF58_476D_1CE4_E5B9
        value ^= value >> 29
        return CGFloat(value % 10_000) / 10_000
    }

    static func vignette(_ context: CGContext, _ bounds: CGRect) {
        let colors = [CGColor(gray: 0, alpha: 0), CGColor(gray: 0, alpha: 0.7)] as CFArray
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0.45, 1]) else { return }
        let center = CGPoint(x: bounds.midX, y: bounds.midY)
        context.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: hypot(bounds.width, bounds.height) / 2, options: [.drawsAfterEndLocation])
    }

    static func glow(_ context: CGContext, center: CGPoint, radius: CGFloat, color: CGColor) {
        guard radius > 0, let clear = color.copy(alpha: 0) else { return }
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [color, clear] as CFArray, locations: [0, 1]) else { return }
        context.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: radius, options: [])
    }
}
