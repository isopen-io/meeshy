import Foundation
import CoreGraphics
import MeeshySDK

/// LES PARTICULES DE LA CÉRÉMONIE (#11177, épopée § 7) — environ 2 600 étincelles qui quittent ta lumière et tissent
/// le cercle en deux brins croisés, les poussières que Mee et Meo y sèment, une gerbe par coup, le petit nuage du flan
/// qui se pose. Tirées UNE fois par frappe, depuis le numéro de la pièce, par le générateur de la maquette (mulberry32) :
/// la même pièce tisse le même cercle sur le web et sur iOS (`apps/web/src/lib/game/choreography-mint-ceremony.ts`).
///
/// LE RENDU TIENT SES IMAGES PAR LE GROUPEMENT : une image ne peint pas 4 000 rectangles un à un, elle les range par
/// couleur et par palier d'opacité (`MintCeremonyBatch`) et peint chaque lot d'un seul trait. `stride` 2 ne peint qu'un
/// fil et un grain sur deux : la scène y passe d'elle-même quand les images tardent.
nonisolated struct MintCeremonyParticles: Sendable {

    struct Weave: Sendable {
        let s: Double, d: Double, phi0: Double, delta: Double, r0: Double, dir: Double, jitter: Double, twinkle: Double
        let big: Bool
        let tone: Int
    }

    struct Grain: Sendable {
        let s: Double, d: Double
        let origin: CGPoint, target: CGPoint, control: CGPoint
        let rho: Double, psi: Double, size: Double
        let material: MintCeremonyDustMaterial
        let tone: Int
    }

    struct Spark: Sendable {
        let strike: Int
        let x: Double, y: Double, vx: Double, vy: Double, life: Double, size: Double
        let tone: Int
    }

    struct Puff: Sendable {
        let x: Double, y: Double, vx: Double, vy: Double, life: Double
    }

    let weave: [Weave]
    let dust: [Grain]
    let bursts: [Spark]
    let puff: [Puff]

    var count: Int { weave.count + dust.count + bursts.count + puff.count }
}

/// Le générateur de la maquette (mulberry32), en arithmétique 32 bits : mêmes tirages que `Math.imul` du web.
nonisolated struct MintCeremonyRandom {
    private var state: UInt32

    init(seed: Int) {
        state = UInt32(truncatingIfNeeded: seed &* 7919 &+ 3)
    }

    mutating func next() -> Double {
        state = state &+ 0x6D2B_79F5
        var t = (state ^ (state >> 15)) &* (1 | state)
        t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
        return Double(t ^ (t >> 14)) / 4_294_967_296
    }
}

/// Une couleur de la palette de la scène, nommée par sa famille et son rang.
nonisolated enum MintCeremonyInk: Hashable, Sendable {
    case weave(Int), iris(Int), silver(Int), gold(Int), diamond(Int), spark(Int), ash
}

/// UN trait de peinture : une encre, une opacité, et ce qu'elle remplit.
nonisolated struct MintCeremonyBatch: Sendable {
    let ink: MintCeremonyInk
    let opacity: Double
    var rects: [CGRect] = []
    var circles: [CGRect] = []
    /// Additive (les lumières s'ajoutent) ou ordinaire (la poussière grise du flan).
    let additive: Bool
}

nonisolated extension MintCeremonyParticles {

    private typealias E = MintCeremonyEase
    private typealias Stage = MintCeremonyStage

    /// Les particules d'une frappe. Les instants de départ viennent des phases de la loi ; les gerbes sont posées
    /// RELATIVEMENT à leur coup, si bien qu'une réponse tardive de la passerelle n'oblige pas à les retirer.
    nonisolated static func build(_ plan: MintCeremonyPlan, seed: Int) -> MintCeremonyParticles {
        var random = MintCeremonyRandom(seed: seed)
        let weave = makeWeave(plan, &random)
        let dust = makeDust(plan, &random)
        let bursts = makeBursts(plan, &random)
        let puff = (0..<plan.particles.puff).map { m -> Puff in
            let side: Double = m % 2 == 1 ? 1 : -1
            let x = 180 + side * (30 + random.next() * 30)
            let vx = side * (40 + random.next() * 90)
            let vy = -(10 + random.next() * 40)
            return Puff(x: x, y: 541, vx: vx, vy: vy, life: 0.4 + random.next() * 0.35)
        }
        return MintCeremonyParticles(weave: weave, dust: dust, bursts: bursts, puff: puff)
    }

    private static func makeWeave(_ plan: MintCeremonyPlan, _ random: inout MintCeremonyRandom) -> [Weave] {
        let emit = plan.seconds(.emit)
        let circle = Stage.circle
        return (0..<plan.particles.weave).map { i in
            let ox = Stage.orb.x + (random.next() - 0.5) * 22
            let oy = Stage.orb.y + (random.next() - 0.5) * 22
            let s = E.lerp(emit.from, emit.to, pow(random.next(), 0.9))
            let d = 0.55 + random.next() * 0.3
            let theta = random.next() * Double.pi * 2
            let dir: Double = i % 2 == 1 ? 1 : -1
            let phi0 = atan2(oy - circle.y, ox - circle.x)
            let r0 = hypot(ox - circle.x, oy - circle.y)
            let raw = theta - phi0
            let turn = 2 * Double.pi
            let wrapped = dir > 0
                ? (raw.truncatingRemainder(dividingBy: turn) + turn).truncatingRemainder(dividingBy: turn)
                : -(((-raw).truncatingRemainder(dividingBy: turn) + turn).truncatingRemainder(dividingBy: turn))
            let delta = wrapped + dir * Double.pi * (0.3 + random.next() * 0.5)
            let jitter = (random.next() - 0.5) * 3.2
            let twinkle = random.next() * 6.28
            let big = random.next() < 0.12
            return Weave(s: s, d: d, phi0: phi0, delta: delta, r0: r0, dir: dir, jitter: jitter, twinkle: twinkle, big: big,
                         tone: Int((theta / turn) * 7) % 7)
        }
    }

    private static func makeDust(_ plan: MintCeremonyPlan, _ random: inout MintCeremonyRandom) -> [Grain] {
        guard plan.span(.dust) != nil else { return [] }
        let dust = plan.seconds(.dust)
        return plan.particles.dust.flatMap { group in
            (0..<group.count).map { j -> Grain in
                let mee = group.from == .mee
                let home = mee ? Stage.meeSow : Stage.meoSow
                let ox = Double(home.x) + (random.next() - 0.5) * 18
                let oy = Double(home.y) + (random.next() - 0.5) * 26
                let rho = (Stage.radius - 8) * sqrt(random.next())
                let psi = random.next() * Double.pi * 2
                let tx = Double(Stage.circle.x) + rho * cos(psi)
                let ty = Double(Stage.circle.y) + rho * sin(psi)
                let s = E.lerp(dust.from, dust.to, random.next())
                let d = 0.45 + random.next() * 0.3
                let cy = min(oy, ty) - 50 - random.next() * 40
                let size = 0.9 + random.next() * 0.9
                return Grain(s: s, d: d, origin: CGPoint(x: ox, y: oy), target: CGPoint(x: tx, y: ty),
                             control: CGPoint(x: (ox + tx) / 2 + (mee ? 10.0 : -10.0), y: cy),
                             rho: rho, psi: psi, size: size, material: group.material, tone: j)
            }
        }
    }

    private static func makeBursts(_ plan: MintCeremonyPlan, _ random: inout MintCeremonyRandom) -> [Spark] {
        let counts = plan.particles.bursts
        return counts.enumerated().flatMap { strike, count in
            let isFinal = strike == counts.count - 1
            let power = isFinal ? (plan.grand ? 1.5 : 1.1) : 0.55
            return (0..<count).map { b -> Spark in
                let angle = -Double.pi * (0.08 + 0.84 * random.next())
                let speed = (120 + 260 * random.next()) * power
                let x = 180 + (random.next() - 0.5) * 20
                let life = 0.45 + random.next() * 0.6
                let size = 1.2 + random.next() * 1.6
                return Spark(strike: strike, x: x, y: Double(Stage.anvilCenter.y) - Stage.anvil / 2 - 4,
                             vx: cos(angle) * speed, vy: sin(angle) * speed, life: life, size: size, tone: b)
            }
        }
    }

    // MARK: - Où est chaque particule

    /// La position d'un fil du tissage et son entrée en lumière, `nil` avant son départ. Les deux brins tournent en
    /// sens opposés et se croisent comme une tresse, puis se resserrent en anneau.
    nonisolated static func position(of w: Weave, plan: MintCeremonyPlan, sceneTime tt: Double) -> (point: CGPoint, alpha: Double)? {
        guard tt >= w.s else { return nil }
        let tighten = plan.seconds(.tighten)
        let amplitude = 9 * (1 - E.seg(tt, tighten.from, tighten.to))
        let x = (tt - w.s) / w.d
        let phi = x < 1 ? w.phi0 + w.delta * E.sine(x) : w.phi0 + w.delta + w.dir * 1.3 * (tt - w.s - w.d)
        let ring = Stage.radius + w.dir * amplitude * sin(6 * phi) + w.jitter
        let r = x < 1 ? E.lerp(w.r0, ring, E.easeOut(x)) : ring
        return (CGPoint(x: Stage.circle.x + r * cos(phi), y: Stage.circle.y + r * sin(phi)), E.seg(tt, w.s, w.s + 0.12))
    }

    /// La position d'un grain : en arc depuis l'aile qui le sème, puis il tourbillonne dans le cercle.
    nonisolated static func position(of g: Grain, sceneTime tt: Double) -> CGPoint {
        let x = (tt - g.s) / g.d
        guard x < 1 else {
            let angle = g.psi + 0.55 * (tt - g.s - g.d)
            return CGPoint(x: Stage.circle.x + g.rho * cos(angle), y: Stage.circle.y + g.rho * sin(angle))
        }
        let e = E.easeInOut(x)
        let u = 1 - e
        return CGPoint(x: u * u * g.origin.x + 2 * u * e * g.control.x + e * e * g.target.x,
                       y: u * u * g.origin.y + 2 * u * e * g.control.y + e * e * g.target.y)
    }
}

// MARK: - La peinture d'une image, rangée par traits

nonisolated extension MintCeremonyInk {
    /// Toutes les encres, dans un ordre fixe : leur rang indexe les lots d'une image.
    nonisolated static let all: [MintCeremonyInk] =
        (0..<3).map(MintCeremonyInk.weave) + (0..<7).map(MintCeremonyInk.iris) + (0..<4).map(MintCeremonyInk.silver)
        + (0..<3).map(MintCeremonyInk.gold) + (0..<2).map(MintCeremonyInk.diamond) + (0..<2).map(MintCeremonyInk.spark) + [.ash]

    nonisolated var code: Int {
        switch self {
        case .weave(let i): return i
        case .iris(let i): return 3 + i
        case .silver(let i): return 10 + i
        case .gold(let i): return 17 + i
        case .diamond(let i): return 20 + i
        case .spark(let i): return 22 + i
        case .ash: return 24
        }
    }
}

nonisolated extension MintCeremonyParticles {

    /// Les paliers d'opacité d'un lot : assez fins pour que l'œil ne voie pas de marche, assez peu pour grouper.
    nonisolated static let opacityLevels = 10

    private static func pick(_ index: Int, _ count: Int) -> Int { ((index % count) + count) % count }

    /// Ce qu'une image peint, en lots : chaque lot est une encre et une opacité, peint d'un seul trait. Rend aussi le
    /// nombre de particules peintes (le budget de la conception : au plus 4 500 à l'écran).
    nonisolated func batches(_ plan: MintCeremonyPlan, at t: Double, stride: Int = 1) -> (batches: [MintCeremonyBatch], painted: Int) {
        var painter = MintCeremonyPainter()
        let tt = plan.sceneTime(t)
        let blank = plan.seconds(.blank)
        let prism = plan.edition == .prism
        let shift = Int((t * 2).rounded(.down))
        let fadeWeave = 1 - MintCeremonyEase.seg(tt, blank.from, blank.to + 0.15)
        if fadeWeave > 0 {
            for index in Swift.stride(from: 0, to: weave.count, by: stride) {
                let w = weave[index]
                guard let at = Self.position(of: w, plan: plan, sceneTime: tt) else { continue }
                let a = at.alpha * fadeWeave * (0.62 + 0.38 * sin(t * 13 + w.twinkle))
                guard a >= 0.02 else { continue }
                let ink: MintCeremonyInk = prism ? .iris(Self.pick(w.tone + shift, 7)) : .weave(Self.pick(w.tone, 3))
                painter.rect(ink, a * 0.2, center: at.point, side: 4.8)
                painter.rect(ink, a, center: at.point, side: w.big ? 2.2 : 1.5)
                painter.painted += 1
            }
        }
        paintDust(&painter, plan: plan, t: t, tt: tt, shift: shift, stride: stride)
        for b in bursts {
            let at = Double(plan.strikes.indices.contains(b.strike) ? plan.strikes[b.strike].impactMs : Int.max) / 1000
            let dt = t - at
            guard dt >= 0, dt <= b.life else { continue }
            let a = 1 - dt / b.life
            let point = CGPoint(x: b.x + b.vx * dt, y: b.y + b.vy * dt + 300 * dt * dt)
            let ink: MintCeremonyInk = prism ? .iris(Self.pick(b.tone + shift, 7)) : .spark(Self.pick(b.tone, 2))
            painter.rect(ink, a, center: point, side: b.size)
            painter.rect(ink, a * 0.25, center: point, side: 5)
            painter.painted += 1
        }
        let landed = plan.seconds(.descent).to
        for p in puff {
            let dp = tt - landed
            guard dp >= 0, dp <= p.life else { continue }
            let radius = 2 + dp * 9
            painter.circle(0.55 * (1 - dp / p.life), center: CGPoint(x: p.x + p.vx * dp, y: p.y + p.vy * dp), radius: radius)
            painter.painted += 1
        }
        return (painter.batches, painter.painted)
    }

    private func paintDust(_ painter: inout MintCeremonyPainter, plan: MintCeremonyPlan, t: Double, tt: Double, shift: Int, stride: Int) {
        let blank = plan.seconds(.blank)
        let fadeDust = 1 - MintCeremonyEase.seg(tt, blank.from + 0.1, blank.to)
        guard fadeDust > 0 else { return }
        for index in Swift.stride(from: 0, to: dust.count, by: stride) {
            let g = dust[index]
            guard tt >= g.s else { continue }
            let a = MintCeremonyEase.seg(tt, g.s, g.s + 0.08) * fadeDust
            guard a >= 0.02 else { continue }
            let point = Self.position(of: g, sceneTime: tt)
            let ink: MintCeremonyInk
            switch g.material {
            case .diamond: ink = g.tone % 7 == 0 ? .iris(Self.pick(g.tone + shift, 7)) : .diamond(Self.pick(g.tone, 2))
            case .gold: ink = .gold(Self.pick(g.tone, 3))
            case .silver: ink = .silver(Self.pick(g.tone, 4))
            }
            painter.rect(ink, g.material == .diamond ? a : a * 0.9, center: point, side: g.size)
            if g.material == .diamond, g.tone % 9 == 0 {
                let glint = a * (0.55 + 0.45 * sin(t * 17 + Double(g.tone)))
                painter.add(ink, glint, CGRect(x: point.x - 3.2, y: point.y - 0.4, width: 6.4, height: 0.8))
                painter.add(ink, glint, CGRect(x: point.x - 0.4, y: point.y - 3.2, width: 0.8, height: 6.4))
            }
            painter.painted += 1
        }
    }
}

/// Le rangement d'une image : un lot par encre et par palier d'opacité, créé à la première particule qui le demande.
nonisolated private struct MintCeremonyPainter {
    private var slots: [Int: Int] = [:]
    private(set) var batches: [MintCeremonyBatch] = []
    var painted = 0

    private static func level(_ opacity: Double) -> Int {
        let levels = MintCeremonyParticles.opacityLevels
        return min(levels, max(1, Int((opacity * Double(levels)).rounded())))
    }

    private mutating func slot(_ ink: MintCeremonyInk, _ opacity: Double, additive: Bool) -> Int {
        let level = Self.level(opacity)
        let key = (ink.code * (MintCeremonyParticles.opacityLevels + 1) + level) * 2 + (additive ? 1 : 0)
        if let existing = slots[key] { return existing }
        batches.append(MintCeremonyBatch(ink: ink, opacity: Double(level) / Double(MintCeremonyParticles.opacityLevels), additive: additive))
        slots[key] = batches.count - 1
        return batches.count - 1
    }

    mutating func add(_ ink: MintCeremonyInk, _ opacity: Double, _ rect: CGRect) {
        guard opacity >= 0.02 else { return }
        batches[slot(ink, opacity, additive: true)].rects.append(rect)
    }

    mutating func rect(_ ink: MintCeremonyInk, _ opacity: Double, center: CGPoint, side: Double) {
        add(ink, opacity, CGRect(x: center.x - side / 2, y: center.y - side / 2, width: side, height: side))
    }

    mutating func circle(_ opacity: Double, center: CGPoint, radius: Double) {
        guard opacity >= 0.02 else { return }
        batches[slot(.ash, opacity, additive: false)].circles.append(
            CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
    }
}
