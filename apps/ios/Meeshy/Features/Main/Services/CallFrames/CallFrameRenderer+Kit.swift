import CoreGraphics
import Foundation

/// Les outils communs des peintres de cadre — le miroir de `frame-paint-kit.ts` : couleurs, réseaux,
/// périmètres, coins, densités, et les zones où un ornement de premier plan peut se poser sans
/// couvrir un visage.
nonisolated extension CGMutablePath {
    /// `arc` du canevas : angles comptés de +x vers +y, `anticlockwise` = angles décroissants
    /// (ce que CoreGraphics appelle `clockwise` dans son repère mathématique).
    func canvasArc(_ x: CGFloat, _ y: CGFloat, _ radius: CGFloat, _ start: CGFloat, _ end: CGFloat, anticlockwise: Bool = false) {
        addArc(center: CGPoint(x: x, y: y), radius: max(0, radius), startAngle: start, endAngle: end, clockwise: anticlockwise)
    }

    func addCircle(_ x: CGFloat, _ y: CGFloat, _ radius: CGFloat) {
        guard radius > 0 else { return }
        addEllipse(in: CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2))
    }

    func addRoundedRect(_ rect: CGRect, radius: CGFloat) {
        let corner = max(0, min(radius, rect.width / 2, rect.height / 2))
        guard rect.width > 0, rect.height > 0 else { return }
        guard corner > 0 else {
            addRect(rect)
            return
        }
        addRoundedRect(in: rect, cornerWidth: corner, cornerHeight: corner)
    }
}

nonisolated struct CallFrameLatticePoint {
    let x: CGFloat
    let y: CGFloat
    let row: Int
    let col: Int
}

nonisolated struct CallFramePerimeterPoint {
    let x: CGFloat
    let y: CGFloat
    let side: Int
}

nonisolated struct CallFrameCorner {
    let x: CGFloat
    let y: CGFloat
    let sx: CGFloat
    let sy: CGFloat
}

nonisolated extension CallFrameRenderer {
    static let tau = CGFloat.pi * 2

    /// La couleur avec son alpha multiplié par `alpha`.
    static func tint(_ hex: String, _ alpha: Double = 1) -> CGColor {
        color(hex, alpha: max(0, min(1, alpha)))
    }

    /// Mélange deux couleurs (0 = la première), alpha compris.
    static func mix(_ from: String, _ to: String, _ share: Double) -> CGColor {
        let a = CallFrameColor.parse(from) ?? CallFrameColor(red: 0, green: 0, blue: 0, alpha: 1)
        let b = CallFrameColor.parse(to) ?? CallFrameColor(red: 0, green: 0, blue: 0, alpha: 1)
        func at(_ x: Double, _ y: Double) -> CGFloat { CGFloat(x + (y - x) * share) }
        return CGColor(red: at(a.red, b.red), green: at(a.green, b.green), blue: at(a.blue, b.blue), alpha: at(a.alpha, b.alpha))
    }

    /// La luminance perçue (0 noir, 1 blanc) — celle de `frame-paint-kit.ts`, sans linéarisation.
    static func perceived(_ hex: String) -> Double {
        guard let color = CallFrameColor.parse(hex) else { return 0 }
        return 0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue
    }

    static func densityScale(_ density: CallFrameDensity) -> Double {
        switch density {
        case .low: return 0.5
        case .mid: return 1
        case .high: return 1.8
        }
    }

    static func count(_ base: Double, _ density: CallFrameDensity) -> Int {
        max(1, Int((base * densityScale(density)).rounded()))
    }

    static func lattice(_ size: CGSize, step: CGFloat, stagger: Bool) -> [CallFrameLatticePoint] {
        guard step > 0 else { return [] }
        let cols = Int((size.width / step).rounded(.up)) + 2
        let rows = Int((size.height / step).rounded(.up)) + 2
        return (0 ..< cols * rows).map { index in
            let row = index / cols
            let col = index % cols
            let shift: CGFloat = stagger && row % 2 == 1 ? step / 2 : 0
            return CallFrameLatticePoint(x: (CGFloat(col) - 0.5) * step + shift, y: (CGFloat(row) - 0.5) * step, row: row, col: col)
        }
    }

    static func corners(_ frame: CGRect) -> [CallFrameCorner] {
        [
            CallFrameCorner(x: frame.minX, y: frame.minY, sx: 1, sy: 1),
            CallFrameCorner(x: frame.maxX, y: frame.minY, sx: -1, sy: 1),
            CallFrameCorner(x: frame.maxX, y: frame.maxY, sx: -1, sy: -1),
            CallFrameCorner(x: frame.minX, y: frame.maxY, sx: 1, sy: -1),
        ]
    }

    /// Des points également répartis le long du périmètre de `frame`, espacés d'environ `step`.
    static func perimeter(_ frame: CGRect, step: CGFloat) -> [CallFramePerimeterPoint] {
        let sides: [(x: CGFloat, y: CGFloat, dx: CGFloat, dy: CGFloat)] = [
            (frame.minX, frame.minY, frame.width, 0),
            (frame.maxX, frame.minY, 0, frame.height),
            (frame.maxX, frame.maxY, -frame.width, 0),
            (frame.minX, frame.maxY, 0, -frame.height),
        ]
        return sides.enumerated().flatMap { index, side -> [CallFramePerimeterPoint] in
            let length = hypot(side.dx, side.dy)
            let count = max(1, Int((length / max(step, 0.0001)).rounded()))
            return (0 ..< count).map { at in
                CallFramePerimeterPoint(
                    x: side.x + side.dx * CGFloat(at) / CGFloat(count),
                    y: side.y + side.dy * CGFloat(at) / CGFloat(count),
                    side: index
                )
            }
        }
    }

    static func inset(_ rect: CGRect, _ by: CGFloat) -> CGRect {
        CGRect(x: rect.minX + by, y: rect.minY + by, width: max(0, rect.width - by * 2), height: max(0, rect.height - by * 2))
    }

    // MARK: - Scènes d'ornement

    /// Les zones où un ornement se pose : la toile entière (`back`), ou les marges et les réserves
    /// de texte seulement (`front`, § 4.4) — un ornement de premier plan ne couvre jamais un visage.
    static func ornamentZones(_ stage: CallFrameStage, front: Bool) -> [CGRect] {
        guard front else { return [stage.bounds] }
        let inner = stage.areas.inner
        let bounds = stage.bounds
        let margins = [
            CGRect(x: 0, y: 0, width: bounds.width, height: inner.minY),
            CGRect(x: 0, y: inner.maxY, width: bounds.width, height: bounds.height - inner.maxY),
            CGRect(x: 0, y: inner.minY, width: inner.minX, height: inner.height),
            CGRect(x: inner.maxX, y: inner.minY, width: bounds.width - inner.maxX, height: inner.height),
        ]
        return ([stage.areas.top, stage.areas.bottom] + margins).filter { $0.width > 0 && $0.height > 0 }
    }

    /// Un point tiré dans l'union de `zones`, pondérée par leur aire.
    static func point(in zones: [CGRect], seed: Double, draw: Int) -> CGPoint? {
        let areas = zones.map { $0.width * $0.height }
        let total = areas.reduce(0, +)
        guard total > 0 else { return nil }
        var left = rand(seed, Double(draw * 3)) * total
        var index = 0
        for (at, area) in areas.enumerated() where left >= 0 {
            index = at
            left -= area
        }
        let zone = zones[index]
        return CGPoint(x: zone.minX + rand(seed, Double(draw * 3 + 1)) * zone.width, y: zone.minY + rand(seed, Double(draw * 3 + 2)) * zone.height)
    }

    /// `count` positions tirées dans les zones ; chacune évite les textes des réserves et, au premier plan,
    /// garde `radius` de jeu avec les cases.
    static func spots(zones: [CGRect], avoid: [CGRect], text: [CGRect], front: Bool, seed: Double, count: Int, radius: (Int) -> CGFloat) -> [(point: CGPoint, r: CGFloat, draw: Int)] {
        (0 ..< max(0, count)).compactMap { draw -> (point: CGPoint, r: CGFloat, draw: Int)? in
            let r = radius(draw)
            let tries = (0 ..< 6).compactMap { point(in: zones, seed: seed, draw: draw * 7 + $0) }
            let found = tries.first { candidate in
                let around = CGRect(x: candidate.x - r, y: candidate.y - r, width: r * 2, height: r * 2)
                return !text.contains { $0.intersects(around) } && (!front || !avoid.contains { $0.intersects(around) })
            }
            return found.map { (point: $0, r: r, draw: draw) }
        }
    }

    /// Restreint la peinture aux zones de la scène (premier plan).
    static func clip(_ context: CGContext, to zones: [CGRect], front: Bool) {
        guard front else { return }
        let path = CGMutablePath()
        zones.forEach { path.addRect($0) }
        context.addPath(path)
        context.clip()
    }
}
