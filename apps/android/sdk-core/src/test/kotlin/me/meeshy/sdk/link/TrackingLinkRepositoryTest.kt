package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import java.io.IOException
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.CreateTrackingLinkRequest
import me.meeshy.sdk.model.CreatedTrackingLinkPayload
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.model.TrackingLinkStats
import me.meeshy.sdk.model.TrackingLinksPage
import me.meeshy.sdk.model.TrackingShortLinkResult
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TrackingLinkApi
import org.junit.Test

class TrackingLinkRepositoryTest {

    private class FakeTrackingLinkApi(
        var create: suspend (CreateTrackingLinkRequest) -> ApiResponse<CreatedTrackingLinkPayload> =
            { ApiResponse(success = false) },
        var stats: suspend () -> ApiResponse<TrackingLinkStats> = { ApiResponse(success = false) },
        var list: suspend () -> ApiResponse<TrackingLinksPage> = { ApiResponse(success = false) },
    ) : TrackingLinkApi {
        val requests = mutableListOf<CreateTrackingLinkRequest>()
        override suspend fun listMine(offset: Int, limit: Int) = list()
        override suspend fun stats() = stats.invoke()
        override suspend fun create(body: CreateTrackingLinkRequest): ApiResponse<CreatedTrackingLinkPayload> {
            requests += body
            return create.invoke(body)
        }
    }

    private fun link(shortUrl: String) = TrackingLink(id = "t1", token = "abc", shortUrl = shortUrl)

    @Test
    fun `createTracking rend l'adresse courte du lien enveloppe`() = runTest {
        val api = FakeTrackingLinkApi(create = {
            ApiResponse(success = true, data = CreatedTrackingLinkPayload(link("https://meeshy.me/l/abc"), existed = true))
        })

        val result = TrackingLinkRepository(api).createTracking("https://example.com", "spring", "feed")

        assertThat(result).isEqualTo(TrackingShortLinkResult.Created("https://meeshy.me/l/abc", existed = true))
        assertThat(api.requests.single().originalUrl).isEqualTo("https://example.com")
        assertThat(api.requests.single().campaign).isEqualTo("spring")
        assertThat(api.requests.single().source).isEqualTo("feed")
    }

    @Test
    fun `createTracking lit encore le lien pose directement sous data`() = runTest {
        val api = FakeTrackingLinkApi(create = {
            ApiResponse(success = true, data = CreatedTrackingLinkPayload(shortUrl = "https://meeshy.me/l/zzz"))
        })

        val result = TrackingLinkRepository(api).createTracking("https://example.com")

        assertThat(result).isEqualTo(TrackingShortLinkResult.Created("https://meeshy.me/l/zzz", existed = false))
    }

    @Test
    fun `createTracking hors ligne rend OFFLINE avec l'URL brute en repli`() = runTest {
        val api = FakeTrackingLinkApi(create = { throw IOException("unreachable") })

        val result = TrackingLinkRepository(api).createTracking("https://example.com")

        assertThat(result).isEqualTo(
            TrackingShortLinkResult.Failed(TrackingShortLinkResult.Reason.OFFLINE, "https://example.com"),
        )
    }

    @Test
    fun `createTracking refuse par la passerelle rend UNAVAILABLE avec l'URL brute`() = runTest {
        val api = FakeTrackingLinkApi(create = { ApiResponse(success = false, error = "boom") })

        val result = TrackingLinkRepository(api).createTracking("https://example.com")

        assertThat(result).isEqualTo(
            TrackingShortLinkResult.Failed(TrackingShortLinkResult.Reason.UNAVAILABLE, "https://example.com"),
        )
    }

    @Test
    fun `createTracking sans adresse courte dans la charge ne fabrique rien`() = runTest {
        val api = FakeTrackingLinkApi(create = { ApiResponse(success = true, data = CreatedTrackingLinkPayload()) })

        val result = TrackingLinkRepository(api).createTracking("https://example.com")

        assertThat(result).isInstanceOf(TrackingShortLinkResult.Failed::class.java)
    }

    @Test
    fun `fetchStats rend les chiffres servis et listLinks deplie la page`() = runTest {
        val api = FakeTrackingLinkApi(
            stats = { ApiResponse(success = true, data = TrackingLinkStats(totalLinks = 3, totalClicks = 12)) },
            list = { ApiResponse(success = true, data = TrackingLinksPage(listOf(link("s")))) },
        )
        val repository = TrackingLinkRepository(api)

        assertThat((repository.fetchStats() as NetworkResult.Success).data.totalClicks).isEqualTo(12)
        assertThat((repository.listLinks() as NetworkResult.Success).data.map { it.id }).containsExactly("t1")
    }
}
