package me.meeshy.sdk.model.call

/**
 * **Une mesure aberrante n'est pas une mesure** (#20122) — le miroir Android de iOS
 * `CallStatValue` (#19933). `getStats` peut rendre NaN, l'infini, un négatif ou un
 * compteur démesuré : une valeur non finie ou négative vaut 0 (non mesurée), un
 * compteur au-delà de la borne sûre aussi, et les cumuls plafonnent à cette borne
 * au lieu de déborder.
 *
 * Les champs de [CallStats] sont des `Int` 32 bits : la borne sûre est donc
 * [Int.MAX_VALUE] (iOS : 2^53 − 1, la borne de la passerelle).
 */
public object CallStatValue {
    public const val MAX_SAFE_COUNT: Int = Int.MAX_VALUE

    public fun measured(value: Double): Double = if (value.isFinite() && value > 0.0) value else 0.0

    public fun count(value: Double): Int {
        val valid = measured(value)
        return if (valid > MAX_SAFE_COUNT.toDouble()) 0 else valid.toInt()
    }

    public fun sum(lhs: Int, rhs: Int): Int =
        (lhs.toLong() + rhs.toLong()).coerceIn(0L, MAX_SAFE_COUNT.toLong()).toInt()
}
