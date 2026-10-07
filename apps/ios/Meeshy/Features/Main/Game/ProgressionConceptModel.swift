import Foundation
import MeeshySDK

/// CE QUE CHAQUE CONCEPT DIT (#9564) — la carte de la première page, les lignes « Où j'en suis » de la fiche et du
/// tableau de bord, la jauge vers l'étape suivante, les sous-pages. Une loi PURE : elle lit la progression et le
/// bloc `game` servis, et ne calcule ni niveau, ni rang, ni prix — chaque nombre est celui du serveur, mis en mots.
///
/// Les trois surfaces (première page, fiche, tableau de bord) PARCOURENT `ProgressionConcepts.served` et lisent
/// ICI ce qu'elles montrent : un concept ne peut pas dire deux valeurs différentes à deux endroits.

/// Une ligne « libellé → valeur » de « Où j'en suis ».
struct ProgressionConceptFact: Equatable, Identifiable {
    let label: String
    let value: String

    var id: String { label }
}

/// La carte d'un concept sur la première page : la tête (nom, valeur), deux ou trois données importantes, la jauge
/// vers l'étape suivante quand elle existe, puis le pourquoi et le comment.
struct ProgressionConceptCard: Equatable, Identifiable {
    let concept: ProgressionConcept
    let name: String
    /// La valeur de la tête, sur UNE ligne.
    let value: String
    /// Les données importantes, trois au plus, jamais vide.
    let chips: [String]
    /// La part parcourue vers l'étape suivante ; `nil` quand il n'y a pas d'étape suivante.
    let gauge: Double?
    let why: String
    let how: String

    var id: String { concept.rawValue }

    /// Un seul élément pour VoiceOver : concept, valeur, pourquoi — le trait « bouton » est posé par la vue.
    var accessibilityLabel: String { ConceptText.cardA11y(name, value, why) }
}

/// Une sous-page d'une fiche (« Aller plus loin ») : le sous-menu du sous-menu.
enum ProgressionConceptLink: Equatable, Identifiable {
    case page(GamePage)
    case section(ProgressionSection)
    case rules(Int?)

    var id: String {
        switch self {
        case .page(let page): "page.\(page.rawValue)"
        case .section(let section): "section.\(section.rawValue)"
        case .rules(let rule): "rules.\(rule ?? 0)"
        }
    }

    var title: String {
        switch self {
        case .page(.league): ConceptText.linkLeague
        case .page(.season): ConceptText.linkSeason
        case .page(.prestige): ConceptText.linkPrestige
        case .page(.showcase): ConceptText.linkShowcase
        case .page(.atlas): ConceptText.linkAtlas
        case .page(.settings): GameText.doorSettings
        case .section(.badges): ConceptText.linkBadges
        case .section(.defis): ConceptText.linkDefis
        case .section(.succes): ConceptText.linkSucces
        case .rules: ConceptText.linkRules
        }
    }
}

extension GameCopy {
    /// L'état de la Flamme en une courte phrase ; `nil` quand elle brûle sans rien à signaler.
    static func flameStatus(_ status: FlameStatus) -> String? {
        switch status {
        case .none: String(localized: "game.flame.status.none", defaultValue: "Un geste aujourd’hui allume ta Flamme", bundle: .main)
        case .lit: nil
        case .atRisk: String(localized: "game.flame.status.at_risk", defaultValue: "Fais un geste avant minuit", bundle: .main)
        case .covered: String(localized: "game.flame.status.covered", defaultValue: "Un gel la protège", bundle: .main)
        case .out: String(localized: "game.flame.status.out", defaultValue: "Éteinte", bundle: .main)
        }
    }

    /// « 23 jours », ou « Pas de série » à zéro : une série nulle ne se dit pas « 0 jour ».
    static func flameDays(_ days: Int) -> String {
        days <= 0
            ? String(localized: "game.flame.no_streak", defaultValue: "Pas de série", bundle: .main)
            : GameCopy.days(days)
    }

    /// « ×1,25 » — un multiplicateur, deux décimales au plus, dans la locale.
    static func factor(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...2)))
    }
}

enum ProgressionConceptModel {

    /// Trois données importantes au plus sur une carte : au-delà, c'est la fiche.
    static let maxChips = 3

    private static func count(_ value: Int) -> String { GameCopy.formatCount(value) }

    private static func ratio(_ done: Int, _ total: Int) -> String {
        ConceptText.ratio(count(done), count(total))
    }

    private static func share(_ done: Int, _ total: Int) -> Double? {
        total > 0 ? min(1, max(0, Double(done) / Double(total))) : nil
    }

    // MARK: - Les cartes de la première page

    static func cards(progress: EngagementProgress, game: GameBlock?, now: Date = Date()) -> [ProgressionConceptCard] {
        ProgressionConcepts.served(for: progress, game: game).map { card($0, progress: progress, game: game, now: now) }
    }

    static func card(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?,
                     now: Date = Date()) -> ProgressionConceptCard {
        let head = value(concept, progress: progress, game: game)
        let important = chips(concept, progress: progress, game: game, now: now)
            .filter { !$0.isEmpty && $0 != head }
            .reduce(into: [String]()) { kept, chip in if !kept.contains(chip) { kept.append(chip) } }
        return ProgressionConceptCard(
            concept: concept,
            name: ConceptText.name(concept),
            value: head,
            // Une carte ne reste jamais sans donnée : à défaut, sa valeur est la donnée.
            chips: Array((important.isEmpty ? [head] : important).prefix(maxChips)),
            gauge: gauge(concept, progress: progress, game: game),
            why: ConceptText.why(concept),
            how: ConceptText.how(concept)
        )
    }

    // MARK: - La valeur de la tête

    static func value(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?) -> String {
        switch concept {
        case .level:
            return GameText.bannerLevel(level: count(game?.level.level ?? progress.level.level))
        case .points:
            return GameCopy.points(game?.level.score ?? progress.level.scale.value)
        case .meesh:
            return GameCopy.meeshes(progress.meesh?.balance ?? game?.treasury.held ?? 0)
        case .glory:
            guard let glory = game?.glory else { return "" }
            return GameCopy.rankLabel(glory.rank, division: glory.division)
        case .flame:
            return GameCopy.flameDays(game?.flame.days ?? progress.streak.currentDays)
        case .missions:
            guard let missions = game?.missions else { return "" }
            guard missions.unlocked else { return GameText.doorLeagueLocked(level: count(GameMissions.minLevel)) }
            return ratio(missions.items.filter(\.isCompleted).count, missions.items.count)
        case .league:
            guard let league = game?.league else { return "" }
            if league.access == .locked { return GameText.doorLeagueLocked(level: count(GameLeague.minLevel)) }
            guard let current = GameLeagueDetail.current(of: league) else { return GameText.doorLeagueOpen }
            return GameText.doorLeagueRank(
                league: GameText.leagueName(current.league), rank: count(current.rank), size: count(current.groupSize))
        case .season:
            guard let season = game?.season else { return GameText.doorSeasonNone }
            return GameText.doorSeasonSteps(steps: count(season.steps), total: count(season.stepsTotal))
        case .prestige:
            guard let prestige = game?.prestige else { return "" }
            if prestige.canPrestige { return GameText.doorPrestigeReady }
            if prestige.stars > 0 { return GameText.doorPrestigeStars(stars: count(prestige.stars), max: count(prestige.max)) }
            return GameText.doorPrestigeLocked
        case .elans:
            guard let elan = progress.elan, elan.isAccelerated else { return ConceptText.valueNoElan }
            return ConceptText.valueFactor(GameCopy.factor(elan.factor))
        case .badges:
            return ratio(progress.badgesEarned, progress.badgesTotal)
        case .defis:
            return ratio(defisDone(progress), defisTotal(progress))
        case .succes:
            return ratio(progress.unlockedAchievementCount, progress.achievements.count)
        case .showcase:
            guard let trophies = game?.trophies, !trophies.items.isEmpty else { return GameText.doorShowcaseEmpty }
            return GameText.doorShowcaseCount(count: trophies.items.count)
        case .atlas:
            guard let atlas = game?.atlas else { return "" }
            return ratio(atlas.stamped, atlas.total)
        }
    }

    private static func defisDone(_ progress: EngagementProgress) -> Int {
        progress.achievementSections.reduce(0) { $0 + $1.unlockedCount }
    }

    private static func defisTotal(_ progress: EngagementProgress) -> Int {
        progress.achievementSections.reduce(0) { $0 + $1.attainableCount }
    }

    private static func remaining(_ done: Int, _ total: Int) -> String {
        total > done ? ConceptText.chipToUnlock(count(total - done)) : ConceptText.chipAllDone
    }

    // MARK: - Les données importantes

    /// Les données importantes d'un concept, dans l'ordre où elles comptent. Chaque branche écrit une liste à trous
    /// (`nil` = « pas cette fois ») : ce qui manque ne laisse ni pastille vide ni condition recopiée.
    static func chips(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?,
                      now: Date = Date()) -> [String] {
        let items: [String?]
        switch concept {
        case .level:
            if let level = game?.level {
                items = [
                    GameCopy.tierName(level.tier),
                    level.nextThreshold == nil ? GameText.bannerTop : ConceptText.chipMissing(GameCopy.points(level.pointsToNext)),
                    level.record > level.level ? ConceptText.chipRecordLevel(count(level.record)) : nil,
                ]
            } else {
                items = [
                    GameCopy.points(progress.level.scale.value),
                    progress.level.scale.remainingToNext.map { ConceptText.chipMissing(GameCopy.points($0)) },
                ]
            }
        case .points:
            guard let game else { return [] }
            items = [
                progress.meesh.map { ConceptText.chipConvertible(GameCopy.points($0.debitablePoints)) },
                game.boosts.tailwind > 1 ? ConceptText.chipTailwind(GameCopy.factor(game.boosts.tailwind)) : nil,
                game.boosts.prismHour.map { ConceptText.chipPrismHour(GameCopy.factor($0.multiplier)) },
                GameText.bannerLevel(level: count(game.level.level)),
            ]
        case .meesh:
            if let mint = game?.mint {
                items = [
                    ConceptText.chipNextPrice(GameCopy.points(mint.price)),
                    mint.canMint ? ConceptText.chipMintReady : ConceptText.chipMissing(GameCopy.points(mint.missingPoints)),
                    progress.meesh.map { ConceptText.chipMinted(count($0.mintedLifetime)) },
                ]
            } else if let meesh = progress.meesh {
                items = [
                    ConceptText.chipNextPrice(GameCopy.points(meesh.mintCost)),
                    meesh.canMint ? ConceptText.chipMintReady : ConceptText.chipMissing(GameCopy.points(meesh.missingPoints)),
                    ConceptText.chipMinted(count(meesh.mintedLifetime)),
                ]
            } else {
                items = []
            }
        case .glory:
            guard let glory = game?.glory else { return [] }
            items = [
                String(localized: "game.rank.glory", defaultValue: "Gloire \(count(glory.glory))", bundle: .main),
                glory.gloryMissing.map { ConceptText.chipGloryMissing(count($0)) } ?? ConceptText.chipTopRank,
            ]
        case .flame:
            let record = ProgressionCopy.streakRecord(progress.streak.longestDays)
            guard let flame = game?.flame else { return [record] }
            let urgent = flame.status == .atRisk || flame.status == .out
            items = [
                urgent ? GameCopy.flameStatus(flame.status) : nil,
                record,
                ConceptText.chipFreezesOf(count(flame.freezes), count(flame.maxFreezes)),
                flame.form.map { GameCopy.flameFormName($0) },
            ]
        case .missions:
            guard let game else { return [] }
            items = [
                chest(game.chest.status),
                game.missions.unlocked && game.missions.rerollAvailable ? ConceptText.chipReroll : nil,
                game.missions.prismDay ? ConceptText.chipPrismDay : nil,
                game.missions.personal != nil ? ConceptText.chipPersonal : nil,
            ]
        case .league:
            guard let league = game?.league else { return [] }
            if let current = GameLeagueDetail.current(of: league) {
                items = [
                    GameText.leagueDetailWeek(points: GameCopy.points(current.weekPoints)),
                    GameText.zoneLabel(current.zone),
                    GameText.leagueCloses(remaining: GameWave2Format.remaining(closes: league.closes, now: now)),
                ]
            } else {
                items = [league.access == .locked ? GameText.leagueFriendsTitle : GameText.doorLeagueOpen]
            }
        case .season:
            guard let season = game?.season else { return [] }
            items = [
                GameText.seasonStars(count: season.stars),
                ConceptText.chipWeekOf(count(season.week), count(GameSeason.weeks)),
                season.completed ? nil : ConceptText.chipMissing(GameText.seasonStars(count: season.starsToNext)),
            ]
        case .prestige:
            guard let prestige = game?.prestige else { return [] }
            items = [
                GameText.doorPrestigeStars(stars: count(prestige.stars), max: count(prestige.max)),
                ConceptText.chipGloryOnPass(count(prestige.gloryOnPass)),
            ]
        case .elans:
            guard let elan = progress.elan else { return [families(0)] }
            items = [
                families(elan.activeFamilyCount),
                ConceptText.chipWindow(GameCopy.days(elan.windowDays)),
                elan.hasStanding ? ConceptText.chipStanding : nil,
            ]
        case .badges:
            items = [remaining(progress.badgesEarned, progress.badgesTotal)]
        case .defis:
            items = [remaining(defisDone(progress), defisTotal(progress))]
        case .succes:
            items = [remaining(progress.unlockedAchievementCount, progress.achievements.count)]
        case .showcase:
            items = [game?.visibility.map { ConceptText.chipVisible(GameText.visibilityLabel($0.showcase)) }]
        case .atlas:
            guard let atlas = game?.atlas else { return [] }
            items = [
                GameText.atlasRemaining(remaining: count(max(0, atlas.total - atlas.stamped))),
                atlas.pending.isEmpty ? nil : ConceptText.chipPending(count(atlas.pending.count)),
                game?.visibility.map { ConceptText.chipVisible(GameText.visibilityLabel($0.atlas)) },
            ]
        }
        return items.compactMap { $0 }
    }

    private static func chest(_ status: GameBlock.Chest.Status) -> String {
        switch status {
        case .ready: ConceptText.chipChestReady
        case .locked: ConceptText.chipChestLocked
        case .claimed: ConceptText.chipChestClaimed
        }
    }

    private static func families(_ active: Int) -> String {
        GameCopy.isSingular(active) ? ConceptText.chipFamiliesOne(count(active)) : ConceptText.chipFamiliesOther(count(active))
    }

    // MARK: - La jauge vers l'étape suivante

    static func gauge(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?) -> Double? {
        switch concept {
        case .level:
            if let level = game?.level { return level.nextThreshold == nil ? nil : level.progress }
            return progress.level.scale.nextThreshold == nil ? nil : progress.level.scale.progress
        case .points, .elans, .showcase, .prestige:
            return nil
        case .meesh:
            if let mint = game?.mint, mint.price > 0 {
                return share(max(0, mint.price - mint.missingPoints), mint.price)
            }
            return progress.meesh?.progress
        case .glory:
            guard let glory = game?.glory, glory.next != nil else { return nil }
            return glory.progress
        case .flame:
            return progress.streak.scale.nextThreshold == nil ? nil : progress.streak.scale.progress
        case .missions:
            guard let missions = game?.missions, missions.unlocked else { return nil }
            return share(missions.items.filter(\.isCompleted).count, missions.items.count)
        case .league:
            return nil
        case .season:
            guard let season = game?.season, !season.completed else { return nil }
            return season.progress
        case .badges:
            return share(progress.badgesEarned, progress.badgesTotal)
        case .defis:
            return share(defisDone(progress), defisTotal(progress))
        case .succes:
            return share(progress.unlockedAchievementCount, progress.achievements.count)
        case .atlas:
            guard let atlas = game?.atlas else { return nil }
            return share(atlas.stamped, atlas.total)
        }
    }

    // MARK: - Où j'en suis

    private static func fact(_ label: String, _ value: String) -> ProgressionConceptFact {
        ProgressionConceptFact(label: label, value: value)
    }

    private static func yesNo(_ value: Bool) -> String { value ? ConceptText.factYes : ConceptText.factNo }

    /// TOUTES les données du concept, en lignes libellé → valeur : la fiche et le tableau de bord lisent la même liste.
    static func facts(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?,
                      now: Date = Date()) -> [ProgressionConceptFact] {
        let rows: [ProgressionConceptFact?]
        switch concept {
        case .level:
            if let level = game?.level {
                rows = [
                    fact(ConceptText.name(.level), count(level.level)),
                    fact(ConceptText.factTier, GameCopy.tierName(level.tier)),
                    fact(ConceptText.name(.points), GameCopy.points(level.score)),
                    fact(ConceptText.factNextLevel, level.nextThreshold == nil
                        ? GameText.bannerTop : ConceptText.chipMissing(GameCopy.points(level.pointsToNext))),
                    fact(ConceptText.factRecord, GameText.bannerLevel(level: count(level.record))),
                    level.prestige > 0 ? fact(ConceptText.factStars, count(level.prestige)) : nil,
                ]
            } else {
                rows = [
                    fact(ConceptText.name(.level), count(progress.level.level)),
                    fact(ConceptText.name(.points), GameCopy.points(progress.level.scale.value)),
                    progress.level.scale.remainingToNext.map {
                        fact(ConceptText.factNextLevel, ConceptText.chipMissing(GameCopy.points($0)))
                    },
                ]
            }
        case .points:
            guard let game else { return [] }
            rows = [
                fact(ConceptText.name(.points), GameCopy.points(game.level.score)),
                progress.meesh.map { fact(ConceptText.factConvertible, GameCopy.points($0.debitablePoints)) },
                fact(ConceptText.factTailwind, ConceptText.valueFactor(GameCopy.factor(game.boosts.tailwind))),
                game.boosts.prismHour.map { fact(ConceptText.factPrismHour, ConceptText.valueFactor(GameCopy.factor($0.multiplier))) },
            ]
        case .meesh:
            let balance: ProgressionConceptFact? = progress.meesh.map { fact(ConceptText.factBalance, GameCopy.meeshes($0.balance)) }
            let minted: ProgressionConceptFact? = progress.meesh.map { fact(ConceptText.factMinted, count($0.mintedLifetime)) }
            if let game {
                let nextTreasury: ProgressionConceptFact? = game.treasury.next.map {
                    fact(ConceptText.factNextTreasury, GameCopy.treasuryName($0.key) + " · " + ConceptText.chipMissing(count($0.missing)))
                }
                rows = [
                    balance,
                    minted,
                    fact(ConceptText.factNextPrice, GameCopy.points(game.mint.price)),
                    fact(ConceptText.factMissing, GameCopy.points(game.mint.missingPoints)),
                    fact(ConceptText.factNextCoin, ConceptText.factCoin(count(game.mint.number), GameCopy.editionName(game.mint.edition))),
                    fact(ConceptText.factTreasury, game.treasury.tier.map { GameCopy.treasuryName($0) } ?? GameCopy.meeshes(game.treasury.held)),
                    nextTreasury,
                ]
            } else {
                rows = [
                    balance,
                    minted,
                    progress.meesh.map { fact(ConceptText.factNextPrice, GameCopy.points($0.mintCost)) },
                    progress.meesh.map { fact(ConceptText.factMissing, GameCopy.points($0.missingPoints)) },
                ]
            }
        case .glory:
            guard let glory = game?.glory else { return [] }
            let missing: String = glory.gloryMissing.map { " · " + ConceptText.chipMissing(count($0)) } ?? ""
            rows = [
                fact(ConceptText.factRank, GameCopy.rankLabel(glory.rank, division: glory.division)),
                fact(ConceptText.name(.glory), count(glory.glory)),
                glory.next.map { fact(ConceptText.factNextRank, GameCopy.rankLabel($0.rank, division: $0.division) + missing) },
            ]
        case .flame:
            let flame = game?.flame
            rows = [
                fact(ConceptText.factStreak, GameCopy.flameDays(flame?.days ?? progress.streak.currentDays)),
                fact(ConceptText.factRecord, GameCopy.days(progress.streak.longestDays)),
                flame?.form.map { fact(ConceptText.factForm, GameCopy.flameFormName($0)) },
                flame.map { fact(ConceptText.factBonus, ConceptText.factPercent(count($0.bonusPercent))) },
                flame.map { fact(ConceptText.factFreezes, ratio($0.freezes, $0.maxFreezes)) },
                flame.map { fact(ConceptText.factFreezePrice, GameCopy.meeshes($0.freezePrice)) },
                flame.map { fact(ConceptText.factRelightPrice, GameCopy.meeshes($0.relightPrice)) },
                flame.flatMap { GameCopy.flameStatus($0.status) }.map { fact(ConceptText.factState, $0) },
            ]
        case .missions:
            guard let game else { return [] }
            rows = [
                fact(ConceptText.factDone, ratio(game.missions.items.filter(\.isCompleted).count, game.missions.items.count)),
                fact(ConceptText.factChest, chest(game.chest.status)),
                fact(ConceptText.factReroll, game.missions.rerollAvailable ? ConceptText.factAvailable : ConceptText.factUsed),
                fact(ConceptText.chipPrismDay, yesNo(game.missions.prismDay)),
                fact(ConceptText.chipPersonal, yesNo(game.missions.personal != nil)),
            ]
        case .league:
            guard let league = game?.league else { return [] }
            let friends = fact(ConceptText.factFriends,
                               GameText.leagueRankLine(rank: count(league.friends.rank), size: count(league.friends.size)))
            if let current = GameLeagueDetail.current(of: league) {
                let toPromotion: ProgressionConceptFact? = current.pointsToPromotion.flatMap {
                    $0 > 0 ? fact(ConceptText.factToPromotion, ConceptText.chipMissing(GameCopy.points($0))) : nil
                }
                rows = [
                    fact(ConceptText.name(.league), GameText.leagueName(current.league)),
                    fact(ConceptText.factRank, GameText.leagueRankLine(rank: count(current.rank), size: count(current.groupSize))),
                    fact(ConceptText.factWeekPoints, GameCopy.points(current.weekPoints)),
                    fact(ConceptText.factZone, GameText.zoneLabel(current.zone)),
                    toPromotion,
                    fact(ConceptText.factCloses, GameWave2Format.remaining(closes: league.closes, now: now)),
                    friends,
                ]
            } else {
                rows = [fact(ConceptText.name(.league), value(.league, progress: progress, game: game)), friends]
            }
        case .season:
            guard let season = game?.season else {
                return [fact(ConceptText.name(.season), GameText.doorSeasonNone)]
            }
            rows = [
                fact(ConceptText.name(.season), count(season.number)),
                fact(ConceptText.factWeek, ratio(season.week, GameSeason.weeks)),
                fact(ConceptText.factStars, count(season.stars)),
                fact(ConceptText.factSteps, ratio(season.steps, season.stepsTotal)),
                season.completed ? nil : fact(ConceptText.factNextStep, ConceptText.chipMissing(GameText.seasonStars(count: season.starsToNext))),
                fact(ConceptText.factSeal, yesNo(season.sealOwned)),
            ]
        case .prestige:
            guard let prestige = game?.prestige else { return [] }
            rows = [
                fact(ConceptText.factStars, ratio(prestige.stars, prestige.max)),
                fact(ConceptText.factAvailable, yesNo(prestige.canPrestige)),
                fact(ConceptText.factGloryOnPass, count(prestige.gloryOnPass)),
            ]
        case .elans:
            guard let elan = progress.elan else {
                return [fact(ConceptText.factFamilies, count(0))]
            }
            let names: [String] = elan.activeFamilies.map { ProgressionCopy.title(for: $0) }
            rows = [
                fact(ConceptText.factFactor, ConceptText.valueFactor(GameCopy.factor(elan.factor))),
                fact(ConceptText.factFamilies, names.isEmpty ? count(elan.activeFamilyCount) : names.joined(separator: ", ")),
                fact(ConceptText.factWindow, GameCopy.days(elan.windowDays)),
            ]
        case .badges:
            let families: [ProgressionConceptFact] = progress.axesByFamily.map { group in
                let reached: Int = group.axes.reduce(0) { $0 + $1.scale.reachedCount }
                let total: Int = group.axes.reduce(0) { $0 + $1.scale.tiers.count }
                return fact(ProgressionCopy.title(for: group.family), ratio(reached, total))
            }
            return [
                fact(ConceptText.factUnlocked, ratio(progress.badgesEarned, progress.badgesTotal)),
                fact(ConceptText.factRemaining, count(max(0, progress.badgesTotal - progress.badgesEarned))),
            ] + families
        case .defis:
            let done = defisDone(progress)
            let total = defisTotal(progress)
            rows = [
                fact(ConceptText.factUnlocked, ratio(done, total)),
                fact(ConceptText.factRemaining, count(max(0, total - done))),
            ]
        case .succes:
            let done = progress.unlockedAchievementCount
            let total = progress.achievements.count
            rows = [
                fact(ConceptText.factUnlocked, ratio(done, total)),
                fact(ConceptText.factRemaining, count(max(0, total - done))),
            ]
        case .showcase:
            guard let game, let trophies = game.trophies else { return [] }
            rows = [
                fact(ConceptText.factTrophies, count(trophies.items.count)),
                game.visibility.map { fact(ConceptText.factVisible, GameText.visibilityLabel($0.showcase)) },
            ]
        case .atlas:
            guard let atlas = game?.atlas else { return [] }
            rows = [
                fact(ConceptText.factStamps, ratio(atlas.stamped, atlas.total)),
                fact(ConceptText.factRemaining, count(max(0, atlas.total - atlas.stamped))),
                fact(ConceptText.factPending, count(atlas.pending.count)),
                game?.visibility.map { fact(ConceptText.factVisible, GameText.visibilityLabel($0.atlas)) },
            ]
        }
        return rows.compactMap { $0 }
    }

    // MARK: - Aller plus loin

    /// Les sous-pages d'une fiche. La page de règles s'ouvre à la règle du concept quand le carnet en a une.
    static func links(_ concept: ProgressionConcept) -> [ProgressionConceptLink] {
        switch concept {
        case .level, .points: [.rules(GameHero.earnRule)]
        case .meesh: [.rules(GameHero.mintRule)]
        case .glory, .flame, .missions, .elans: [.rules(nil)]
        case .league: [.page(.league), .rules(nil)]
        case .season: [.page(.season), .rules(nil)]
        case .prestige: [.page(.prestige), .rules(nil)]
        case .badges: [.section(.badges), .rules(nil)]
        case .defis: [.section(.defis)]
        case .succes: [.section(.succes)]
        case .showcase: [.page(.showcase)]
        case .atlas: [.page(.atlas)]
        }
    }

    /// Le concept qu'une ancre du guide (ou d'une notification) désigne : sa FICHE s'ouvre, plus rien ne défile.
    static func concept(for anchor: GameAnchor) -> ProgressionConcept {
        switch anchor {
        case .level: .level
        case .missions: .missions
        case .flame, .flamePanel: .flame
        case .treasury: .points
        case .rank: .glory
        case .mint: .meesh
        }
    }

    /// La fiche où une proposition de photo se pose : celle du concept que son emblème célèbre.
    static func concept(for emblem: PhotoEmblem) -> ProgressionConcept {
        switch emblem {
        case .start, .tier, .levelHundred: .level
        case .rank: .glory
        case .meesh, .treasury: .meesh
        case .flame: .flame
        case .achievement: .succes
        case .trophy: .showcase
        case .leagueUp: .league
        case .season: .season
        case .prestige: .prestige
        }
    }
}
