import CoreGraphics
import CoreText
import Foundation

nonisolated struct CallMontagePortrait: @unchecked Sendable {
    let id: String
    let name: String
    let image: CGImage?
}

nonisolated struct CallMontageCaption: Equatable, Sendable {
    let title: String
    let subtitle: String
}

nonisolated enum CallMontageRenderer {
    static func render(style: CallMontageStyle, portraits: [CallMontagePortrait], canvas: CGSize, caption: CallMontageCaption) -> CGImage? {
        guard let context = makeContext(size: canvas) else { return nil }
        let bounds = CGRect(origin: .zero, size: canvas)
        let slots = CallMontageLayout.frames(style: style, count: portraits.count, canvas: canvas)
        let placed = Array(zip(slots, portraits))
        let unit = canvas.width / 1080

        switch style {
        case .screen:
            fill(context, bounds, gray: 0)
            placed.enumerated().forEach { index, pair in
                drawPortrait(context, pair.1, in: pair.0)
                if index > 0, portraits.count == 2 { stroke(context, pair.0, color: white(0.9), width: 5 * unit) }
            }
        case .grid:
            fill(context, bounds, color: rgb(0.06, 0.06, 0.1))
            placed.forEach { drawPortrait(context, $0.1, in: $0.0) }
        case .strip:
            drawStrip(context, bounds: bounds, placed: placed, caption: caption, unit: unit)
        case .polaroid:
            drawPolaroids(context, bounds: bounds, placed: placed, unit: unit)
        case .magazine:
            drawMagazine(context, bounds: bounds, placed: placed, caption: caption, unit: unit)
        case .comic:
            drawComic(context, bounds: bounds, placed: placed, unit: unit)
        case .heart:
            drawHearts(context, bounds: bounds, placed: placed, caption: caption, unit: unit)
        case .cover:
            drawCover(context, bounds: bounds, placed: placed, caption: caption, unit: unit)
        case .gold:
            drawGold(context, bounds: bounds, placed: placed, caption: caption, unit: unit)
        case .redcarpet:
            drawRedCarpet(context, bounds: bounds, placed: placed, caption: caption, unit: unit)
        case .film:
            drawFilm(context, bounds: bounds, placed: placed, unit: unit)
        case .neon:
            drawNeon(context, bounds: bounds, placed: placed, caption: caption, unit: unit)
        case .noir:
            drawNoir(context, bounds: bounds, placed: placed, caption: caption, unit: unit)
        }
        return context.makeImage()
    }

    static func faceSquare(from image: CGImage, face normalized: CGRect?, side: Int) -> CGImage? {
        let size = CGSize(width: image.width, height: image.height)
        let face = normalized.map { CallFaceCrop.pixelRect(fromNormalized: $0, imageSize: size) }
        let crop = CallFaceCrop.square(around: face, in: size, margin: 0.45).integral
        guard let cropped = image.cropping(to: crop),
              let context = makeContext(size: CGSize(width: side, height: side)) else { return nil }
        drawImage(context, cropped, aspectFill: CGRect(x: 0, y: 0, width: side, height: side))
        return context.makeImage()
    }

    // MARK: - Styles

    static func drawStrip(_ context: CGContext, bounds: CGRect, placed: [(CallMontageSlot, CallMontagePortrait)], caption: CallMontageCaption, unit: CGFloat) {
        fill(context, bounds, color: rgb(0.98, 0.97, 0.94))
        placed.forEach { slot, portrait in
            drawPortrait(context, portrait, in: slot)
            stroke(context, slot, color: rgb(0.15, 0.15, 0.18), width: 3 * unit)
        }
        guard let band = CallMontageLayout.captionBand(style: .strip, canvas: bounds.size) else { return }
        drawText(context, caption.title, font: "AvenirNext-Heavy", size: 64 * unit, color: rgb(0.12, 0.12, 0.2), centerX: band.midX, baseline: band.minY + band.height * 0.45, maxWidth: band.width * 0.8)
        drawText(context, caption.subtitle, font: "AvenirNext-DemiBold", size: 34 * unit, color: rgb(0.45, 0.45, 0.5), centerX: band.midX, baseline: band.minY + band.height * 0.72, maxWidth: band.width * 0.8)
    }

    static func drawPolaroids(_ context: CGContext, bounds: CGRect, placed: [(CallMontageSlot, CallMontagePortrait)], unit: CGFloat) {
        linearGradient(context, bounds, top: rgb(0.42, 0.3, 0.24), bottom: rgb(0.2, 0.13, 0.1))
        placed.forEach { slot, portrait in
            let card = CallMontageLayout.polaroidCard(around: slot.frame)
            context.saveGState()
            rotate(context, around: CGPoint(x: card.midX, y: card.midY), degrees: slot.rotation)
            context.setShadow(offset: CGSize(width: 0, height: -10 * unit), blur: 24 * unit, color: CGColor(gray: 0, alpha: 0.45))
            fill(context, card, color: rgb(0.99, 0.99, 0.97))
            context.setShadow(offset: .zero, blur: 0, color: nil)
            drawPortrait(context, portrait, in: CallMontageSlot(frame: slot.frame, shape: .rectangle))
            let footer = CGRect(x: card.minX, y: slot.frame.maxY, width: card.width, height: card.maxY - slot.frame.maxY)
            drawText(context, portrait.name, font: "Noteworthy-Bold", size: footer.height * 0.36, color: rgb(0.2, 0.2, 0.28), centerX: footer.midX, baseline: footer.minY + footer.height * 0.62, maxWidth: footer.width * 0.86)
            context.restoreGState()
        }
    }

    static func drawMagazine(_ context: CGContext, bounds: CGRect, placed: [(CallMontageSlot, CallMontagePortrait)], caption: CallMontageCaption, unit: CGFloat) {
        fill(context, bounds, color: rgb(0.1, 0.1, 0.12))
        guard let cover = placed.first else { return }
        drawPortrait(context, cover.1, in: cover.0)
        linearGradient(context, CGRect(x: 0, y: 0, width: bounds.width, height: bounds.height * 0.3), top: CGColor(gray: 0, alpha: 0.6), bottom: CGColor(gray: 0, alpha: 0))
        linearGradient(context, CGRect(x: 0, y: bounds.height * 0.55, width: bounds.width, height: bounds.height * 0.45), top: CGColor(gray: 0, alpha: 0), bottom: CGColor(gray: 0, alpha: 0.75))
        if let band = CallMontageLayout.captionBand(style: .magazine, canvas: bounds.size) {
            drawText(context, caption.title.uppercased(), font: "Didot-Bold", size: band.height * 0.62, color: white(1), centerX: band.midX, baseline: band.minY + band.height * 0.7, maxWidth: band.width * 0.9)
            drawText(context, caption.subtitle.uppercased(), font: "AvenirNext-DemiBold", size: 30 * unit, color: rgb(1, 0.84, 0.3), centerX: band.midX, baseline: band.maxY + 30 * unit, maxWidth: band.width * 0.8)
        }
        let insets = placed.dropFirst()
        let headlineBaseline = (insets.first?.0.frame.minY ?? bounds.maxY - bounds.height * 0.06) - 40 * unit
        drawText(context, cover.1.name, font: "AvenirNext-Heavy", size: 92 * unit, color: white(1), left: bounds.width * 0.06, baseline: headlineBaseline, maxWidth: bounds.width * 0.88)
        insets.forEach { slot, portrait in
            drawPortrait(context, portrait, in: slot)
            stroke(context, slot, color: white(1), width: 6 * unit)
        }
    }

    static func drawComic(_ context: CGContext, bounds: CGRect, placed: [(CallMontageSlot, CallMontagePortrait)], unit: CGFloat) {
        fill(context, bounds, color: rgb(1, 0.84, 0.12))
        let spacing = bounds.width / 26
        context.setFillColor(rgb(0.95, 0.55, 0.05))
        stride(from: spacing / 2, to: bounds.height, by: spacing).enumerated().forEach { row, y in
            stride(from: (row % 2 == 0 ? spacing / 2 : spacing), to: bounds.width, by: spacing).forEach { x in
                let radius = spacing * 0.18
                context.fillEllipse(in: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
            }
        }
        placed.forEach { slot, portrait in
            fill(context, slot.frame, gray: 1)
            drawPortrait(context, portrait, in: slot)
            stroke(context, slot, color: CGColor(gray: 0, alpha: 1), width: 10 * unit)
            drawSpeechBubble(context, text: portrait.name, in: slot.frame, unit: unit)
        }
    }

    static func drawHearts(_ context: CGContext, bounds: CGRect, placed: [(CallMontageSlot, CallMontagePortrait)], caption: CallMontageCaption, unit: CGFloat) {
        linearGradient(context, bounds, top: rgb(1, 0.55, 0.68), bottom: rgb(0.93, 0.24, 0.45))
        let sparkles = CallFaceEffectGeometry.embers(count: 18, time: 0, canvas: bounds, seed: 0x48_45_41_52_54)
        sparkles.forEach { sparkle in
            let side = sparkle.radius * 5
            context.setFillColor(CGColor(gray: 1, alpha: 0.25 + sparkle.opacity * 0.3))
            context.addPath(heartPath(in: CGRect(x: sparkle.center.x - side / 2, y: sparkle.center.y - side / 2, width: side, height: side)))
            context.fillPath()
        }
        placed.forEach { slot, portrait in
            context.saveGState()
            context.setShadow(offset: CGSize(width: 0, height: -8 * unit), blur: 22 * unit, color: CGColor(red: 0.5, green: 0, blue: 0.15, alpha: 0.4))
            context.addPath(heartPath(in: slot.frame))
            context.setFillColor(white(1))
            context.fillPath()
            context.restoreGState()
            drawPortrait(context, portrait, in: slot)
            stroke(context, slot, color: white(1), width: 8 * unit)
        }
        if let band = CallMontageLayout.captionBand(style: .heart, canvas: bounds.size) {
            drawText(context, caption.subtitle, font: "AvenirNext-DemiBold", size: band.height * 0.42, color: white(1), centerX: band.midX, baseline: band.minY + band.height * 0.6, maxWidth: band.width * 0.8)
        }
    }

    static func drawSpeechBubble(_ context: CGContext, text: String, in panel: CGRect, unit: CGFloat) {
        guard !text.isEmpty else { return }
        let fontSize = max(10, min(panel.width, panel.height) * 0.075)
        let width = min(panel.width * 0.7, measure(text, font: "ChalkboardSE-Bold", size: fontSize) + fontSize * 1.4)
        let height = fontSize * 1.8
        let bubble = CGRect(x: panel.minX + panel.width * 0.05, y: panel.minY + panel.height * 0.05, width: width, height: height)
        let tail = CGMutablePath()
        tail.move(to: CGPoint(x: bubble.minX + width * 0.25, y: bubble.maxY - 1))
        tail.addLine(to: CGPoint(x: bubble.minX + width * 0.18, y: bubble.maxY + height * 0.45))
        tail.addLine(to: CGPoint(x: bubble.minX + width * 0.42, y: bubble.maxY - 1))
        tail.closeSubpath()
        let corner = min(width, height) / 2
        let body = CGPath(roundedRect: bubble, cornerWidth: corner, cornerHeight: corner, transform: nil)
        [body, tail].forEach { path in
            context.addPath(path)
            context.setFillColor(white(1))
            context.fillPath()
        }
        [body, tail].forEach { path in
            context.addPath(path)
            context.setStrokeColor(CGColor(gray: 0, alpha: 1))
            context.setLineWidth(max(1, 4 * unit))
            context.strokePath()
        }
        drawText(context, text, font: "ChalkboardSE-Bold", size: fontSize, color: CGColor(gray: 0, alpha: 1), centerX: bubble.midX, baseline: bubble.midY + fontSize * 0.35, maxWidth: width - fontSize)
    }

    // MARK: - Portraits

    static func drawPortrait(_ context: CGContext, _ portrait: CallMontagePortrait, in slot: CallMontageSlot) {
        context.saveGState()
        if slot.rotation != 0, slot.shape != .rectangle {
            rotate(context, around: CGPoint(x: slot.frame.midX, y: slot.frame.midY), degrees: slot.rotation)
        }
        context.addPath(path(for: slot))
        context.clip()
        if let image = portrait.image {
            drawImage(context, image, aspectFill: slot.frame)
        } else {
            drawPlaceholder(context, portrait, in: slot.frame)
        }
        context.restoreGState()
    }

    static func drawPlaceholder(_ context: CGContext, _ portrait: CallMontagePortrait, in rect: CGRect) {
        let hue = CGFloat(portrait.id.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF } % 360) / 360
        linearGradient(context, rect, top: hsb(hue, 0.55, 0.85), bottom: hsb(hue, 0.7, 0.55))
        let initial = portrait.name.first.map { String($0).uppercased() } ?? "?"
        let size = min(rect.width, rect.height) * 0.4
        drawText(context, initial, font: "AvenirNext-Bold", size: size, color: white(1), centerX: rect.midX, baseline: rect.midY + size * 0.35, maxWidth: rect.width * 0.9)
    }

    static func drawImage(_ context: CGContext, _ image: CGImage, aspectFill rect: CGRect) {
        let imageSize = CGSize(width: image.width, height: image.height)
        guard imageSize.width > 0, imageSize.height > 0, rect.width > 0, rect.height > 0 else { return }
        let scale = max(rect.width / imageSize.width, rect.height / imageSize.height)
        let drawn = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
        let target = CGRect(x: rect.midX - drawn.width / 2, y: rect.midY - drawn.height / 2, width: drawn.width, height: drawn.height)
        context.saveGState()
        context.clip(to: rect)
        context.translateBy(x: target.minX, y: target.maxY)
        context.scaleBy(x: 1, y: -1)
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(origin: .zero, size: target.size))
        context.restoreGState()
    }

    // MARK: - Paths

    static func heartPath(in rect: CGRect) -> CGPath {
        let path = CGMutablePath()
        let width = rect.width
        let height = rect.height
        let bottom = CGPoint(x: rect.midX, y: rect.maxY)
        path.move(to: bottom)
        path.addCurve(
            to: CGPoint(x: rect.minX, y: rect.minY + height * 0.3),
            control1: CGPoint(x: rect.midX - width * 0.1, y: rect.maxY - height * 0.12),
            control2: CGPoint(x: rect.minX, y: rect.minY + height * 0.58)
        )
        path.addCurve(
            to: CGPoint(x: rect.midX, y: rect.minY + height * 0.2),
            control1: CGPoint(x: rect.minX, y: rect.minY + height * 0.02),
            control2: CGPoint(x: rect.midX - width * 0.04, y: rect.minY - height * 0.02)
        )
        path.addCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY + height * 0.3),
            control1: CGPoint(x: rect.midX + width * 0.04, y: rect.minY - height * 0.02),
            control2: CGPoint(x: rect.maxX, y: rect.minY + height * 0.02)
        )
        path.addCurve(
            to: bottom,
            control1: CGPoint(x: rect.maxX, y: rect.minY + height * 0.58),
            control2: CGPoint(x: rect.midX + width * 0.1, y: rect.maxY - height * 0.12)
        )
        path.closeSubpath()
        return path
    }

    static func path(for slot: CallMontageSlot) -> CGPath {
        switch slot.shape {
        case .rectangle: return CGPath(rect: slot.frame, transform: nil)
        case .roundedRectangle:
            let radius = min(slot.cornerRadius, min(slot.frame.width, slot.frame.height) / 2)
            return CGPath(roundedRect: slot.frame, cornerWidth: radius, cornerHeight: radius, transform: nil)
        case .circle: return CGPath(ellipseIn: slot.frame, transform: nil)
        case .heart: return heartPath(in: slot.frame)
        }
    }

    static func stroke(_ context: CGContext, _ slot: CallMontageSlot, color: CGColor, width: CGFloat) {
        context.saveGState()
        context.addPath(path(for: slot))
        context.setStrokeColor(color)
        context.setLineWidth(max(1, width))
        context.strokePath()
        context.restoreGState()
    }

    // MARK: - Drawing primitives

    static func makeContext(size: CGSize) -> CGContext? {
        let width = Int(size.width.rounded())
        let height = Int(size.height.rounded())
        guard width > 0, height > 0,
              let context = CGContext(
                data: nil,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
              ) else { return nil }
        context.translateBy(x: 0, y: CGFloat(height))
        context.scaleBy(x: 1, y: -1)
        return context
    }

    static func rotate(_ context: CGContext, around center: CGPoint, degrees: CGFloat) {
        context.translateBy(x: center.x, y: center.y)
        context.rotate(by: degrees * .pi / 180)
        context.translateBy(x: -center.x, y: -center.y)
    }

    static func fill(_ context: CGContext, _ rect: CGRect, gray: CGFloat) {
        fill(context, rect, color: CGColor(gray: gray, alpha: 1))
    }

    static func fill(_ context: CGContext, _ rect: CGRect, color: CGColor) {
        context.setFillColor(color)
        context.fill(rect)
    }

    static func linearGradient(_ context: CGContext, _ rect: CGRect, top: CGColor, bottom: CGColor) {
        guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [top, bottom] as CFArray, locations: [0, 1]) else { return }
        context.saveGState()
        context.clip(to: rect)
        context.drawLinearGradient(gradient, start: CGPoint(x: rect.midX, y: rect.minY), end: CGPoint(x: rect.midX, y: rect.maxY), options: [])
        context.restoreGState()
    }

    static func rgb(_ red: CGFloat, _ green: CGFloat, _ blue: CGFloat) -> CGColor {
        CGColor(red: red, green: green, blue: blue, alpha: 1)
    }

    static func white(_ alpha: CGFloat) -> CGColor {
        CGColor(gray: 1, alpha: alpha)
    }

    static func hsb(_ hue: CGFloat, _ saturation: CGFloat, _ brightness: CGFloat) -> CGColor {
        let sector = hue * 6
        let chroma = brightness * saturation
        let secondary = chroma * (1 - abs(sector.truncatingRemainder(dividingBy: 2) - 1))
        let offset = brightness - chroma
        let (red, green, blue): (CGFloat, CGFloat, CGFloat) = {
            switch Int(sector) % 6 {
            case 0: return (chroma, secondary, 0)
            case 1: return (secondary, chroma, 0)
            case 2: return (0, chroma, secondary)
            case 3: return (0, secondary, chroma)
            case 4: return (secondary, 0, chroma)
            default: return (chroma, 0, secondary)
            }
        }()
        return rgb(red + offset, green + offset, blue + offset)
    }

    // MARK: - Text

    static func line(_ text: String, font name: String, size: CGFloat, color: CGColor) -> CTLine {
        let font = CTFontCreateWithName(name as CFString, max(size, 1), nil)
        let attributes: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): color
        ]
        return CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
    }

    static func measure(_ text: String, font: String, size: CGFloat) -> CGFloat {
        CGFloat(CTLineGetTypographicBounds(line(text, font: font, size: size, color: white(1)), nil, nil, nil))
    }

    static func fitted(_ text: String, font: String, size: CGFloat, maxWidth: CGFloat) -> CGFloat {
        let width = measure(text, font: font, size: size)
        guard width > maxWidth, width > 0 else { return size }
        return size * maxWidth / width
    }

    static func drawText(_ context: CGContext, _ text: String, font: String, size: CGFloat, color: CGColor, centerX: CGFloat, baseline: CGFloat, maxWidth: CGFloat) {
        guard !text.isEmpty else { return }
        let fittedSize = fitted(text, font: font, size: size, maxWidth: maxWidth)
        let width = measure(text, font: font, size: fittedSize)
        drawLine(context, line(text, font: font, size: fittedSize, color: color), at: CGPoint(x: centerX - width / 2, y: baseline))
    }

    static func drawText(_ context: CGContext, _ text: String, font: String, size: CGFloat, color: CGColor, left: CGFloat, baseline: CGFloat, maxWidth: CGFloat) {
        guard !text.isEmpty else { return }
        let fittedSize = fitted(text, font: font, size: size, maxWidth: maxWidth)
        drawLine(context, line(text, font: font, size: fittedSize, color: color), at: CGPoint(x: left, y: baseline))
    }

    static func drawLine(_ context: CGContext, _ line: CTLine, at origin: CGPoint) {
        context.saveGState()
        context.textMatrix = CGAffineTransform(scaleX: 1, y: -1)
        context.textPosition = origin
        CTLineDraw(line, context)
        context.restoreGState()
    }
}
