package me.meeshy.sdk.model

/** Les modes de visibilité d'une publication (port de `PostVisibility`). */
enum class StoryVisibility(val wire: String) {
    PUBLIC("PUBLIC"),
    COMMUNITY("COMMUNITY"),
    FRIENDS("FRIENDS"),
    EXCEPT("EXCEPT"),
    ONLY("ONLY"),
    PRIVATE("PRIVATE"),
    ;

    /** EXCEPT / ONLY exigent une sélection d'utilisateurs : la passerelle rejette un envoi sans. */
    val requiresUserSelection: Boolean get() = this == EXCEPT || this == ONLY
}

/** Ce que déclenche un tap sur une entrée du sous-menu « Modifier la visibilité ». */
object StoryVisibilityMenuResolver {

    sealed interface Route {
        /** Mode déjà actif : ni réseau ni sélecteur. */
        data object Ignored : Route

        /**
         * Écriture directe. [userIds] est TOUJOURS envoyé, même vide, jamais omis : un champ
         * absent laisserait côté serveur l'ancienne audience orpheline.
         */
        data class ApplyDirectly(val userIds: List<String> = emptyList()) : Route

        /** EXCEPT / ONLY : le sélecteur d'audience s'ouvre pré-coché sur la sélection actuelle. */
        data object OpenAudiencePicker : Route
    }

    fun isCurrent(candidate: StoryVisibility, rawValue: String?): Boolean =
        rawValue != null && rawValue.uppercase() == candidate.wire

    fun route(candidate: StoryVisibility, current: String?): Route = when {
        isCurrent(candidate, current) -> Route.Ignored
        candidate.requiresUserSelection -> Route.OpenAudiencePicker
        else -> Route.ApplyDirectly(userIds = emptyList())
    }
}
