package me.meeshy.sdk.model.call

/**
 * **Une mesure aberrante n'est pas une mesure** (#20122) — le miroir Android de iOS
 * `CallStatValue` (#19933). `getStats` peut rendre NaN, l'infini ou un négatif :
 * une telle valeur vaut 0 (non mesurée), et les cumuls plafonnent à la borne au
 * lieu de déborder.
 *
 * Écart VOULU avec iOS au-delà de la borne. Sur iOS, 2^53 − 1 est une borne de
 * VRAISEMBLANCE (la passerelle refuse tout entier au-delà) : un compteur qui la
 * dépasse est aberrant et vaut 0. Ici, les champs de [CallStats] sont des `Int`
 * 32 bits et [Int.MAX_VALUE] n'est qu'une limite de REPRÉSENTATION : un flux vidéo
 * à 2,5 Mb/s franchit 2^31 octets en moins de deux heures. Une valeur FINIE
 * au-delà de la borne y SATURE donc, pour qu'un cumul ne recule jamais quand un
 * flux la franchit (les compteurs en `Long` relèvent de #20132).
 */
public object CallStatValue {
    public const val MAX_SAFE_COUNT: Int = Int.MAX_VALUE

    public fun measured(value: Double): Double = if (value.isFinite() && value > 0.0) value else 0.0

    public fun count(value: Double): Int {
        val valid = measured(value)
        return if (valid > MAX_SAFE_COUNT.toDouble()) MAX_SAFE_COUNT else valid.toInt()
    }

    public fun sum(lhs: Int, rhs: Int): Int =
        (lhs.toLong() + rhs.toLong()).coerceIn(0L, MAX_SAFE_COUNT.toLong()).toInt()
}
