package me.meeshy.sdk.model.profile

/** Les onglets de la fiche ; l'onglet initial est [DETAILS]. */
enum class ProfileTab {
    POSTS,
    CONVERSATIONS,
    DETAILS;

    companion object {
        val DEFAULT: ProfileTab = DETAILS
    }
}
