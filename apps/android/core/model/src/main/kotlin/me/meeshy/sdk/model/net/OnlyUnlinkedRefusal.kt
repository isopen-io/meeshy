package me.meeshy.sdk.model.net

/**
 * **TROP DE PERSONNES CHOISIES SANS LIEN** (#14105, #14169) — le 429 `ONLY_UNLINKED_RECIPIENTS_LIMIT` qu'une publication
 * ou une édition `ONLY` reçoit quand ses choisis sans lien avec l'auteur dépassent le plafond du jour. Ce n'est pas une
 * cadence : attendre une minute n'y change rien, l'auteur retire ces personnes ou revient demain. Il ne se rejoue donc
 * jamais tout seul ([RetryDecision.NEVER_REPLAYED_429_CODES]) et se DIT à l'auteur, avec ses nombres quand la passerelle
 * les donne ([limit] par jour, [unlinked] dans cette publication).
 *
 * Le refus voyage sur la ligne d'outbox qui renonce, sous la forme de [reason] ; [parse] l'y relit.
 */
public data class OnlyUnlinkedRefusal(val limit: Int?, val unlinked: Int?) {

    /** La raison d'échec écrite sur la ligne d'outbox, relue par [parse]. */
    public val reason: String
        get() = listOfNotNull(CODE, limit?.let { "limit=$it" }, unlinked?.let { "unlinked=$it" }).joinToString(" ")

    public companion object {
        public const val CODE: String = "ONLY_UNLINKED_RECIPIENTS_LIMIT"

        /** Le refus porté par une raison d'échec, ou `null` quand elle dit autre chose. */
        public fun parse(reason: String?): OnlyUnlinkedRefusal? {
            val parts = reason?.trim()?.split(' ')?.takeIf { it.firstOrNull() == CODE } ?: return null
            val numbers = parts.drop(1).mapNotNull { part ->
                part.split('=', limit = 2).takeIf { it.size == 2 }?.let { (key, value) -> value.toIntOrNull()?.let { key to it } }
            }.toMap()
            return OnlyUnlinkedRefusal(limit = numbers["limit"], unlinked = numbers["unlinked"])
        }
    }
}
