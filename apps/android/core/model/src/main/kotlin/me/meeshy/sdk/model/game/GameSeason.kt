package me.meeshy.sdk.model.game

/*
 * Les saisons (#9386) : huit semaines, un thème, quarante étapes gratuites. MIROIR de
 * `packages/shared/utils/game/season.ts` et de `GameSeason.swift` (iOS) ; sur divergence, le TS fait foi.
 *
 * Le calendrier est DONNÉ, pas lu sur une horloge : la saison 1 ouvre le lundi 2026-12-21 et ferme le
 * dimanche 2027-02-14 à 20 h, puis les saisons s'enchaînent sans trou de 56 jours. Les semaines de saison
 * sont celles des ligues (lundi local, fermeture dimanche 20 h).
 *
 * Les ÉTOILES se gagnent par missions (1 facile ou moyenne, 2 difficile, 3 d'Or, 5 pour le duo) ; quatre
 * étoiles font une étape. Le parcours gratuit compte 40 étapes — ses récompenses ne comportent JAMAIS de
 * Meesh. La rangée SCEAU (10 Meeshes) ajoute un cosmétique toutes les quatre étapes, sans avantage de jeu.
 */

/** Le jour civil et la minute depuis minuit, dans le calendrier de MON appareil ou de mon compte. */
public data class SeasonMoment(val dayKey: String, val minuteOfDay: Int)

public data class SeasonCalendar(
    val number: Int,
    val startDay: String,
    /** Le dernier dimanche de la saison. */
    val endDay: String,
    val weekKeys: List<String>,
    val themeKey: String,
)

public enum class SeasonStarSource { Easy, Medium, Hard, Gold, Duo }

public data class SeasonProgress(
    val stars: Int,
    /** De 0 à 40. */
    val steps: Int,
    val starsToNext: Int,
    /** Fraction de l'étape en cours ; `1` une fois le parcours terminé. */
    val progress: Double,
    val completed: Boolean,
)

public enum class SeasonSealRefusal(val wire: String) {
    AlreadyOwned("already-owned"),
    InsufficientBalance("insufficient-balance"),
}

public enum class SeasonClaimRefusal(val wire: String) {
    OutOfRange("out-of-range"),
    Locked("locked"),
    AlreadyClaimed("already-claimed"),
}

public sealed interface SeasonClaim {
    public data class Allowed(val reward: SeasonRewardBlock, val seal: SeasonSeal?) : SeasonClaim
    public data class Refused(val reason: SeasonClaimRefusal) : SeasonClaim
}

public data class SeasonSettlement(
    val completed: Boolean,
    /** `GameGlory.POINTS_SEASON` (5 000) au parcours terminé. */
    val glory: Int,
    val cup: Boolean,
    /** Le badge daté : `season.<n>`, `null` sans parcours terminé. */
    val badgeKey: String?,
)

public object GameSeason {
    public const val ONE_START: String = "2026-12-21"
    public const val WEEKS: Int = 8
    public const val DAYS: Int = WEEKS * 7
    public const val STEPS: Int = 40
    public const val STARS_PER_STEP: Int = 4

    /** En Meeshes. */
    public const val SEAL_PRICE: Int = 10

    /** Un cosmétique de la rangée Sceau toutes les quatre étapes. */
    public const val SEAL_EVERY: Int = 4

    /** Les points d'une étape ordinaire. */
    public const val STEP_POINTS: Int = 100

    /** Les clés de thème, en boucle : une langue du modèle de traduction à chaque saison. */
    public val themeKeys: List<String> = listOf(
        "language:fr", "language:es", "language:ar", "language:sw",
        "language:ja", "language:pt", "language:hi", "language:zh",
    )

    internal fun themeOf(number: Int): String = themeKeys[(number - 1).mod(themeKeys.size)]

    public fun calendar(number: Int): SeasonCalendar? {
        if (number < 1) return null
        val startDay = GameDay.add((number - 1) * DAYS, ONE_START) ?: return null
        return SeasonWeeks.calendarOf(number, startDay, themeOf(number))
    }

    /** Le numéro de la saison qui contient ce jour, `null` avant la première. */
    public fun season(dayKey: String): Int? {
        val elapsed = GameDay.diff(ONE_START, dayKey) ?: return null
        return if (elapsed >= 0) elapsed / DAYS + 1 else null
    }

    /** La semaine de saison de 1 à 8, `null` avant la première saison. */
    public fun week(dayKey: String): Int? {
        val elapsed = GameDay.diff(ONE_START, dayKey) ?: return null
        return if (elapsed >= 0) (elapsed % DAYS) / 7 + 1 else null
    }

    /** La saison d'un moment, la fermeture du dimanche 20 h comprise. */
    public fun season(moment: SeasonMoment): Int? = season(SeasonWeeks.weekOfMoment(moment))

    public fun isOpen(season: Int, dayKey: String): Boolean = season(dayKey) == season

    /**
     * L'ÉTAT D'UNE SAISON À UN MOMENT (#10131) : la fermeture du dimanche 20 h ouvre la semaine suivante,
     * la saison du lundi est donc en cours dès la veille à 20 h.
     */
    public fun tense(startDay: String, endDay: String, moment: SeasonMoment): GameArchiveStatus {
        val week = SeasonWeeks.weekOfMoment(moment)
        if (week < SeasonWeeks.weekKey(startDay)) return GameArchiveStatus.Upcoming
        return if (week > SeasonWeeks.weekKey(endDay)) GameArchiveStatus.Past else GameArchiveStatus.Current
    }

    /**
     * L'état d'une COPIE (#10131) : l'état servi, avancé par l'horloge locale. Une saison « à venir » gardée
     * hors ligne passe « en cours » le jour de son ouverture ; une horloge en retard ne fait jamais reculer
     * l'état servi.
     */
    public fun liveTense(served: GameArchiveStatus, startDay: String, endDay: String, moment: SeasonMoment): GameArchiveStatus {
        val computed = tense(startDay, endDay, moment)
        return if (tenseRank(computed) > tenseRank(served)) computed else served
    }

    private fun tenseRank(tense: GameArchiveStatus): Int = when (tense) {
        GameArchiveStatus.Upcoming -> 0
        GameArchiveStatus.Current -> 1
        GameArchiveStatus.Past -> 2
    }

    /** La saison À VENIR (#10014) : la saison 1 tant qu'aucune n'est ouverte, `null` ensuite. */
    public fun upcoming(moment: SeasonMoment): SeasonCalendar? = if (season(moment) == null) calendar(1) else null

    public fun stars(source: SeasonStarSource): Int = when (source) {
        SeasonStarSource.Easy, SeasonStarSource.Medium -> 1
        SeasonStarSource.Hard -> 2
        SeasonStarSource.Gold -> 3
        SeasonStarSource.Duo -> 5
    }

    public fun progress(stars: Int): SeasonProgress {
        val clamped = maxOf(0, stars)
        val reached = minOf(STEPS, clamped / STARS_PER_STEP)
        val completed = reached >= STEPS
        val inStep = clamped % STARS_PER_STEP
        return SeasonProgress(
            stars = clamped,
            steps = reached,
            starsToNext = if (completed) 0 else STARS_PER_STEP - inStep,
            progress = if (completed) 1.0 else inStep.toDouble() / STARS_PER_STEP,
            completed = completed,
        )
    }

    /**
     * La récompense GRATUITE d'une étape : des points (ceux de LA saison, bornés par le calendrier servi ;
     * à défaut ou illisibles, la loi : 100) ; un fragment d'étoile toutes les cinq étapes, un gel de Flamme
     * toutes les dix, la coupe à la 40e.
     */
    public fun stepReward(step: Int, stepPoints: Int? = null): SeasonRewardBlock? = when {
        step !in 1..STEPS -> null
        step == STEPS -> SeasonRewardBlock(SeasonRewardKind.SeasonCup, 1)
        step % 10 == 0 -> SeasonRewardBlock(SeasonRewardKind.Freeze, 1)
        step % 5 == 0 -> SeasonRewardBlock(SeasonRewardKind.Fragment, 1)
        else -> SeasonRewardBlock(SeasonRewardKind.Points, stepPoints?.takeIf { it > 0 } ?: STEP_POINTS)
    }

    /** Le cosmétique de la rangée Sceau à cette étape, `null` hors des étapes marquées. */
    public fun sealReward(season: Int, step: Int): SeasonSeal? {
        if (step !in 1..STEPS || step % SEAL_EVERY != 0) return null
        return SeasonSeal("season-$season.seal-${step / SEAL_EVERY}")
    }

    /** `null` quand l'achat est permis, sinon le refus. */
    public fun sealRefusal(balance: Int, owned: Boolean): SeasonSealRefusal? = when {
        owned -> SeasonSealRefusal.AlreadyOwned
        balance >= SEAL_PRICE -> null
        else -> SeasonSealRefusal.InsufficientBalance
    }

    /** [stepPoints] : les points d'une étape ordinaire de CETTE saison (calendrier servi) ; absent, la loi. */
    public fun claim(
        season: Int,
        step: Int,
        stepsReached: Int,
        claimed: List<Int>,
        sealOwned: Boolean,
        stepPoints: Int? = null,
    ): SeasonClaim {
        val reward = stepReward(step, stepPoints) ?: return SeasonClaim.Refused(SeasonClaimRefusal.OutOfRange)
        if (step in claimed) return SeasonClaim.Refused(SeasonClaimRefusal.AlreadyClaimed)
        if (step > stepsReached) return SeasonClaim.Refused(SeasonClaimRefusal.Locked)
        return SeasonClaim.Allowed(reward, if (sealOwned) sealReward(season, step) else null)
    }

    public fun settlement(season: Int, stepsReached: Int): SeasonSettlement =
        if (stepsReached >= STEPS) {
            SeasonSettlement(completed = true, glory = GameGlory.POINTS_SEASON, cup = true, badgeKey = "season.$season")
        } else {
            SeasonSettlement(completed = false, glory = 0, cup = false, badgeKey = null)
        }
}

/** Les semaines de ligue vues par les saisons : lundi local, fermeture le dimanche à 20 h. */
internal object SeasonWeeks {
    private const val CLOSE_WEEKDAY = 6
    private const val CLOSE_MINUTE = 20 * 60

    /** 0 pour le lundi, 6 pour le dimanche. */
    fun weekdayIndex(dayKey: String): Int = (((GameDay.number(dayKey) ?: 0L) + 3).mod(7L)).toInt()

    /** Le lundi local qui commence la semaine de [dayKey]. */
    fun weekKey(dayKey: String): String = GameDay.add(-weekdayIndex(dayKey), dayKey) ?: dayKey

    /** La semaine d'un moment : passé la fermeture du dimanche 20 h, c'est la suivante. */
    fun weekOfMoment(moment: SeasonMoment): String {
        val week = weekKey(moment.dayKey)
        val closed = weekdayIndex(moment.dayKey) == CLOSE_WEEKDAY && moment.minuteOfDay >= CLOSE_MINUTE
        return if (closed) GameDay.add(7, week) ?: week else week
    }

    fun calendarOf(number: Int, startDay: String, themeKey: String): SeasonCalendar? {
        val endDay = GameDay.add(GameSeason.DAYS - 1, startDay) ?: return null
        val weekKeys = (0 until GameSeason.WEEKS).mapNotNull { GameDay.add(it * 7, startDay) }
        return SeasonCalendar(number, startDay, endDay, weekKeys, themeKey)
    }
}
