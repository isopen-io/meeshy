package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.store.FakeClock
import me.meeshy.sdk.cache.store.inMemoryDatabase
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.ShareLinkArrivalStats
import me.meeshy.sdk.model.conversationcard.ConversationCard
import me.meeshy.sdk.model.conversationcard.ConversationCardKind
import me.meeshy.sdk.model.conversationcard.ConversationCardLink
import me.meeshy.sdk.model.conversationcard.ConversationCardResolution
import me.meeshy.sdk.model.conversationcard.ConversationCardViewer
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.HttpException
import retrofit2.Response
import me.meeshy.sdk.net.api.LinkDetailApi
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.IOException

@RunWith(RobolectricTestRunner::class)
class LinkCacheRepositoryTest {

    private lateinit var db: MeeshyDatabase
    private val clock = FakeClock()
    private val api = mockk<LinkDetailApi>()

    @Before fun setUp() { db = inMemoryDatabase() }

    @After fun tearDown() { db.close() }

    private fun cache() = KeyedJsonCache(db.keyedJsonCacheDao(), clock)

    private fun repository() = LinkCacheRepository(api, cache(), clock)

    @Test fun `a froid les statistiques sont Empty puis servies`() = runTest {
        coEvery { api.linkStats("l1") } returns ApiResponse(success = true, data = ShareLinkArrivalStats(visits = 7))

        val results = repository().stats("l1").take(2).toList()

        assertThat(results[0]).isEqualTo(CacheResult.Empty)
        assertThat((results[1] as CacheResult.Fresh).value.visits).isEqualTo(7)
    }

    @Test fun `sur cache non vide aucune attente, meme hors ligne`() = runTest {
        cache().put("link:stats", "l1", ShareLinkArrivalStats(visits = 3), ShareLinkArrivalStats.serializer(), null)
        clock.now += 60 * 60_000
        coEvery { api.linkStats("l1") } throws IOException("hors ligne")

        val first = repository().stats("l1").first()

        assertThat(first).isInstanceOf(CacheResult.Stale::class.java)
        assertThat((first as CacheResult.Stale).value.visits).isEqualTo(3)
    }

    @Test fun `une page d arrivees se demande avec son curseur`() = runTest {
        coEvery { api.arrivals("l1", 30, "c1") } returns ApiResponse(
            success = true,
            data = me.meeshy.sdk.model.ShareLinkArrivalsPage(listOf(me.meeshy.sdk.model.ShareLinkArrivalEntry(displayName = "Ana")), "c2"),
        )

        val result = repository().arrivalsPage("l1", cursor = "c1", limit = 30)

        assertThat((result as me.meeshy.sdk.net.NetworkResult.Success).data.cursorOrNull).isEqualTo("c2")
    }

    private fun shareCard() = ConversationCard(
        kind = ConversationCardKind.SHARE_LINK,
        title = "Club",
        viewer = ConversationCardViewer(canJoin = true),
        link = ConversationCardLink(identifier = "l1", isActive = true),
    )

    private fun notFound(): HttpException =
        HttpException(Response.error<Any>(404, "{\"success\":false,\"error\":\"Conversation not found\"}".toResponseBody()))

    @Test fun `la carte d un lien de partage arrive typee puis se sert du cache`() = runTest {
        val target = ConversationCardTarget.ShareLink("l1")
        coEvery { api.card("l1") } returns ApiResponse(success = true, data = shareCard())

        val results = repository().card(target).take(2).toList()

        assertThat(results[0]).isEqualTo(CacheResult.Empty)
        assertThat((results[1] as CacheResult.Fresh).value).isEqualTo(ConversationCardResolution.Card(shareCard()))
    }

    @Test fun `un lien direct refuse se cache en carte privee, sans titre`() = runTest {
        val target = ConversationCardTarget.Direct("c1")
        coEvery { api.directCard("c1") } throws notFound()

        val results = repository().card(target).take(2).toList()

        assertThat((results[1] as CacheResult.Fresh).value).isEqualTo(ConversationCardResolution.PrivateConversation)
    }

    @Test fun `une panne n est pas un verdict, rien ne se cache et l erreur se dit`() = runTest {
        val target = ConversationCardTarget.ShareLink("l1")
        coEvery { api.card("l1") } throws IOException("hors ligne")
        val failure = CompletableDeferred<Throwable>()

        val collecting = launch { repository().card(target) { failure.complete(it) }.collect {} }
        val error = withContext(Dispatchers.Default) { withTimeout(5_000) { failure.await() } }
        collecting.cancel()

        assertThat(error).isInstanceOf(RuntimeException::class.java)
        assertThat(cache().get("link:card", "share:l1", ConversationCardResolution.serializer())).isNull()
    }

    @Test fun `une carte posee localement remplace la lue sans la dater comme relue`() = runTest {
        val target = ConversationCardTarget.ShareLink("l1")
        cache().put("link:card", "share:l1", ConversationCardResolution.Card(shareCard()), ConversationCardResolution.serializer(), null)
        val joined = ConversationCardResolution.Card(shareCard().withMembership(isMember = true, conversationId = "c9"))

        repository().storeCard(target, joined)

        assertThat(cache().get("link:card", "share:l1", ConversationCardResolution.serializer())?.value).isEqualTo(joined)
    }

    @Test fun `oublier une carte la fait relire au serveur`() = runTest {
        val target = ConversationCardTarget.Direct("c1")
        cache().put("link:card", "direct:c1", ConversationCardResolution.PrivateConversation, ConversationCardResolution.serializer(), null)

        repository().forgetCard(target)

        assertThat(cache().get("link:card", "direct:c1", ConversationCardResolution.serializer())).isNull()
    }

    @Test fun `la deconnexion efface tout ce que les liens avaient garde`() = runTest {
        cache().put("link:stats", "l1", ShareLinkArrivalStats(visits = 3), ShareLinkArrivalStats.serializer(), null)

        repository().clear()

        assertThat(cache().get("link:stats", "l1", ShareLinkArrivalStats.serializer())).isNull()
    }
}
