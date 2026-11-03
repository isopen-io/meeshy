package me.meeshy.sdk.model.session

/**
 * Ce que l'écran Sécurité > Sessions montre selon ce qu'il sait (miroir de `LoadState` de
 * `ActiveSessionsViewModel`, iOS) : la liste connue reste lisible hors ligne ou en échec,
 * le squelette n'apparaît que sur un cache vide, jamais un écran d'erreur par-dessus des données.
 */
public object ActiveSessionsScreenLaw {

    public enum class Mode { SKELETON, CONTENT, OFFLINE, ERROR, EMPTY }

    public enum class Banner { OFFLINE, ERROR }

    /**
     * [payload] nul = cache vide. [syncFailed] : la dernière revalidation a échoué ;
     * [isOnline] départage « hors ligne » (discret) et « erreur ».
     */
    public fun mode(payload: UserSessionsPayload?, syncFailed: Boolean, isOnline: Boolean): Mode = when {
        payload != null -> if (payload.sessions.isEmpty()) Mode.EMPTY else Mode.CONTENT
        !syncFailed -> Mode.SKELETON
        isOnline -> Mode.ERROR
        else -> Mode.OFFLINE
    }

    /** Le bandeau qui dit que la liste affichée peut dater ; nul sans échec ou sans liste. */
    public fun banner(payload: UserSessionsPayload?, syncFailed: Boolean, isOnline: Boolean): Banner? = when {
        payload == null || payload.sessions.isEmpty() || !syncFailed -> null
        isOnline -> Banner.ERROR
        else -> Banner.OFFLINE
    }

    /** Un lieu au moins est montré : l'attribution de la base DB-IP (CC-BY 4.0) est due. */
    public fun showsGeolocation(sessions: List<UserSession>): Boolean =
        sessions.any { !it.city.isNullOrBlank() || !it.country.isNullOrBlank() }
}
