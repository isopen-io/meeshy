package me.meeshy.sdk.link

import me.meeshy.sdk.model.ResolvedTrackedLink
import me.meeshy.sdk.model.SetTrackingLinkActiveRequest
import me.meeshy.sdk.model.TrackingClickRequest
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.TrackingRedirectOutcome
import me.meeshy.sdk.model.TrackingRedirectStatusRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TrackingLinkTokenApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Un lien de suivi par son jeton : résolution, clic, issue de la redirection, activation. Port de `TrackedLinkService`. */
@Singleton
class TrackedLinkRepository @Inject constructor(
    private val api: TrackingLinkTokenApi,
) {
    suspend fun resolve(token: String): NetworkResult<ResolvedTrackedLink> = apiCall { api.resolve(token) }

    /** Au mieux : un clic perdu ne bloque jamais la navigation, aucune erreur ne remonte. */
    suspend fun recordClick(token: String, source: String = CLICK_SOURCE) {
        apiCall { api.click(token, TrackingClickRequest(socialSource = source)) }
    }

    /** L'issue de la redirection (`confirmed` ou `failed`) ; route publique, au mieux elle aussi. */
    suspend fun reportRedirect(token: String, clickId: String, outcome: TrackingRedirectOutcome) {
        apiCall { api.redirectStatus(token, TrackingRedirectStatusRequest(clickId = clickId, status = outcome.wire)) }
    }

    suspend fun setActive(token: String, isActive: Boolean): NetworkResult<TrackingLink> =
        apiCall { api.setActive(token, SetTrackingLinkActiveRequest(isActive)) }

    suspend fun deactivate(token: String): NetworkResult<TrackingLink> = apiCall { api.deactivate(token) }

    suspend fun byConversation(conversationId: String): NetworkResult<List<TrackingLink>> =
        apiCall { api.byConversation(conversationId) }.map { it.trackingLinks }

    private companion object {
        const val CLICK_SOURCE = "android-app"
    }
}
