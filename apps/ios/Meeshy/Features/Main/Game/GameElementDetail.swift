import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Les précisions d'un élément du jeu (#9564, amendement n° 2)
//
// Tout élément qui porte un sens répond au toucher : il rebondit, puis une feuille dit SES précisions — son
// emblème en grand, son nom, son état (obtenu, avec la date quand elle est servie ; verrouillé, avec ce qu'il
// manque et sa jauge), ce que c'est, comment on l'obtient ou ce que ça donne, sa rareté quand elle est servie.
//
// UN modèle (`GameElementDetail`) nourrit UNE feuille (`GameElementSheet`). Une fonction PURE par famille le
// bâtit depuis le bloc `game` et la progression servie : aucun calcul, aucune donnée inventée — ce que la
// passerelle ne sert pas ne s'affiche pas. Miroir de `apps/web/src/lib/game-detail/` (#9563).

/// Les familles d'éléments — la liste FERMÉE du partagé (`GAME_DETAIL_FAMILIES`,
/// `apps/web/src/lib/game/detail-families.ts`). La valeur brute est le segment `<famille>` des clés
/// `game.detail.<famille>.what` / `.how` : les mêmes clés sur le web et sur iOS. `fact` n'est pas une famille du
/// catalogue : c'est une pastille ou une ligne de donnée, dont la phrase est `game.detail.fact.<donnée>` ; `player`
/// non plus : c'est une ligne du classement de la ligue, qui n'a qu'une phrase (`game.detail.player.what`).
enum GameElementKind: String, CaseIterable, Equatable {
    case badge
    case achievement = "succes"
    case challenge = "defi"
    case trophy
    case stamp
    case seasonStep = "step"
    case seal
    case leagueGem = "gem"
    case prestigeStar = "star"
    case rank
    case flameForm = "flame"
    case freeze
    case mission
    case chest
    case coin
    case levelRing = "ring"
    case treasuryTier = "treasury"
    case elanFamily = "elan"
    case fact
    case player

    /// Les dix-huit familles du catalogue (tout sauf la donnée et la ligne de classement).
    static let families: [GameElementKind] = allCases.filter { $0 != .fact && $0 != .player }

    /// Ce que la seconde phrase d'une famille dit (miroir de `GAME_DETAIL_HOW`) : comment on OBTIENT l'élément,
    /// ou ce qu'il DONNE. Le titre de la section en dépend.
    enum How: Equatable {
        case obtain
        case gives
    }

    var how: How {
        switch self {
        case .flameForm, .mission, .chest, .elanFamily: .gives
        case .badge, .achievement, .challenge, .trophy, .stamp, .seasonStep, .seal, .leagueGem, .prestigeStar, .rank,
             .freeze, .coin, .levelRing, .treasuryTier, .fact, .player: .obtain
        }
    }

    /// Le concept dont l'élément relève : c'est sa fiche que « Voir la fiche » ouvre.
    var concept: ProgressionConcept? {
        switch self {
        case .badge: .badges
        case .achievement: .succes
        case .challenge: .defis
        case .trophy: .showcase
        case .stamp: .atlas
        case .seasonStep, .seal: .season
        case .leagueGem, .player: .league
        case .prestigeStar: .prestige
        case .rank: .glory
        case .flameForm, .freeze: .flame
        case .mission, .chest: .missions
        case .coin, .treasuryTier: .meesh
        case .levelRing: .level
        case .elanFamily: .elans
        case .fact: nil
        }
    }
}

/// Les DONNÉES qui ont leur phrase (miroir de `GAME_DETAIL_FACTS`) : la valeur brute est le segment `<donnée>` de
/// `game.detail.fact.<donnée>`. Une ligne qui n'est pas dans la liste dit la phrase de son concept.
enum GameDetailFactKey: String, CaseIterable, Equatable {
    case tier
    case score
    case levelNext = "level_next"
    case levelRecord = "level_record"
    case tailwind
    case mintPrice = "mint_price"
    case mintMissing = "mint_missing"
    case canMint = "can_mint"
    case factor
    case mintNext = "mint_next"
    case mintGlory = "mint_glory"
    case minted
    case glory
    case gloryMissing = "glory_missing"
    case streak
    case streakRecord = "streak_record"
    case flameState = "flame_state"
    case missionsDone = "missions_done"
    case leaguePlace = "league_place"
    case weekPoints = "week_points"
    case leagueZone = "league_zone"
    case leagueMissing = "league_missing"
    case leagueCloses = "league_closes"
    case leagueFriends = "league_friends"
    case season
    case seasonWeek = "season_week"
    case seasonSteps = "season_steps"
    case seasonStars = "season_stars"
    case prestigeGlory = "prestige_glory"
    case elanFamilies = "elan_families"
    case badgesEarned = "badges_earned"
    case defisEarned = "defis_earned"
    case succesEarned = "succes_earned"
    case trophies
    case showcaseVisibility = "showcase_visibility"
    case atlasStamps = "atlas_stamps"
    case atlasPending = "atlas_pending"
}

/// L'emblème d'un élément — une DONNÉE, que la feuille dessine en grand avec les briques du jeu.
enum GameElementEmblem: Equatable {
    case concept(ProgressionConcept)
    case tier(LevelTierKey)
    /// Le rang, sa division V–I (`nil` pour Mythe) et la place servie du Mythe (#9636).
    case rank(GloryRank, GloryDivision5?, MythicSeatRef?)
    case coin(MeeshEdition)
    case flame(FlameFormKey?)
    case chest(open: Bool)
    case league(LeagueKey)
    case trophy(GameMaterial)
    case stamp(code: String, stamped: Bool)
    case badge(family: GameMedalFamily, glyph: GameMedalGlyph, material: GameMaterial, lit: Bool, progress: Double)
    /// Un succès (médaillon à réunir) ou un défi (losange du record) : la FORME dit le type.
    case medal(shape: GameBadgeView.Shape, material: GameMaterial, lit: Bool)
    case symbol(String)
}

/// L'état d'un élément, dit en toutes lettres par la feuille.
enum GameElementStatus: Equatable {
    /// Obtenu ; `since` est la date SERVIE, déjà mise en mots (« Obtenu le 3 octobre 2026 »), ou `nil`.
    case obtained(since: String?)
    /// Verrouillé ; ce qu'il manque (déjà en mots) et la part parcourue, quand la passerelle les sert.
    case locked(missing: String?, progress: Double?)
    /// Une donnée : ni obtenue ni verrouillée. Sa valeur est dite, avec la jauge quand il y a une étape suivante.
    case value(String, progress: Double?)
}

struct GameElementDetail: Identifiable, Equatable {
    let kind: GameElementKind
    /// L'identité de CET élément : deux badges ne partagent pas leurs précisions.
    let key: String
    let emblem: GameElementEmblem
    let name: String
    let status: GameElementStatus
    /// Les données de l'élément, en lignes libellé → valeur.
    var facts: [ProgressionConceptFact] = []
    /// La rareté MESURÉE, quand la passerelle la sert ; `nil` : rien ne se dit.
    var rarity: GameRarityEntry?
    /// Le concept dont l'élément relève — celui d'une pastille ou d'une ligne est porté par la donnée elle-même.
    let concept: ProgressionConcept
    /// La donnée dont une ligne parle, quand elle a sa phrase au catalogue.
    var factKey: GameDetailFactKey?
    /// Ce qu'un BADGE dit de lui-même (#9640) : ce qui compte pour son axe, sa matière et pourquoi, ses étoiles, ses
    /// sept paliers, la prochaine étoile. `nil` pour tout autre élément.
    var badge: GameBadgeGuideModel?

    var id: String { kind.rawValue + ":" + key }

    /// « C'est quoi » — la phrase de la famille ; pour une donnée, SA phrase, ou à défaut celle de son concept ;
    /// pour une ligne du classement, ce qu'on voit d'un autre joueur.
    var what: String {
        if let badge { return badge.counts }
        return switch kind {
        case .fact: factKey.map { GameDetailText.fact($0) } ?? ConceptText.why(concept)
        case .player: GameDetailText.playerWhat
        default: GameDetailText.what(kind) ?? ConceptText.why(concept)
        }
    }

    /// « Comment l'obtenir » ou « ce que ça donne » — la seconde phrase de la famille ; pour un badge, ce qu'il manque
    /// pour la prochaine étoile. Une donnée et une ligne de classement n'en ont qu'une : `nil`.
    var how: String? { badge?.next ?? GameDetailText.how(kind) }

    /// Le titre de la première phrase : « C'est quoi », ou — pour un badge — « Ce qui compte ».
    var whatTitle: String { badge == nil ? ConceptText.ficheWhat : GameBadgeGuideText.countsLabel }

    /// Le titre de la seconde phrase : « Comment l'obtenir » ou « Ce que ça donne ».
    var howTitle: String { kind.how == .gives ? GameDetailText.givesLabel : GameDetailText.obtainLabel }

    var isObtained: Bool {
        if case .obtained = status { return true }
        return false
    }

    var progress: Double? {
        switch status {
        case .obtained: nil
        case .locked(_, let progress), .value(_, let progress): progress
        }
    }

    /// Ce que VoiceOver annonce à l'ouverture : l'élément, puis son état.
    var announcement: String { name + ", " + statusLine }

    /// L'état en une ligne : « Obtenu le … », « Verrouillé · encore … », ou la valeur.
    var statusLine: String {
        switch status {
        case .obtained(let since): since ?? GameDetailText.earned
        case .locked(let missing, _): missing.map { GameDetailText.locked + " · " + $0 } ?? GameDetailText.locked
        case .value(let value, _): value
        }
    }
}

// MARK: - Une fonction pure par famille

enum GameElementDetails {

    private static func count(_ value: Int) -> String { GameCopy.formatCount(value) }

    private static func fact(_ label: String, _ value: String) -> ProgressionConceptFact {
        ProgressionConceptFact(label: label, value: value)
    }

    private static func share(_ done: Int, _ total: Int) -> Double? {
        total > 0 ? min(1, max(0, Double(done) / Double(total))) : nil
    }

    /// Obtenu — avec la date SERVIE mise en mots, ou sans date quand la passerelle n'en sert pas.
    private static func obtained(on date: Date?) -> GameElementStatus {
        .obtained(since: date.map { GameDetailText.earnedOn($0.formatted(date: .long, time: .omitted)) })
    }

    /// « Il manque … » — ce qu'il reste à réunir, en mots.
    private static func missing(_ what: String) -> String { GameDetailText.missing(what) }

    // MARK: Badge / médaille

    /// Ce que la fiche d'un badge porte en propre (#9640) : son guide, sa matière et ses étoiles en lignes.
    private static func badgeFacts(_ guide: GameBadgeGuideModel) -> [ProgressionConceptFact] {
        [
            guide.material.map { fact(GameBadgeGuideText.materialLabel, GameCopy.materialName($0)) },
            fact(GameBadgeGuideText.starsLabel, ConceptText.ratio(count(guide.stars), count(guide.starsMax))),
        ].compactMap { $0 }
    }

    /// Le badge d'un AXE : son plus haut palier atteint, ou — s'il n'en a encore aucun — le premier à décrocher,
    /// verrouillé, avec ce qu'il manque et sa jauge.
    static func badge(for axis: EngagementAxisProgress, progress: EngagementProgress) -> GameElementDetail {
        if let item = GameBadges.items(for: progress).last(where: { $0.axis == axis.axis }) {
            return badge(item, progress: progress)
        }
        let target = axis.scale.nextThreshold ?? axis.scale.tiers.first?.threshold ?? 0
        let material = GameBadges.material(forThreshold: target)
        let guide = GameBadgeGuideModel.make(BadgeGuideResolver.resolve(axis))
        return GameElementDetail(
            kind: .badge, key: axis.axis.rawValue + ":next",
            emblem: .badge(family: GameMedalFamily(axis.family), glyph: GameMedalGlyph(axis: axis.axis), material: material,
                           lit: false, progress: axis.scale.progress),
            name: ProgressionCopy.title(for: axis.axis),
            status: .locked(missing: axis.scale.remainingToNext.map { missing(count($0)) }, progress: axis.scale.progress),
            facts: badgeFacts(guide),
            concept: .badges,
            badge: guide
        )
    }

    /// Un badge : l'axe, la matière de son palier, et — éteint — ce qu'il manque pour le rallumer. Son guide est lu
    /// dans la progression servie (paliers datés) ; sans elle, dans le seul compteur.
    static func badge(_ item: GameBadgeItem, progress: EngagementProgress? = nil) -> GameElementDetail {
        let axis = progress?.axes.first { $0.axis == item.axis }
        let reachedAt = axis?.scale.tiers.first { $0.threshold == item.threshold }?.reachedAt
        let guide = GameBadgeGuideModel.make(
            axis.map { BadgeGuideResolver.resolve($0) } ?? BadgeGuideResolver.resolve(axis: item.axis, count: item.value, served: [])
        )
        return GameElementDetail(
            kind: .badge, key: item.id,
            emblem: .badge(family: item.family, glyph: item.glyph, material: item.material, lit: item.lit, progress: item.progress),
            name: ProgressionCopy.title(for: item.axis),
            status: item.lit
                ? obtained(on: EngagementProgressResolver.reachedDate(reachedAt))
                : .locked(missing: missing(count(item.missing)), progress: item.progress),
            facts: badgeFacts(guide),
            concept: .badges,
            badge: guide
        )
    }

    // MARK: Succès

    /// Un succès nommé. Sa précision à l'écran reste `AchievementRevealView` ; ce modèle sert le tableau de bord
    /// et les témoins — un seul élément n'a jamais deux modales.
    static func achievement(_ achievement: EngagementAchievementProgress, rarity: GameRarityEntry? = nil) -> GameElementDetail {
        GameElementDetail(
            kind: .achievement, key: achievement.key.rawValue,
            emblem: .medal(shape: .collection(filled: achievement.unlocked ? 1 : 0, total: 1), material: .gold, lit: achievement.unlocked),
            name: ProgressionCopy.title(for: achievement.key),
            status: achievement.unlocked
                ? obtained(on: EngagementProgressResolver.reachedDate(achievement.reachedAt))
                : .locked(missing: ProgressionCopy.condition(for: achievement.key), progress: nil),
            rarity: rarity,
            concept: .succes
        )
    }

    // MARK: Défi

    /// Un palier de défi. `nil` quand la famille est hors catalogue : on ne montre pas une clé technique.
    static func challenge(_ entry: AchievementEntry) -> GameElementDetail? {
        guard let name = AchievementCopy.label(entry.family, tier: entry.tier) else { return nil }
        return GameElementDetail(
            kind: .challenge, key: entry.key,
            emblem: .medal(shape: .record, material: .silver, lit: entry.unlocked),
            name: name,
            status: entry.unlocked ? obtained(on: entry.reachedAt) : .locked(missing: nil, progress: nil),
            facts: [fact(ConceptText.name(.defis), AchievementCopy.sectionTitle(entry.section))],
            concept: .defis
        )
    }

    // MARK: Trophée de la vitrine

    /// Un trophée. `nil` quand sa clé ne se lit pas : un trophée inconnu ne s'invente pas.
    static func trophy(_ item: GameTrophyItem) -> GameElementDetail? {
        guard let presentation = GameTrophyPresentation.of(key: item.key) else { return nil }
        return GameElementDetail(
            kind: .trophy, key: item.key,
            emblem: .trophy(presentation.material),
            name: presentation.title,
            status: obtained(on: EngagementProgressResolver.reachedDate(item.awardedAt)),
            facts: [fact(ConceptText.factTier, GameCopy.materialName(presentation.material))],
            concept: .showcase
        )
    }

    // MARK: Tampon de l'Atlas

    static func stamp(_ stamp: GameAtlasBlock.Stamp) -> GameElementDetail {
        GameElementDetail(
            kind: .stamp, key: stamp.language,
            emblem: .stamp(code: stamp.language.uppercased(), stamped: true),
            name: GameWave2Format.languageName(stamp.language),
            status: .obtained(since: GameText.atlasStampedOn(date: GameWave2Format.day(stamp.stampedOn))),
            concept: .atlas
        )
    }

    /// Un échange à moitié fait : le tampon attend le message qui manque.
    static func pendingStamp(_ pending: GameAtlasBlock.Pending) -> GameElementDetail {
        GameElementDetail(
            kind: .stamp, key: "pending." + pending.language,
            emblem: .stamp(code: pending.language.uppercased(), stamped: false),
            name: GameWave2Format.languageName(pending.language),
            status: .locked(missing: pending.sent ? GameText.atlasPendingSent : GameText.atlasPendingReceived, progress: 0.5),
            concept: .atlas
        )
    }

    // MARK: Saison

    static func seasonStep(_ step: Int, in season: GameSeasonBlock) -> GameElementDetail {
        let needed = step * GameSeason.starsPerStep
        let status: GameElementStatus
        if season.claimedSteps.contains(step) {
            status = .obtained(since: nil)
        } else if step <= season.steps {
            status = .value(GameText.seasonStepReady, progress: nil)
        } else {
            status = .locked(
                missing: missing(GameText.seasonStars(count: max(0, needed - season.stars))),
                progress: share(season.stars, needed)
            )
        }
        return GameElementDetail(
            kind: .seasonStep, key: "\(season.number).\(step)",
            emblem: .trophy(.platinum),
            name: GameText.seasonStep(step: count(step)),
            status: status,
            facts: [
                fact(ConceptText.name(.season), count(season.number)),
                fact(ConceptText.factStars, count(season.stars)),
            ],
            concept: .season
        )
    }

    static func seal(_ season: GameSeasonBlock) -> GameElementDetail {
        GameElementDetail(
            kind: .seal, key: "\(season.number)",
            emblem: .symbol("seal.fill"),
            name: GameText.seasonSealTitle,
            status: season.sealOwned
                ? .obtained(since: nil)
                : .locked(missing: GameCopy.meeshes(season.sealPrice), progress: nil),
            facts: [fact(ConceptText.name(.season), count(season.number))],
            concept: .season
        )
    }

    // MARK: Ligue

    /// La gemme de la ligue où l'on joue. Rien de plus que ce que la page de la ligue affiche — jamais de présence.
    static func leagueGem(_ league: GameLeagueBlock) -> GameElementDetail? {
        guard let current = GameLeagueDetail.current(of: league) else { return nil }
        let toPromotion: ProgressionConceptFact? = current.pointsToPromotion.flatMap {
            $0 > 0 ? fact(ConceptText.factToPromotion, ConceptText.chipMissing(GameCopy.points($0))) : nil
        }
        return GameElementDetail(
            kind: .leagueGem, key: current.league.rawValue,
            emblem: .league(current.league),
            name: GameText.leagueName(current.league),
            status: .value(GameText.leagueRankLine(rank: count(current.rank), size: count(current.groupSize)), progress: nil),
            facts: [
                fact(ConceptText.factWeekPoints, GameCopy.points(current.weekPoints)),
                fact(ConceptText.factZone, GameText.zoneLabel(current.zone)),
                toPromotion,
            ].compactMap { $0 },
            concept: .league
        )
    }

    /// Une ligne du CLASSEMENT : rien de plus que ce que la page affiche déjà — le pseudonyme, la place, la zone et
    /// les points de la semaine. Jamais une présence, jamais un identifiant.
    static func player(_ entry: LeagueWeekEntry) -> GameElementDetail {
        GameElementDetail(
            kind: .player, key: "\(entry.rank)",
            emblem: .concept(.league),
            name: entry.displayName,
            status: .value(GameCopy.points(entry.weekPoints), progress: nil),
            facts: [
                fact(ConceptText.factRank, count(entry.rank)),
                fact(ConceptText.factZone, GameText.zoneLabel(entry.zone)),
            ],
            concept: .league
        )
    }

    // MARK: Prestige

    /// La n-ième étoile de Prestige : obtenue si on l'a, verrouillée sinon.
    static func prestigeStar(_ index: Int, in prestige: GamePrestigeBlock) -> GameElementDetail {
        let ready = index == prestige.stars + 1 && prestige.canPrestige
        let missing: String = ready ? GameText.doorPrestigeReady : GameText.doorPrestigeLocked
        return GameElementDetail(
            kind: .prestigeStar, key: "\(index)",
            emblem: .trophy(.prism),
            name: GameText.trophyPrestige(number: count(index)),
            status: index <= prestige.stars ? .obtained(since: nil) : .locked(missing: missing, progress: nil),
            facts: [
                fact(ConceptText.factStars, ConceptText.ratio(count(prestige.stars), count(prestige.max))),
                fact(ConceptText.factGloryOnPass, count(prestige.gloryOnPass)),
            ],
            concept: .prestige
        )
    }

    // MARK: Rang

    static func rank(_ glory: GameBlock.Glory) -> GameElementDetail {
        let missing: String = glory.gloryMissing.map { " · " + ConceptText.chipMissing(count($0)) } ?? ""
        let next: ProgressionConceptFact? = glory.next.map {
            fact(ConceptText.factNextRank, GameCopy.rankLabel($0.rank, division5: $0.shownDivision) + missing)
        }
        return GameElementDetail(
            kind: .rank, key: glory.rank.rawValue + (glory.shownDivision.map { ".\($0.rawValue)" } ?? ""),
            emblem: .rank(glory.rank, glory.shownDivision, glory.mythicSeat),
            name: GameCopy.rankLabel(glory),
            status: .value(String(localized: "game.rank.glory", defaultValue: "Gloire \(count(glory.glory))", bundle: .main),
                           progress: glory.next == nil ? nil : glory.progress),
            facts: [next].compactMap { $0 },
            concept: .glory
        )
    }

    // MARK: Flamme

    static func flameForm(_ flame: GameBlock.Flame) -> GameElementDetail {
        let state: ProgressionConceptFact? = GameCopy.flameStatus(flame.status).map { fact(ConceptText.factState, $0) }
        return GameElementDetail(
            kind: .flameForm, key: flame.form?.rawValue ?? "out",
            emblem: .flame(flame.form),
            name: flame.form.map { GameCopy.flameFormName($0) } ?? ConceptText.name(.flame),
            status: .value(GameCopy.flameDays(flame.days), progress: nil),
            facts: [
                fact(ConceptText.factBonus, ConceptText.factPercent(count(flame.bonusPercent))),
                state,
            ].compactMap { $0 },
            concept: .flame
        )
    }

    static func freeze(_ flame: GameBlock.Flame) -> GameElementDetail {
        GameElementDetail(
            kind: .freeze, key: "freeze",
            emblem: .symbol("snowflake"),
            name: ConceptText.factFreezes,
            status: .value(ConceptText.ratio(count(flame.freezes), count(flame.maxFreezes)), progress: share(flame.freezes, flame.maxFreezes)),
            facts: [fact(ConceptText.factFreezePrice, GameCopy.meeshes(flame.freezePrice))],
            concept: .flame
        )
    }

    // MARK: Missions

    static func mission(_ mission: GameBlock.Mission) -> GameElementDetail {
        let glory: ProgressionConceptFact? = mission.glory > 0 ? fact(ConceptText.name(.glory), "+" + count(mission.glory)) : nil
        return GameElementDetail(
            kind: .mission, key: mission.id,
            emblem: .symbol("target"),
            name: GameCopy.missionTitle(templateKey: mission.templateKey, target: mission.target),
            status: mission.isCompleted
                ? .obtained(since: nil)
                : .locked(missing: ConceptText.ratio(count(mission.progress), count(mission.target)),
                          progress: share(mission.progress, mission.target)),
            facts: [
                fact(ConceptText.factTier, GameCopy.difficultyName(mission.difficulty)),
                fact(ConceptText.name(.points), "+" + GameCopy.points(mission.reward)),
                glory,
            ].compactMap { $0 },
            concept: .missions
        )
    }

    static func chest(_ chest: GameBlock.Chest, missions: GameBlock.Missions) -> GameElementDetail {
        let done = missions.items.filter(\.isCompleted).count
        let status: GameElementStatus
        switch chest.status {
        case .claimed: status = .obtained(since: nil)
        case .ready: status = .value(ConceptText.chipChestReady, progress: 1)
        case .locked: status = .locked(missing: ConceptText.ratio(count(done), count(missions.items.count)), progress: share(done, missions.items.count))
        }
        return GameElementDetail(
            kind: .chest, key: missions.dayKey,
            emblem: .chest(open: chest.status == .claimed),
            name: ConceptText.factChest,
            status: status,
            facts: [
                fact(ConceptText.name(.points), ConceptText.ratio(count(chest.odds.minPoints), count(chest.odds.maxPoints))),
            ],
            concept: .missions
        )
    }

    // MARK: Meeshes

    /// La prochaine pièce : son numéro, son édition, son prix — tels que la passerelle les sert.
    static func coin(_ mint: GameMintPreview) -> GameElementDetail {
        GameElementDetail(
            kind: .coin, key: "\(mint.number)",
            emblem: .coin(mint.edition),
            name: ConceptText.factCoin(count(mint.number), GameCopy.editionName(mint.edition)),
            status: mint.canMint
                ? .value(ConceptText.chipMintReady, progress: 1)
                : .locked(missing: missing(GameCopy.points(mint.missingPoints)),
                          progress: share(max(0, mint.price - mint.missingPoints), mint.price)),
            facts: [
                fact(ConceptText.factNextPrice, GameCopy.points(mint.price)),
                fact(ConceptText.name(.glory), "+" + count(mint.gloryGained)),
            ],
            concept: .meesh
        )
    }

    static func treasuryTier(_ treasury: TreasuryStanding) -> GameElementDetail {
        let next: ProgressionConceptFact? = treasury.next.map {
            fact(ConceptText.factNextTreasury, GameCopy.treasuryName($0.key) + " · " + ConceptText.chipMissing(count($0.missing)))
        }
        return GameElementDetail(
            kind: .treasuryTier, key: treasury.tier?.rawValue ?? "none",
            emblem: .coin(.silver),
            name: treasury.tier.map { GameCopy.treasuryName($0) } ?? ConceptText.factTreasury,
            status: .value(GameCopy.meeshes(treasury.held),
                           progress: treasury.next.flatMap { share(treasury.held, $0.minHeld) }),
            facts: [next].compactMap { $0 },
            concept: .meesh
        )
    }

    // MARK: Niveau

    /// Le niveau se lit sur la VÉRITÉ (`level.shown`, #9688) ; au plafond du rang, le fait dit quel rang ouvre la suite.
    static func levelRing(_ block: GameBlock.Level) -> GameElementDetail {
        let level = block.shown
        let record: ProgressionConceptFact? = level.record > level.level
            ? fact(ConceptText.factRecord, GameText.bannerLevel(level: count(level.record))) : nil
        return GameElementDetail(
            kind: .levelRing, key: "\(level.level)",
            emblem: .tier(level.tier),
            name: GameText.bannerLevel(level: count(level.level)) + " · " + GameCopy.tierName(level.tier),
            status: .value(GameCopy.points(block.score), progress: level.nextThreshold == nil ? nil : level.progress),
            facts: [
                fact(ConceptText.factNextLevel, level.nextThreshold == nil
                    ? GameCopy.levelTopShort(cap: level.cap) : ConceptText.chipMissing(GameCopy.points(level.pointsToNext))),
                record,
            ].compactMap { $0 },
            concept: .level
        )
    }

    // MARK: Élans

    /// Une famille d'élan : active dans la fenêtre servie, ou au repos — et ce qu'un geste de la famille rapporte.
    static func elanFamily(_ family: EngagementAxisFamily, elan: EngagementElanProgress?,
                           weights: [EngagementAxisFamily: Int] = EngagementCatalog.familyTopPoints) -> GameElementDetail {
        let active = elan?.activeFamilies.contains(family) ?? false
        let window: ProgressionConceptFact? = elan.map { fact(ConceptText.factWindow, GameCopy.days($0.windowDays)) }
        let points: ProgressionConceptFact? = weights[family].map {
            fact(ConceptText.name(.points), GameDetailText.elanPoints(count($0)))
        }
        return GameElementDetail(
            kind: .elanFamily, key: family.rawValue,
            emblem: .concept(.elans),
            name: ProgressionCopy.title(for: family),
            status: .value(active ? GameDetailText.elanActive : GameDetailText.elanIdle, progress: nil),
            facts: [points, window].compactMap { $0 },
            concept: .elans
        )
    }

    // MARK: Pastille / ligne de donnée

    /// Une ligne « libellé → valeur » d'une fiche ou du tableau de bord : ce que la donnée dit, dans SON concept.
    static func fact(_ fact: ProgressionConceptFact, of concept: ProgressionConcept, gauge: Double? = nil) -> GameElementDetail {
        GameElementDetail(
            kind: .fact, key: concept.rawValue + "." + fact.label,
            emblem: .concept(concept),
            name: fact.label,
            status: .value(fact.value, progress: gauge),
            concept: concept,
            factKey: fact.detail
        )
    }

    // MARK: Le héros d'une fiche

    /// L'élément que l'emblème du héros d'une fiche ouvre : l'élément PRINCIPAL du concept, quand il est servi.
    static func hero(of concept: ProgressionConcept, progress: EngagementProgress, game: GameBlock?) -> GameElementDetail {
        let fallback = fact(
            ProgressionConceptFact(label: ConceptText.name(concept), value: ProgressionConceptModel.value(concept, progress: progress, game: game)),
            of: concept, gauge: ProgressionConceptModel.gauge(concept, progress: progress, game: game)
        )
        guard let game else { return fallback }
        switch concept {
        case .level: return levelRing(game.level)
        case .meesh: return coin(game.mint)
        case .glory: return rank(game.glory)
        case .flame: return flameForm(game.flame)
        case .missions: return chest(game.chest, missions: game.missions)
        case .league: return game.league.flatMap { leagueGem($0) } ?? fallback
        case .prestige: return game.prestige.map { prestigeStar(min($0.stars + 1, $0.max), in: $0) } ?? fallback
        case .points, .season, .elans, .badges, .defis, .succes, .showcase, .atlas: return fallback
        }
    }
}
