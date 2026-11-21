package me.meeshy.sdk.model.call

/**
 * **Une mesure aberrante n'est pas une mesure** (#20122) — le miroir Android de iOS
 * `CallStatValue` (#19933). `getStats` peut rendre NaN, l'infini ou un négatif :
 * une telle valeur vaut 0 (non mesurée), et les cumuls plafonnent à la borne au
 * lieu de déborder.
 *
 * Les PAQUETS se comptent en `Int` : [MAX_SAFE_COUNT] n'y est qu'une limite de
 * REPRÉSENTATION, et une valeur finie au-delà SATURE, pour qu'un cumul ne recule
 * jamais quand un flux la franchit.
 *
 * Les OCTETS se comptent en `Long` (#20132) : un flux vidéo à 2,5 Mb/s franchit
 * 2^31 octets en moins de deux heures. Leur borne [MAX_SAFE_BYTES] = 2^53 − 1 est,
 * comme sur iOS, une borne de VRAISEMBLANCE (la passerelle refuse tout entier
 * au-delà de `Number.MAX_SAFE_INTEGER`) : une lecture qui la dépasse est aberrante
 * et vaut 0, comme sur iOS. Aucun flux réel n'y arrive (neuf siècles à 2,5 Mb/s),
 * si bien qu'un cumul réel ne recule jamais ; la SOMME de plusieurs flux sature à
 * la borne et ne déborde pas.
 */
public object CallStatValue {
    public const val MAX_SAFE_COUNT: Int = Int.MAX_VALUE

    public const val MAX_SAFE_BYTES: Long = 9_007_199_254_740_991L

    public fun measured(value: Double): Double = if (value.isFinite() && value > 0.0) value else 0.0

    public fun count(value: Double): Int {
        val valid = measured(value)
        return if (valid > MAX_SAFE_COUNT.toDouble()) MAX_SAFE_COUNT else valid.toInt()
    }

    public fun sum(lhs: Int, rhs: Int): Int =
        (lhs.toLong() + rhs.toLong()).coerceIn(0L, MAX_SAFE_COUNT.toLong()).toInt()

    public fun bytes(value: Double): Long {
        val valid = measured(value)
        return if (valid > MAX_SAFE_BYTES.toDouble()) 0L else valid.toLong()
    }

    public fun bytes(value: Long): Long = value.takeIf { it in 0L..MAX_SAFE_BYTES } ?: 0L

    public fun sumBytes(lhs: Long, rhs: Long): Long {
        val left = lhs.coerceIn(0L, MAX_SAFE_BYTES)
        val right = rhs.coerceIn(0L, MAX_SAFE_BYTES)
        return if (right > MAX_SAFE_BYTES - left) MAX_SAFE_BYTES else left + right
    }

    /**
     * Les octets relus d'un résumé persisté : la clé `Long` d'abord, sinon l'ancienne
     * clé `Int` écrite avant #20132, sinon 0. Une valeur hors de `0..`[MAX_SAFE_BYTES]
     * est aberrante et vaut 0.
     */
    public fun storedBytes(stored: Long?, legacy: Int?): Long = bytes(stored ?: legacy?.toLong() ?: 0L)
}
