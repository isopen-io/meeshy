package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ContentFetchFailure
import me.meeshy.sdk.model.ReferenceAccess
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Les six issues de l'écran cible d'une notification de story (miroir de iOS `StoryNotificationTargetViewModel.LoadState`).
 * [Expired] = disparue (404/403) ou expirée sans droit ; [ExpiredConsumed] = expirée ET fenêtre de référence close ;
 * [Offline] = la requête n'est jamais partie (réessayable) ; [ServerFailed] = le serveur a répondu et échoué (jamais
 * présenté comme un problème de connexion).
 */
sealed interface StoryNotificationTargetState {
    data object Loading : StoryNotificationTargetState
    data class Active(val post: ApiPost) : StoryNotificationTargetState
    data object Expired : StoryNotificationTargetState
    data object ExpiredConsumed : StoryNotificationTargetState
    data object Offline : StoryNotificationTargetState
    data object ServerFailed : StoryNotificationTargetState

    /** Une RÉPONSE détenue (lisible ou absente pour ce lecteur) : un échec de revalidation ne l'écrase pas. */
    val holdsAnAnswer: Boolean
        get() = when (this) {
            is Active, Expired, ExpiredConsumed -> true
            Loading, Offline, ServerFailed -> false
        }
}

object StoryNotificationTargetResolver {

    /**
     * Le droit se DÉCLARE, il ne se déduit pas : `expiresAt` ne tranche que lorsque le serveur ne dit rien de la
     * référence (absent ou `none`).
     */
    fun stateFor(post: ApiPost, nowMillis: Long): StoryNotificationTargetState =
        when (post.referenceAccess ?: ReferenceAccess.NONE) {
            ReferenceAccess.GRANTED -> StoryNotificationTargetState.Active(post)
            ReferenceAccess.CONSUMED -> StoryNotificationTargetState.ExpiredConsumed
            ReferenceAccess.NONE ->
                if (isExpired(post, nowMillis)) StoryNotificationTargetState.Expired else StoryNotificationTargetState.Active(post)
        }

    /** 404 et 403 sont des réponses : la story n'est pas là pour ce lecteur. Réseau et 5xx ne le sont pas. */
    fun failureState(failure: ContentFetchFailure): StoryNotificationTargetState = when (failure) {
        ContentFetchFailure.NOT_FOUND, ContentFetchFailure.FORBIDDEN -> StoryNotificationTargetState.Expired
        ContentFetchFailure.NETWORK -> StoryNotificationTargetState.Offline
        ContentFetchFailure.SERVER -> StoryNotificationTargetState.ServerFailed
    }

    /** L'état après un échec de revalidation : une réponse déjà détenue est gardée, une panne précédente se remplace. */
    fun afterFailedRevalidation(
        current: StoryNotificationTargetState,
        failure: ContentFetchFailure,
    ): StoryNotificationTargetState = if (current.holdsAnAnswer) current else failureState(failure)

    private fun isExpired(post: ApiPost, nowMillis: Long): Boolean {
        val expiresAt = isoToEpochMillisOrNull(post.expiresAt) ?: return false
        return expiresAt <= nowMillis
    }
}
