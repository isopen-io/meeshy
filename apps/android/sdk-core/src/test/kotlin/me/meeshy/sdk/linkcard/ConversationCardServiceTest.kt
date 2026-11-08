package me.meeshy.sdk.linkcard

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.conversationcard.ConversationCard
import me.meeshy.sdk.model.conversationcard.ConversationCardChange
import me.meeshy.sdk.model.conversationcard.ConversationCardKind
import me.meeshy.sdk.model.conversationcard.ConversationCardResolution
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import me.meeshy.sdk.net.api.LinkDetailApi
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class ConversationCardServiceTest {
    private val share = ConversationCardTarget.ShareLink("abc")
    private val direct = ConversationCardTarget.Direct("c1")
    private val clock = FakeClock(now = 10_000_000L)

    private fun card(conversationId: String? = null) =
        ConversationCard(kind = ConversationCardKind.SHARE_LINK, conversationId = conversationId, title = "Groupe")

    private fun http(code: Int) = HttpException(Response.error<Any>(code, "{}".toResponseBody()))

    private fun service(api: LinkDetailApi = mockk(relaxed = true)) = ConversationCardService(api, clock)

    @Test fun `une carte vue il y a moins d'une minute est fraiche`() {
        val service = service()
        service.store(ConversationCardResolution.Card(card()), share)
        clock.now += 59_000

        assertThat(service.cached(share)).isInstanceOf(CacheResult.Fresh::class.java)
    }

    @Test fun `une carte plus vieille qu'une minute est servie perimee jusqu'a un jour`() {
        val service = service()
        service.store(ConversationCardResolution.Card(card()), share)
        clock.now += 60_000
        assertThat(service.cached(share)).isInstanceOf(CacheResult.Stale::class.java)

        clock.now += 24 * 3_600_000L
        assertThat(service.cached(share)).isEqualTo(CacheResult.Empty)
    }

    @Test fun `un indisponible n'est jamais servi perime`() {
        val service = service()
        service.store(ConversationCardResolution.Unavailable, share)
        assertThat(service.cached(share)).isInstanceOf(CacheResult.Fresh::class.java)

        clock.now += 120_000
        assertThat(service.cached(share)).isEqualTo(CacheResult.Empty)
    }

    @Test fun `un lien direct refuse en 404 est une conversation privee et se cache`() = runTest {
        val api = mockk<LinkDetailApi>()
        coEvery { api.directCard("c1") } throws http(404)
        val service = service(api)

        assertThat(service.refresh(direct)).isEqualTo(ConversationCardResolution.PrivateConversation)
        assertThat((service.cached(direct) as CacheResult.Fresh).value).isEqualTo(ConversationCardResolution.PrivateConversation)
    }

    @Test fun `un 404 sur un lien de partage est indisponible sans nouvelle tentative`() = runTest {
        val api = mockk<LinkDetailApi>()
        coEvery { api.card("abc") } throws http(404)

        assertThat(service(api).refresh(share)).isEqualTo(ConversationCardResolution.Unavailable)
        coVerify(exactly = 1) { api.card("abc") }
    }

    @Test fun `une panne reseau rend la derniere carte connue`() = runTest {
        val api = mockk<LinkDetailApi>()
        val known = ConversationCardResolution.Card(card())
        coEvery { api.card("abc") } throws IOException("hors ligne")
        val service = service(api)
        service.store(known, share)
        clock.now += 3_600_000

        assertThat(service.refresh(share)).isEqualTo(known)
    }

    @Test fun `une panne serveur sans cache est indisponible et ne se cache pas`() = runTest {
        val api = mockk<LinkDetailApi>()
        coEvery { api.card("abc") } throws http(503)
        val service = service(api)

        assertThat(service.refresh(share)).isEqualTo(ConversationCardResolution.Unavailable)
        assertThat(service.cached(share)).isEqualTo(CacheResult.Empty)
    }

    @Test fun `une lecture reussie se cache`() = runTest {
        val api = mockk<LinkDetailApi>()
        coEvery { api.card("abc") } returns ApiResponse(success = true, data = card("c1"))
        val service = service(api)

        service.refresh(share)

        assertThat((service.cached(share) as CacheResult.Fresh).value)
            .isEqualTo(ConversationCardResolution.Card(card("c1")))
    }

    @Test fun `invalider une conversation purge le lien de partage et le lien direct et l'annonce`() = runTest(UnconfinedTestDispatcher()) {
        val service = service()
        service.store(ConversationCardResolution.Card(card("c1")), share)
        service.store(ConversationCardResolution.PrivateConversation, direct)
        val other = ConversationCardTarget.ShareLink("zzz")
        service.store(ConversationCardResolution.Card(card("c2")), other)
        val changes = mutableListOf<ConversationCardChange>()
        val job = launch { service.changes.collect { changes += it } }

        service.invalidate("c1", origin = other)
        job.cancel()

        assertThat(service.cached(share)).isEqualTo(CacheResult.Empty)
        assertThat(service.cached(direct)).isEqualTo(CacheResult.Empty)
        assertThat(service.cached(other)).isInstanceOf(CacheResult.Fresh::class.java)
        assertThat(changes).containsExactly(ConversationCardChange("c1", other))
    }

    @Test fun `la deconnexion oublie toutes les cartes`() = runTest {
        val service = service()
        service.store(ConversationCardResolution.Card(card("c1")), share)

        service.clear()

        assertThat(service.cached(share)).isEqualTo(CacheResult.Empty)
    }
}
