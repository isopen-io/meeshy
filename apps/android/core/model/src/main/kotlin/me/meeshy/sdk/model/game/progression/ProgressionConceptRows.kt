package me.meeshy.sdk.model.game.progression

import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.ceil
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameSeason
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.LeagueCloses
import me.meeshy.sdk.model.game.LeagueZone
import me.meeshy.sdk.model.game.engagement.EngagementProgress

/**
 * Les lignes « Où j'en suis » du Niveau, de la Joute, du Voyage, de la Renaissance et des Élans (#13909) — miroir de
 * `levelRows`, `leagueRows`, `seasonRows`, `elansRows` et de la ligne « Gloire au passage » de `ProgressionConceptFiche`
 * (iOS). Chaque ligne déclare l'IDENTITÉ du fait qu'elle dit : la fiche écarte celles que l'écran montre déjà.
 */
internal object ProgressionConceptRows {

    private fun fact(label: GameTextKey, value: GameText, identity: ConceptFact): FicheFact = FicheFact(GameText(label), value, identity)

    private fun count(value: Int): GameText = GameText(GameTextKey.JoinedBySpace, listOf(GameTextArg.Count(value)))

    private fun points(value: Long): GameText = GameCopyLaws.points(value.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt())

    private fun factor(value: Double): GameText = GameText.of(GameTextKey.ValueFactor, GameTextArg.Decimal(value))

    fun level(progress: EngagementProgress, game: GameBlock?): List<FicheFact> {
        val level = game?.level?.shown
        if (level == null) {
            val remaining = progress.level.scale.remainingToNext ?: return emptyList()
            return listOf(
                FicheFact(
                    GameText.of(GameTextKey.FactMissingForLevel, GameTextArg.Count(progress.level.level + 1)),
                    points(remaining.toLong()),
                    ConceptFact.LevelNext,
                ),
            )
        }
        val next = if (level.nextThreshold == null) {
            fact(GameTextKey.FactNextLevel, ProgressionConceptModel.levelTopShort(level.cap), ConceptFact.LevelTop)
        } else {
            FicheFact(
                GameText.of(GameTextKey.FactMissingForLevel, GameTextArg.Count(level.level + 1)),
                points(level.pointsToNext),
                ConceptFact.LevelNext,
            )
        }
        val record = if (level.record > level.level) {
            fact(GameTextKey.FactRecord, GameText.of(GameTextKey.BannerLevel, GameTextArg.Count(level.record)), ConceptFact.LevelRecord)
        } else {
            null
        }
        return listOfNotNull(fact(GameTextKey.FactTier, GameCopyLaws.tierName(level.tier), ConceptFact.Tier), next, record)
    }

    fun league(game: GameBlock?, nowMillis: Long, zone: ZoneId): List<FicheFact> {
        val league = game?.league ?: return emptyList()
        val friends = fact(
            GameTextKey.FactFriends,
            GameText.of(GameTextKey.LeagueRankLine, GameTextArg.Count(league.friends.rank), GameTextArg.Count(league.friends.size)),
            ConceptFact.LeagueFriends,
        )
        val current = ProgressionConceptStatesMore.current(league) ?: return listOf(friends)
        return listOfNotNull(
            fact(GameTextKey.FactWeekPoints, GameCopyLaws.points(current.weekPoints), ConceptFact.WeekPoints),
            fact(GameTextKey.FactZone, zoneLabel(current.zone), ConceptFact.LeagueZone),
            current.pointsToPromotion?.takeIf { it > 0 }?.let {
                fact(GameTextKey.FactMissingForPromotion, GameCopyLaws.points(it), ConceptFact.LeagueMissing)
            },
            closesIn(league.closes, nowMillis, zone)?.let { fact(GameTextKey.FactCloses, it, ConceptFact.LeagueCloses) },
            friends,
        )
    }

    private fun zoneLabel(zone: LeagueZone): GameText = GameText(
        when (zone) {
            LeagueZone.Promotion -> GameTextKey.LeagueZonePromotion
            LeagueZone.Safe -> GameTextKey.LeagueZoneSafe
            LeagueZone.Relegation -> GameTextKey.LeagueZoneRelegation
        },
    )

    /**
     * Le temps jusqu'à la fermeture de la semaine, à l'heure LOCALE (iOS `GameWave2Format.remaining`) : jours et heures,
     * sinon heures, sinon minutes, une minute au moins. Un jour illisible ne dit rien.
     */
    fun closesIn(closes: LeagueCloses, nowMillis: Long, zone: ZoneId): GameText? {
        val day = runCatching { LocalDate.parse(closes.dayKey) }.getOrNull() ?: return null
        val target = day.atStartOfDay(zone).plusMinutes(closes.minuteOfDay.toLong()).toInstant().toEpochMilli()
        val minutes = maxOf(1, ceil((target - nowMillis) / MILLIS_PER_MINUTE).toInt())
        val days = minutes / MINUTES_PER_DAY
        val hours = (minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR
        return when {
            days >= 1 -> GameText.of(GameTextKey.DurationDaysHours, GameTextArg.Count(days), GameTextArg.Count(hours))
            hours >= 1 -> GameText.of(GameTextKey.DurationHours, GameTextArg.Count(minutes / MINUTES_PER_HOUR))
            else -> GameText.of(GameTextKey.DurationMinutes, GameTextArg.Count(minutes))
        }
    }

    fun season(game: GameBlock?): List<FicheFact> {
        val season = game?.season ?: return emptyList()
        return listOf(
            fact(GameTextKey.ConceptNameSeason, count(season.number), ConceptFact.Season),
            fact(
                GameTextKey.FactWeek,
                GameText.of(GameTextKey.Ratio, GameTextArg.Count(season.week), GameTextArg.Count(GameSeason.WEEKS)),
                ConceptFact.SeasonWeek,
            ),
            fact(GameTextKey.FactStrides, count(season.stars), ConceptFact.SeasonStars),
            fact(GameTextKey.FactSeal, GameText(if (season.sealOwned) GameTextKey.FactYes else GameTextKey.FactNo), ConceptFact.SeasonSeal),
        )
    }

    fun prestige(game: GameBlock?): List<FicheFact> = listOfNotNull(
        game?.prestige?.let { fact(GameTextKey.FactGloryOnPass, count(it.gloryOnPass), ConceptFact.PrestigeGlory) },
    )

    /** Les multiplicateurs du jeu sont ici, et seulement ici : le Vent arrière ne se dit que quand il souffle (#10896). */
    fun elans(game: GameBlock?): List<FicheFact> {
        val boosts = game?.boosts ?: return emptyList()
        return listOfNotNull(
            if (boosts.tailwind > 1.0) fact(GameTextKey.TailwindName, factor(boosts.tailwind), ConceptFact.Tailwind) else null,
            boosts.prismHour?.let { fact(GameTextKey.FactPrismHour, factor(it.multiplier), ConceptFact.PrismHour) },
        )
    }

    private const val MILLIS_PER_MINUTE = 60_000.0
    private const val MINUTES_PER_DAY = 24 * 60
    private const val MINUTES_PER_HOUR = 60
}
