package me.meeshy.sdk.link

import me.meeshy.sdk.model.CreateTrackingLinkRequest
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.TrackingLinkStats
import me.meeshy.sdk.model.TrackingShortLinkResult
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TrackingLinkApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Liens de suivi : lecture des chiffres et création d'une adresse courte, sans exception vers l'appelant. */
@Singleton
public class TrackingLinkRepository @Inject constructor(
    private val api: TrackingLinkApi,
) {
    public suspend fun fetchStats(): NetworkResult<TrackingLinkStats> = apiCall { api.stats() }

    public suspend fun listLinks(offset: Int = 0, limit: Int = 50): NetworkResult<List<TrackingLink>> =
        apiCall { api.listMine(offset, limit) }.map { it.trackingLinks }

    /** L'adresse courte de [url], ou une erreur typée portant [url] comme repli : jamais une adresse inventée. */
    public suspend fun createTracking(
        url: String,
        campaign: String? = null,
        source: String? = null,
    ): TrackingShortLinkResult {
        val request = CreateTrackingLinkRequest(originalUrl = url, campaign = campaign, source = source)
        return when (val result = apiCall { api.create(request) }) {
            is NetworkResult.Success -> result.data.resolvedShortUrl
                ?.let { TrackingShortLinkResult.Created(it, result.data.existed) }
                ?: TrackingShortLinkResult.Failed(TrackingShortLinkResult.Reason.UNAVAILABLE, url)
            is NetworkResult.Failure -> TrackingShortLinkResult.Failed(
                reason = when {
                    result.error.code == NETWORK_CODE -> TrackingShortLinkResult.Reason.OFFLINE
                    (result.error.httpStatus ?: 0) in CLIENT_REFUSALS -> TrackingShortLinkResult.Reason.REJECTED
                    else -> TrackingShortLinkResult.Reason.UNAVAILABLE
                },
                fallbackUrl = url,
            )
        }
    }

    private companion object {
        const val NETWORK_CODE = "NETWORK"
        val CLIENT_REFUSALS = 400..499
    }
}
