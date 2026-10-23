package me.meeshy.sdk.model.game

/*
 * Les boosts (#9373) : le Vent arrière et l'Heure du Prisme. MIROIR de
 * `packages/shared/utils/game/boosts.ts` et de `GameBoosts.swift` (iOS).
 */

/** [startMinute, endMinute[ en minutes de la journée locale. */
public data class PrismHourWindow(val startMinute: Int, val endMinute: Int)

public object GameBoostLaws {

    /** Le Vent arrière : ×1,25 sur les étincelles des gestes. */
    public const val TAILWIND_FACTOR: Double = 1.25

    /** L'écart au record de niveau à partir duquel le Vent arrière souffle (#10896). */
    public const val TAILWIND_LEVEL_GAP: Int = 7

    public const val REPLY_RECEIVED_DAILY_CAP: Int = 20

    /** Les missions comptent double pendant l'Heure du Prisme. */
    public const val PRISM_HOUR_MULTIPLIER: Int = 2

    private const val PRISM_EARLIEST_MINUTE = 9 * 60
    private const val PRISM_LATEST_END_MINUTE = 21 * 60
    private const val PRISM_LENGTH = 60
    private const val PRISM_GRANULARITY = 15

    /** La loi d'AVANT les étincelles : le Vent arrière souffle dès que le niveau passe sous le record. */
    public fun tailwindFactor(level: Int, levelRecord: Int): Double = if (level < levelRecord) TAILWIND_FACTOR else 1.0

    /** Le Vent arrière des étincelles : il souffle tant que le niveau est 7 niveaux ou plus sous le record, sans état. */
    public fun sparksTailwindFactor(level: Int, levelRecord: Int): Double =
        if (levelRecord - level >= TAILWIND_LEVEL_GAP) TAILWIND_FACTOR else 1.0

    /** Une heure par jour, tirée par la graine (utilisateur, jour), sur un quart d'heure, entre 9 h et 21 h locales. */
    public fun prismHourWindow(userId: String, dayKey: String): PrismHourWindow {
        val slots = (PRISM_LATEST_END_MINUTE - PRISM_LENGTH - PRISM_EARLIEST_MINUTE) / PRISM_GRANULARITY + 1
        val slot = kotlin.math.floor(GameRandom(GameSeedParts(userId, dayKey, "prism-hour")).next() * slots).toInt()
        val start = PRISM_EARLIEST_MINUTE + slot * PRISM_GRANULARITY
        return PrismHourWindow(start, start + PRISM_LENGTH)
    }

    public fun isInPrismHour(window: PrismHourWindow, minuteOfDay: Int): Boolean =
        minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute

    /** Le multiplicateur des missions à cet instant local du compte : 2 dans la fenêtre, 1 hors d'elle. */
    public fun missionMultiplier(window: PrismHourWindow?, minuteOfDay: Int): Int =
        if (window != null && isInPrismHour(window, minuteOfDay)) PRISM_HOUR_MULTIPLIER else 1
}
