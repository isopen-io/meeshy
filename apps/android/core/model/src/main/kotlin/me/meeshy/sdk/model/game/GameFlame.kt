package me.meeshy.sdk.model.game

import kotlin.math.max
import kotlin.math.min

/*
 * La Flamme (#9373) : la série de jours prend cinq formes, un bonus sur les missions, des gels qui
 * protègent un jour manqué, un rallumage dans les 48 h. MIROIR de
 * `packages/shared/utils/game/flame.ts` et de `GameFlame.swift` (iOS). Les jours sont des clés
 * `AAAA-MM-JJ` dans le fuseau du COMPTE ; la fenêtre de 48 h se lit en jours calendaires.
 * Une clé illisible se traite comme « même jour » : la loi ne change rien.
 */

public enum class FlameOutcome { Started, SameDay, Continued, Protected, Broken }

public data class FlameTransition(
    val outcome: FlameOutcome,
    val streak: Int,
    val freezes: Int,
    val freezesUsed: Int,
    val missedDays: Int,
    /** La série perdue quand la Flamme s'éteint, 0 sinon : c'est elle qu'un rallumage rend. */
    val lostStreak: Int,
)

public enum class FreezeRefusal { AtMaximum, InsufficientBalance }

public enum class RelightRefusal { NoStreak, NotExtinguished, WindowClosed, MonthlyLimit, InsufficientBalance }

/** [reason] est `null` quand le rallumage est permis. */
public data class RelightDecision(val allowed: Boolean, val reason: RelightRefusal?, val price: Int)

public data class FlameRelit(val streak: Int, val lastActiveDay: String?)

public object GameFlameLaw {

    private data class Form(val key: FlameFormKey, val minDays: Int)

    private val FORMS = listOf(
        Form(FlameFormKey.Braise, 1),
        Form(FlameFormKey.Flamme, 7),
        Form(FlameFormKey.Brasier, 30),
        Form(FlameFormKey.Astre, 100),
        Form(FlameFormKey.Soleil, 365),
    )

    public const val FREEZE_MAX: Int = 2
    public const val FREEZE_PRICE: Int = 1
    public const val RELIGHT_PRICE: Int = 3
    public const val RELIGHT_WINDOW_DAYS: Int = 2
    public const val BONUS_PERCENT_PER_DAY: Int = 2
    public const val BONUS_PERCENT_MAX: Int = 50

    private fun days0(value: Int): Int = max(0, value)

    /** `null` sans série. */
    public fun form(streakDays: Int): FlameFormKey? = FORMS.lastOrNull { days0(streakDays) >= it.minDays }?.key

    /** Le bonus en pour cent entier : 2 % par jour de série, plafond 50 %. */
    public fun bonusPercent(streakDays: Int): Int = min(BONUS_PERCENT_MAX, BONUS_PERCENT_PER_DAY * days0(streakDays))

    public fun bonus(streakDays: Int): Double = bonusPercent(streakDays) / 100.0

    /** Acheter un gel : refus FREEZE_AT_MAXIMUM à 2 en réserve, solde insuffisant sinon. `null` = permis. */
    public fun canBuyFreeze(freezes: Int, balance: Int): FreezeRefusal? = when {
        days0(freezes) >= FREEZE_MAX -> FreezeRefusal.AtMaximum
        days0(balance) < FREEZE_PRICE -> FreezeRefusal.InsufficientBalance
        else -> null
    }

    /**
     * Le jour où l'utilisateur AGIT : que devient la série ? Un gel couvre un jour manqué, consommé
     * AUTOMATIQUEMENT, mais seulement si les gels couvrent TOUS les jours manqués.
     */
    public fun advance(lastActiveDay: String?, today: String, streak: Int, freezes: Int): FlameTransition {
        val s = days0(streak)
        val f = days0(freezes)
        if (lastActiveDay == null) return FlameTransition(FlameOutcome.Started, 1, f, 0, 0, 0)
        val gap = GameDay.diff(lastActiveDay, today) ?: 0
        if (gap <= 0) return FlameTransition(FlameOutcome.SameDay, s, f, 0, 0, 0)
        if (gap == 1) return FlameTransition(FlameOutcome.Continued, s + 1, f, 0, 0, 0)
        val missed = gap - 1
        if (missed <= f) return FlameTransition(FlameOutcome.Protected, s + 1, f - missed, missed, missed, 0)
        return FlameTransition(FlameOutcome.Broken, 1, f, 0, missed, s)
    }

    /** L'état de la Flamme à l'ouverture, avant tout geste du jour. */
    public fun status(lastActiveDay: String?, today: String, streak: Int, freezes: Int): FlameStatus {
        if (lastActiveDay == null || days0(streak) == 0) return FlameStatus.None
        val gap = GameDay.diff(lastActiveDay, today) ?: 0
        return when {
            gap <= 0 -> FlameStatus.Lit
            gap == 1 -> FlameStatus.AtRisk
            gap - 1 <= days0(freezes) -> FlameStatus.Covered
            else -> FlameStatus.Out
        }
    }

    /** 3 Meeshes, dans les 48 h qui suivent l'extinction, une fois par mois (RELIGHT_NOT_ALLOWED sinon). */
    public fun canRelight(lastActiveDay: String?, today: String, streakBeforeBreak: Int, lastRelightDay: String?, balance: Int): RelightDecision {
        fun refuse(reason: RelightRefusal) = RelightDecision(false, reason, RELIGHT_PRICE)
        if (lastActiveDay == null || days0(streakBeforeBreak) == 0) return refuse(RelightRefusal.NoStreak)
        val gap = GameDay.diff(lastActiveDay, today) ?: 0
        return when {
            gap <= 1 -> refuse(RelightRefusal.NotExtinguished)
            gap > 1 + RELIGHT_WINDOW_DAYS -> refuse(RelightRefusal.WindowClosed)
            lastRelightDay != null && GameDay.month(lastRelightDay) == GameDay.month(today) -> refuse(RelightRefusal.MonthlyLimit)
            days0(balance) < RELIGHT_PRICE -> refuse(RelightRefusal.InsufficientBalance)
            else -> RelightDecision(true, null, RELIGHT_PRICE)
        }
    }

    /** La série d'avant la rupture, à poursuivre par le geste du jour : la veille d'aujourd'hui. */
    public fun relight(today: String, streakBeforeBreak: Int): FlameRelit =
        FlameRelit(days0(streakBeforeBreak), GameDay.add(-1, today))
}
