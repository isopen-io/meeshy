import Foundation

// MARK: - La cérémonie de la frappe (#11177, épopée § 7)
//
// MIROIR de `packages/shared/utils/game/mint-ceremony.ts`, rejoué cas pour cas sur
// `packages/shared/fixtures/reading-modes/mint-ceremony.vectors.json` : sur divergence, c'est le TS qui a raison.
//
// « Des milliers d'étincelles de ma lumière tissent un cercle », Mee et Meo y sèment la poussière qui forme le flan,
// Mee pose le coin, Meo frappe — la frappe arrive EN DERNIER. Cette loi dit QUAND chaque chose arrive, pour une
// édition, un mode (normal, réduit, refus) et l'instant où la passerelle a répondu. Elle ne touche à aucune règle du
// jeu : ni prix, ni numéro, ni gloire. Les instants sont des millisecondes entières depuis le toucher : la scène part
// AU TOUCHER, et si la passerelle n'a pas répondu quand Meo a levé le marteau, il le garde levé jusqu'à sa réponse.

public enum MintCeremonyMode: String, CaseIterable, Sendable, Hashable {
    case normal
    case reduced
    case refused
}

public struct MintCeremonySpan: Equatable, Sendable, Hashable {
    public let fromMs: Int
    public let toMs: Int

    public init(fromMs: Int, toMs: Int) {
        self.fromMs = fromMs
        self.toMs = toMs
    }
}

/// Les phases, dans l'ordre du récit (voir la loi TS pour le sens de chacune).
public enum MintCeremonyPhase: String, CaseIterable, Sendable, Hashable {
    case open, emit, braid, tighten, dust, blank, descent, places, die, windup, hold, strikes, engrave
    case dieOff, reveal, ancestors, celebrate, flight, glory
}

public enum MintCeremonyHitter: String, Sendable, Hashable {
    case mee
    case meo
}

/// Un coup : le marteau part à `atMs`, touche le coin à `impactMs`. Le dernier (`isFinal`) vibre le plus fort.
public struct MintCeremonyStrike: Equatable, Sendable {
    public let atMs: Int
    public let impactMs: Int
    public let hitters: [MintCeremonyHitter]
    public let isFinal: Bool
}

public enum MintCeremonyDustMaterial: String, Sendable, Hashable {
    case silver
    case gold
    case diamond
}

/// Une poussière : qui la sème, de quelle matière, combien de grains.
public struct MintCeremonyDust: Equatable, Sendable {
    public let from: MintCeremonyHitter
    public let material: MintCeremonyDustMaterial
    public let count: Int
}

/// Combien de particules : le tissage, les poussières, une gerbe par coup, le petit nuage de la descente.
public struct MintCeremonyParticles: Equatable, Sendable {
    public let weave: Int
    public let dust: [MintCeremonyDust]
    public let bursts: [Int]
    public let puff: Int
}

/// Le refus : l'Ombre voile le cercle, la scène remonte jusqu'au départ des étincelles, Mee dit ce qui bloque.
public struct MintCeremonyRefusal: Equatable, Sendable {
    public let atMs: Int
    public let rewind: MintCeremonySpan
    public let rewindToMs: Int
    public let shadowIn: MintCeremonySpan
    public let shadowOut: MintCeremonySpan
    public let sayMs: Int
}

public struct MintCeremonyPlan: Equatable, Sendable {
    public let edition: MeeshEdition
    public let mode: MintCeremonyMode
    /// L'or et le prisme : trois coups, les rayons et les aïeux.
    public let grand: Bool
    public let particles: MintCeremonyParticles
    public let phases: [MintCeremonyPhase: MintCeremonySpan]
    public let strikes: [MintCeremonyStrike]
    public let refusal: MintCeremonyRefusal?
    public let endMs: Int

    /// La phase, `nil` quand elle n'a pas lieu dans ce déroulé.
    public func span(_ phase: MintCeremonyPhase) -> MintCeremonySpan? { phases[phase] }
}

/// Ce que Mee dit d'un refus : l'Ombre, l'Héritage qui attend un rang, la lumière qui manque, le réseau, le reste.
public enum MintRefusalReason: String, CaseIterable, Sendable, Hashable {
    case shadow, locked, light, offline, other
}

public enum GameMintCeremony {

    /// L'instant où le marteau peut tomber si la passerelle a déjà répondu.
    public static let strikeReadyMs = 4800
    /// Au plus autant de particules à l'écran en même temps (tissage et poussières ; les gerbes viennent après).
    public static let particleBudget = 4500
    /// Le code qu'un client donne à une frappe que le réseau n'a pas portée.
    public static let networkRefusalCode = "NETWORK"

    private static func span(_ fromMs: Int, _ toMs: Int) -> MintCeremonySpan { MintCeremonySpan(fromMs: fromMs, toMs: toMs) }

    private static let open = span(0, 400)
    private static let emit = span(350, 1400)
    private static let braid = span(350, 2200)
    private static let tighten = span(2000, 2550)
    private static let dust = span(2200, 2900)
    private static let blank = span(3300, 3800)
    private static let descent = span(3800, 4200)
    private static let places = span(3950, 4300)
    private static let die = span(4150, 4450)
    private static let windup = span(4400, 4750)

    private static let impactAfterMs = 90
    private static let engraveMs = 180
    private static let weave = 2600
    private static let puff = 70

    private static let strikeOffsets: [MeeshEdition: [Int]] = [.silver: [0], .gold: [0, 580, 1250], .prism: [0, 580, 1300]]

    private static let dustOf: [MeeshEdition: [MintCeremonyDust]] = [
        .silver: [MintCeremonyDust(from: .mee, material: .silver, count: 1500), MintCeremonyDust(from: .meo, material: .gold, count: 170)],
        .gold: [MintCeremonyDust(from: .meo, material: .gold, count: 1500)],
        .prism: [MintCeremonyDust(from: .meo, material: .gold, count: 900), MintCeremonyDust(from: .mee, material: .diamond, count: 950)],
    ]

    /// Le premier refus se dit quand les étincelles ont commencé à tisser : la lumière part, puis l'Ombre la ramène.
    private static let refusalEarliestMs = 1500
    private static let rewindMaxMs = 1200
    private static let reducedFadeMs = 260
    private static let reducedHoldMs = 2600

    private static let refusalReasons: [String: MintRefusalReason] = [
        "MINT_BLOCKED_BY_DEBT": .shadow,
        "TREASURY_LOCKED": .locked,
        "INSUFFICIENT_POINTS": .light,
        networkRefusalCode: .offline,
    ]

    /// `Math.round` du TS : la moitié monte. Les comptes sont positifs, donc `.toNearestOrAwayFromZero` y est égal.
    private static func half(_ count: Int, _ modest: Bool) -> Int {
        modest ? Int((Double(count) / 2).rounded(.toNearestOrAwayFromZero)) : count
    }

    private static func sanitize(_ value: Double?) -> Int {
        guard let value, value.isFinite else { return 0 }
        return max(0, Int((value + 0.5).rounded(.down)))
    }

    private static func isGrand(_ edition: MeeshEdition) -> Bool { edition != .silver }

    /// Les poussières suivent le DESSIN (`look`, #11483) ; les gerbes, la LOI (`edition`).
    private static func particles(_ edition: MeeshEdition, look: MeeshEdition, strikes: Int, modest: Bool) -> MintCeremonyParticles {
        let finalBurst = isGrand(edition) ? 420 : 320
        return MintCeremonyParticles(
            weave: half(weave, modest),
            dust: (dustOf[look] ?? []).map { MintCeremonyDust(from: $0.from, material: $0.material, count: half($0.count, modest)) },
            bursts: (0..<strikes).map { half($0 == strikes - 1 ? finalBurst : 120, modest) },
            puff: half(puff, modest)
        )
    }

    private static func strikes(_ edition: MeeshEdition, firstMs: Int) -> [MintCeremonyStrike] {
        let offsets = strikeOffsets[edition] ?? [0]
        return offsets.enumerated().map { index, offset in
            let isFinal = index == offsets.count - 1
            return MintCeremonyStrike(
                atMs: firstMs + offset,
                impactMs: firstMs + offset + impactAfterMs,
                hitters: isFinal && edition == .prism ? [.mee, .meo] : [.meo],
                isFinal: isFinal
            )
        }
    }

    private static func normalPlan(_ edition: MeeshEdition, look: MeeshEdition, answeredAtMs: Int, modest: Bool) -> MintCeremonyPlan {
        let grand = isGrand(edition)
        let firstStrike = max(strikeReadyMs, answeredAtMs)
        let blows = strikes(edition, firstMs: firstStrike)
        let first = blows.first?.impactMs ?? firstStrike
        let last = blows.last?.impactMs ?? firstStrike
        let reveal = span(last + 250, last + (grand ? 1500 : 1050))
        let flightFrom = reveal.toMs + (grand ? 1200 : 650)
        let flight = span(flightFrom, flightFrom + 650)
        let glory = span(flight.toMs - 200, flight.toMs + 650)
        var phases: [MintCeremonyPhase: MintCeremonySpan] = [
            .open: open, .emit: emit, .braid: braid, .tighten: tighten, .dust: dust, .blank: blank, .descent: descent,
            .places: places, .die: die, .windup: windup,
            .hold: span(windup.toMs, firstStrike),
            .strikes: span(firstStrike, last),
            .engrave: span(first, first + engraveMs),
            .dieOff: span(last + 120, last + 420),
            .reveal: reveal,
            .celebrate: span(reveal.toMs, flight.fromMs),
            .flight: flight,
            .glory: glory,
        ]
        if grand { phases[.ancestors] = span(last + 500, last + 1000) }
        return MintCeremonyPlan(edition: edition, mode: .normal, grand: grand,
                                particles: particles(edition, look: look, strikes: blows.count, modest: modest),
                                phases: phases, strikes: blows, refusal: nil, endMs: glory.toMs + 150)
    }

    /// Les phases que le refus laisse : celles qui avaient commencé, jamais la frappe ni ce qui la suit.
    private static let refusedAway: Set<MintCeremonyPhase> = [.strikes, .engrave, .dieOff, .reveal, .ancestors, .celebrate, .flight, .glory]

    private static func refusedPlan(_ edition: MeeshEdition, look: MeeshEdition, answeredAtMs: Int, modest: Bool) -> MintCeremonyPlan {
        let atMs = max(refusalEarliestMs, answeredAtMs)
        let woven = normalPlan(edition, look: look, answeredAtMs: max(atMs, strikeReadyMs), modest: modest)
        let rewind = span(atMs, atMs + min(rewindMaxMs, atMs - emit.fromMs))
        let sayMs = atMs + 1300
        let phases = woven.phases.filter { phase, span in span.fromMs < atMs && !refusedAway.contains(phase) }
        let particles = MintCeremonyParticles(weave: woven.particles.weave, dust: woven.particles.dust, bursts: [], puff: woven.particles.puff)
        return MintCeremonyPlan(
            edition: edition, mode: .refused, grand: woven.grand, particles: particles, phases: phases, strikes: [],
            refusal: MintCeremonyRefusal(atMs: atMs, rewind: rewind, rewindToMs: emit.fromMs, shadowIn: span(atMs, atMs + 700),
                                         shadowOut: span(atMs + 1650, atMs + 2250), sayMs: sayMs),
            endMs: sayMs + 2500
        )
    }

    private static func reducedPlan(_ edition: MeeshEdition, answeredAtMs: Int) -> MintCeremonyPlan {
        let reveal = span(answeredAtMs, answeredAtMs + reducedFadeMs)
        let endMs = reveal.fromMs + reducedHoldMs
        return MintCeremonyPlan(
            edition: edition, mode: .reduced, grand: isGrand(edition),
            particles: MintCeremonyParticles(weave: 0, dust: [], bursts: [], puff: 0),
            phases: [.open: span(0, reducedFadeMs), .reveal: reveal, .celebrate: span(reveal.toMs, endMs)],
            strikes: [MintCeremonyStrike(atMs: reveal.fromMs, impactMs: reveal.fromMs,
                                         hitters: edition == .prism ? [.mee, .meo] : [.meo], isFinal: true)],
            refusal: nil, endMs: endMs
        )
    }

    /// Le déroulé de la cérémonie. Une fonction pure : mêmes entrées, mêmes instants, sur toutes les plateformes.
    /// - Parameters:
    ///   - edition: la LOI de la pièce (`GameMint.edition(forNumber:)`) : les coups, les aïeux, la nuit du prisme.
    ///   - look: le DESSIN de la pièce (`GameMint.displayEdition(forNumber:)`, #11483) : la matière des poussières ;
    ///     `nil` : celui de la loi. Le n° 247, frappé après le n° 100, se frappe d'un seul coup dans la poussière d'or.
    ///   - answeredAtMs: l'instant où la passerelle a répondu (confirmé ou refusé) ; `nil` : à temps.
    public static func plan(edition: MeeshEdition, look: MeeshEdition? = nil, mode: MintCeremonyMode,
                            answeredAtMs: Double? = nil, modest: Bool = false) -> MintCeremonyPlan {
        let answered = sanitize(answeredAtMs)
        let look = look ?? edition
        switch mode {
        case .normal: return normalPlan(edition, look: look, answeredAtMs: answered, modest: modest)
        case .refused: return refusedPlan(edition, look: look, answeredAtMs: answered, modest: modest)
        case .reduced: return reducedPlan(edition, answeredAtMs: answered)
        }
    }

    /// Toucher passe la scène : l'état final s'applique d'un coup, à tout instant.
    public static func skip(_ plan: MintCeremonyPlan, atMs: Double) -> Int {
        max(plan.endMs, sanitize(atMs))
    }

    public static func refusalReason(code: String?) -> MintRefusalReason {
        code.flatMap { refusalReasons[$0] } ?? .other
    }
}
