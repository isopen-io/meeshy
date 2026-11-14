package me.meeshy.ui.component.kit

import java.text.BreakIterator

/** Un franchissement du plafond : l'entrée dans les 80 %, ou le plafond atteint. */
public enum class MeeshyFieldLimitCrossing { Near, Reached }

/**
 * La loi du plafond : compte en unités UTF-16, troncature sur une frontière de graphème, seuil d'alerte à 80 %.
 * Pure, sans ton ni vue ; la même loi que `MeeshyFieldLimit` (iOS).
 */
public object MeeshyFieldLimit {
    public fun count(text: String): Int = text.length

    public fun truncate(text: String, limit: Int): String {
        if (count(text) <= limit) return text
        val iterator = BreakIterator.getCharacterInstance()
        iterator.setText(text)
        var kept = 0
        var boundary = iterator.next()
        while (boundary != BreakIterator.DONE && boundary <= limit) {
            kept = boundary
            boundary = iterator.next()
        }
        return text.substring(0, kept)
    }

    public fun isNear(count: Int, limit: Int): Boolean =
        count.toFloat() >= limit.toFloat() * MeeshyFieldRecipe.NEAR_LIMIT_RATIO

    /** Le franchissement MONTANT entre deux comptes : une fois par passage, le plafond l'emporte sur les 80 %. */
    public fun crossing(from: Int, to: Int, limit: Int): MeeshyFieldLimitCrossing? = when {
        from < limit && to >= limit -> MeeshyFieldLimitCrossing.Reached
        !isNear(from, limit) && isNear(to, limit) -> MeeshyFieldLimitCrossing.Near
        else -> null
    }
}

/** Une frappe lue par le registre : la valeur à montrer, si elle a été coupée, si elle part chez l'hôte, et le franchissement. */
public data class MeeshyFieldEdit(
    val value: String,
    val wasTruncated: Boolean,
    val emits: Boolean,
    val crossing: MeeshyFieldLimitCrossing?,
)

/**
 * L'état du brouillon en valeurs : ce que le champ a rendu à l'hôte ([emitted]) et ce qu'il a validé ([committed]).
 * Le composable garde le texte affiché et le curseur ; ce registre décide qui parle et quand.
 */
public data class MeeshyFieldLedger(
    val emitted: String,
    val committed: String,
) {
    public companion object {
        public fun of(text: String): MeeshyFieldLedger = MeeshyFieldLedger(emitted = text, committed = text)
    }

    public fun receive(next: String, limit: Int?): Pair<MeeshyFieldLedger, MeeshyFieldEdit?> {
        if (next == emitted) return this to null
        val bounded = limit?.let { MeeshyFieldLimit.truncate(next, it) } ?: next
        val wasTruncated = bounded != next
        if (bounded == emitted) {
            return this to MeeshyFieldEdit(bounded, wasTruncated, emits = false, crossing = null)
        }
        val crossing = limit?.let {
            MeeshyFieldLimit.crossing(MeeshyFieldLimit.count(emitted), MeeshyFieldLimit.count(bounded), it)
        }
        return copy(emitted = bounded) to MeeshyFieldEdit(bounded, wasTruncated, emits = true, crossing = crossing)
    }

    public fun resync(external: String): Pair<MeeshyFieldLedger, Boolean> {
        if (external == emitted) return this to false
        return MeeshyFieldLedger(emitted = external, committed = external) to true
    }

    public fun commit(draft: String): Pair<MeeshyFieldLedger, String?> {
        if (draft == committed) return this to null
        return copy(committed = draft) to draft
    }
}
