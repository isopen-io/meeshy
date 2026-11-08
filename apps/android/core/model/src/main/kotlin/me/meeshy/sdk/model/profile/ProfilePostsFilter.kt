package me.meeshy.sdk.model.profile

/** Le genre d'une publication pour le filtre de l'onglet Postes (miroir de `isReel` / `isStory` d'iOS). */
enum class ProfilePostKind {
    POST,
    REEL,
    STORY;

    companion object {
        /** Le type serveur (`POST`, `REEL`, `STORY`, sans tenir compte de la casse) ; absent ou inconnu = poste. */
        fun of(type: String?): ProfilePostKind = when (type?.lowercase()) {
            "reel" -> REEL
            "story" -> STORY
            else -> POST
        }
    }
}

/**
 * Le filtre de la liste, piloté par les tuiles du bandeau (miroir de `ProfilePostsFilter` iOS) :
 * Postes = ni réel ni story ; Réels = réels seuls ; retoucher la tuile active remet [ALL].
 */
enum class ProfilePostsFilter {
    ALL,
    POSTS,
    REELS;

    fun toggled(with: ProfilePostsFilter): ProfilePostsFilter = if (this == with) ALL else with

    fun accepts(kind: ProfilePostKind): Boolean = when (this) {
        ALL -> true
        POSTS -> kind == ProfilePostKind.POST
        REELS -> kind == ProfilePostKind.REEL
    }
}
