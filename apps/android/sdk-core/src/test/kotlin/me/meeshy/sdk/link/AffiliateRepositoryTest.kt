package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import java.io.IOException
import me.meeshy.sdk.model.AffiliateStats
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AffiliateApi
import org.junit.Test

class AffiliateRepositoryTest {

    private class FakeAffiliateApi(
        var stats: suspend () -> ApiResponse<AffiliateStats> = { ApiResponse(success = false) },
        var tokens: suspend () -> ApiResponse<List<AffiliateToken>> = { ApiResponse(success = false) },
    ) : AffiliateApi {
        var lastPage: Pair<Int, Int>? = null
        override suspend fun listTokens(offset: Int, limit: Int): ApiResponse<List<AffiliateToken>> {
            lastPage = offset to limit
            return tokens()
        }
        override suspend fun stats() = stats.invoke()
    }

    @Test
    fun `fetchStats rend les chiffres de parrainage`() = runTest {
        val api = FakeAffiliateApi(stats = {
            ApiResponse(success = true, data = AffiliateStats(totalReferrals = 4, totalVisits = 40))
        })

        val result = AffiliateRepository(api).fetchStats()

        assertThat((result as NetworkResult.Success).data.totalReferrals).isEqualTo(4)
    }

    @Test
    fun `listTokens transmet la page demandee`() = runTest {
        val api = FakeAffiliateApi(tokens = {
            ApiResponse(success = true, data = listOf(AffiliateToken(id = "a", token = "t", name = "n")))
        })

        val result = AffiliateRepository(api).listTokens(offset = 50, limit = 25)

        assertThat(api.lastPage).isEqualTo(50 to 25)
        assertThat((result as NetworkResult.Success).data.map { it.id }).containsExactly("a")
    }

    @Test
    fun `une panne reseau devient un echec type sans exception`() = runTest {
        val api = FakeAffiliateApi(stats = { throw IOException("down") })

        val result = AffiliateRepository(api).fetchStats()

        assertThat((result as NetworkResult.Failure).error.code).isEqualTo("NETWORK")
    }
}
