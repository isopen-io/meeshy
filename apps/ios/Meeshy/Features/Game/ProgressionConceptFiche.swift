import Foundation
import MeeshySDK

/// CE QUE LA FICHE D'UN CONCEPT DIT SOUS SA TÊTE (#11180, épopée § 3.3) — « Où j'en suis » NE REDIT RIEN : un fait ne
/// paraît qu'une fois par écran. On compare des IDENTITÉS, jamais des chaînes :
///
///  - la tête (le héros générique, la tête des Étincelles, ou la pièce de jeu qui la remplace) et les gestes du concept
///    disent déjà certains faits ;
///  - la phrase d'état disparaît dès qu'elle en enchâsse un ;
///  - quand elle reste, les lignes ne redisent ni ce que l'écran montre, ni ce qu'elle dit.
///
/// MIROIR de `ficheView` (`apps/web/src/lib/view/progression-concepts.ts`).
struct ProgressionConceptFiche: Equatable {

    /// Ce qui tient la tête de la fiche.
    enum Head: Equatable {
        /// L'emblème en grand, la valeur, la ligne de la carte, la jauge.
        case generic
        /// TA LUMIÈRE : la poche en grand, le « depuis toujours » en petit, l'Ombre avant tout.
        case sparks(GameSparksHeadModel)
        /// La pièce de jeu du concept (l'anneau, l'Héritage et sa frappe, le détail de la joute, les Élans).
        case piece
    }

    let head: Head
    /// La ligne sous la valeur du héros générique ; `nil` quand les gestes de la fiche la disent déjà.
    let heroLine: ProgressionFactText?
    /// La phrase d'état, quand elle ne redit aucun fait déjà à l'écran.
    let state: ProgressionFactText?
    /// « Où j'en suis » : les faits que l'écran ne dit pas déjà.
    let facts: [ProgressionConceptFact]

    /// La section « Où j'en suis » paraît-elle ?
    var hasWhere: Bool { state != nil || !facts.isEmpty }

    static func make(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?,
                     now: Date = Date()) -> ProgressionConceptFiche {
        let shown = shows(concept, progress: progress, game: game)
        let head = headKind(concept, progress: progress, game: game)
        guard shown != .all else { return ProgressionConceptFiche(head: head, heroLine: nil, state: nil, facts: []) }
        let gestures = gesturesShow(concept, game: game)
        let card = ProgressionConceptModel.card(concept, progress: progress, game: game, now: now)
        let heroLine = shown == nil ? card.line.flatMap { Set($0.facts).isDisjoint(with: gestures) ? $0 : nil } : nil
        let onScreen: Set<ProgressionFactID> = switch shown {
        case .some(.facts(let facts)): facts.union(gestures)
        default: Set([card.valueFact] + [card.emblem?.fact].compactMap { $0 } + (heroLine?.facts ?? [])).union(gestures)
        }
        let said = ProgressionConceptModel.stateLine(concept, progress: progress, game: game)
        let state = said.flatMap { Set($0.facts).isDisjoint(with: onScreen) ? $0 : nil }
        let told = onScreen.union(state?.facts ?? [])
        let facts = rows(concept, progress: progress, game: game, now: now).filter { fact in
            fact.identity.map { !told.contains($0) } ?? true
        }
        return ProgressionConceptFiche(head: head, heroLine: heroLine, state: state, facts: facts)
    }

    // MARK: - Ce que la tête et les gestes montrent

    private enum Shown: Equatable {
        case all
        case facts(Set<ProgressionFactID>)
    }

    private static func headKind(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?) -> Head {
        if concept == .points, let game { return .sparks(GameSparksHeadModel(game.level)) }
        return ProgressionConceptGestures.isHero(for: concept, progress: progress, game: game) ? .piece : .generic
    }

    /// Les faits que la tête montre quand elle n'est pas le héros générique ; `nil` : le héros générique.
    private static func shows(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?) -> Shown? {
        if concept == .points, let game { return .facts(Set(GameSparksHeadModel(game.level).facts)) }
        guard ProgressionConceptGestures.isHero(for: concept, progress: progress, game: game) else { return nil }
        switch concept {
        case .league: return .facts([.league, .leaguePlace, .weekPoints, .leagueCloses])
        case .elans: return .facts([.factor, .elanFamilies])
        default: return .all
        }
    }

    /// Les faits que les GESTES de la fiche montrent déjà : les tuiles de la Flamme, l'Offrande du Rêve.
    private static func gesturesShow(_ concept: ProgressionConcept, game: GameBlock?) -> Set<ProgressionFactID> {
        guard game != nil else { return [] }
        switch concept {
        case .flame: return [.flameForm, .freezes]
        case .missions: return [.chest, .prismDay]
        default: return []
        }
    }

    // MARK: - Les lignes de « Où j'en suis », chacune avec son identité

    private static func fact(_ label: String, _ value: String, _ identity: ProgressionFactID,
                             detail: GameDetailFactKey? = nil) -> ProgressionConceptFact {
        ProgressionConceptFact(label: label, value: value, detail: detail, identity: identity)
    }

    private static func count(_ value: Int) -> String { GameCopy.formatCount(value) }

    static func rows(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?,
                     now: Date = Date()) -> [ProgressionConceptFact] {
        switch concept {
        case .level: levelRows(progress, game)
        case .points, .meesh, .missions: []
        case .glory: gloryRows(game)
        case .flame: flameRows(progress, game)
        case .league: leagueRows(game, now: now)
        case .season: seasonRows(game)
        case .prestige: game?.prestige.map { [fact(ConceptText.factGloryOnPass, count($0.gloryOnPass), .prestigeGlory, detail: .prestigeGlory)] } ?? []
        case .elans: elansRows(game)
        case .badges: badgesRows(progress)
        case .defis:
            [fact(ConceptText.factRemaining, count(max(0, ProgressionConceptModel.defisTotal(progress) - ProgressionConceptModel.defisDone(progress))),
                  .left(.defis))]
        case .succes:
            [fact(ConceptText.factRemaining, count(max(0, progress.achievements.count - progress.unlockedAchievementCount)), .left(.succes))]
        case .showcase:
            [game?.visibility.map { fact(ConceptText.factVisible, GameText.visibilityLabel($0.showcase), .showcaseVisibility, detail: .showcaseVisibility) }]
                .compactMap { $0 }
        case .atlas: atlasRows(game)
        }
    }

    private static func levelRows(_ progress: EngagementProgress, _ game: GameBlock?) -> [ProgressionConceptFact] {
        guard let level = game?.level.shown else {
            return progress.level.scale.remainingToNext.map {
                [fact(ConceptText.missingForLevel(level: count(progress.level.level + 1)), GameCopy.points($0), .levelNext, detail: .levelNext)]
            } ?? []
        }
        let next = level.nextThreshold == nil
            ? fact(ConceptText.factNextLevel, GameCopy.levelTopShort(cap: level.cap), .levelTop, detail: .levelNext)
            : fact(ConceptText.missingForLevel(level: count(level.level + 1)), GameCopy.points(level.pointsToNext), .levelNext, detail: .levelNext)
        let record = level.record > level.level
            ? fact(ConceptText.factRecord, GameText.bannerLevel(level: count(level.record)), .levelRecord, detail: .levelRecord) : nil
        return [fact(ConceptText.factTier, GameCopy.tierName(level.tier), .tier, detail: .tier), next, record].compactMap { $0 }
    }

    private static func gloryRows(_ game: GameBlock?) -> [ProgressionConceptFact] {
        guard let glory = game?.glory else { return [] }
        let next: String? = glory.next.map { GameCopy.rankLabel($0.rank, division5: $0.shownDivision) }
        return [
            fact(ConceptText.name(.glory), count(glory.glory), .glory, detail: .glory),
            next.map { fact(ConceptText.factNextRank, $0, .rankNext) },
            next.flatMap { name in
                glory.gloryMissing.map { fact(ConceptText.missingForRank(rank: name), GameCopy.gloryAmount(count($0)), .gloryMissing, detail: .gloryMissing) }
            },
        ].compactMap { $0 }
    }

    /// La forme et les Veilleuses sont aux tuiles de la fiche, leurs prix aux gestes : ici, ce qui reste.
    private static func flameRows(_ progress: EngagementProgress, _ game: GameBlock?) -> [ProgressionConceptFact] {
        [
            fact(ConceptText.factRecord, GameCopy.days(progress.streak.longestDays), .streakRecord, detail: .streakRecord),
            game.flatMap { GameCopy.flameStatus($0.flame.status) }.map { fact(ConceptText.factState, $0, .flameState, detail: .flameState) },
        ].compactMap { $0 }
    }

    private static func leagueRows(_ game: GameBlock?, now: Date) -> [ProgressionConceptFact] {
        guard let league = game?.league else { return [] }
        let friends = fact(ConceptText.factFriends,
                           GameText.leagueRankLine(rank: count(league.friends.rank), size: count(league.friends.size)),
                           .leagueFriends, detail: .leagueFriends)
        guard let current = GameLeagueDetail.current(of: league) else { return [friends] }
        return [
            fact(ConceptText.factWeekPoints, GameCopy.points(current.weekPoints), .weekPoints, detail: .weekPoints),
            fact(ConceptText.factZone, GameText.zoneLabel(current.zone), .leagueZone, detail: .leagueZone),
            current.pointsToPromotion.flatMap {
                $0 > 0 ? fact(ConceptText.missingForPromotion, GameCopy.points($0), .leagueMissing, detail: .leagueMissing) : nil
            },
            fact(ConceptText.factCloses, GameWave2Format.remaining(closes: league.closes, now: now), .leagueCloses, detail: .leagueCloses),
            friends,
        ].compactMap { $0 }
    }

    private static func seasonRows(_ game: GameBlock?) -> [ProgressionConceptFact] {
        guard let season = game?.season else { return [] }
        return [
            fact(ConceptText.name(.season), count(season.number), .season, detail: .season),
            fact(ConceptText.factWeek, ProgressionConceptModel.ratio(season.week, GameSeason.weeks), .seasonWeek, detail: .seasonWeek),
            fact(ConceptText.factStrides, count(season.stars), .seasonStars, detail: .seasonStars),
            fact(ConceptText.factSeal, season.sealOwned ? ConceptText.factYes : ConceptText.factNo, .seasonSeal),
        ]
    }

    /// Les multiplicateurs du jeu sont ici, et seulement ici : le Vent arrière ne se dit que quand il souffle (#10896).
    private static func elansRows(_ game: GameBlock?) -> [ProgressionConceptFact] {
        guard let boosts = game?.boosts else { return [] }
        return [
            boosts.tailwind > 1
                ? fact(GameRulesGlossary.name(.tailwind), ConceptText.valueFactor(GameCopy.factor(boosts.tailwind)), .tailwind, detail: .tailwind)
                : nil,
            boosts.prismHour.map { fact(ConceptText.factPrismHour, ConceptText.valueFactor(GameCopy.factor($0.multiplier)), .prismHour) },
        ].compactMap { $0 }
    }

    private static func badgesRows(_ progress: EngagementProgress) -> [ProgressionConceptFact] {
        let families: [ProgressionConceptFact] = progress.axesByFamily.map { group in
            let reached: Int = group.axes.reduce(0) { $0 + $1.scale.reachedCount }
            let total: Int = group.axes.reduce(0) { $0 + $1.scale.tiers.count }
            return fact(ProgressionCopy.title(for: group.family), ProgressionConceptModel.ratio(reached, total), .badgeFamily(group.family))
        }
        return [fact(ConceptText.factRemaining, count(max(0, progress.badgesTotal - progress.badgesEarned)), .left(.badges))] + families
    }

    private static func atlasRows(_ game: GameBlock?) -> [ProgressionConceptFact] {
        guard let atlas = game?.atlas else { return [] }
        return [
            fact(ConceptText.factRemaining, count(max(0, atlas.total - atlas.stamped)), .atlasLeft),
            atlas.pending.isEmpty ? nil : fact(ConceptText.factPending, count(atlas.pending.count), .atlasPending, detail: .atlasPending),
            game?.visibility.map { fact(ConceptText.factVisible, GameText.visibilityLabel($0.atlas), .atlasVisibility) },
        ].compactMap { $0 }
    }
}
