package me.meeshy.sdk.link

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import me.meeshy.sdk.model.CommunityLinkStats
import me.meeshy.sdk.model.LinkStatsCard
import me.meeshy.sdk.model.LinkStatsSnapshot
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.CommunityLinksApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.sharelink.ShareLinkRepository
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Charge les quatre sources du tableau « MES LIENS » EN PARALLÈLE ; chacune rend
 * [LinkStatsCard.Loaded] ou [LinkStatsCard.Unavailable], et l'échec de l'une n'affecte jamais les autres.
 */
@Singleton
public class LinkStatsRepository @Inject constructor(
    private val tracking: TrackingLinkRepository,
    private val affiliate: AffiliateRepository,
    private val share: ShareLinkRepository,
    private val communityApi: CommunityLinksApi,
) {
    public suspend fun load(): LinkStatsSnapshot = coroutineScope {
        val trackingCard = async { tracking.fetchStats().asCard() }
        val affiliateCard = async { affiliate.fetchStats().asCard() }
        val shareCard = async { share.fetchMyStats().asCard() }
        val communityCard = async { loadCommunity() }
        LinkStatsSnapshot(
            tracking = trackingCard.await(),
            affiliate = affiliateCard.await(),
            share = shareCard.await(),
            community = communityCard.await(),
        )
    }

    private suspend fun loadCommunity(): LinkStatsCard<CommunityLinkStats> =
        apiCall { communityApi.mine(ADMIN_ROLES) }.map { CommunityLinkStats.from(it) }.asCard()

    private fun <T> NetworkResult<T>.asCard(): LinkStatsCard<T> = when (this) {
        is NetworkResult.Success -> LinkStatsCard.Loaded(data)
        is NetworkResult.Failure -> LinkStatsCard.Unavailable
    }

    private companion object {
        const val ADMIN_ROLES = "admin,moderator"
    }
}
