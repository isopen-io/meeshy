import Foundation

// MARK: - La loi du carnet (#9961, #9962, #10155)
//
// MIROIR de `packages/shared/utils/game/photo-catch-up.ts`, rejoué sur les lois
// `photo-catch-up`, `photo-offer` et `photo-standing` de `game.vectors.json`.
//
// Les étapes se DÉDUISENT de l'état du jeu, jamais d'un journal : un moment
// arrivé écran fermé, ou avant que le carnet n'existe, reste photographiable
// sans que rien n'ait été gardé. Sept pistes ordonnées — départ, rang (division
// par division), palier de niveau, sommet et Prestige, Meesh (la première puis
// chaque dixième), trésor, Flamme. Dans une piste, seule la PREMIÈRE étape sans
// photo est ouverte : la Meesh 50 attend la Meesh 40. Les pistes ne s'attendent
// pas entre elles.
//
// Moteur de règles sans état : il rend des identités et des emblèmes ; l'app en
// fait des moments (deux lignes localisées) par `GamePhotoCatchUp`.

/// Les sept pistes du carnet.
public enum PhotoTrack: String, CaseIterable, Equatable, Sendable {
    case start
    case rank
    case tier
    case summit
    case meesh
    case treasury
    case flame
}

/// Ce que le rattrapage lit de l'état du jeu.
public struct PhotoCatchUpStanding: Equatable, Sendable {
    public let rank: GloryRank
    /// V (5) à I (1) ; `nil` pour le Mythe.
    public let division: GloryDivision5?
    /// Le plus haut niveau atteint (`ladder.record`).
    public let levelRecord: Int
    public let prestige: Int
    /// Les Meeshes déjà frappées (`mint.number - 1`).
    public let minted: Int
    public let treasuryTier: TreasuryTierKey?
    /// La plus longue Flamme (`ladder.steps.flameRecord`, à défaut les jours en cours).
    public let flameRecord: Int
    /// Le record de chaque cycle clos par un Prestige (`ladder.pastCycleRecords`, #10911) — `nil` devant un serveur
    /// antérieur. Il dit combien de fois un palier a été atteint (`GamePhotoCatchUpLaw.levelReachCount`).
    public let pastCycleRecords: [Int]?

    public init(
        rank: GloryRank = .murmure,
        division: GloryDivision5? = .v,
        levelRecord: Int = 1,
        prestige: Int = 0,
        minted: Int = 0,
        treasuryTier: TreasuryTierKey? = nil,
        flameRecord: Int = 0,
        pastCycleRecords: [Int]? = nil
    ) {
        self.pastCycleRecords = pastCycleRecords
        self.rank = rank
        self.division = division
        self.levelRecord = levelRecord
        self.prestige = prestige
        self.minted = minted
        self.treasuryTier = treasuryTier
        self.flameRecord = flameRecord
    }

    /// La situation lue dans le bloc `game` servi — miroir de `catchUpStandingOf`.
    public init(game: GameBlock) {
        let shown = game.level.shown
        self.init(
            rank: game.glory.rank,
            division: game.glory.rank == .mythe ? nil : game.glory.shownDivision,
            levelRecord: shown.record,
            prestige: game.level.prestige,
            minted: max(0, game.mint.number - 1),
            treasuryTier: game.treasury.tier,
            flameRecord: max(shown.steps?.flameRecord ?? 0, game.flame.days),
            pastCycleRecords: shown.pastCycleRecords
        )
    }
}

/// L'emblème qu'une étape grave — la même forme que `PhotoStepEmblem` en TypeScript.
public enum PhotoStepEmblem: Equatable, Sendable {
    case start
    case rank(GloryRank, division: GloryDivision5?)
    /// `prestige` : le cycle où le palier est atteint ; `times` : combien de cycles l'ont atteint, celui-ci compris (#10911).
    case tier(LevelTierKey, level: Int, prestige: Int, times: Int)
    case levelHundred
    case prestige(number: Int)
    case meesh(number: Int, edition: MeeshEdition)
    case treasury(TreasuryTierKey)
    case flame(FlameFormKey, days: Int)
}

/// Une étape franchie : son identité (celle du moment), sa piste, son emblème.
public struct PhotoLawStep: Equatable, Identifiable, Sendable {
    public let track: PhotoTrack
    public let id: String
    public let emblem: PhotoStepEmblem

    public init(track: PhotoTrack, id: String, emblem: PhotoStepEmblem) {
        self.track = track
        self.id = id
        self.emblem = emblem
    }
}

/// Une étape franchie SANS photo gardée : ouverte, ou en attente d'une étape plus ancienne de sa piste.
public struct PhotoLawEntry: Equatable, Identifiable, Sendable {
    public let step: PhotoLawStep
    public let isOpen: Bool
    /// L'identité de l'étape à photographier d'abord ; `nil` pour l'étape ouverte.
    public let blockedBy: String?

    public var id: String { step.id }
    public var track: PhotoTrack { step.track }
}

public enum GamePhotoCatchUpLaw {

    /// L'ordre de préséance d'une proposition : un rang passe avant un palier, une Meesh en dernier.
    public static let offerPriority: [PhotoTrack] = [.start, .rank, .tier, .summit, .treasury, .flame, .meesh]

    public static let flameThresholds = [7, 30, 100, 365]

    private static let divisions: [GloryDivision5] = [.v, .iv, .iii, .ii, .i]

    private static func count(_ value: Int) -> Int { max(0, value) }

    /// Toutes les étapes franchies que la politique photographie, piste après piste, chacune dans son ordre :
    /// une étape non photographiable ne verrouille pas sa piste.
    public static func stepsReached(_ standing: PhotoCatchUpStanding, policy: PhotoAlertPolicy = .standard) -> [PhotoLawStep] {
        let tracks: [[PhotoLawStep]] = [
            [PhotoLawStep(track: .start, id: "start", emblem: .start)],
            rankSteps(standing),
            tierSteps(standing),
            summitSteps(standing),
            meeshSteps(standing),
            treasurySteps(standing),
            flameSteps(standing),
        ]
        return tracks.flatMap { $0 }.filter { isPhotographed($0, policy: policy) }
    }

    private static func isPhotographed(_ step: PhotoLawStep, policy: PhotoAlertPolicy) -> Bool {
        guard policy.photographs == .rankPassage, case .rank(_, let division) = step.emblem else { return true }
        return division == nil || division == .v
    }

    /// Les étapes franchies sans photo gardée : la première de chaque piste est ouverte, les suivantes l'attendent.
    public static func catchUp(_ standing: PhotoCatchUpStanding, kept: Set<String>, policy: PhotoAlertPolicy = .standard) -> [PhotoLawEntry] {
        let missing = stepsReached(standing, policy: policy).filter { !kept.contains($0.id) }
        return missing.map { step in
            guard let first = missing.first(where: { $0.track == step.track }), first.id != step.id else {
                return PhotoLawEntry(step: step, isOpen: true, blockedBy: nil)
            }
            return PhotoLawEntry(step: step, isOpen: false, blockedBy: first.id)
        }
    }

    /// La piste d'une identité de moment ; `nil` hors des sept pistes (succès, trophée, ligue, saison).
    public static func track(of momentId: String) -> PhotoTrack? {
        switch String(momentId.prefix(while: { $0 != ":" })) {
        case "start": .start
        case "rank": .rank
        case "tier": .tier
        case "meesh": .meesh
        case "treasury": .treasury
        case "flame": .flame
        case "level-100", "prestige": .summit
        default: nil
        }
    }

    /// LA proposition d'une transition : chaque moment d'une piste est remplacé par l'étape OUVERTE de sa
    /// piste (aucune si la piste est à jour), puis le plus marquant l'emporte. `nil` : rien à proposer.
    public static func offer(
        for ids: [String], standing: PhotoCatchUpStanding, kept: Set<String>, policy: PhotoAlertPolicy = .standard
    ) -> String? {
        let open = catchUp(standing, kept: kept, policy: policy).filter(\.isOpen)
        let candidates = ids.compactMap { id -> String? in
            guard let lane = track(of: id) else { return id }
            return open.first { $0.track == lane }?.id
        }
        var seen = Set<String>()
        let unique = candidates.filter { seen.insert($0).inserted }
        return unique.enumerated().min { lhs, rhs in
            (priority(lhs.element), lhs.offset) < (priority(rhs.element), rhs.offset)
        }?.element
    }

    /// Le rang de préséance d'une identité : sa piste dans `offerPriority`, une identité hors piste en dernier.
    public static func priority(_ momentId: String) -> Int {
        guard let lane = track(of: momentId) else { return offerPriority.count }
        return offerPriority.firstIndex(of: lane) ?? offerPriority.count
    }

    // MARK: - Les pistes

    private static func rankStep(_ rank: GloryRank, _ division: GloryDivision5?) -> PhotoLawStep {
        PhotoLawStep(track: .rank, id: "rank:\(rank.rawValue):\(division?.rawValue ?? 0)", emblem: .rank(rank, division: division))
    }

    private static func rankSteps(_ standing: PhotoCatchUpStanding) -> [PhotoLawStep] {
        let ladder = GloryRank.ladder.flatMap { rank in divisions.map { rankStep(rank, $0) } } + [rankStep(.mythe, nil)]
        let current = "rank:\(standing.rank.rawValue):\(standing.division?.rawValue ?? 0)"
        guard let reached = ladder.firstIndex(where: { $0.id == current }), reached >= 1 else { return [] }
        return Array(ladder[1...reached])
    }

    /// L'identité d'une étape de PALIER (#10911) — miroir de `photoTierStepId` : celle d'hier au premier cycle, une par
    /// cycle ensuite (`tier:<palier>:<Prestige>`). Les autres pistes gardent une identité unique.
    public static func tierStepId(_ tier: LevelTierKey, prestige: Int) -> String {
        count(prestige) == 0 ? "tier:\(tier.rawValue)" : "tier:\(tier.rawValue):\(count(prestige))"
    }

    /// Combien de cycles ont atteint ce niveau, le cycle en cours compris (#10911) — miroir de `levelReachCount` : un
    /// cycle clos dont le record n'a pas été gardé a atteint le niveau du Prestige (100), jamais plus.
    public static func levelReachCount(_ standing: PhotoCatchUpStanding, level: Int) -> Int {
        let prestige = count(standing.prestige)
        let kept = (standing.pastCycleRecords ?? []).prefix(prestige).map { count($0) }
        let closed = kept + Array(repeating: GameLevels.prestigeLevel, count: prestige - kept.count)
        return closed.filter { $0 >= level }.count + (count(standing.levelRecord) >= level ? 1 : 0)
    }

    private static func tierSteps(_ standing: PhotoCatchUpStanding) -> [PhotoLawStep] {
        let index = GameLevels.tierIndex(of: count(standing.levelRecord))
        return LevelTierKey.allCases.prefix(index + 1).dropFirst().map { tier in
            let level = GameLevels.tierStart(of: tier)
            return PhotoLawStep(
                track: .tier,
                id: tierStepId(tier, prestige: standing.prestige),
                emblem: .tier(tier, level: level, prestige: count(standing.prestige), times: levelReachCount(standing, level: level))
            )
        }
    }

    private static func summitSteps(_ standing: PhotoCatchUpStanding) -> [PhotoLawStep] {
        let prestige = count(standing.prestige)
        guard count(standing.levelRecord) >= 100 || prestige > 0 else { return [] }
        let laps: [PhotoLawStep] = prestige > 0 ? (1...prestige).map { number in
            PhotoLawStep(track: .summit, id: "prestige:\(number)", emblem: .prestige(number: number))
        } : []
        return [PhotoLawStep(track: .summit, id: "level-100:0", emblem: .levelHundred)] + laps
    }

    private static func meeshSteps(_ standing: PhotoCatchUpStanding) -> [PhotoLawStep] {
        let minted = count(standing.minted)
        guard minted > 0 else { return [] }
        let tens: [Int] = minted / 10 > 0 ? (1...(minted / 10)).map { $0 * 10 } : []
        return ([1] + tens).map { number in
            PhotoLawStep(track: .meesh, id: "meesh:\(number)", emblem: .meesh(number: number, edition: GameMint.edition(forNumber: number)))
        }
    }

    private static func treasurySteps(_ standing: PhotoCatchUpStanding) -> [PhotoLawStep] {
        guard let tier = standing.treasuryTier, let held = TreasuryTierKey.allCases.firstIndex(of: tier) else { return [] }
        return TreasuryTierKey.allCases.prefix(held + 1).map {
            PhotoLawStep(track: .treasury, id: "treasury:\($0.rawValue)", emblem: .treasury($0))
        }
    }

    private static func flameSteps(_ standing: PhotoCatchUpStanding) -> [PhotoLawStep] {
        flameThresholds
            .filter { count(standing.flameRecord) >= $0 }
            .map { PhotoLawStep(track: .flame, id: "flame:\($0)", emblem: .flame(GameFlame.form(forDays: $0) ?? .braise, days: $0)) }
    }
}
