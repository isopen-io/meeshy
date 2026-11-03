package me.meeshy.sdk.model.story

/**
 * Ce que l'en-tête du lecteur dit de l'auteur — miroir de `FullscreenIdentityRow` (iOS) : l'ancienneté qui qualifie
 * l'auteur (jamais de date absolue) et l'attribution d'une republication (icône + `@handle`, sans « via »).
 */
object StoryHeaderPresentation {

    /** L'appui long sur l'identité (halo puis profil) : 0,4 s comme iOS. */
    const val PROFILE_LONG_PRESS_MILLIS: Long = 400L

    sealed interface Age {
        data object Now : Age
        data class Minutes(val value: Int) : Age
        data class Hours(val value: Int) : Age
        data class Days(val value: Int) : Age
    }

    /** `null` quand la story n'a pas de date : rien n'est inventé. Une horloge en retard compte « maintenant ». */
    fun age(createdAtMillis: Long?, nowMillis: Long): Age? {
        createdAtMillis ?: return null
        val minutes = ((nowMillis - createdAtMillis).coerceAtLeast(0L) / 60_000L).toInt()
        return when {
            minutes < 1 -> Age.Now
            minutes < 60 -> Age.Minutes(minutes)
            minutes < 24 * 60 -> Age.Hours(minutes / 60)
            else -> Age.Days(minutes / (24 * 60))
        }
    }

    /** Le `@handle` de l'attribution : rogné, sans `@` doublé ; `null` quand il n'y a rien à dire. */
    fun repostHandle(raw: String?): String? =
        raw?.trim()?.removePrefix("@")?.trim()?.takeIf { it.isNotEmpty() }
}
