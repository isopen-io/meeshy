package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ResolvedTrackedLink
import me.meeshy.sdk.model.TrackingClickRequest
import me.meeshy.sdk.model.TrackingRedirectOutcome
import me.meeshy.sdk.model.TrackingRedirectStatusRequest
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TrackingLinkTokenApi
import org.junit.Test
import java.io.IOException

class TrackedLinkRepositoryTest {

    private val api = mockk<TrackingLinkTokenApi>()
    private val repository = TrackedLinkRepository(api)

    @Test
    fun `la resolution rend la cible servie`() = runTest {
        coEvery { api.resolve("t") } returns ApiResponse(success = true, data = ResolvedTrackedLink(originalUrl = "https://x.y", isActive = true))

        val result = repository.resolve("t")

        assertThat((result as NetworkResult.Success).data.originalUrl).isEqualTo("https://x.y")
    }

    @Test
    fun `les deux issues de redirection partent avec leur valeur de fil`() = runTest {
        coEvery { api.redirectStatus(any(), any()) } returns ApiResponse(success = true, data = JsonObject(emptyMap()))

        repository.reportRedirect("t", "k1", TrackingRedirectOutcome.CONFIRMED)
        repository.reportRedirect("t", "k2", TrackingRedirectOutcome.FAILED)

        coVerify { api.redirectStatus("t", TrackingRedirectStatusRequest("k1", "confirmed")) }
        coVerify { api.redirectStatus("t", TrackingRedirectStatusRequest("k2", "failed")) }
    }

    @Test
    fun `un clic perdu ne remonte aucune erreur`() = runTest {
        coEvery { api.click(any(), any()) } throws IOException("hors ligne")

        repository.recordClick("t")

        coVerify { api.click("t", TrackingClickRequest(socialSource = "android-app")) }
    }
}
