package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.AffiliateTrackVisitRequest
import me.meeshy.sdk.model.AffiliateTrackVisitResult
import me.meeshy.sdk.model.AffiliateValidation
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.net.EndpointAuthKind
import me.meeshy.sdk.model.net.EndpointPolicy
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.AffiliateReferralApi
import org.junit.Test

class AffiliateReferralRepositoryTest {

    private val api = mockk<AffiliateReferralApi>()
    private val repository = AffiliateReferralRepository(api)

    @Test
    fun `la validation rend le verdict de la passerelle`() = runTest {
        coEvery { api.validate("t") } returns ApiResponse(success = true, data = AffiliateValidation(isValid = true))

        assertThat((repository.validate("t") as NetworkResult.Success).data.isValid).isTrue()
    }

    @Test
    fun `la visite rend la cle de session a rejouer`() = runTest {
        coEvery { api.trackVisit(any()) } returns ApiResponse(success = true, data = AffiliateTrackVisitResult("sess"))

        val result = repository.trackVisit("t")

        assertThat((result as NetworkResult.Success).data.sessionKey).isEqualTo("sess")
        coVerify { api.trackVisit(AffiliateTrackVisitRequest(token = "t")) }
    }

    @Test
    fun `les routes publiques partent sans bearer et les autres avec`() {
        val publicRoutes = listOf("/api/v1/affiliate/click/t", "/api/v1/affiliate/track-visit", "/api/v1/affiliate/validate/t", "/api/v1/affiliate/t/og")
        val sessionRoutes = listOf("/api/v1/affiliate/tokens", "/api/v1/affiliate/register", "/api/v1/affiliate/tokens/9")

        assertThat(publicRoutes.map { EndpointPolicy.of(it).authKind }.toSet()).containsExactly(EndpointAuthKind.NONE)
        assertThat(sessionRoutes.map { EndpointPolicy.of(it).authKind }.toSet()).containsExactly(EndpointAuthKind.BEARER)
    }
}
