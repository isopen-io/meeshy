import CoreGraphics
import Foundation

/// Les formes des cases (§ 4.2), le traitement des visages (ton) et ce qui les entoure : cartes,
/// ombres, halos (sous les visages) et traits (dessus).
nonisolated extension CallFrameRenderer {
    static let defaultRoundRadius: CGFloat = 0.08

    // MARK: - Formes (port de `frame-paint-shapes.ts`)

    /// Le contour d'une case de forme `shape` dans `rect` (repère de la case, avant rotation) : centrée,
    /// sans déborder ; `circle`, `hex`, `star` et `heart` gardent leurs proportions.
    static func slotPath(_ shape: CallFrameSlotShape, in rect: CGRect, radius: Double?, seed: Int) -> CGPath {
        guard rect.width > 0, rect.height > 0 else { return CGPath(rect: rect, transform: nil) }
        let side = min(rect.width, rect.height)
        let path = CGMutablePath()
        switch shape {
        case .rect:
            path.addRect(rect)
        case .round:
            path.addRoundedRect(rect, radius: CGFloat(radius ?? Double(defaultRoundRadius)) * side)
        case .circle:
            path.addCircle(rect.midX, rect.midY, side / 2)
        case .oval:
            path.addEllipse(in: rect)
        case .arch:
            let archRadius = min(rect.width / 2, rect.height)
            path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + archRadius))
            path.canvasArc(rect.midX, rect.minY + archRadius, archRadius, .pi, 0)
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.closeSubpath()
        case .hex:
            return hexPath(rect)
        case .diamond:
            return polygon([
                CGPoint(x: rect.midX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.midY),
                CGPoint(x: rect.midX, y: rect.maxY), CGPoint(x: rect.minX, y: rect.midY),
            ])
        case .heart:
            let width = min(rect.width, rect.height * 1.1)
            let height = width / 1.1
            return heartPath(CGRect(x: rect.midX - width / 2, y: rect.midY - height / 2, width: width, height: height))
        case .star:
            return starPath(rect)
        case .ticket:
            return ticketPath(rect)
        case .stamp:
            return stampPath(rect)
        case .blob:
            return blobPath(rect, seed: seed)
        case .torn:
            return polygon(tornPoints(rect, seed: seed))
        case .polaroid:
            path.addRect(polaroidWindow(rect))
        case .frameOval:
            path.addEllipse(in: medallionRect(rect))
        }
        return path
    }

    /// Un bord déchiré (`tornPoints` du web) : les quatre côtés rongés vers l'intérieur par des dents
    /// irrégulières (au plus 2,5 % du petit côté), les coins intacts — déterministe pour une même case.
    static func tornPoints(_ rect: CGRect, seed: Int) -> [CGPoint] {
        let side = min(rect.width, rect.height)
        let depth = side * 0.025
        let step = side * 0.045
        guard step > 0 else { return [rect.origin] }
        func edge(_ from: CGPoint, _ to: CGPoint, inward: CGVector, salt: Int) -> [CGPoint] {
            let count = max(4, Int((hypot(to.x - from.x, to.y - from.y) / step).rounded()))
            return (0 ..< count).map { index in
                let share = CGFloat(index) / CGFloat(count)
                let bite = index == 0 ? 0 : rand(Double(seed + 23), Double(salt * 1000 + index)) * depth
                return CGPoint(x: from.x + (to.x - from.x) * share + inward.dx * bite, y: from.y + (to.y - from.y) * share + inward.dy * bite)
            }
        }
        let topLeft = CGPoint(x: rect.minX, y: rect.minY)
        let topRight = CGPoint(x: rect.maxX, y: rect.minY)
        let bottomRight = CGPoint(x: rect.maxX, y: rect.maxY)
        let bottomLeft = CGPoint(x: rect.minX, y: rect.maxY)
        return edge(topLeft, topRight, inward: CGVector(dx: 0, dy: 1), salt: 0)
            + edge(topRight, bottomRight, inward: CGVector(dx: -1, dy: 0), salt: 1)
            + edge(bottomRight, bottomLeft, inward: CGVector(dx: 0, dy: -1), salt: 2)
            + edge(bottomLeft, topLeft, inward: CGVector(dx: 1, dy: 0), salt: 3)
    }

    /// La photo d'un polaroid (`polaroidWindow` du web) : carrée, marges fines en haut et sur les côtés,
    /// la marge du bas épaisse (20 % de la case au moins).
    static func polaroidWindow(_ rect: CGRect) -> CGRect {
        let pad = min(rect.width, rect.height) * 0.06
        let side = max(0, min(rect.width - pad * 2, rect.height - pad - rect.height * 0.2))
        return CGRect(x: rect.minX + (rect.width - side) / 2, y: rect.minY + pad, width: side, height: side)
    }

    static let medallionRatio: CGFloat = 0.75

    /// Le rectangle d'un médaillon (`medallionRect` du web) : un ovale vertical 3:4, le plus grand qui tient, centré.
    static func medallionRect(_ rect: CGRect) -> CGRect {
        let width = min(rect.width, rect.height * medallionRatio)
        let height = width / medallionRatio
        return CGRect(x: rect.midX - width / 2, y: rect.midY - height / 2, width: width, height: height)
    }

    static func slotPath(for box: CallFrameSlotBox, in rect: CGRect, slot: CallFrameSlotStyle) -> CGPath {
        slotPath(box.shape, in: rect, radius: slot.radius, seed: box.index)
    }

    static func polygon(_ points: [CGPoint]) -> CGPath {
        let path = CGMutablePath()
        guard let first = points.first else { return path }
        path.move(to: first)
        points.dropFirst().forEach { path.addLine(to: $0) }
        path.closeSubpath()
        return path
    }

    /// Le cœur de `call-montage-render.ts` (`heartPath`), le même tracé que le web.
    static func heartPath(_ box: CGRect) -> CGPath {
        let x = box.minX, y = box.minY, w = box.width, h = box.height
        let path = CGMutablePath()
        path.move(to: CGPoint(x: x + w / 2, y: y + h * 0.28))
        path.addCurve(to: CGPoint(x: x + w * 0.04, y: y + h * 0.3), control1: CGPoint(x: x + w / 2, y: y + h * 0.06), control2: CGPoint(x: x + w * 0.1, y: y - h * 0.02))
        path.addCurve(to: CGPoint(x: x + w / 2, y: y + h * 0.96), control1: CGPoint(x: x - w * 0.02, y: y + h * 0.58), control2: CGPoint(x: x + w * 0.3, y: y + h * 0.76))
        path.addCurve(to: CGPoint(x: x + w * 0.96, y: y + h * 0.3), control1: CGPoint(x: x + w * 0.7, y: y + h * 0.76), control2: CGPoint(x: x + w * 1.02, y: y + h * 0.58))
        path.addCurve(to: CGPoint(x: x + w / 2, y: y + h * 0.28), control1: CGPoint(x: x + w * 0.9, y: y - h * 0.02), control2: CGPoint(x: x + w / 2, y: y + h * 0.06))
        path.closeSubpath()
        return path
    }

    /// Un hexagone régulier à pointe en haut, le plus grand qui tient dans `rect`.
    static func hexPath(_ rect: CGRect) -> CGPath {
        let width = min(rect.width, rect.height / CallFrameLayoutGeometry.hexRatio)
        let height = width * CallFrameLayoutGeometry.hexRatio
        let left = rect.midX - width / 2
        let right = rect.midX + width / 2
        let top = rect.midY - height / 2
        return polygon([
            CGPoint(x: rect.midX, y: top),
            CGPoint(x: right, y: top + height / 4),
            CGPoint(x: right, y: top + height * 3 / 4),
            CGPoint(x: rect.midX, y: top + height),
            CGPoint(x: left, y: top + height * 3 / 4),
            CGPoint(x: left, y: top + height / 4),
        ])
    }

    /// Une étoile à cinq branches (rayon intérieur 0,5) posée dans `rect`, pointe en haut.
    static func starPath(_ rect: CGRect) -> CGPath {
        let lower = cos(CGFloat.pi / 5)
        let outer = min(rect.width / (2 * sin(2 * CGFloat.pi / 5)), rect.height / (1 + lower))
        let inner = outer * 0.5
        let cx = rect.midX
        let cy = rect.minY + (rect.height - outer * (1 + lower)) / 2 + outer
        return polygon((0 ..< 10).map { index in
            let angle = -CGFloat.pi / 2 + CGFloat(index) * .pi / 5
            let radius = index % 2 == 0 ? outer : inner
            return CGPoint(x: cx + cos(angle) * radius, y: cy + sin(angle) * radius)
        })
    }

    /// Un billet : quatre coins encochés d'un quart de cercle.
    static func ticketPath(_ rect: CGRect) -> CGPath {
        let notch = min(rect.width, rect.height) * 0.12
        let x = rect.minX, y = rect.minY, w = rect.width, h = rect.height
        let path = CGMutablePath()
        path.move(to: CGPoint(x: x + notch, y: y))
        path.addLine(to: CGPoint(x: x + w - notch, y: y))
        path.canvasArc(x + w, y, notch, .pi, .pi / 2, anticlockwise: true)
        path.addLine(to: CGPoint(x: x + w, y: y + h - notch))
        path.canvasArc(x + w, y + h, notch, -.pi / 2, -.pi, anticlockwise: true)
        path.addLine(to: CGPoint(x: x + notch, y: y + h))
        path.canvasArc(x, y + h, notch, 0, -.pi / 2, anticlockwise: true)
        path.addLine(to: CGPoint(x: x, y: y + notch))
        path.canvasArc(x, y, notch, .pi / 2, 0, anticlockwise: true)
        path.closeSubpath()
        return path
    }

    /// Un bord de timbre : des morsures en demi-cercle, régulières, le long des quatre côtés.
    static func stampPath(_ rect: CGRect) -> CGPath {
        let bite = min(rect.width, rect.height) * 0.035
        let x = rect.minX, y = rect.minY, w = rect.width, h = rect.height
        func bites(_ length: CGFloat) -> [CGFloat] {
            let count = max(2, Int((length / max(bite * 3.2, 0.0001)).rounded()))
            let step = length / CGFloat(count)
            return (0 ..< count).map { step * (CGFloat($0) + 0.5) }
        }
        let path = CGMutablePath()
        path.move(to: CGPoint(x: x, y: y))
        bites(w).forEach { at in
            path.addLine(to: CGPoint(x: x + at - bite, y: y))
            path.canvasArc(x + at, y, bite, .pi, 0, anticlockwise: true)
        }
        path.addLine(to: CGPoint(x: x + w, y: y))
        bites(h).forEach { at in
            path.addLine(to: CGPoint(x: x + w, y: y + at - bite))
            path.canvasArc(x + w, y + at, bite, -.pi / 2, .pi / 2, anticlockwise: true)
        }
        path.addLine(to: CGPoint(x: x + w, y: y + h))
        bites(w).forEach { at in
            path.addLine(to: CGPoint(x: x + w - at + bite, y: y + h))
            path.canvasArc(x + w - at, y + h, bite, 0, -.pi, anticlockwise: true)
        }
        path.addLine(to: CGPoint(x: x, y: y + h))
        bites(h).forEach { at in
            path.addLine(to: CGPoint(x: x, y: y + h - at + bite))
            path.canvasArc(x, y + h - at, bite, .pi / 2, -.pi / 2, anticlockwise: true)
        }
        path.closeSubpath()
        return path
    }

    /// Un galet : un cercle déformé par deux harmoniques de phases tirées, lissé par des courbes quadratiques.
    static func blobPath(_ rect: CGRect, seed: Int) -> CGPath {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let phaseA = rand(Double(seed + 11), 0) * tau
        let phaseB = rand(Double(seed + 11), 1) * tau
        let rx = rect.width / 2 / 1.09
        let ry = rect.height / 2 / 1.09
        let points = (0 ..< 36).map { index -> CGPoint in
            let angle = CGFloat(index) / 36 * tau
            let wobble = 1 + 0.055 * sin(3 * angle + phaseA) + 0.035 * sin(5 * angle + phaseB)
            return CGPoint(x: center.x + cos(angle) * rx * wobble, y: center.y + sin(angle) * ry * wobble)
        }
        func mid(_ a: CGPoint, _ b: CGPoint) -> CGPoint { CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2) }
        let path = CGMutablePath()
        path.move(to: mid(points[points.count - 1], points[0]))
        points.indices.forEach { index in
            path.addQuadCurve(to: mid(points[index], points[(index + 1) % points.count]), control: points[index])
        }
        path.closeSubpath()
        return path
    }

    /// Le rectangle UTILE d'une forme — là où poser un bandeau, une pastille (`shapeInnerRect` du web).
    static func shapeInnerRect(_ shape: CallFrameSlotShape, _ rect: CGRect) -> CGRect {
        let side = min(rect.width, rect.height)
        func around(_ width: CGFloat, _ height: CGFloat) -> CGRect {
            CGRect(x: rect.midX - width / 2, y: rect.midY - height / 2, width: width, height: height)
        }
        switch shape {
        case .circle:
            return around(side * 0.82, side * 0.82)
        case .oval:
            return around(rect.width * 0.82, rect.height * 0.82)
        case .hex:
            let ratio = CallFrameLayoutGeometry.hexRatio
            return around(min(rect.width, rect.height / ratio), min(rect.height, rect.width * ratio) * 0.7)
        case .diamond:
            return around(rect.width * 0.5, rect.height * 0.5)
        case .heart:
            return CGRect(x: rect.midX - side * 0.3, y: rect.minY + rect.height * 0.2, width: side * 0.6, height: rect.height * 0.45)
        case .star:
            return around(side * 0.42, side * 0.42)
        case .arch:
            let lift = min(rect.width / 2, rect.height) * 0.4
            return CGRect(x: rect.minX, y: rect.minY + lift, width: rect.width, height: rect.height - lift)
        case .ticket, .stamp:
            return CGRect(x: rect.minX + side * 0.06, y: rect.minY + side * 0.06, width: rect.width - side * 0.12, height: rect.height - side * 0.12)
        case .blob:
            return around(rect.width * 0.8, rect.height * 0.8)
        case .torn:
            return rect.insetBy(dx: side * 0.04, dy: side * 0.04)
        case .polaroid:
            return polaroidWindow(rect)
        case .frameOval:
            let medallion = medallionRect(rect)
            return around(medallion.width * 0.82, medallion.height * 0.82)
        case .rect, .round:
            return rect
        }
    }

    // MARK: - Sous les visages : cartes, ombres, halos (port de `paintSlotGrounds`)

    static func paintUnderlay(_ context: CGContext, box: CallFrameSlotBox, stage: CallFrameStage) {
        let slot = stage.look.slot
        let unit = stage.unit
        let photo = photoRect(box.rect, card: slot.card)
        let side = min(photo.width, photo.height)
        let facePath = slotPath(for: box, in: photo, slot: slot)
        inBox(context, box) {
            if let card = slot.card {
                context.saveGState()
                let shadow: (blur: CGFloat, offset: CGFloat, alpha: CGFloat) = slot.shadow ? (blur: 0.03, offset: 0.01, alpha: 0.38) : (blur: 0.014, offset: 0.004, alpha: 0.18)
                context.setShadow(offset: CGSize(width: 0, height: -unit * shadow.offset), blur: unit * shadow.blur, color: CGColor(gray: 0, alpha: shadow.alpha))
                context.setFillColor(color(card.color))
                context.fill(box.rect)
                context.restoreGState()
            }
            if let glow = slot.glow {
                context.saveGState()
                context.setShadow(offset: .zero, blur: side * 0.12, color: color(glow))
                context.setFillColor(color(glow))
                context.addPath(facePath)
                context.fillPath()
                context.addPath(facePath)
                context.fillPath()
                context.restoreGState()
            }
            if slot.shadow, slot.card == nil {
                context.saveGState()
                context.setShadow(offset: CGSize(width: 0, height: -unit * 0.012), blur: unit * 0.03, color: CGColor(gray: 0, alpha: 0.42))
                context.setFillColor(CGColor(red: 17 / 255, green: 17 / 255, blue: 17 / 255, alpha: 1))
                context.addPath(facePath)
                context.fillPath()
                context.restoreGState()
            }
        }
    }

    // MARK: - Les visages (port de `paintFaces`)

    static func drawFace(_ context: CGContext, portrait: CallFramePortrait, box: CallFrameSlotBox, stage: CallFrameStage) {
        let slot = stage.look.slot
        let photo = photoRect(box.rect, card: slot.card)
        guard photo.width > 0, photo.height > 0 else { return }
        let path = slotPath(for: box, in: photo, slot: slot)
        inBox(context, box) {
            context.addPath(path)
            context.clip()
            if let image = portrait.image, image.width > 0, image.height > 0 {
                context.setFillColor(CGColor(gray: 0, alpha: 1))
                context.fill(photo)
                CallMontageRenderer.drawImage(context, image, aspectFill: photo)
            } else {
                drawPlaceholder(context, person: portrait.person, in: photo)
            }
            applyTone(context, slot: slot, in: photo)
        }
    }

    static let placeholderHues: [(String, String)] = [
        ("#6366F1", "#A855F7"), ("#0EA5E9", "#6366F1"), ("#F97316", "#EC4899"), ("#10B981", "#0EA5E9"),
        ("#F59E0B", "#EF4444"), ("#8B5CF6", "#EC4899"), ("#14B8A6", "#22C55E"),
    ]

    /// Le `hashOf` du web : `(hash · 31 + point de code) >>> 0` depuis 7, sur les points de code.
    static func placeholderHash(_ value: String) -> UInt32 {
        value.unicodeScalars.reduce(UInt32(7)) { $0 &* 31 &+ $1.value }
    }

    /// Caméra coupée : un dégradé propre à la personne et son initiale, jamais une case retirée (§ 2).
    static func drawPlaceholder(_ context: CGContext, person: CallFramePerson, in photo: CGRect) {
        let hues = placeholderHues[Int(placeholderHash(person.id) % UInt32(placeholderHues.count))]
        context.saveGState()
        context.clip(to: photo)
        linear(context, colors: [color(hues.0), color(hues.1)], from: CGPoint(x: photo.minX, y: photo.minY), to: CGPoint(x: photo.maxX, y: photo.maxY))
        context.restoreGState()
        let trimmed = person.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = trimmed.first else { return }
        let initial = String(first).uppercased(with: .current)
        let size = min(photo.width, photo.height) * 0.36
        guard size >= 1 else { return }
        context.saveGState()
        context.setShadow(offset: .zero, blur: size * 0.12, color: CGColor(gray: 0, alpha: 0.18))
        let font = CallFrameFontBook.resolve(nil, size: size)
        drawText(context, initial, font: font, color: CGColor(gray: 1, alpha: 0.94), x: photo.midX, y: photo.midY + size * 0.04, align: .center, vertical: .middle)
        context.restoreGState()
    }

    /// Le ton d'un visage (§ 4.2) : les filtres CSS du web (`TONE_FILTERS`) rendus par modes de fusion,
    /// puis les pellicules (`paintToneFilm`), DANS la découpe de la case.
    static func applyTone(_ context: CGContext, slot: CallFrameSlotStyle, in rect: CGRect) {
        let gray = CGColor(gray: 0.5, alpha: 1)
        switch slot.tone {
        case .color:
            return
        case .mono:
            blend(context, rect, .saturation, gray)
        case .sepia:
            blend(context, rect, .saturation, gray)
            blend(context, rect, .color, CGColor(red: 0.6, green: 0.45, blue: 0.29, alpha: 0.85))
        case .noir:
            blend(context, rect, .saturation, gray)
            blend(context, rect, .softLight, CGColor(gray: 0, alpha: 0.45))
            blend(context, rect, .multiply, CGColor(gray: 0.95, alpha: 1))
        case .warm:
            blend(context, rect, .color, CGColor(red: 0.6, green: 0.45, blue: 0.29, alpha: 0.12))
            blend(context, rect, .softLight, color("#FF9A3C", alpha: 0.22))
        case .cool:
            blend(context, rect, .saturation, CGColor(gray: 0.5, alpha: 0.12))
            blend(context, rect, .softLight, color("#3C8CFF", alpha: 0.24))
        case .faded:
            blend(context, rect, .saturation, CGColor(gray: 0.5, alpha: 0.3))
            blend(context, rect, .screen, CGColor(gray: 0.1, alpha: 1))
            blend(context, rect, .multiply, CGColor(gray: 0.92, alpha: 1))
            blend(context, rect, .normal, CGColor(gray: 1, alpha: 0.08))
        case .duotone:
            let pair = slot.duotone ?? CallFrameDuotone(shadow: "#1E1B4B", light: "#F0ABFC")
            blend(context, rect, .saturation, gray)
            blend(context, rect, .multiply, color(pair.light))
            blend(context, rect, .lighten, color(pair.shadow))
        }
    }

    static func blend(_ context: CGContext, _ rect: CGRect, _ mode: CGBlendMode, _ fill: CGColor) {
        context.saveGState()
        context.setBlendMode(mode)
        context.setFillColor(fill)
        context.fill(rect)
        context.restoreGState()
    }

    // MARK: - Au-dessus des visages : les traits de case (port de `paintSlotStrokes`)

    static func paintSlotStroke(_ context: CGContext, box: CallFrameSlotBox, stage: CallFrameStage) {
        let slot = stage.look.slot
        guard let stroke = slot.stroke else { return }
        let width = max(0.75, CGFloat(stroke.width) * stage.unit)
        let photo = photoRect(box.rect, card: slot.card)
        inBox(context, box) {
            context.setStrokeColor(color(stroke.color))
            context.setLineWidth(width)
            context.setLineJoin(.round)
            context.addPath(slotPath(for: box, in: photo, slot: slot))
            context.strokePath()
            if slot.double {
                context.setLineWidth(width * 0.4)
                context.setStrokeColor(tint(stroke.color, 0.9))
                context.addPath(slotPath(for: box, in: inset(photo, width * 2.2), slot: slot))
                context.strokePath()
            }
        }
    }
}
