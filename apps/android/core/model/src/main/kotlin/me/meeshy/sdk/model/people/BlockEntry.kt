package me.meeshy.sdk.model.people

/** L'entrée rouge offerte pour une personne : bloquer, ou débloquer quand la liste de blocage la contient. */
enum class BlockEntry {
    BLOCK,
    UNBLOCK,
    ;

    /** Bloquer se confirme ; débloquer est direct (parité iOS). */
    val needsConfirmation: Boolean get() = this == BLOCK
}

/**
 * Qui peut se voir offrir « Bloquer » ou « Débloquer » : jamais soi, jamais une personne inconnue ou sans
 * compte, jamais un groupe (une conversation de groupe n'a pas d'interlocuteur à bloquer).
 */
object BlockEntryPlan {
    fun of(
        targetUserId: String?,
        selfUserId: String?,
        isGroup: Boolean = false,
        isAnonymous: Boolean = false,
        isBlocked: Boolean,
    ): BlockEntry? {
        val target = targetUserId?.takeIf { it.isNotBlank() } ?: return null
        if (isGroup || isAnonymous || target == selfUserId) return null
        return if (isBlocked) BlockEntry.UNBLOCK else BlockEntry.BLOCK
    }
}

/** Le nom que la confirmation prononce : celui de la personne, ou le repli localisé quand il manque. */
object BlockConfirmWording {
    fun displayName(name: String?, fallback: String): String = name?.trim()?.takeIf { it.isNotEmpty() } ?: fallback
}
