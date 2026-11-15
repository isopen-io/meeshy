package me.meeshy.sdk.model.call

/**
 * Verdict d'une vérification de fraîcheur d'un appel annoncé par push : un push livré longtemps
 * après la fin de l'appel ne doit pas faire sonner. Toute incertitude retombe sur [Live] (sonner).
 */
enum class CallFreshness {
    Live,
    Finished,
    ;

    companion object {
        private val FINISHED_STATUSES = setOf("ended", "missed", "rejected", "failed", "cancelled", "canceled")

        /** Le statut serveur d'une session relue ; `null` (réseau, 4xx, corps vide) = [Live]. */
        fun of(status: String?): CallFreshness =
            if (status != null && status.trim().lowercase() in FINISHED_STATUSES) Finished else Live
    }
}
