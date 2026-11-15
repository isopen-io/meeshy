package me.meeshy.sdk.model.profile

/** Les onglets de la fiche, dans l'ordre de la barre : Détails, Conversations, Publications (#17203) ; l'onglet initial est [DETAILS]. */
enum class ProfileTab {
    DETAILS,
    CONVERSATIONS,
    POSTS;

    companion object {
        val DEFAULT: ProfileTab = DETAILS
    }
}
