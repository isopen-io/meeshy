import SwiftUI

// MARK: - La Meesh, peinte (épopée § 6, #11176)
//
// Le MIROIR de `apps/web/src/components/game/meesh-coin.tsx` et de `meesh-coin-decor.tsx` : même ordre de pose, mêmes
// matières, mêmes encres, mêmes opacités. Le métal, la tranche, les décors du bord, le champ et son guilloché, puis la
// face — l'avers (la couronne « MEESHY · 1 MEESH », la Signature) ou le revers (l'oiseau ou les oiseaux de l'édition,
// la couronne royale, les lauriers, « Nº », l'année) —, et enfin les éclats du prisme.

extension MeeshCoinGeometry.Paint {
    var stops: [Gradient.Stop] {
        switch self {
        case .coinSilver: GamePalette.coinSilver
        case .coinGold: GamePalette.coinGold
        case .prism: GamePalette.prismStops
        case .coinSilverIn: GamePalette.coinSilverInner
        case .coinGoldIn: GamePalette.coinGoldInner
        case .coinDiamondIn: GamePalette.coinDiamondInner
        }
    }

    /// L'encre gravée sur la matière : toujours plus sombre qu'elle.
    var ink: Color {
        switch self {
        case .coinSilver, .coinSilverIn: GamePalette.coinInk
        case .coinGold, .coinGoldIn: GamePalette.coinGoldInk
        case .prism, .coinDiamondIn: GamePalette.coinDiamondInk
        }
    }

    /// Le creux (le champ) prend la lumière à contre-sens du métal.
    var isHollow: Bool { self == .coinSilverIn || self == .coinGoldIn || self == .coinDiamondIn }
}

struct MeeshCoinPainter {

    enum Side: Sendable { case obverse, reverse }

    let geometry: MeeshCoinGeometry
    let edition: MeeshCoinGeometry.Edition
    let side: Side

    var decor: [MeeshCoinGeometry.Decor] {
        side == .obverse ? edition.decor.obverse : edition.decor.reverse
    }

    var ink: Color { edition.field.ink }

    private var center: CGPoint { CGPoint(x: geometry.center, y: geometry.center) }

    private var field: MeeshCoinGeometry.Field {
        side == .obverse ? geometry.field.obverse : geometry.field.reverse
    }

    private var isRoyal: Bool { edition.flute == .iris }

    func has(_ name: MeeshCoinGeometry.Decor) -> Bool { decor.contains(name) }

    private func disc(_ radius: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
    }

    private func shading(_ stops: [Gradient.Stop], hollow: Bool = false, in box: CGRect) -> GraphicsContext.Shading {
        hollow ? GamePalette.shading(stops, from: .topTrailing, to: .bottomLeading, in: box)
               : GamePalette.diagonal(stops, in: box)
    }

    // MARK: Le flan : métal, tranche, bord, champ

    func drawBlank(in context: inout GraphicsContext) {
        let body = disc(geometry.body.radius)
        context.fill(body, with: shading(edition.metal.stops, in: body.boundingRect))
        drawFlute(in: &context)
        if has(.beads) { drawBeads(in: &context) }
        if has(.cabochons) { drawCabochons(in: &context) }
        let inner = disc(field.radius)
        context.fill(inner, with: shading(edition.field.stops, hollow: true, in: inner.boundingRect))
        context.stroke(inner, with: .color(GamePalette.glint), lineWidth: field.stroke)
        if has(.veins) { drawVeins(in: context) }
        if has(.rosette) { drawRosette(in: context) }
        if has(.sunburst) { drawSunburst(in: context) }
    }

    private func drawFlute(in context: inout GraphicsContext) {
        let flute = geometry.body.flute
        let ring = disc(flute.radius)
        switch edition.flute {
        case .rim:
            context.stroke(ring, with: .color(GamePalette.coinRim), style: StrokeStyle(lineWidth: flute.width, dash: flute.dash))
        case .ink:
            context.stroke(ring, with: .color(ink.opacity(0.7)), style: StrokeStyle(lineWidth: flute.width, dash: flute.dash))
        case .iris:
            context.stroke(ring, with: shading(GamePalette.prismStops, hollow: true, in: ring.boundingRect),
                           style: StrokeStyle(lineWidth: flute.width * 1.6, dash: flute.dash))
        }
    }

    private func drawBeads(in context: inout GraphicsContext) {
        let rings = isRoyal ? geometry.decor.beads.prism : geometry.decor.beads.gold
        var beads = Path()
        for ring in rings {
            for point in MeeshCoinLayout.beads(ring, geometry: geometry) {
                beads.addEllipse(in: CGRect(x: point.x - ring.dot, y: point.y - ring.dot, width: ring.dot * 2, height: ring.dot * 2))
            }
        }
        context.fill(beads, with: .color(isRoyal ? GamePalette.glint.opacity(0.9) : ink.opacity(0.55)))
    }

    private func drawCabochons(in context: inout GraphicsContext) {
        for cabochon in MeeshCoinLayout.cabochons(geometry) {
            let outer = MeeshCoinLayout.closed(cabochon.outer)
            context.fill(outer, with: shading(GamePalette.diamond, in: outer.boundingRect))
            context.stroke(outer, with: .color(ink), style: StrokeStyle(lineWidth: 0.4, lineJoin: .round))
            context.fill(MeeshCoinLayout.closed(cabochon.table), with: .color(GamePalette.glint.opacity(0.8)))
        }
    }

    private func drawVeins(in context: GraphicsContext) {
        let veins = geometry.decor.veins
        var local = context
        local.clip(to: disc(geometry.body.radius - 1))
        local.opacity = veins.opacity
        for d in veins.paths {
            local.stroke(GameSVGPath.make(d), with: .color(GamePalette.coinVein),
                         style: StrokeStyle(lineWidth: veins.width, lineCap: .round))
        }
    }

    private func drawRosette(in context: GraphicsContext) {
        let rosette = geometry.decor.rosette
        var local = context
        local.clip(to: disc(field.radius))
        var circles = Path()
        for c in MeeshCoinLayout.rosetteCenters(geometry) {
            circles.addEllipse(in: CGRect(x: c.x - rosette.radius, y: c.y - rosette.radius,
                                          width: rosette.radius * 2, height: rosette.radius * 2))
        }
        local.stroke(circles, with: .color(ink.opacity(rosette.opacity)), lineWidth: rosette.width)
    }

    private func drawSunburst(in context: GraphicsContext) {
        let sunburst = geometry.decor.sunburst
        var local = context
        local.clip(to: disc(field.radius))
        var rays = Path()
        for ray in MeeshCoinLayout.sunburst(fieldRadius: field.radius, geometry: geometry) {
            rays.move(to: ray.from.cgPoint)
            rays.addLine(to: ray.to.cgPoint)
        }
        local.stroke(rays, with: .color(ink.opacity(sunburst.opacity)),
                     style: StrokeStyle(lineWidth: sunburst.width, lineCap: .round))
    }

    // MARK: Les éclats du prisme

    /// `time` : le temps du scintillement, en secondes ; `nil` ⇒ immobiles (mouvement réduit, capture).
    func drawSparkles(in context: inout GraphicsContext, time: Double?) {
        let spec = geometry.decor.sparkles
        for point in spec.points {
            let tint = GamePalette.sparkles[point.tint % GamePalette.sparkles.count]
            let shape = MeeshCoinLayout.closed(MeeshCoinLayout.sparkle(point, geometry: geometry))
            guard let time else {
                context.fill(shape, with: .color(tint))
                continue
            }
            let twinkle = Self.twinkle(at: time - point.delay)
            var local = context
            local.translateBy(x: point.x, y: point.y)
            local.scaleBy(x: twinkle.scale, y: twinkle.scale)
            local.translateBy(x: -point.x, y: -point.y)
            local.fill(shape, with: .color(tint.opacity(twinkle.opacity)))
        }
    }

    /// `gameTwinkle` du web : 2,4 s, de (0,6 ; 0,35) au repos à (1,15 ; 1) au milieu, en douceur.
    static func twinkle(at time: Double) -> (scale: CGFloat, opacity: Double) {
        let period = 2.4
        let phase = (time.truncatingRemainder(dividingBy: period) + period).truncatingRemainder(dividingBy: period) / period
        let wave = (1 - cos(2 * .pi * phase)) / 2
        return (CGFloat(0.6 + 0.55 * wave), 0.35 + 0.65 * wave)
    }
}
