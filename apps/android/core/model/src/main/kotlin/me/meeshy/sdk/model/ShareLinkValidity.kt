package me.meeshy.sdk.model

/**
 * Validité d'un lien : places restantes, jours restants, ouverture. Miroir de
 * `ShareLinkInvitationTerms` (iOS) — lois pures, sans I/O.
 */
object ShareLinkValidity {
    private const val DAY_MILLIS = 86_400_000L

    /** Places restantes ; `null` = illimité. Jamais négatif. */
    fun remainingPlaces(maxUses: Int?, currentUses: Int): Int? =
        maxUses?.let { maxOf(0, it - currentUses) }

    /**
     * Jours restants arrondis AU-DESSUS (expire dans cinq heures = « encore 1 jour ») ;
     * `null` = sans échéance, `0` = expiré (à la seconde de l'échéance comprise).
     */
    fun daysLeft(expiresAt: Long?, now: Long): Int? {
        if (expiresAt == null) return null
        val remaining = expiresAt - now
        if (remaining <= 0) return 0
        return ((remaining + DAY_MILLIS - 1) / DAY_MILLIS).toInt()
    }

    /** Le lien accepte-t-il encore quelqu'un ? */
    fun isOpen(maxUses: Int?, currentUses: Int, expiresAt: Long?, now: Long): Boolean {
        val placesLeft = remainingPlaces(maxUses, currentUses)?.let { it > 0 } ?: true
        val timeLeft = daysLeft(expiresAt, now)?.let { it > 0 } ?: true
        return placesLeft && timeLeft
    }
}

val ShareLinkInfo.remainingPlaces: Int?
    get() = ShareLinkValidity.remainingPlaces(maxUses, currentUses)

fun ShareLinkInfo.daysLeft(now: Long): Int? = ShareLinkValidity.daysLeft(expiresAt, now)

fun ShareLinkInfo.isOpen(now: Long): Boolean =
    ShareLinkValidity.isOpen(maxUses, currentUses, expiresAt, now)
