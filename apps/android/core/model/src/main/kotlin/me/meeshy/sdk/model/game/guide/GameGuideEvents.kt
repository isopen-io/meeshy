package me.meeshy.sdk.model.game.guide

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.game.FlameStatus
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameLevels
import me.meeshy.sdk.model.game.GameSeason
import me.meeshy.sdk.model.game.GloryLaws
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LevelTierKey

/**
 * LES ÉVÉNEMENTS DU GUIDE, vague 1 (iOS `GameGuideEvents`, miroir de `apps/web/src/lib/game-guide/events.ts`).
 *
 *  - [standing] lit l'ÉTAT à l'ouverture : une découverte ne se dit qu'UNE fois (tant que sa clé n'est pas vue) ; trois
 *    urgences se redisent à chaque ouverture — la Flamme en danger, la Flamme éteinte, le retour après une absence.
 *  - [transitions] compare deux lectures pendant que l'écran est ouvert : ce qui vient d'ARRIVER se dit chaque fois.
 *
 * Ce que le bloc ne sert pas n'est jamais inventé : une Flamme éteinte ne dit pas combien de jours elle valait.
 */
public object GameGuideEvents {

    public const val ABSENCE_DAYS: Int = 7

    /** Le palier se lit sur la VÉRITÉ (`level.shown`). */
    private fun tierIndex(game: GameBlock): Int = game.level.shown.tier.ordinal

    private fun treasuryIndex(game: GameBlock): Int = game.treasury.tier?.ordinal ?: -1

    /** Un ordre total des (rang, division V–I) : une division gagnée est une marche, un rang aussi. */
    public fun standingOrder(game: GameBlock): Int =
        game.glory.rank.ordinal * 6 + (game.glory.shownDivision?.let { 5 - it } ?: 5)

    /** Une marche GAGNÉE — jamais la marche retrouvée quand un geste refusé restaure la lecture d'avant. */
    public fun rankClimbed(before: GameBlock, after: GameBlock): Boolean = standingOrder(after) > standingOrder(before)

    /** Le premier niveau du palier suivant — `null` après Singularité, qui n'a pas de fin. */
    public fun nextTierLevel(after: LevelTierKey): Int? =
        LevelTierKey.entries.getOrNull(after.ordinal + 1)?.let(GameLevels::tierStart)

    private fun rankEvent(game: GameBlock): GuideEvent =
        GuideEvent.NewRank(game.glory.rank, game.glory.shownDivision, game.glory.glory, game.glory.gloryMissing)

    private fun flameOutEvent(game: GameBlock): GuideEvent =
        GuideEvent.FlameOut(lostDays = 0, relightPrice = game.flame.relightPrice, canRelight = game.flame.canRelight)

    public fun standing(game: GameBlock, seen: Set<String>, daysAway: Int?): List<GuideEvent> {
        val shown = game.level.shown
        val discoveries = listOfNotNull(
            GuideEvent.FirstLevel(shown.level, shown.pointsToNext).takeIf { shown.level >= 2 },
            GuideEvent.NewTier(shown.tier, nextTierLevel(shown.tier)).takeIf { tierIndex(game) >= 1 },
            GuideEvent.MissionsUnlocked.takeIf { game.missions.unlocked },
            GuideEvent.FirstMintPossible(game.mint.price, game.mint.shownLevels.levelsLost, game.mint.gloryGained)
                .takeIf { game.mint.canMint && game.mint.number == 1 },
            rankEvent(game).takeIf { game.glory.rank != GloryRank.Murmure },
            game.treasury.tier?.let { GuideEvent.TreasuryTier(it, game.treasury.next?.missing) },
            GuideEvent.Level100(game.level.canPrestige).takeIf { shown.level >= GameLevels.PRESTIGE_LEVEL },
        )
        val urgencies = listOfNotNull(
            GuideEvent.FlameAtRisk(game.flame.days).takeIf { game.flame.status == FlameStatus.AtRisk },
            flameOutEvent(game).takeIf { game.flame.status == FlameStatus.Out },
            daysAway?.takeIf { it >= ABSENCE_DAYS }?.let(GuideEvent::ReturnAfterAbsence),
        )
        return discoveries.filter { it.key.wire !in seen } + urgencies
    }

    /** La frappe n'éteint plus aucun badge : le moment « badge éteint » n'est jamais annoncé. */
    public fun transitions(before: GameBlock, after: GameBlock): List<GuideEvent> {
        val was = before.level.shown
        val now = after.level.shown
        return listOfNotNull(
            GuideEvent.FirstLevel(now.level, now.pointsToNext).takeIf { was.level < 2 && now.level >= 2 },
            GuideEvent.NewTier(now.tier, nextTierLevel(now.tier)).takeIf { tierIndex(after) > tierIndex(before) },
            GuideEvent.MissionsUnlocked.takeIf { !before.missions.unlocked && after.missions.unlocked },
            GuideEvent.FirstMint.takeIf { before.mint.number == 1 && after.mint.number == 2 },
            GuideEvent.PriceRises(after.mint.price).takeIf { after.mint.price > before.mint.price },
            rankEvent(after).takeIf { rankClimbed(before, after) },
            after.treasury.tier?.takeIf { treasuryIndex(after) > treasuryIndex(before) }
                ?.let { GuideEvent.TreasuryTier(it, after.treasury.next?.missing) },
            flameOutEvent(after).takeIf { before.flame.status != FlameStatus.Out && after.flame.status == FlameStatus.Out },
            GuideEvent.Level100(after.level.canPrestige)
                .takeIf { was.level < GameLevels.PRESTIGE_LEVEL && now.level >= GameLevels.PRESTIGE_LEVEL },
        )
    }
}

/**
 * L'INSTANTANÉ du guide (iOS `GuideSnapshotV2`) : la plus petite chose qui permet de comparer deux lectures de la
 * vague 2. Il se garde sur l'appareil entre deux ouvertures : une montée de ligue arrive le dimanche soir, et c'est à
 * l'ouverture SUIVANTE qu'on la raconte.
 */
@Serializable
public data class GuideSnapshot(
    val prestige: Int,
    val league: League? = null,
    val season: Season? = null,
    val trophies: List<String>? = null,
    val atlas: Atlas? = null,
) {
    @Serializable
    public data class League(val weekKey: String, val current: Current? = null) {
        @Serializable
        public data class Current(val league: LeagueKey, val rank: Int, val pointsToPromotion: Int? = null)
    }

    @Serializable
    public data class Season(val number: Int, val themeKey: String, val steps: Int, val completed: Boolean)

    @Serializable
    public data class Atlas(val total: Int, val languages: List<String>)

    public companion object {
        public fun of(game: GameBlock): GuideSnapshot = GuideSnapshot(
            prestige = game.level.prestige,
            league = game.league?.let { block ->
                League(block.weekKey, block.current?.let { League.Current(it.league, it.rank, it.pointsToPromotion) })
            },
            season = game.season?.let { Season(it.number, it.themeKey, it.steps, it.completed) },
            trophies = game.trophies?.items?.map { it.key },
            atlas = game.atlas?.let { Atlas(it.total, it.stamps.map { stamp -> stamp.language }) },
        )
    }
}

/**
 * LES ÉVÉNEMENTS DU GUIDE, vague 2 (iOS `GameGuideEventsV2`, miroir de `events-v2.ts`). Une extension absente d'UNE
 * des deux lectures ne produit aucune transition : on ne célèbre pas ce qu'on n'a pas vu changer.
 */
public object GameGuideEventsV2 {

    private fun seasonStart(season: GuideSnapshot.Season): GuideEventV2 =
        GuideEventV2.SeasonStart(season.number, season.themeKey, GameSeason.STEPS)

    /** Ce que l'état dit à l'ouverture et que la personne n'a pas encore entendu : la première ligue, une saison. */
    public fun standing(game: GameBlock, seen: Set<String>): List<GuideEventV2> {
        val league = game.league?.takeIf { it.access == LeagueAccess.Open }?.current
            ?.let { GuideEventV2.LeagueFirst(it.league, it.pointsToPromotion) }
        val season = GuideSnapshot.of(game).season?.let(::seasonStart)
        return listOfNotNull(league, season).filter { it.key.wire !in seen }
    }

    public fun between(before: GuideSnapshot, after: GuideSnapshot): List<GuideEventV2> =
        leagueEvents(before, after) + seasonEvents(before, after) + trophyEvents(before, after) +
            prestigeEvents(before, after) + atlasEvents(before, after)

    public fun transition(before: GameBlock, after: GameBlock): List<GuideEventV2> =
        between(GuideSnapshot.of(before), GuideSnapshot.of(after))

    private fun leagueEvents(before: GuideSnapshot, after: GuideSnapshot): List<GuideEventV2> {
        val was = before.league ?: return emptyList()
        val now = after.league ?: return emptyList()
        val from = was.current
        val to = now.current ?: return emptyList()
        if (from == null) return listOf(GuideEventV2.LeagueFirst(to.league, to.pointsToPromotion))
        if (now.weekKey == was.weekKey) return emptyList()
        return when {
            to.league.index > from.league.index ->
                listOf(GuideEventV2.LeaguePromoted(from.league, to.league, from.rank, was.weekKey))
            to.league.index < from.league.index ->
                listOf(GuideEventV2.LeagueRelegated(from.league, to.league, to.pointsToPromotion, was.weekKey))
            else -> emptyList()
        }
    }

    private fun seasonEvents(before: GuideSnapshot, after: GuideSnapshot): List<GuideEventV2> {
        val finished = before.season?.takeIf { after.season?.number != it.number }?.let {
            GuideEventV2.SeasonEnd(it.number, it.steps, it.completed, if (it.completed) GloryLaws.POINTS_SEASON else 0)
        }
        val started = after.season?.takeIf { before.season?.number != it.number }?.let(::seasonStart)
        return listOfNotNull(finished, started)
    }

    private fun trophyEvents(before: GuideSnapshot, after: GuideSnapshot): List<GuideEventV2> {
        val known = before.trophies?.toSet() ?: return emptyList()
        val now = after.trophies ?: return emptyList()
        return now.filter { it !in known }.map(GuideEventV2::Trophy)
    }

    private fun prestigeEvents(before: GuideSnapshot, after: GuideSnapshot): List<GuideEventV2> =
        listOfNotNull(
            GuideEventV2.Prestige(after.prestige, GloryLaws.POINTS_PRESTIGE).takeIf { after.prestige > before.prestige },
        )

    private fun atlasEvents(before: GuideSnapshot, after: GuideSnapshot): List<GuideEventV2> {
        val known = before.atlas?.languages?.toSet() ?: return emptyList()
        val now = after.atlas ?: return emptyList()
        return now.languages.filter { it !in known }
            .map { GuideEventV2.AtlasStamp(it, now.languages.size, now.total) }
    }
}
