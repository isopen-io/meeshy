import Foundation
import CoreGraphics
import MeeshySDK

/// LA CÉRÉMONIE DE LA FRAPPE, IMAGE PAR IMAGE (#11177, épopée § 7) — ce que la scène plein écran montre à chaque
/// instant hors des particules. QUAND : la loi partagée (`GameMintCeremony`, rejouée sur les vecteurs du web). COMMENT :
/// la maquette validée (`docs/product/epopee/frappe-ceremonie.html`), dont le web est le premier miroir
/// (`apps/web/src/lib/game/choreography-mint-ceremony.ts`) — celui-ci est le second, nombre pour nombre.
///
/// Le repère est celui de la maquette : une scène de 360 × 640, mise à l'échelle de l'écran sans déformation. Le temps
/// est en SECONDES depuis le toucher. Rien ici ne touche une vue : `MintCeremonyScene` applique ces nombres.
///
/// LE REFUS REMONTE LE TEMPS : passé l'instant du refus, tout ce qui avait été tissé se rejoue à l'envers jusqu'au
/// départ des étincelles (`sceneTime`) — elles reviennent à ta lumière par le chemin qu'elles avaient pris.
nonisolated enum MintCeremonyStage {
    static let size = CGSize(width: 360, height: 640)
    static let circle = CGPoint(x: 180, y: 300)
    static let radius: Double = 84
    static let orb = CGPoint(x: 180, y: 96)
    static let form: Double = 168
    static let anvil: Double = 116
    static let anvilCenter = CGPoint(x: 180, y: 543 - 116 / 2 + 3)
    static let dieOn = CGPoint(x: 180 - 13, y: anvilCenter.y - 116 / 2 - 46)
    static let meeHome = CGPoint(x: 10, y: 244)
    static let meoHome = CGPoint(x: 258, y: 244)
    static let meeStrike = CGPoint(x: 14, y: 404)
    static let meoStrike = CGPoint(x: 252, y: 394)
    static let meeEnd = CGPoint(x: 12, y: 262)
    static let meoEnd = CGPoint(x: 256, y: 262)
    static let meeSow = CGPoint(x: 96, y: 296)
    static let meoSow = CGPoint(x: 264, y: 296)
    static let coinBox: Double = 150
    static let bird: Double = 92

    /// Les angles des marteaux, en degrés : au repos, levé, à l'impact (Meo, puis Mee, en miroir).
    static let rest: Double = 12, wind: Double = 62, hit: Double = -54
    static let restMee: Double = -12, windMee: Double = -62, hitMee: Double = 50

    /// Le contenant de l'Héritage, s'il n'est pas à l'écran : la pièce file vers le haut de la scène.
    static let defaultTarget = MintCeremonyTarget(x: 180, y: 40, scale: 0.3)
}

/// Où la pièce file à la fin, dans le repère de la scène, et son échelle (1 = 150 unités).
nonisolated struct MintCeremonyTarget: Equatable, Sendable {
    let x: Double
    let y: Double
    let scale: Double
}

// MARK: - Les courbes

nonisolated enum MintCeremonyEase {
    static func clamp(_ x: Double) -> Double { x < 0 ? 0 : (x > 1 ? 1 : x) }

    /// La progression de `t` entre `a` et `b` ; une phase qui ne commence jamais (`infinity`) reste à 0.
    static func seg(_ t: Double, _ a: Double, _ b: Double) -> Double {
        if a == .infinity { return 0 }
        if b <= a { return t >= a ? 1 : 0 }
        return clamp((t - a) / (b - a))
    }

    static func lerp(_ a: Double, _ b: Double, _ x: Double) -> Double { a + (b - a) * x }
    static func easeOut(_ x: Double) -> Double { 1 - pow(1 - x, 3) }
    static func easeIn(_ x: Double) -> Double { x * x * x }
    static func easeInOut(_ x: Double) -> Double { x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2 }
    static func sine(_ x: Double) -> Double { -(cos(Double.pi * x) - 1) / 2 }

    static func bump(_ t: Double, at: Double, length: Double) -> Double {
        let x = (t - at) / length
        return x < 0 || x > 1 ? 0 : sin(Double.pi * x)
    }
}

/// Une phase de la loi, en secondes ; une phase absente ne commence jamais.
nonisolated struct MintCeremonySeconds: Equatable, Sendable {
    let from: Double
    let to: Double

    static let never = MintCeremonySeconds(from: .infinity, to: .infinity)

    init(from: Double, to: Double) {
        self.from = from
        self.to = to
    }

    init(_ span: MintCeremonySpan?) {
        guard let span else {
            self = .never
            return
        }
        self.init(from: Double(span.fromMs) / 1000, to: Double(span.toMs) / 1000)
    }
}

extension MintCeremonyPlan {
    nonisolated func seconds(_ phase: MintCeremonyPhase) -> MintCeremonySeconds { MintCeremonySeconds(span(phase)) }

    /// LE TEMPS DE LA SCÈNE — égal au temps du toucher, sauf après un refus : la scène remonte alors jusqu'au départ
    /// des étincelles, à la vitesse que la loi fixe (`rewind`), et reste là.
    nonisolated func sceneTime(_ t: Double) -> Double {
        guard let refusal else { return t }
        let at = Double(refusal.atMs) / 1000
        if t <= at { return t }
        let length = Double(refusal.rewind.toMs - refusal.rewind.fromMs) / 1000
        let back = Double(refusal.rewindToMs) / 1000
        if length <= 0 { return back }
        return max(back - 0.001, at - ((t - at) * (at - back)) / length)
    }
}

// MARK: - L'image d'un instant

nonisolated enum MintCeremonyPose: Equatable, Sendable {
    case rest, party, courage
}

nonisolated struct MintCeremonyFrame: Equatable, Sendable {
    struct Actor: Equatable, Sendable {
        let x: Double, y: Double, rotate: Double, scale: Double
        let pose: MintCeremonyPose
    }
    struct Hammer: Equatable, Sendable {
        let x: Double, y: Double, angle: Double, opacity: Double
    }
    struct Die: Equatable, Sendable {
        let x: Double, y: Double, squash: Double, opacity: Double
    }
    /// La pièce : centre, échelle (1 = 150 unités), écrasement, rotation (degrés), et la gravure (0 flan, 1 avers frappé).
    struct Coin: Equatable, Sendable {
        let x: Double, y: Double, scale: Double, squash: Double, rotateY: Double, opacity: Double, engraved: Double
    }
    struct Glow: Equatable, Sendable {
        let x: Double, y: Double, scale: Double, opacity: Double
    }
    struct Ring: Equatable, Sendable {
        let scale: Double, opacity: Double
    }
    struct Tchak: Equatable, Sendable {
        let opacity: Double, scale: Double, isFinal: Bool
    }
    struct Rays: Equatable, Sendable {
        let opacity: Double, rotate: Double, scale: Double
    }
    struct Shadow: Equatable, Sendable {
        let opacity: Double, scale: Double
    }
    struct Glory: Equatable, Sendable {
        let opacity: Double, rise: Double
    }

    let backdrop: Double
    let shake: CGPoint
    let orb: Double
    let mee: Actor
    let meo: Actor
    let die: Die
    let hammerMeo: Hammer
    let hammerMee: Hammer
    let coin: Coin
    let glow: Glow
    let flash: Double
    let ring: Ring
    let tchak: Tchak
    let rays: Rays
    let sign: Double
    let say: Double
    let shadow: Shadow
    let glory: Glory
}

/// L'instant, et ce que la loi en dit, lus une fois par image et partagés par les calques.
nonisolated private struct MintCeremonyMoment {
    struct Blow {
        let at: Double
        let impact: Double
        let mee: Bool
    }

    let plan: MintCeremonyPlan
    let t: Double
    /// Le temps de la scène : `t`, remonté après un refus.
    let tt: Double
    let blows: [Blow]
    let lastImpact: Double
    let exitFade: Double

    init(plan: MintCeremonyPlan, t: Double) {
        self.plan = plan
        self.t = t
        tt = plan.sceneTime(t)
        blows = plan.strikes.map { Blow(at: Double($0.atMs) / 1000, impact: Double($0.impactMs) / 1000, mee: $0.hitters.contains(.mee)) }
        lastImpact = blows.last?.impact ?? .infinity
        let flight = plan.seconds(.flight)
        let end = Double(plan.endMs) / 1000
        exitFade = plan.refusal == nil ? 1 - MintCeremonyEase.seg(t, flight.from, flight.to) : 1 - MintCeremonyEase.seg(t, end - 0.45, end)
    }

    func p(_ phase: MintCeremonyPhase) -> MintCeremonySeconds { plan.seconds(phase) }

    func power(_ index: Int) -> Double {
        index == blows.count - 1 ? (plan.grand ? 1.6 : 1.1) : 0.55
    }
}

nonisolated enum MintCeremonyChoreography {

    private typealias E = MintCeremonyEase
    private typealias Stage = MintCeremonyStage

    /// L'IMAGE DE L'INSTANT `t` (en secondes depuis le toucher). Tant que la passerelle n'a pas répondu, l'hôte passe
    /// un plan dont les coups sont encore devant : Meo garde le marteau levé.
    static func frame(_ plan: MintCeremonyPlan, at t: Double, target: MintCeremonyTarget = Stage.defaultTarget) -> MintCeremonyFrame {
        if plan.mode == .reduced { return reducedFrame(plan, at: t) }
        let moment = MintCeremonyMoment(plan: plan, t: t)
        let actors = actorsOf(moment)
        let coin = coinOf(moment, target: target)
        let hammers = hammersOf(moment, mee: actors.mee, meo: actors.meo)
        let impacts = impactsOf(moment)
        let emit = moment.p(.emit)
        let shining = t > emit.from && t < (plan.refusal == nil ? emit.to + 0.4 : Double(plan.endMs) / 1000)
        let blank = moment.p(.blank)
        let descent = moment.p(.descent)
        let flight = moment.p(.flight)
        let open = moment.p(.open)
        return MintCeremonyFrame(
            backdrop: E.seg(t, open.from, open.to) * moment.exitFade,
            shake: shakeOf(moment),
            orb: 1 + 0.18 * sin(t * 9) * (shining ? 1 : 0),
            mee: actors.mee,
            meo: actors.meo,
            die: dieOf(moment, mee: actors.mee),
            hammerMeo: hammers.meo,
            hammerMee: hammers.mee,
            coin: coin,
            glow: MintCeremonyFrame.Glow(
                x: coin.x, y: coin.y, scale: 0.6 + 0.5 * coin.scale,
                opacity: 0.35 * E.seg(moment.tt, blank.from, blank.to) * (1 - E.seg(moment.tt, descent.from, descent.to))
                    + 0.9 * E.seg(t, moment.lastImpact, moment.lastImpact + 0.3) * (1 - E.seg(t, flight.from, flight.from + 0.3))
            ),
            flash: impacts.flash,
            ring: impacts.ring,
            tchak: impacts.tchak,
            rays: raysOf(moment),
            sign: E.seg(t, moment.p(.ancestors).from, moment.p(.ancestors).to) * moment.exitFade,
            say: sayOf(moment),
            shadow: shadowOf(moment),
            glory: gloryOf(moment)
        )
    }

    private static func reducedFrame(_ plan: MintCeremonyPlan, at t: Double) -> MintCeremonyFrame {
        let open = plan.seconds(.open)
        let reveal = plan.seconds(.reveal)
        let end = Double(plan.endMs) / 1000
        let appear = E.seg(t, reveal.from, reveal.to)
        let leave = 1 - E.seg(t, end - 0.26, end)
        func actor(_ home: CGPoint) -> MintCeremonyFrame.Actor {
            MintCeremonyFrame.Actor(x: home.x, y: home.y + 18, rotate: 0, scale: 1, pose: appear > 0 ? .party : .rest)
        }
        return MintCeremonyFrame(
            backdrop: E.seg(t, open.from, open.to) * leave,
            shake: .zero, orb: 1,
            mee: actor(Stage.meeEnd), meo: actor(Stage.meoEnd),
            die: MintCeremonyFrame.Die(x: Stage.dieOn.x, y: Stage.dieOn.y, squash: 1, opacity: 0),
            hammerMeo: MintCeremonyFrame.Hammer(x: 0, y: 0, angle: Stage.rest, opacity: 0),
            hammerMee: MintCeremonyFrame.Hammer(x: 0, y: 0, angle: Stage.restMee, opacity: 0),
            coin: MintCeremonyFrame.Coin(x: Stage.circle.x, y: Stage.circle.y, scale: 1, squash: 1, rotateY: 180,
                                         opacity: appear * leave, engraved: 1),
            glow: MintCeremonyFrame.Glow(x: Stage.circle.x, y: Stage.circle.y, scale: 1, opacity: 0.6 * appear),
            flash: 0,
            ring: MintCeremonyFrame.Ring(scale: 0, opacity: 0),
            tchak: MintCeremonyFrame.Tchak(opacity: 0, scale: 1, isFinal: true),
            rays: MintCeremonyFrame.Rays(opacity: 0, rotate: 0, scale: 1),
            sign: 0,
            say: E.seg(t, reveal.to, reveal.to + 0.3),
            shadow: MintCeremonyFrame.Shadow(opacity: 0, scale: 1),
            glory: MintCeremonyFrame.Glory(opacity: 0, rise: 0)
        )
    }

    /// Le tremblement : chaque coup, plus fort au dernier, et le flan qui se pose.
    private static func shakeOf(_ m: MintCeremonyMoment) -> CGPoint {
        var shake = m.blows.enumerated().reduce(CGPoint.zero) { acc, item in
            let x = m.t - item.element.impact
            guard x >= 0, x < 0.26 else { return acc }
            let power = m.power(item.offset)
            return CGPoint(x: acc.x + power * 4.5 * (1 - x / 0.26) * sin(x * 95), y: acc.y + power * 2 * (1 - x / 0.26) * cos(x * 80))
        }
        let landed = m.tt - m.p(.descent).to
        if landed >= 0, landed < 0.18 { shake.y += 2.2 * (1 - landed / 0.18) * sin(landed * 120) }
        return shake
    }

    /// Mee et Meo : ils arrivent des côtés, sèment la poussière, prennent place à l'enclume, reculent pour la fête.
    private static func actorsOf(_ m: MintCeremonyMoment) -> (mee: MintCeremonyFrame.Actor, meo: MintCeremonyFrame.Actor) {
        let enter = E.easeOut(E.seg(m.t, 0.05, 0.6))
        let move = E.easeInOut(E.seg(m.tt, m.p(.places).from, m.p(.places).to))
        let back = E.easeInOut(E.seg(m.t, m.p(.dieOff).to, m.p(.reveal).to))
        func path(_ from: Double, _ home: CGPoint, _ strike: CGPoint, _ rest: CGPoint) -> CGPoint {
            CGPoint(x: E.lerp(E.lerp(E.lerp(from, home.x, enter), strike.x, move), rest.x, back),
                    y: E.lerp(E.lerp(home.y, strike.y, move), rest.y, back))
        }
        let mee = path(-110, Stage.meeHome, Stage.meeStrike, Stage.meeEnd)
        let meo = path(380, Stage.meoHome, Stage.meoStrike, Stage.meoEnd)
        let dust = m.p(.dust)
        let sowing = m.plan.refusal == nil && m.t > dust.from - 0.1 && m.t < dust.to + 0.3 ? sin(m.t * 24) * 7 : 0
        let celebrate = m.p(.celebrate).from
        let party = m.t >= celebrate
        let courage = m.plan.refusal.map { m.t >= Double($0.sayMs) / 1000 } ?? false
        return (
            MintCeremonyFrame.Actor(x: mee.x, y: mee.y + sin(m.t * 4.3) * 3, rotate: sowing,
                                    scale: 1 + 0.14 * E.bump(m.t, at: celebrate, length: 0.38),
                                    pose: courage ? .courage : (party ? .party : .rest)),
            MintCeremonyFrame.Actor(x: meo.x, y: meo.y + sin(m.t * 4.3 + 1.7) * 3, rotate: -sowing,
                                    scale: 1 + 0.14 * E.bump(m.t, at: celebrate + 0.12, length: 0.38),
                                    pose: party ? .party : .rest)
        )
    }

    /// Le coin : Mee le tient sous l'aile, le pose sur le flan, il s'écrase un peu à chaque coup, puis Mee le retire.
    private static func dieOf(_ m: MintCeremonyMoment, mee: MintCeremonyFrame.Actor) -> MintCeremonyFrame.Die {
        let wing = CGPoint(x: mee.x + 72, y: mee.y + 42)
        let die = m.p(.die)
        let dieOff = m.p(.dieOff)
        let place = E.easeInOut(E.seg(m.tt, die.from, die.to))
        let lift = E.easeInOut(E.seg(m.t, dieOff.from, dieOff.to))
        return MintCeremonyFrame.Die(
            x: E.lerp(E.lerp(wing.x, Stage.dieOn.x, place), wing.x, lift),
            y: E.lerp(E.lerp(wing.y, Stage.dieOn.y, place), wing.y, lift),
            squash: m.blows.reduce(1) { $0 - 0.1 * E.bump(m.t, at: $1.impact, length: 0.1) },
            opacity: E.seg(m.tt, die.from - 0.2, die.from) * (1 - E.seg(m.t, dieOff.to, dieOff.to + 0.2))
        )
    }

    /// L'angle d'un marteau qui frappe à `at` : il tombe, rebondit, puis se relève (ou se repose au dernier coup).
    private static func swing(_ t: Double, at: Double, last: Bool, wind: Double, hit: Double, rest: Double) -> Double {
        if t < at + 0.15 { return E.lerp(wind, hit, E.easeIn(E.seg(t, at, at + 0.09))) }
        return E.lerp(hit, last ? rest : wind, E.easeInOut(E.seg(t, at + 0.15, at + (last ? 0.55 : 0.42))))
    }

    /// Les marteaux : Meo lève le sien, le GARDE levé tant que la passerelle n'a pas répondu, frappe ; au prisme, Mee
    /// prend le sien pour le dernier coup.
    private static func hammersOf(_ m: MintCeremonyMoment, mee: MintCeremonyFrame.Actor,
                                  meo: MintCeremonyFrame.Actor) -> (meo: MintCeremonyFrame.Hammer, mee: MintCeremonyFrame.Hammer) {
        let windup = m.p(.windup)
        let places = m.p(.places)
        let firstStrike = m.blows.first?.at ?? .infinity
        let waiting = m.plan.refusal == nil && m.t > windup.to && m.t < firstStrike && firstStrike - windup.to > 0.06
        let raised = waiting ? Stage.wind + sin(m.t * 30) * 2.5 : E.lerp(Stage.rest, Stage.wind, E.easeInOut(E.seg(m.tt, windup.from, windup.to)))
        let angle = m.blows.enumerated().reduce(raised) { current, item in
            m.t < item.element.at ? current : swing(m.t, at: item.element.at, last: item.offset == m.blows.count - 1,
                                                    wind: Stage.wind, hit: Stage.hit, rest: Stage.rest)
        }
        let away = 1 - E.seg(m.t, m.lastImpact + 0.45, m.lastImpact + 0.75)
        let together = m.blows.last?.mee == true ? m.blows.last : nil
        let angleMee: Double = {
            guard let together else { return Stage.restMee }
            if m.t < together.at {
                return E.lerp(Stage.restMee, Stage.windMee, E.easeInOut(E.seg(m.t, together.at - 0.45, together.at - 0.1)))
            }
            return swing(m.t, at: together.at, last: true, wind: Stage.windMee, hit: Stage.hitMee, rest: Stage.restMee)
        }()
        return (
            MintCeremonyFrame.Hammer(x: meo.x + 8, y: meo.y - 46, angle: angle, opacity: E.seg(m.tt, places.from, places.to) * away),
            MintCeremonyFrame.Hammer(x: mee.x + 76, y: mee.y - 46, angle: angleMee,
                                     opacity: together.map { E.seg(m.t, $0.at - 0.6, $0.at - 0.4) * away } ?? 0)
        )
    }

    /// La pièce : le flan se fige dans le cercle, descend sur l'enclume, prend la gravure au coup, se lève en montrant
    /// son revers, puis file dans l'Héritage.
    private static func coinOf(_ m: MintCeremonyMoment, target: MintCeremonyTarget) -> MintCeremonyFrame.Coin {
        let descent = m.p(.descent)
        let reveal = m.p(.reveal)
        let flight = m.p(.flight)
        let blank = m.p(.blank)
        let engrave = m.p(.engrave)
        let descend = E.seg(m.tt, descent.from, descent.to)
        let rv = E.seg(m.t, reveal.from, reveal.to)
        let ex = E.seg(m.t, flight.from, flight.to)
        let rising = E.easeOut(rv)
        let flying = E.easeInOut(ex)
        let restY = rv > 0 ? E.lerp(Stage.anvilCenter.y, Stage.circle.y, rising) : E.lerp(Stage.circle.y, Stage.anvilCenter.y, E.easeIn(descend))
        let restScale = rv > 0
            ? E.lerp(Stage.anvil / Stage.coinBox, 1, rising)
            : E.lerp(Stage.form / Stage.coinBox, Stage.anvil / Stage.coinBox, E.easeInOut(descend))
        let flown = ex > 0
        return MintCeremonyFrame.Coin(
            x: flown ? E.lerp(Stage.circle.x, target.x, flying) : Stage.circle.x,
            y: flown ? E.lerp(Stage.circle.y, target.y, flying) - 70 * sin(Double.pi * flying) : restY,
            scale: flown ? E.lerp(1, target.scale, flying) : restScale,
            squash: m.blows.reduce(1 - 0.05 * E.bump(m.tt, at: descent.to, length: 0.12)) { $0 - 0.07 * E.bump(m.t, at: $1.impact, length: 0.1) },
            rotateY: flown ? 540 + 180 * flying : 540 * E.easeInOut(rv),
            opacity: E.seg(m.tt, blank.from, blank.to) * (1 - E.seg(m.t, flight.to - 0.05, flight.to)),
            engraved: E.seg(m.t, engrave.from, engrave.to)
        )
    }

    /// Ce que chaque coup allume : l'éclair, l'onde, le « tchak » (le grand au dernier coup de l'or et du prisme).
    private static func impactsOf(_ m: MintCeremonyMoment) -> (flash: Double, ring: MintCeremonyFrame.Ring, tchak: MintCeremonyFrame.Tchak) {
        var flash = 0.0
        var ring = MintCeremonyFrame.Ring(scale: 0.3, opacity: 0)
        var tchak = MintCeremonyFrame.Tchak(opacity: 0, scale: 1, isFinal: false)
        for (index, blow) in m.blows.enumerated() {
            let x = m.t - blow.impact
            let isFinal = index == m.blows.count - 1
            if x >= 0, x < 0.32 {
                flash = min(0.95, flash + (isFinal ? (m.plan.grand ? 1 : 0.85) : 0.45) * (1 - x / 0.32))
            }
            guard x >= 0, x < 0.7 else { continue }
            let power = m.power(index)
            ring = MintCeremonyFrame.Ring(scale: 0.3 + (2 + 1.6 * power) * E.easeOut(min(1, x / 0.55)), opacity: max(0, 0.95 * (1 - x / 0.55)))
            tchak = MintCeremonyFrame.Tchak(opacity: x < 0.08 ? x / 0.08 : max(0, 1 - (x - 0.08) / 0.6),
                                            scale: 0.8 + 0.35 * power * E.easeOut(min(1, x / 0.2)), isFinal: isFinal && m.plan.grand)
        }
        return (flash, ring, tchak)
    }

    private static func raysOf(_ m: MintCeremonyMoment) -> MintCeremonyFrame.Rays {
        guard m.plan.grand else { return MintCeremonyFrame.Rays(opacity: 0, rotate: 0, scale: 1) }
        return MintCeremonyFrame.Rays(opacity: 0.95 * E.seg(m.t, m.lastImpact, m.lastImpact + 0.5) * m.exitFade, rotate: m.t * 16,
                                      scale: E.lerp(0.5, 1, E.seg(m.t, m.lastImpact, m.lastImpact + 0.8)))
    }

    /// La phrase de Mee : à la fête, ou, au refus, ce qui bloque.
    private static func sayOf(_ m: MintCeremonyMoment) -> Double {
        guard let refusal = m.plan.refusal else {
            let celebrate = m.p(.celebrate).from
            let flight = m.p(.flight)
            return E.seg(m.t, celebrate, celebrate + 0.3) * (1 - E.seg(m.t, flight.from, flight.to))
        }
        let say = Double(refusal.sayMs) / 1000
        return E.seg(m.t, say, say + 0.3) * m.exitFade
    }

    /// L'Ombre du refus voile le cercle, puis se retire.
    private static func shadowOf(_ m: MintCeremonyMoment) -> MintCeremonyFrame.Shadow {
        guard let refusal = m.plan.refusal else { return MintCeremonyFrame.Shadow(opacity: 0, scale: 1) }
        let inFrom = Double(refusal.shadowIn.fromMs) / 1000
        let inTo = Double(refusal.shadowIn.toMs) / 1000
        return MintCeremonyFrame.Shadow(
            opacity: 0.95 * E.seg(m.t, inFrom, inFrom + 0.3)
                * (1 - E.seg(m.t, Double(refusal.shadowOut.fromMs) / 1000, Double(refusal.shadowOut.toMs) / 1000)),
            scale: E.lerp(0.3, 1.25, E.easeOut(E.seg(m.t, inFrom, inTo)))
        )
    }

    private static func gloryOf(_ m: MintCeremonyMoment) -> MintCeremonyFrame.Glory {
        let glory = m.p(.glory)
        let g = E.seg(m.t, glory.from, glory.to)
        return MintCeremonyFrame.Glory(opacity: g > 0 && g < 1 ? sin(Double.pi * g) : 0, rise: E.easeInOut(g))
    }
}
