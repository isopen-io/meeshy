package me.meeshy.sdk.model.imagine

import kotlin.math.abs

/**
 * **L'échelle de chaque partie** — un pincement sur l'aperçu agrandit ou réduit la partie qu'il touche. Bornée de moitié
 * au double ; tout près de 100 %, elle s'y AIMANTE (revenir à la taille d'origine ne demande pas un doigt d'horloger).
 * Valeur immuable : [with] rend une nouvelle table. Miroir de `MessageCardScales` (iOS).
 */
class ImagineScales private constructor(private val values: Map<ImaginePartId, Double>) {

    operator fun get(part: ImaginePartId): Double = values[part] ?: 1.0

    val isIdentity: Boolean get() = values.isEmpty()

    /** La table où [part] vaut [value] — borné, aimanté ; une partie sans taille propre ou une valeur absurde ne change rien. */
    fun with(part: ImaginePartId, value: Double): ImagineScales {
        if (part !in PARTS || !value.isFinite()) return this
        val clamped = value.coerceIn(MIN, MAX)
        return ImagineScales(if (abs(clamped - 1.0) <= SNAP) values - part else values + (part to clamped))
    }

    /**
     * L'échelle que vise un pincement de [factor] sur [part], depuis l'échelle que la carte REND (bornée par [limit], la
     * place qu'elle laisse à la partie) : le geste ne promet jamais une taille que la carte ne peindra pas.
     */
    fun pinched(part: ImaginePartId, factor: Double, limit: Double = MAX): Double {
        val bound = limit.coerceIn(MIN, MAX)
        val rendered = minOf(this[part], bound)
        if (!factor.isFinite() || factor <= 0) return rendered
        return (rendered * factor).coerceIn(MIN, bound)
    }

    /** Le pincement appliqué : la table qui suit le geste. */
    fun pinch(part: ImaginePartId, factor: Double, limit: Double = MAX): ImagineScales = with(part, pinched(part, factor, limit))

    /** Un pas d'accessibilité (TalkBack « augmenter » / « diminuer ») : ×1,1 ou ÷1,1 de l'échelle rendue. */
    fun stepped(part: ImaginePartId, increase: Boolean, limit: Double = MAX): ImagineScales =
        pinch(part, if (increase) STEP else 1 / STEP, limit)

    /** La forme enregistrée : `partie → échelle`, sans les parties à 100 %. */
    fun stored(): Map<String, Double> = values.mapKeys { it.key.name.lowercase() }

    override fun equals(other: Any?): Boolean = other is ImagineScales && other.values == values

    override fun hashCode(): Int = values.hashCode()

    companion object {
        const val MIN = 0.5
        const val MAX = 2.0
        const val SNAP = 0.04
        const val STEP = 1.1

        /** Les parties qu'un pincement règle : la liaison et le fond n'ont pas de taille à eux. */
        val PARTS: List<ImaginePartId> = listOf(
            ImaginePartId.HEADER, ImaginePartId.QUOTE, ImaginePartId.REPLY, ImaginePartId.MEDIA, ImaginePartId.TRANSCRIPT,
        )

        val Identity = ImagineScales(emptyMap())

        /** Relit la forme enregistrée : une partie inconnue ou une valeur abîmée est ignorée. */
        fun fromStored(stored: Map<String, Double>?): ImagineScales =
            stored.orEmpty().entries.fold(Identity) { scales, (key, value) ->
                val part = ImaginePartId.entries.firstOrNull { it.name.equals(key, ignoreCase = true) }
                if (part == null) scales else scales.with(part, value)
            }
    }
}
