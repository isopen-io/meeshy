package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Métadonnées HORS-PAGE d'une réponse (clé racine `meta`). `data` ne peut dire que
 * ce qui EXISTE ; les disparitions n'ont nulle part où tenir dans la page : c'est le
 * seul canal par lequel un client ayant manqué l'événement socket
 * (`conversation:deleted`, `story:deleted`) apprend qu'il doit purger son cache.
 * Miroir de iOS `APIResponseMeta`. Tout est nullable : un ancien serveur (ou une
 * route qui ne sert pas le bloc) se lit `null`, les clés inconnues sont ignorées.
 */
@Serializable
data class ApiResponseMeta(
    val deletedConversationIds: List<String>? = null,
    val deletedConversationIdsTruncated: Boolean? = null,
    val deletedStoryIds: List<String>? = null,
    val deletedStoryIdsTruncated: Boolean? = null,
    val feedRequestId: String? = null,
    val searchId: String? = null,
) {
    /** Disparitions de conversations, ou `null` si le serveur n'en a rien dit. */
    val conversationTombstones: DeletionTombstones?
        get() = DeletionTombstones.of(deletedConversationIds, deletedConversationIdsTruncated)

    /** Disparitions de stories, ou `null` si le serveur n'en a rien dit. */
    val storyTombstones: DeletionTombstones?
        get() = DeletionTombstones.of(deletedStoryIds, deletedStoryIdsTruncated)
}

/**
 * Liste de disparitions rendue par le serveur. Un drapeau `Truncated=true` n'est
 * JAMAIS une liste exhaustive : les tombstones n'ont aucun curseur de reprise, le
 * seul recours est une réconciliation complète. Le type sépare les deux cas pour
 * qu'aucun appelant ne puisse lire [Incomplete] comme [Complete].
 */
sealed interface DeletionTombstones {
    val ids: List<String>

    /** Toutes les disparitions depuis le curseur sont listées. */
    data class Complete(override val ids: List<String>) : DeletionTombstones

    /** Plafond serveur dépassé : des disparitions plus anciennes manquent. */
    data class Incomplete(override val ids: List<String>) : DeletionTombstones

    companion object {
        internal fun of(ids: List<String>?, truncated: Boolean?): DeletionTombstones? = when {
            truncated == true -> Incomplete(ids.orEmpty())
            ids == null -> null
            else -> Complete(ids)
        }
    }
}
