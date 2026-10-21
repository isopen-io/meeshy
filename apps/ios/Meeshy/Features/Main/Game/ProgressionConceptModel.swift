import Foundation
import MeeshySDK

/// CE QUE CHAQUE CONCEPT DIT (#9564) — la carte de la première page, les lignes « Où j'en suis » de la fiche, la
/// jauge vers l'étape suivante, les sous-pages. Une loi PURE : elle lit la progression et le bloc `game` servis, et
/// ne calcule ni niveau, ni rang, ni prix — chaque nombre est celui du serveur, mis en mots.
///
/// Les deux surfaces (première page, fiche) PARCOURENT `ProgressionConcepts.served` et lisent ICI ce qu'elles
/// montrent. Trois règles de DÉDOUBLONNAGE y sont posées une fois (amendement n° 4) :
///  1. une donnée appartient à UN concept (`owner(of:)`) — elle ne se redit pas ailleurs tant que son concept est servi ;
///  2. une ligne ne redit jamais la valeur de tête ;
///  3. dans la fiche, « Où j'en suis » ne liste pas ce que la pièce de jeu montre déjà.
///
/// QUATRE QUESTIONS PAR CONCEPT (#10540) : ce que c'est (`what`), à quoi ça sert (`why`), comment ça marche et se
/// gagne (`how`, les conseils), comment s'en servir (`use`). La valeur en cours est suivie de SA phrase d'état
/// (`state(_:progress:game:)`), et tout « il manque » nomme sa cible : le niveau, la Meesh, le rang, la zone.

/// Une ligne « libellé → valeur » de « Où j'en suis ».
struct ProgressionConceptFact: Equatable, Identifiable {
    let label: String
    let value: String
    /// La donnée dont la ligne parle, quand elle a SA phrase au catalogue (`game.detail.fact.<donnée>`).
    var detail: GameDetailFactKey?

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
    /// La PREMIÈRE pastille demande une action (coffre prêt, Flamme en danger, frappe possible…) : elle se teinte.
    var urgent = false
    /// La part parcourue vers l'étape suivante ; `nil` quand il n'y a pas d'étape suivante.
    let gauge: Double?
    let why: String
    let how: String
    /// La phrase d'état (#10540) : l'étape où l'on est, et ce que la valeur vise. `nil` : rien n'est servi pour la dire.
    var state: String?

    var id: String { concept.rawValue }

    /// Un seul élément pour VoiceOver : concept, valeur, pourquoi, puis la phrase d'état quand elle existe — le trait
    /// « bouton » est posé par la vue.
    var accessibilityLabel: String {
        let head = ConceptText.cardA11y(name, value, why)
        return state.map { head + " " + $0 } ?? head
    }
}

/// La sous-page d'une fiche (« Aller plus loin ») : le troisième niveau du jeu (`GameNavigationMap`).
enum ProgressionConceptLink: Equatable, Identifiable {
    case page(GamePage)
    case section(ProgressionSection)

    var id: String {
        switch self {
        case .page(let page): "page.\(page.rawValue)"
        case .section(let section): "section.\(section.rawValue)"
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
        case .covered: String(localized: "game.flame.status.covered", defaultValue: "Une Veilleuse la garde", bundle: .main)
        case .out: String(localized: "game.flame.status.out", defaultValue: "Éteinte", bundle: .main)
        }
    }

    /// « 23 jours », ou « Pas de série » à zéro : une série nulle ne se dit pas « 0 jour ».
    static func flameDays(_ days: Int) -> String {
        days <= 0
            ? String(localized: "game.flame.no_streak", defaultValue: "Flamme à allumer", bundle: .main)
            : GameCopy.days(days)
    }

    /// « ×1,25 » — un multiplicateur, deux décimales au plus, dans la locale.
    static func factor(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(0...2)))
    }
}

/// Les données que plusieurs concepts pourraient dire — chacune a UN propriétaire (règle n° 1).
enum ProgressionSharedDatum: CaseIterable, Equatable {
    /// Les points en poche (le score).
    case score
    /// Le multiplicateur d'Élan.
    case factor
    /// Les étoiles de Prestige.
    case prestigeStars
    /// Le prix de la prochaine Meesh.
    case mintPrice
    /// Ce qui manque pour frapper.
    case mintMissing
    /// Le Vent arrière et l'heure Prisme : tout multiplicateur est aux Élans.
    case tailwind
}

enum ProgressionConceptModel {

    /// Trois données importantes au plus sur une carte : au-delà, c'est la fiche.
    static let maxChips = 3

    // MARK: - Règle n° 1 : une donnée, un concept

    /// Le concept qui POSSÈDE une donnée partagée.
    static func owner(of datum: ProgressionSharedDatum) -> ProgressionConcept {
        switch datum {
        case .score, .mintMissing: .points
        case .factor, .tailwind: .elans
        case .prestigeStars: .prestige
        case .mintPrice: .meesh
        }
    }

    /// Un concept dit-il cette donnée ? Oui s'il la possède, ou si son propriétaire n'est pas servi (devant un ancien
    /// serveur, le niveau garde le score : la carte des Points n'existe pas).
    static func says(_ datum: ProgressionSharedDatum, in concept: ProgressionConcept, served: Set<ProgressionConcept>) -> Bool {
        let holder = owner(of: datum)
        return holder == concept || !served.contains(holder)
    }

    private static func servedConcepts(_ progress: EngagementProgress, _ game: GameBlock?) -> Set<ProgressionConcept> {
        Set(ProgressionConcepts.served(for: progress, game: game))
    }

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
        let head = value(concept, progress: progress, game: game, now: now)
        let action = self.action(concept, progress: progress, game: game, now: now)
        let important = ([action].compactMap { $0 } + chips(concept, progress: progress, game: game, now: now))
            .filter { !$0.isEmpty && $0 != head }
            .reduce(into: [String]()) { kept, chip in if !kept.contains(chip) { kept.append(chip) } }
        return ProgressionConceptCard(
            concept: concept,
            name: ConceptText.name(concept),
            value: head,
            // Une carte ne reste jamais sans donnée : à défaut, sa valeur est la donnée.
            chips: Array((important.isEmpty ? [head] : important).prefix(maxChips)),
            urgent: action != nil && important.first == action,
            gauge: gauge(concept, progress: progress, game: game),
            why: ConceptText.why(concept),
            how: ConceptText.how(concept),
            state: state(concept, progress: progress, game: game)
        )
    }

    // MARK: - La valeur de la tête

    static func value(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?,
                      now: Date = Date()) -> String {
        switch concept {
        case .level:
            return GameText.bannerLevel(level: count(game?.level.shown.level ?? progress.level.level))
        case .points:
            return GameCopy.points(game?.level.score ?? progress.level.scale.value)
        case .meesh:
            return GameCopy.meeshes(progress.meesh?.balance ?? game?.treasury.held ?? 0)
        case .glory:
            guard let glory = game?.glory else { return "" }
            return GameCopy.rankLabel(glory)
        case .flame:
            return GameCopy.flameDays(game?.flame.days ?? progress.streak.currentDays)
        case .missions:
            guard let missions = game?.missions else { return "" }
            guard missions.unlocked else { return GameText.doorLeagueLocked(level: count(GameMissions.minLevel)) }
            return ratio(missions.items.filter(\.isCompleted).count, missions.items.count)
        case .league:
            guard let league = game?.league else { return "" }
            if league.access == .locked { return GameText.doorLeagueLocked(level: count(GameLeague.minLevel)) }
            // La valeur est le NOM de la ligue ; la place est une pastille (règle n° 2).
            guard let current = GameLeagueDetail.current(of: league) else { return GameText.doorLeagueOpen }
            return GameText.leagueName(current.league)
        case .season:
            guard let season = game?.season else {
                // Avant la saison 1 (#10014) : la date d'ouverture, jamais un vide.
                guard let upcoming = game?.seasonUpcoming else { return GameText.doorSeasonNone }
                // L'état se CALCULE (#10224), comme la page Saison : hors ligne, la copie « à venir » bascule
                // d'elle-même à la fermeture du dimanche 20 h qui ouvre la saison.
                let tense = GameSeason.liveTense(served: .upcoming, startDay: upcoming.startDay, endDay: upcoming.endDay,
                                                 at: .local(now))
                guard tense == .upcoming else { return GameText.doorSeason(number: count(upcoming.number)) }
                return GameText.doorSeasonUpcoming(date: GameWave2Format.day(upcoming.startDay))
            }
            return GameText.doorSeasonSteps(steps: count(season.steps), total: count(season.stepsTotal))
        case .prestige:
            // La valeur est « étoiles / max » ; « tu peux passer » est la pastille d'action.
            guard let prestige = game?.prestige else { return "" }
            return ratio(prestige.stars, prestige.max)
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

    /// LA PASTILLE D'ACTION (carte de navigation, § 4) : ce qui demande un geste, posé EN TÊTE de la carte et
    /// teinté — une au plus, lue dans le bloc servi, jamais calculée. L'ordre des cartes, lui, ne change jamais.
    static func action(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?,
                       now: Date = Date()) -> String? {
        switch concept {
        case .missions:
            guard let missions = game?.missions, missions.unlocked else { return nil }
            if game?.chest.status == .ready { return ConceptText.chipChestReady }
            guard let personal = missions.personal, let end = personal.endsAtDate else { return nil }
            let phase = GameMissionClock.phase(start: personal.startsAtDate, end: end, completed: personal.mission.isCompleted, now: now)
            guard case .running = phase else { return nil }
            return GameCopy.missionTimerLine(phase, window: nil)
        case .flame:
            return game?.flame.status == .atRisk ? GameCopy.flameStatus(.atRisk) : nil
        case .meesh:
            return (game?.mint.canMint ?? progress.meesh?.canMint ?? false) ? ConceptText.chipMintReady : nil
        case .prestige:
            return game?.prestige?.canPrestige == true ? GameText.doorPrestigeReady : nil
        case .level, .points, .glory, .league, .season, .elans, .badges, .defis, .succes, .showcase, .atlas:
            return nil
        }
    }

    /// Les données importantes, sous la pastille d'action, dans l'ordre où elles comptent ; aucune ne redit la valeur de
    /// tête ni la donnée d'un autre concept (règles n° 1 et 2). Chaque branche écrit une liste à trous (`nil` = « pas
    /// cette fois ») : ce qui manque ne laisse ni pastille vide ni condition recopiée.
    static func chips(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?,
                      now: Date = Date()) -> [String] {
        let served = servedConcepts(progress, game)
        let items: [String?]
        switch concept {
        case .level:
            if let level = game?.level.shown {
                items = [
                    GameCopy.tierName(level.tier),
                    level.nextThreshold == nil
                        ? GameCopy.levelTopShort(cap: level.cap)
                        : ConceptText.chipToLevel(level: count(level.level + 1), points: GameCopy.points(level.pointsToNext)),
                    level.record > level.level ? ConceptText.chipRecordLevel(count(level.record)) : nil,
                ]
            } else {
                items = [
                    says(.score, in: .level, served: served) ? GameCopy.points(progress.level.scale.value) : nil,
                    progress.level.scale.remainingToNext.map {
                        ConceptText.chipToLevel(level: count(progress.level.level + 1), points: GameCopy.points($0))
                    },
                ]
            }
        case .points:
            guard let game else { return [] }
            // Le solde à convertir et ce qui manque pour frapper sont aux Points ; tout multiplicateur est aux Élans
            // (règle n° 1). Le manque nomme la pièce qu'il vise.
            items = [
                convertiblePoints(progress: progress, game: game).map { GameCopy.convertiblePoints($0) },
                game.mint.canMint
                    ? ConceptText.chipMintCovered
                    : ConceptText.chipToMeesh(number: count(game.mint.number), missing: count(game.mint.missingPoints)),
            ]
        case .meesh:
            let missingHere = says(.mintMissing, in: .meesh, served: served)
            if let mint = game?.mint {
                items = [
                    ConceptText.chipNextPrice(GameCopy.points(mint.price)),
                    !mint.canMint && missingHere ? ConceptText.chipToMeesh(number: count(mint.number), missing: count(mint.missingPoints)) : nil,
                    progress.meesh.map { ConceptText.chipMinted(count($0.mintedLifetime)) },
                ]
            } else if let meesh = progress.meesh {
                items = [
                    ConceptText.chipNextPrice(GameCopy.points(meesh.mintCost)),
                    !meesh.canMint && missingHere
                        ? ConceptText.chipToMeesh(number: count(meesh.mintedLifetime + 1), missing: count(meesh.missingPoints)) : nil,
                    ConceptText.chipMinted(count(meesh.mintedLifetime)),
                ]
            } else {
                items = []
            }
        case .glory:
            guard let glory = game?.glory else { return [] }
            items = [
                GameCopy.gloryAmount(count(glory.glory)),
                glory.next.map { ConceptText.chipNext(name: GameCopy.rankLabel($0.rank, division5: $0.shownDivision)) } ?? ConceptText.chipTopRank,
            ]
        case .flame:
            let record = ProgressionCopy.streakRecord(progress.streak.longestDays)
            guard let flame = game?.flame else { return [record] }
            items = [
                record,
                ConceptText.chipFreezesOf(count(flame.freezes), count(flame.maxFreezes)),
                flame.form.map { GameCopy.flameFormName($0) },
            ]
        case .missions:
            guard let game else { return [] }
            items = [
                game.chest.status == .ready ? nil : chest(game.chest.status),
                game.missions.unlocked && game.missions.rerollAvailable ? ConceptText.chipReroll : nil,
                game.missions.prismDay ? ConceptText.chipPrismDay : nil,
                game.missions.personal != nil ? ConceptText.chipPersonal : nil,
            ]
        case .league:
            guard let league = game?.league else { return [] }
            if let current = GameLeagueDetail.current(of: league) {
                items = [
                    GameText.leagueRankLine(rank: count(current.rank), size: count(current.groupSize)),
                    GameText.leagueDetailWeek(points: GameCopy.points(current.weekPoints)),
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
            ]
        case .prestige:
            guard let prestige = game?.prestige else { return [] }
            items = [
                prestige.canPrestige ? nil : (prestige.stars >= prestige.max ? GameText.bannerTop : GameText.doorPrestigeLocked),
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

    static func families(_ active: Int) -> String {
        GameCopy.isSingular(active) ? ConceptText.chipFamiliesOne(count(active)) : ConceptText.chipFamiliesOther(count(active))
    }

    // MARK: - La jauge vers l'étape suivante

    static func gauge(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?) -> Double? {
        switch concept {
        case .level:
            if let level = game?.level.shown { return level.nextThreshold == nil ? nil : level.progress }
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

    private static func fact(_ label: String, _ value: String, _ detail: GameDetailFactKey? = nil) -> ProgressionConceptFact {
        ProgressionConceptFact(label: label, value: value, detail: detail)
    }

    private static func yesNo(_ value: Bool) -> String { value ? ConceptText.factYes : ConceptText.factNo }

    /// « OÙ J'EN SUIS » d'une fiche : les données du concept, en lignes libellé → valeur, après les trois règles de
    /// dédoublonnage. Ni la valeur de tête (le héros ou la pièce la disent), ni ce que la pièce de jeu montre déjà, ni
    /// la donnée d'un autre concept servi. Vide quand la pièce dit tout : la section ne paraît pas.
    static func facts(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?,
                      now: Date = Date()) -> [ProgressionConceptFact] {
        let served = servedConcepts(progress, game)
        let piece = ProgressionConceptGestures.isHero(for: concept, progress: progress, game: game)
        let rows: [ProgressionConceptFact?]
        switch concept {
        case .level:
            // La pièce (l'anneau du héros de niveau, ou les paliers devant un ancien serveur) dit le niveau, le
            // palier, ce qui manque et le record ; le score est aux Points, les étoiles au Prestige.
            if let block = game?.level {
                let level = block.shown
                rows = [
                    piece ? nil : fact(ConceptText.factTier, GameCopy.tierName(level.tier), .tier),
                    says(.score, in: .level, served: served) ? fact(ConceptText.name(.points), GameCopy.points(block.score), .score) : nil,
                    piece ? nil : (level.nextThreshold == nil
                        ? fact(ConceptText.factNextLevel, GameCopy.levelTopShort(cap: level.cap), .levelNext)
                        : fact(ConceptText.missingForLevel(level: count(level.level + 1)), GameCopy.points(level.pointsToNext), .levelNext)),
                    piece || level.record <= level.level
                        ? nil : fact(ConceptText.factRecord, GameText.bannerLevel(level: count(level.record)), .levelRecord),
                    block.prestige > 0 && says(.prestigeStars, in: .level, served: served)
                        ? fact(ConceptText.factStars, count(block.prestige)) : nil,
                ]
            } else {
                rows = piece ? [] : [
                    fact(ConceptText.name(.points), GameCopy.points(progress.level.scale.value), .score),
                    progress.level.scale.remainingToNext.map {
                        fact(ConceptText.missingForLevel(level: count(progress.level.level + 1)), GameCopy.points($0), .levelNext)
                    },
                ]
            }
        case .points:
            // La tête dit les points en poche ; le solde à convertir et ce qui manque pour frapper sont ici, le prix aux
            // Meeshes, les multiplicateurs aux Élans. Le manque nomme la pièce qu'il vise (#10540).
            guard let game else { return [] }
            rows = [
                convertiblePoints(progress: progress, game: game).map { fact(ConceptText.factConvertible, GameCopy.points($0), .convertible) },
                game.mint.canMint ? nil : fact(ConceptText.missingForMeesh(number: count(game.mint.number)),
                                               GameCopy.convertiblePoints(game.mint.missingPoints), .mintMissing),
            ]
        case .meesh:
            // La tête dit le solde ; la pièce (la frappe et le palier du trésor) dit la prochaine pièce, son prix, ce
            // qui manque et le trésor.
            let minted: ProgressionConceptFact? = progress.meesh.map { fact(ConceptText.factMinted, count($0.mintedLifetime), .minted) }
            if let game {
                rows = [
                    minted,
                    game.treasury.next.map {
                        fact(ConceptText.factNextTreasury, GameCopy.treasuryNext(missing: count($0.missing), tier: GameCopy.treasuryName($0.key)))
                    },
                ]
            } else {
                rows = piece ? [] : [
                    minted,
                    progress.meesh.map { fact(ConceptText.factNextPrice, GameCopy.points($0.mintCost), .mintPrice) },
                ]
            }
        case .glory:
            // La tête dit le rang.
            guard let glory = game?.glory else { return [] }
            let next: String? = glory.next.map { GameCopy.rankLabel($0.rank, division5: $0.shownDivision) }
            rows = [
                fact(ConceptText.name(.glory), count(glory.glory), .glory),
                next.map { fact(ConceptText.factNextRank, $0) },
                next.flatMap { name in
                    glory.gloryMissing.map { fact(ConceptText.missingForRank(rank: name), GameCopy.gloryAmount(count($0)), .gloryMissing) }
                },
            ]
        case .flame:
            // La tête dit la série ; les tuiles de la fiche disent la forme et les gels.
            let flame = game?.flame
            rows = [
                fact(ConceptText.factRecord, GameCopy.days(progress.streak.longestDays), .streakRecord),
                flame.map { fact(ConceptText.factBonus, ConceptText.factPercent(count($0.bonusPercent))) },
                flame.map { fact(ConceptText.factFreezePrice, GameCopy.meeshes($0.freezePrice)) },
                flame.map { fact(ConceptText.factRelightPrice, GameCopy.meeshes($0.relightPrice)) },
                flame.flatMap { GameCopy.flameStatus($0.status) }.map { fact(ConceptText.factState, $0, .flameState) },
            ]
        case .missions:
            // La tête dit les missions faites ; la liste des missions montre le coffre, le changement, le Prisme et la
            // mission personnelle.
            return []
        case .league:
            // La tête dit la ligue et la place ; la pièce (le détail de ligue) dit les points de la semaine et la
            // fermeture.
            guard let league = game?.league else { return [] }
            let friends = fact(ConceptText.factFriends,
                               GameText.leagueRankLine(rank: count(league.friends.rank), size: count(league.friends.size)),
                               .leagueFriends)
            if let current = GameLeagueDetail.current(of: league) {
                rows = [
                    piece ? nil : fact(ConceptText.factWeekPoints, GameCopy.points(current.weekPoints), .weekPoints),
                    fact(ConceptText.factZone, GameText.zoneLabel(current.zone), .leagueZone),
                    current.pointsToPromotion.flatMap {
                        $0 > 0 ? fact(ConceptText.missingForPromotion, GameCopy.points($0), .leagueMissing) : nil
                    },
                    piece ? nil : fact(ConceptText.factCloses, GameWave2Format.remaining(closes: league.closes, now: now), .leagueCloses),
                    friends,
                ]
            } else {
                rows = [friends]
            }
        case .season:
            // La tête dit les étapes ouvertes.
            guard let season = game?.season else { return [] }
            rows = [
                fact(ConceptText.name(.season), count(season.number), .season),
                fact(ConceptText.factWeek, ratio(season.week, GameSeason.weeks), .seasonWeek),
                fact(ConceptText.factStars, count(season.stars), .seasonStars),
                fact(ConceptText.factSeal, yesNo(season.sealOwned)),
            ]
        case .prestige:
            // La tête dit les étoiles : seule la Gloire du passage reste.
            guard let prestige = game?.prestige else { return [] }
            rows = [fact(ConceptText.factGloryOnPass, count(prestige.gloryOnPass), .prestigeGlory)]
        case .elans:
            // La pièce (les Élans) dit le multiplicateur, les familles et la fenêtre ; les multiplicateurs du jeu sont
            // ici, et seulement ici (règle n° 1).
            guard let boosts = game?.boosts else { return [] }
            // Le Vent arrière ne se dit que quand il souffle (#10896) : à 7 niveaux ou plus sous le record de niveau.
            rows = [
                boosts.tailwind > 1
                    ? fact(GameRulesGlossary.name(.tailwind), ConceptText.valueFactor(GameCopy.factor(boosts.tailwind)), .tailwind)
                    : nil,
                boosts.prismHour.map { fact(ConceptText.factPrismHour, ConceptText.valueFactor(GameCopy.factor($0.multiplier))) },
            ]
        case .badges:
            // La tête dit les badges obtenus.
            let families: [ProgressionConceptFact] = progress.axesByFamily.map { group in
                let reached: Int = group.axes.reduce(0) { $0 + $1.scale.reachedCount }
                let total: Int = group.axes.reduce(0) { $0 + $1.scale.tiers.count }
                return fact(ProgressionCopy.title(for: group.family), ratio(reached, total))
            }
            return [fact(ConceptText.factRemaining, count(max(0, progress.badgesTotal - progress.badgesEarned)))] + families
        case .defis:
            rows = [fact(ConceptText.factRemaining, count(max(0, defisTotal(progress) - defisDone(progress))))]
        case .succes:
            rows = [fact(ConceptText.factRemaining, count(max(0, progress.achievements.count - progress.unlockedAchievementCount)))]
        case .showcase:
            // La tête dit le nombre de trophées.
            guard let game, game.trophies != nil else { return [] }
            rows = [game.visibility.map { fact(ConceptText.factVisible, GameText.visibilityLabel($0.showcase), .showcaseVisibility) }]
        case .atlas:
            // La tête dit les tampons.
            guard let atlas = game?.atlas else { return [] }
            rows = [
                fact(ConceptText.factRemaining, count(max(0, atlas.total - atlas.stamped))),
                atlas.pending.isEmpty ? nil : fact(ConceptText.factPending, count(atlas.pending.count), .atlasPending),
                game?.visibility.map { fact(ConceptText.factVisible, GameText.visibilityLabel($0.atlas)) },
            ]
        }
        let head = value(concept, progress: progress, game: game)
        return rows.compactMap { $0 }.filter { $0.value != head }
    }

    // MARK: - Aller plus loin

    /// « Aller plus loin » : la sous-page du concept, et ELLE SEULE (carte de navigation, amendement n° 4). Aucun lien
    /// transverse : « Comment ça marche » est une porte de la première page, et la fiche porte déjà « C'est quoi ? »
    /// et « Comment en gagner ». Les sept concepts du jeu de base n'en ont pas : la section ne paraît pas.
    static func links(_ concept: ProgressionConcept) -> [ProgressionConceptLink] {
        switch concept {
        case .league: [.page(.league)]
        case .season: [.page(.season)]
        case .prestige: [.page(.prestige)]
        case .badges: [.section(.badges)]
        case .defis: [.section(.defis)]
        case .succes: [.section(.succes)]
        case .showcase: [.page(.showcase)]
        case .atlas: [.page(.atlas)]
        case .level, .points, .meesh, .glory, .flame, .missions, .elans: []
        }
    }

    /// Le concept qu'une ancre du guide (ou d'une notification) désigne : sa FICHE s'ouvre, plus rien ne défile.
    static func concept(for anchor: GameAnchor) -> ProgressionConcept {
        switch anchor {
        case .level: .level
        case .missions: .missions
        case .flame, .flamePanel: .flame
        case .treasury: .meesh
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
        case .mission: .missions
        case .trophy: .showcase
        case .leagueUp: .league
        case .season: .season
        case .prestige: .prestige
        }
    }
}

// MARK: - La phrase d'état d'un concept (#10540)

/// LA PHRASE D'ÉTAT — retour du porteur : « j'ai 77 099 points, il te manque 1 839 points, points à convertir 5 823,
/// niveau 27 ». Trois chiffres justes qui mesurent trois choses, et l'écran ne disait pas lesquelles. Chaque valeur en
/// cours est suivie d'UNE phrase qui dit l'étape où l'on est et ce que le chiffre vise : le niveau suivant, la
/// prochaine Meesh, le rang, la zone de montée. MIROIR de `conceptState` (`apps/web/src/lib/view/progression-state.ts`).
///
/// Pure : le bloc `game` et la progression sont lus tels que servis (le plancher du niveau, son seuil, le prix, le
/// manque viennent de la loi, rejouée par le serveur), puis habillés par le catalogue. Ce que le serveur ne sert pas
/// n'a pas de phrase (`nil`) : rien n'est inventé.
///
/// LES DEUX SOLDES DE POINTS ont deux noms stables : les points EN POCHE (`level.score`), qui font le niveau, et les
/// points À CONVERTIR (`meesh.debitablePoints`), seuls à payer une Meesh. La phrase les dit tous les deux ; elle ne
/// promet pas qu'ils soient proches.
extension ProgressionConceptModel {

    /// Le solde à convertir : celui du porte-monnaie servi ; sans lui, une frappe impossible le DIT (le prix moins le
    /// manque) ; possible, il reste inconnu — jamais déduit du score.
    static func convertiblePoints(progress: EngagementProgress, game: GameBlock?) -> Int? {
        if let meesh = progress.meesh { return meesh.debitablePoints }
        guard let mint = game?.mint, !mint.canMint else { return nil }
        return max(0, mint.price - mint.missingPoints)
    }

    static func state(_ concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?) -> String? {
        switch concept {
        case .level: levelState(progress, game)
        case .points: pointsState(progress, game)
        case .meesh: meeshState(progress, game)
        case .glory: gloryState(game)
        case .flame: flameState(progress, game)
        case .missions: missionsState(game)
        case .league: leagueState(game)
        case .season: seasonState(game)
        case .prestige: prestigeState(game)
        case .elans: elansState(progress)
        case .badges: countedState(.badges, done: progress.badgesEarned, total: progress.badgesTotal)
        case .defis: countedState(.defis, done: defisDone(progress), total: defisTotal(progress))
        case .succes: countedState(.succes, done: progress.unlockedAchievementCount, total: progress.achievements.count)
        case .showcase: showcaseState(game)
        case .atlas: atlasState(game)
        }
    }

    private static func levelState(_ progress: EngagementProgress, _ game: GameBlock?) -> String? {
        guard let block = game?.level else {
            let scale = progress.level.scale
            guard let next = scale.nextThreshold else { return GameCopy.levelTop(cap: nil) }
            return ConceptText.stateLevelSimple(level: count(progress.level.level), left: GameCopy.points(max(0, next - scale.value)),
                                                next: count(progress.level.level + 1))
        }
        let level = block.shown
        // Retenu par une étape (#9706) : la phrase dit l'étape, jamais « il en reste 0 ».
        if level.held, let step = level.step { return GameCopy.levelHeld(step) }
        guard let next = level.nextThreshold else { return GameCopy.levelTop(cap: level.cap) }
        return ConceptText.stateLevelProgress(
            level: count(level.level), done: GameCopy.points(max(0, block.score - level.floorScore)),
            span: count(next - level.floorScore), left: count(level.pointsToNext), next: count(level.level + 1)
        )
    }

    private static func pointsState(_ progress: EngagementProgress, _ game: GameBlock?) -> String? {
        guard let game else { return nil }
        let mint = game.mint
        let number = count(mint.number)
        let price = GameCopy.points(mint.price)
        // Les étincelles (#10846) : UN seul solde, la poche, toute convertible — jamais le cycle, indicatif (#10892).
        if game.level.sparks != nil {
            let pocket = GameCopy.points(game.level.sparkFacts.pocket)
            return mint.canMint
                ? ConceptText.statePointsReadyPlain(held: pocket, number: number, price: price)
                : ConceptText.statePointsMissingPlain(held: pocket, number: number, price: price,
                                                      missing: GameCopy.points(mint.missingPoints))
        }
        let held = GameCopy.points(game.level.score)
        guard let convertible = convertiblePoints(progress: progress, game: game) else {
            return ConceptText.statePointsReadyPlain(held: held, number: number, price: price)
        }
        let toConvert = GameCopy.convertiblePoints(convertible)
        guard !mint.canMint else {
            return ConceptText.statePointsReady(held: held, convertible: toConvert, number: number, price: price)
        }
        return ConceptText.statePointsMissing(held: held, convertible: toConvert, number: number, price: price,
                                              missing: GameCopy.convertiblePoints(mint.missingPoints))
    }

    private static func meeshState(_ progress: EngagementProgress, _ game: GameBlock?) -> String? {
        guard let game else { return nil }
        let mint = game.mint
        let balance = progress.meesh?.balance ?? game.treasury.held
        let minted = count(progress.meesh?.mintedLifetime ?? max(0, mint.number - 1))
        let kept = balance <= 0
            ? ConceptText.stateMeeshKeptNone(minted: minted)
            : ConceptText.stateMeeshKept(balance: GameCopy.meeshes(balance), minted: minted)
        let number = count(mint.number)
        let price = GameCopy.points(mint.price)
        let next = mint.canMint
            ? ConceptText.stateMeeshNextReady(number: number, price: price)
            : ConceptText.stateMeeshNextMissing(number: number, price: price, missing: GameCopy.convertiblePoints(mint.missingPoints))
        return kept + " " + next
    }

    private static func gloryState(_ game: GameBlock?) -> String? {
        guard let glory = game?.glory else { return nil }
        let rank = GameCopy.rankLabel(glory)
        let held = count(glory.glory)
        guard let next = glory.next else { return ConceptText.stateGloryTop(rank: rank, glory: held) }
        return ConceptText.stateGloryNext(
            rank: rank, glory: held, missing: count(glory.gloryMissing ?? max(0, next.minGlory - glory.glory)),
            next: GameCopy.rankLabel(next.rank, division5: next.shownDivision)
        )
    }

    private static func flameState(_ progress: EngagementProgress, _ game: GameBlock?) -> String? {
        guard let flame = game?.flame else {
            let streak = progress.streak
            guard streak.currentDays > 0 else { return ConceptText.stateFlameNone }
            return ConceptText.stateFlameStreak(days: GameCopy.days(streak.currentDays), record: GameCopy.days(streak.longestDays))
        }
        let days = GameCopy.days(flame.days)
        switch flame.status {
        case .none: return ConceptText.stateFlameNone
        case .out: return ConceptText.stateFlameOut
        case .atRisk: return ConceptText.stateFlameAtRisk(days: days)
        case .covered: return ConceptText.stateFlameCovered(days: days)
        case .lit:
            return ConceptText.stateFlameLit(days: days, bonus: count(min(100, max(0, flame.bonusPercent))),
                                             freezes: ratio(flame.freezes, flame.maxFreezes))
        }
    }

    private static func missionsState(_ game: GameBlock?) -> String? {
        guard let game else { return nil }
        let missions = game.missions
        guard missions.unlocked else { return GameCopy.missionsLocked(level: count(game.level.shown.level)) }
        let total = missions.items.count
        let done = missions.items.filter(\.isCompleted).count
        switch game.chest.status {
        case .claimed: return ConceptText.stateMissionsClaimed(done: count(done), total: count(total))
        case .ready: return ConceptText.stateMissionsReady(done: count(done), total: count(total))
        case .locked: return ConceptText.stateMissionsProgress(done: count(done), total: count(total), left: count(max(0, total - done)))
        }
    }

    private static func leagueState(_ game: GameBlock?) -> String? {
        guard let game, let league = game.league else { return nil }
        if league.access == .locked {
            return GameText.leagueLocked(level: count(GameLeague.minLevel), current: count(game.level.shown.level))
        }
        guard let current = GameLeagueDetail.current(of: league) else { return ConceptText.stateLeagueUnplaced }
        let place = ConceptText.stateLeaguePlace(league: GameText.leagueName(current.league), rank: count(current.rank),
                                                 size: count(current.groupSize), points: GameCopy.points(current.weekPoints))
        guard let zone = leagueZoneState(current) else { return place }
        return place + " " + zone
    }

    /// La zone, avec ce qu'il manque pour la zone de MONTÉE — la cible est dans la phrase.
    private static func leagueZoneState(_ current: GameLeagueBlock.Current) -> String? {
        if current.zone == .promotion { return ConceptText.stateLeagueZonePromotion }
        guard let missing = current.pointsToPromotion, missing > 0 else { return nil }
        switch current.zone {
        case .promotion: return ConceptText.stateLeagueZonePromotion
        case .safe: return ConceptText.stateLeagueZoneSafe(missing: GameCopy.points(missing))
        case .relegation: return ConceptText.stateLeagueZoneRelegation(missing: GameCopy.points(missing))
        }
    }

    private static func seasonState(_ game: GameBlock?) -> String? {
        guard let game else { return nil }
        guard let season = game.season else { return GameText.seasonNone }
        let number = count(season.number)
        let week = count(season.week)
        let weeks = count(GameSeason.weeks)
        let total = count(season.stepsTotal)
        guard season.steps < season.stepsTotal else {
            return ConceptText.stateSeasonDone(number: number, week: week, weeks: weeks, total: total)
        }
        return ConceptText.stateSeasonProgress(number: number, week: week, weeks: weeks, steps: count(season.steps), total: total,
                                               stars: GameText.seasonStars(count: season.starsToNext))
    }

    private static func prestigeState(_ game: GameBlock?) -> String? {
        guard let game, let prestige = game.prestige else { return nil }
        if prestige.canPrestige { return GameText.prestigeMee }
        if prestige.stars >= prestige.max { return GameText.prestigeMax }
        return GameText.prestigeLocked(level: count(game.level.shown.level))
    }

    private static func elansState(_ progress: EngagementProgress) -> String? {
        guard let elan = progress.elan else { return nil }
        let active = families(elan.activeFamilyCount)
        return elan.isAccelerated
            ? ConceptText.stateElansActive(factor: GameCopy.factor(elan.factor), families: active)
            : ConceptText.stateElansIdle(families: active)
    }

    private enum Counted { case badges, defis, succes }

    private static func countedState(_ kind: Counted, done: Int, total: Int) -> String? {
        guard total > 0 else { return nil }
        guard done < total else { return ConceptText.stateCountComplete(done: count(done), total: count(total)) }
        let left = count(total - done)
        switch kind {
        case .badges: return ConceptText.stateCountBadges(done: count(done), total: count(total), left: left)
        case .defis: return ConceptText.stateCountDefis(done: count(done), total: count(total), left: left)
        case .succes: return ConceptText.stateCountSucces(done: count(done), total: count(total), left: left)
        }
    }

    private static func showcaseState(_ game: GameBlock?) -> String? {
        guard let game, let trophies = game.trophies else { return nil }
        guard !trophies.items.isEmpty else { return GameText.showcaseEmpty }
        return ConceptText.stateShowcaseCount(
            trophies: GameText.doorShowcaseCount(count: trophies.items.count),
            who: GameText.visibilityLabel(game.visibility?.showcase ?? GameTrophies.defaultVisibility)
        )
    }

    private static func atlasState(_ game: GameBlock?) -> String? {
        guard let atlas = game?.atlas else { return nil }
        guard atlas.stamped > 0 || !atlas.pending.isEmpty else { return GameText.atlasEmpty }
        return ConceptText.stateAtlasProgress(stamped: count(atlas.stamped), total: count(atlas.total), pending: count(atlas.pending.count))
    }
}
