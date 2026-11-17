package me.meeshy.sdk.model.contentcard

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PostType
import org.junit.Test

/**
 * Les états d'une carte (contrat #19331 § 3) : cache d'abord — une carte connue se montre à la première image, même
 * périmée, sans squelette —, « indisponible » sur un refus, l'aperçu générique sur une panne à froid, et une panne
 * n'efface jamais une carte déjà montrée.
 */
class ContentLinkCardStateTest {

    private val post = ApiPost(id = "p1", type = "POST", content = "Hello", viewCount = 3)

    private fun cardOf(post: ApiPost): ContentCard = ContentCardProjection.of(post, prefs = null, linkType = null)

    private val shown = ContentLinkCardState.Card(cardOf(post))

    @Test
    fun `a post the memory knows, fresh or stale, shows at once without a skeleton`() {
        val served = ContentCardResolution.Served(post)

        assertThat(ContentLinkCardState.remembered(ContentCardMemory.Lookup.Fresh(served), ::cardOf, PostType.POST)).isEqualTo(shown)
        assertThat(ContentLinkCardState.remembered(ContentCardMemory.Lookup.Stale(served), ::cardOf, PostType.POST)).isEqualTo(shown)
    }

    @Test
    fun `nothing known is a skeleton`() {
        assertThat(ContentLinkCardState.remembered(ContentCardMemory.Lookup.Missing, ::cardOf, PostType.POST))
            .isEqualTo(ContentLinkCardState.Loading)
    }

    @Test
    fun `a refusal that says the content is gone or not for this reader is unavailable, with the link's genre`() {
        listOf(403, 404, 410).forEach { status ->
            val verdict = ContentCardResolution.ofRefusal(status)
            assertThat(verdict).isEqualTo(ContentCardResolution.Unavailable)
            assertThat(ContentLinkCardState.Loading.resolved(checkNotNull(verdict), ::cardOf, PostType.REEL))
                .isEqualTo(ContentLinkCardState.Unavailable(PostType.REEL))
        }
    }

    @Test
    fun `a network or server failure is no verdict`() {
        listOf(null, 401, 429, 500, 503).forEach { status -> assertThat(ContentCardResolution.ofRefusal(status)).isNull() }
    }

    @Test
    fun `a failure on a cold card falls back to the generic preview`() {
        assertThat(ContentLinkCardState.Loading.failed()).isEqualTo(ContentLinkCardState.Failed)
    }

    @Test
    fun `a failure keeps the card already shown`() {
        assertThat(shown.failed()).isEqualTo(shown)
    }

    @Test
    fun `a revalidated post replaces the card`() {
        val fresher = post.copy(viewCount = 99)

        val state = shown.resolved(ContentCardResolution.Served(fresher), ::cardOf, PostType.POST)

        assertThat((state as ContentLinkCardState.Card).card.stats.views).isEqualTo(99)
    }

    @Test
    fun `a fallback is drawn by the generic preview, a card or an unavailable line by the content card`() {
        assertThat(ContentLinkCardState.Failed.fallsBack).isTrue()
        assertThat(ContentLinkCardState.NotContent.fallsBack).isTrue()
        assertThat(ContentLinkCardState.Loading.fallsBack).isFalse()
        assertThat(shown.fallsBack).isFalse()
        assertThat(ContentLinkCardState.Unavailable(null).fallsBack).isFalse()
    }
}
