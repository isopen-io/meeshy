package me.meeshy.sdk.model.push

/**
 * Le temps que le réveil d'un push peut consacrer à sa synchro avant de rendre la main (miroir de
 * `SilentPushDurability`, iOS). Le plafond n'est pas une attente : le travail rend la main dès qu'il a fini.
 *
 * Sans budget connu (`null`), le plafond est servi — jamais une attente sans borne sur un chemin qui doit
 * rendre la main.
 */
public object SilentPushBudget {
    /** Ce qu'on garde pour rendre la main elle-même. */
    public const val SAFETY_MARGIN_MILLIS: Long = 1_000

    /** La synchro ne devient pas une seconde raison de tenir le processus éveillé. */
    public const val CAP_MILLIS: Long = 5_000

    /** Ce que FCM accorde à `onMessageReceived` avant de tuer le processus (environ dix secondes). */
    public const val FCM_BUDGET_MILLIS: Long = 10_000

    /** L'instant (epoch ms) avant lequel le travail et son flush doivent être terminés. */
    public fun flushDeadline(nowMillis: Long, remainingMillis: Long?): Long {
        if (remainingMillis == null) return nowMillis + CAP_MILLIS
        val usable = (remainingMillis - SAFETY_MARGIN_MILLIS).coerceAtLeast(0)
        return nowMillis + minOf(usable, CAP_MILLIS)
    }

    /** La durée utilisable (ms) : `flushDeadline(now, remaining) - now`. */
    public fun workBudgetMillis(remainingMillis: Long?): Long = flushDeadline(0, remainingMillis)
}
