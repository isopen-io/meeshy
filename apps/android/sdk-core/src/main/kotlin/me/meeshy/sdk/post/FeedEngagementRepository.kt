package me.meeshy.sdk.post

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.analytics.ContentSurface
import me.meeshy.sdk.model.analytics.SocialEvent
import me.meeshy.sdk.model.analytics.SocialEventStamp
import me.meeshy.sdk.model.analytics.SocialEventsBody
import me.meeshy.sdk.model.analytics.StampedSocialEvent
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.SocialEventsApi
import me.meeshy.sdk.net.apiCall

/** Ce qu'un envoi d'impressions a fait : jamais une erreur à montrer, seulement un décompte. */
data class ImpressionDelivery(val sent: Int, val dropped: Int)

/**
 * Compte ce que le fil affiche par `POST /social/events` (porte unique de la télémétrie de lecture).
 * Les impressions partent par lots BORNÉS ([MAX_BATCH], sous le plafond de 200 de la passerelle).
 * Rien ne fait attendre le défilement et rien ne se voit en cas d'échec : hors ligne ou refusé, le lot
 * restant est abandonné (une impression manquée vaut mieux qu'une file qui enfle).
 */
@Singleton
class FeedEngagementRepository internal constructor(
    private val api: SocialEventsApi,
    private val listings: FeedListingRegistry,
    private val nowMillis: () -> Long,
) {
    @Inject
    constructor(api: SocialEventsApi, listings: FeedListingRegistry) : this(api, listings, System::currentTimeMillis)

    suspend fun recordImpressions(
        postIds: List<String>,
        surface: ContentSurface,
        source: String = "feed",
        sessionToken: String? = null,
        consent: SocialEventsBody.Consent? = null,
    ): ImpressionDelivery {
        val events = postIds.filter { it.isNotEmpty() }.map { postId ->
            StampedSocialEvent(
                event = SocialEvent.Impression(
                    postId = postId,
                    source = source,
                    surface = surface,
                    listing = listings.listingFor(postId),
                ),
                stamp = SocialEventStamp.minted(nowMillis()),
            )
        }
        var sent = 0
        for (batch in events.chunked(MAX_BATCH)) {
            val body = SocialEventsBody.of(batch, nowMillis(), consent)
            val delivered = try {
                apiCall { api.record(body, sessionToken) } is NetworkResult.Success
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                false
            }
            if (!delivered) return ImpressionDelivery(sent = sent, dropped = events.size - sent)
            sent += batch.size
        }
        return ImpressionDelivery(sent = sent, dropped = 0)
    }

    companion object {
        const val MAX_BATCH = 100
    }
}
