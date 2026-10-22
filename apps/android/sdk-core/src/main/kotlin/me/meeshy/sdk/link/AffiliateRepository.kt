package me.meeshy.sdk.link

import me.meeshy.sdk.model.AffiliateStats
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AffiliateApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/** Parrainage : jetons et chiffres, repliés en [NetworkResult]. */
@Singleton
public class AffiliateRepository @Inject constructor(
    private val api: AffiliateApi,
) {
    public suspend fun fetchStats(): NetworkResult<AffiliateStats> = apiCall { api.stats() }

    public suspend fun listTokens(offset: Int = 0, limit: Int = 50): NetworkResult<List<AffiliateToken>> =
        apiCall { api.listTokens(offset, limit) }
}
