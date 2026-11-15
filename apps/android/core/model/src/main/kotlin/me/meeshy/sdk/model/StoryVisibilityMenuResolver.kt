package me.meeshy.sdk.model

/**
 * Les modes de visibilité d'une publication (port de `PostVisibility`, `POST_VISIBILITIES` du serveur).
 *
 * Les audiences de CERCLE (#13931, #13939) se lisent au niveau effectif de l'auteur avec le lecteur : [ACQUAINTANCES]
 * (Connaissances et au-dessus), [CLOSE] (Proches et au-dessus), [BLOOD] (Sang seul). [FRIENDS] garde son sens historique
 * « Amis et au-dessus ». L'ordre de déclaration est l'échelle du composeur, du plus large au plus étroit.
 */
enum class StoryVisibility(val wire: String) {
    PUBLIC("PUBLIC"),
    COMMUNITY("COMMUNITY"),
    ACQUAINTANCES("ACQUAINTANCES"),
    FRIENDS("FRIENDS"),
    CLOSE("CLOSE"),
    BLOOD("BLOOD"),
    EXCEPT("EXCEPT"),
    ONLY("ONLY"),
    PRIVATE("PRIVATE"),
    ;

    /** EXCEPT / ONLY exigent une sélection d'utilisateurs : la passerelle rejette un envoi sans. */
    val requiresUserSelection: Boolean get() = this == EXCEPT || this == ONLY

    companion object {
        /**
         * Une audience SERVIE, lue fail-closed (#13939) : une valeur que ce client ne connaît pas se lit RESTREINTE
         * ([PRIVATE]), jamais [PUBLIC]. Afficher « Public » une audience inconnue, puis la réécrire en public à
         * l'édition, est le risque que cette lecture referme — miroir de `PostVisibility(served:)` (iOS).
         */
        fun fromWire(value: String): StoryVisibility =
            entries.firstOrNull { it.wire == value.uppercase() } ?: PRIVATE
    }
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
