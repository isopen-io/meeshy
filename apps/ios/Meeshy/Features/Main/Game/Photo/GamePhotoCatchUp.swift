import Foundation
import MeeshySDK

/// LE RATTRAPAGE DU CARNET (#9961, #9962) — chaque étape déjà franchie se photographie, DANS L'ORDRE.
/// Miroir de `packages/shared/utils/game/photo-catch-up.ts`.
///
/// Les étapes se DÉDUISENT de l'état du jeu, jamais d'un journal : un moment arrivé écran fermé, ou avant
/// que le carnet n'existe, reste photographiable sans que rien n'ait été gardé. Sept pistes ordonnées —
/// départ, rang (division par division), palier de niveau, sommet et Prestige, Meesh (la première puis
/// chaque dixième), trésor, Flamme. Dans une piste, seule la PREMIÈRE étape sans photo est ouverte : la
/// Meesh 50 attend la Meesh 40. Les pistes ne s'attendent pas entre elles.
///
/// Les identités sont celles des moments (`GamePhotoMoments`) : une photo gardée par la proposition en
/// direct compte pour le rattrapage, et inversement.
nonisolated enum PhotoTrack: String, CaseIterable, Equatable, Sendable {
    case start
    case rank
    case tier
    case summit
    case meesh
    case treasury
    case flame
}

/// Ce que le rattrapage lit de l'état du jeu.
nonisolated struct PhotoCatchUpStanding: Equatable, Sendable {
    let rank: GloryRank
    /// V (5) à I (1) ; `nil` pour le Mythe.
    let division: GloryDivision5?
    /// Le plus haut niveau atteint (`ladder.record`).
    let levelRecord: Int
    let prestige: Int
    /// Les Meeshes déjà frappées (`mint.number - 1`).
    let minted: Int
    let treasuryTier: TreasuryTierKey?
    /// La plus longue Flamme (`ladder.steps.flameRecord`, à défaut les jours en cours).
    let flameRecord: Int

    init(
        rank: GloryRank = .murmure,
        division: GloryDivision5? = .v,
        levelRecord: Int = 1,
        prestige: Int = 0,
        minted: Int = 0,
        treasuryTier: TreasuryTierKey? = nil,
        flameRecord: Int = 0
    ) {
        self.rank = rank
        self.division = division
        self.levelRecord = levelRecord
        self.prestige = prestige
        self.minted = minted
        self.treasuryTier = treasuryTier
        self.flameRecord = flameRecord
    }

    init(game: GameBlock) {
        let shown = game.level.shown
        self.init(
            rank: game.glory.rank,
            division: game.glory.rank == .mythe ? nil : game.glory.shownDivision,
            levelRecord: shown.record,
            prestige: game.level.prestige,
            minted: max(0, game.mint.number - 1),
            treasuryTier: game.treasury.tier,
            flameRecord: max(shown.steps?.flameRecord ?? 0, game.flame.days)
        )
    }
}

/// Une étape franchie : le moment qu'elle photographie, et sa piste.
nonisolated struct PhotoStep: Equatable, Identifiable, Sendable {
    let track: PhotoTrack
    let moment: PhotoMoment

    var id: String { moment.id }
}

/// Une étape franchie SANS photo gardée : ouverte, ou en attente d'une étape plus ancienne de sa piste.
nonisolated struct PhotoCatchUpEntry: Equatable, Identifiable, Sendable {
    let moment: PhotoMoment
    let track: PhotoTrack
    let isOpen: Bool
    /// L'identité de l'étape à photographier d'abord ; `nil` pour l'étape ouverte.
    let blockedBy: String?

    var id: String { moment.id }
}

enum GamePhotoCatchUp {

    /// L'ordre de préséance d'une proposition : un rang passe avant un palier, une Meesh en dernier.
    static let offerPriority: [PhotoTrack] = [.start, .rank, .tier, .summit, .treasury, .flame, .meesh]

    private static let divisions: [GloryDivision5] = [.v, .iv, .iii, .ii, .i]

    private static func count(_ value: Int) -> Int { max(0, value) }

    /// Toutes les étapes franchies, piste après piste, chacune dans son ordre.
    static func stepsReached(_ standing: PhotoCatchUpStanding) -> [PhotoStep] {
        [PhotoStep(track: .start, moment: GamePhotoMoments.start())]
            + rankSteps(standing)
            + tierSteps(standing)
            + summitSteps(standing)
            + meeshSteps(standing)
            + treasurySteps(standing)
            + flameSteps(standing)
    }

    /// Les étapes franchies sans photo gardée : la première de chaque piste est ouverte, les suivantes l'attendent.
    static func catchUp(_ standing: PhotoCatchUpStanding, kept: Set<String>) -> [PhotoCatchUpEntry] {
        let missing = stepsReached(standing).filter { !kept.contains($0.id) }
        return missing.map { step in
            let first = missing.first { $0.track == step.track }
            guard let first, first.id != step.id else {
                return PhotoCatchUpEntry(moment: step.moment, track: step.track, isOpen: true, blockedBy: nil)
            }
            return PhotoCatchUpEntry(moment: step.moment, track: step.track, isOpen: false, blockedBy: first.id)
        }
    }

    /// La piste d'une identité de moment ; `nil` hors des sept pistes (succès, trophée, ligue, saison).
    static func track(of momentId: String) -> PhotoTrack? {
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
    static func offer(for ids: [String], standing: PhotoCatchUpStanding, kept: Set<String>) -> String? {
        let open = catchUp(standing, kept: kept).filter(\.isOpen)
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

    private static func priority(_ momentId: String) -> Int {
        guard let lane = track(of: momentId) else { return offerPriority.count }
        return offerPriority.firstIndex(of: lane) ?? offerPriority.count
    }

    // MARK: - Les pistes

    private static func rankSteps(_ standing: PhotoCatchUpStanding) -> [PhotoStep] {
        let ladder: [PhotoStep] = GloryRank.ladder.flatMap { rank in
            divisions.map { PhotoStep(track: .rank, moment: GamePhotoMoments.rank(rank, division: $0)) }
        } + [PhotoStep(track: .rank, moment: GamePhotoMoments.rank(.mythe, division: nil))]
        let current = "rank:\(standing.rank.rawValue):\(standing.division?.rawValue ?? 0)"
        guard let reached = ladder.firstIndex(where: { $0.id == current }), reached >= 1 else { return [] }
        return Array(ladder[1...reached])
    }

    private static func tierSteps(_ standing: PhotoCatchUpStanding) -> [PhotoStep] {
        let index = GameLevels.tierIndex(of: count(standing.levelRecord))
        return LevelTierKey.allCases.prefix(index + 1).dropFirst().map { tier in
            PhotoStep(track: .tier, moment: GamePhotoMoments.tier(tier, level: GameLevels.tierStart(of: tier)))
        }
    }

    private static func summitSteps(_ standing: PhotoCatchUpStanding) -> [PhotoStep] {
        let prestige = count(standing.prestige)
        guard count(standing.levelRecord) >= 100 || prestige > 0 else { return [] }
        let laps: [PhotoStep] = prestige > 0 ? (1...prestige).map { number in
            PhotoStep(track: .summit, moment: GamePhotoMoments.ofEmblemV2(.prestige(number: number)))
        } : []
        return [PhotoStep(track: .summit, moment: GamePhotoMoments.levelHundred(prestige: 0))] + laps
    }

    private static func meeshSteps(_ standing: PhotoCatchUpStanding) -> [PhotoStep] {
        let minted = count(standing.minted)
        guard minted > 0 else { return [] }
        let tens: [Int] = minted / 10 > 0 ? (1...(minted / 10)).map { $0 * 10 } : []
        return ([1] + tens).map { number in
            PhotoStep(track: .meesh, moment: GamePhotoMoments.meesh(number: number, edition: GameMint.edition(forNumber: number)))
        }
    }

    private static func treasurySteps(_ standing: PhotoCatchUpStanding) -> [PhotoStep] {
        guard let tier = standing.treasuryTier, let held = TreasuryTierKey.allCases.firstIndex(of: tier) else { return [] }
        return TreasuryTierKey.allCases.prefix(held + 1).map { PhotoStep(track: .treasury, moment: GamePhotoMoments.treasury($0)) }
    }

    private static func flameSteps(_ standing: PhotoCatchUpStanding) -> [PhotoStep] {
        GamePhotoMoments.flameThresholds
            .filter { count(standing.flameRecord) >= $0 }
            .map { PhotoStep(track: .flame, moment: GamePhotoMoments.flame(days: $0)) }
    }
}
