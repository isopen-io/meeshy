package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.SocialEventsReceipt
import me.meeshy.sdk.model.analytics.ContentSurface
import me.meeshy.sdk.model.analytics.SocialEvent
import me.meeshy.sdk.model.analytics.SocialEventStamp
import me.meeshy.sdk.model.analytics.SocialEventsBody
import me.meeshy.sdk.model.analytics.StampedSocialEvent
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.SocialEventsApi
import org.junit.Test

class FeedEngagementRepositoryTest {

    private val api: SocialEventsApi = mockk()
    private val bodies = mutableListOf<SocialEventsBody>()
    private val tokens = mutableListOf<String?>()
    private val listings = FeedListingRegistry()

    private fun repository() = FeedEngagementRepository(api, listings) { 1_757_928_864_000L }

    private fun accepting() {
        coEvery { api.record(any(), any()) } coAnswers {
            bodies += firstArg<SocialEventsBody>()
            tokens += secondArg<String?>()
            ApiResponse(success = true, data = SocialEventsReceipt(recorded = firstArg<SocialEventsBody>().events.size))
        }
    }

    private fun ids(count: Int) = (1..count).map { "p$it" }

    @Test
    fun `un lot court part en une seule requete`() = runTest {
        accepting()

        val delivery = repository().recordImpressions(ids(3), ContentSurface.FEED)

        assertThat(delivery).isEqualTo(ImpressionDelivery(sent = 3, dropped = 0))
        assertThat(bodies).hasSize(1)
    }

    @Test
    fun `un long defilement est borne en lots de cent`() = runTest {
        accepting()

        repository().recordImpressions(ids(250), ContentSurface.FEED)

        assertThat(bodies.map { it.events.size }).containsExactly(100, 100, 50).inOrder()
    }

    @Test
    fun `hors ligne le lot est abandonne sans erreur`() = runTest {
        coEvery { api.record(any(), any()) } throws IOException("offline")

        val delivery = repository().recordImpressions(ids(5), ContentSurface.FEED)

        assertThat(delivery).isEqualTo(ImpressionDelivery(sent = 0, dropped = 5))
    }

    @Test
    fun `apres un premier lot parti la panne abandonne seulement le reste`() = runTest {
        var calls = 0
        coEvery { api.record(any(), any()) } coAnswers {
            if (++calls == 1) ApiResponse(success = true, data = SocialEventsReceipt(recorded = 100)) else throw IOException("lost")
        }

        val delivery = repository().recordImpressions(ids(250), ContentSurface.FEED)

        assertThat(delivery).isEqualTo(ImpressionDelivery(sent = 100, dropped = 150))
    }

    @Test
    fun `une impression recopie la page servie et le rang`() = runTest {
        accepting()
        listings.note(ContentSurface.HASHTAG, "req-1", listOf("p1", "p2"))

        repository().recordImpressions(listOf("p2"), ContentSurface.HASHTAG, source = "hashtag")

        val impression = bodies.single().events.single().event as SocialEvent.Impression
        assertThat(impression.listing?.feedRequestId).isEqualTo("req-1")
        assertThat(impression.listing?.position).isEqualTo(1)
        assertThat(impression.source).isEqualTo("hashtag")
    }

    @Test
    fun `un visiteur envoie son jeton de session`() = runTest {
        accepting()

        repository().recordImpressions(ids(1), ContentSurface.DETAIL, sessionToken = "visitor_x")

        assertThat(tokens).containsExactly("visitor_x")
    }

    @Test
    fun `une liste vide n appelle rien`() = runTest {
        accepting()

        assertThat(repository().recordImpressions(emptyList(), ContentSurface.FEED)).isEqualTo(ImpressionDelivery(0, 0))
        assertThat(bodies).isEmpty()
    }

    @Test
    fun `deliver envoie les enveloppes telles quelles pour qu'un rejeu garde ses identifiants`() = runTest {
        accepting()
        val stamped = StampedSocialEvent(
            event = SocialEvent.Impression(postId = "s1", source = "story", surface = ContentSurface.STORY_RAIL),
            stamp = SocialEventStamp("0b8f6f6e-4a39-4c1e-9d55-6b3c1f0f6a01", 1_757_928_000_000L),
        )

        val result = repository().deliver(listOf(stamped))

        assertThat(result).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(bodies.single().events).containsExactly(stamped)
        assertThat(tokens.single()).isNull()
    }

    @Test
    fun `deliver rend l'echec au lieu de l'avaler`() = runTest {
        coEvery { api.record(any(), any()) } throws IOException("offline")

        val result = repository().deliver(listOf(StampedSocialEvent(
            event = SocialEvent.Impression(postId = "s1", source = "story"),
            stamp = SocialEventStamp.minted(null),
        )))

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
    }
}
