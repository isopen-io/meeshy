package me.meeshy.sdk.model.contentcard

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.deeplink.ContentLinkTarget
import org.junit.Test

/** La mémoire des cartes (contrat #19331 § 2) : fraîche une minute, servie périmée un jour, bornée, jetons gardés. */
class ContentCardMemoryTest {

    private val now = 10_000_000L
    private val served = ContentCardResolution.Served(ApiPost(id = "p1"))

    @Test
    fun `a post seen less than a minute ago is fresh`() {
        val memory = ContentCardMemory().storing("p1", served, now)

        assertThat(memory.lookup("p1", now + 59_000)).isEqualTo(ContentCardMemory.Lookup.Fresh(served))
    }

    @Test
    fun `an older post is served stale for a day, then forgotten`() {
        val memory = ContentCardMemory().storing("p1", served, now)

        assertThat(memory.lookup("p1", now + 60_000)).isEqualTo(ContentCardMemory.Lookup.Stale(served))
        assertThat(memory.lookup("p1", now + 24 * 3_600_000L)).isEqualTo(ContentCardMemory.Lookup.Missing)
    }

    @Test
    fun `an unavailable verdict is never served stale`() {
        val memory = ContentCardMemory().storing("p1", ContentCardResolution.Unavailable, now)

        assertThat(memory.lookup("p1", now + 1_000)).isEqualTo(ContentCardMemory.Lookup.Fresh(ContentCardResolution.Unavailable))
        assertThat(memory.lookup("p1", now + 61_000)).isEqualTo(ContentCardMemory.Lookup.Missing)
    }

    @Test
    fun `an unknown post is missing`() {
        assertThat(ContentCardMemory().lookup("p1", now)).isEqualTo(ContentCardMemory.Lookup.Missing)
    }

    @Test
    fun `the memory is bounded, the least recently stored post leaving first`() {
        val full = (0 until ContentCardMemory.MAX_POSTS).fold(ContentCardMemory()) { memory, index ->
            memory.storing("p$index", served, now)
        }

        val overflowing = full.storing("p0", served, now).storing("extra", served, now)

        assertThat(overflowing.lookup("p0", now)).isInstanceOf(ContentCardMemory.Lookup.Fresh::class.java)
        assertThat(overflowing.lookup("p1", now)).isEqualTo(ContentCardMemory.Lookup.Missing)
        assertThat(overflowing.lookup("extra", now)).isInstanceOf(ContentCardMemory.Lookup.Fresh::class.java)
    }

    @Test
    fun `a resolved token keeps its target for good, a content or none`() {
        val target = ContentLinkTarget.Content("66f0c0ffee0000000000c0de", PostType.REEL)
        val memory = ContentCardMemory().storingToken("Ab3xYz", target).storingToken("Site01", null)

        assertThat(memory.token("Ab3xYz")).isEqualTo(ContentCardMemory.TokenLookup.Known(target))
        assertThat(memory.token("Site01")).isEqualTo(ContentCardMemory.TokenLookup.Known(null))
        assertThat(memory.token("Other1")).isEqualTo(ContentCardMemory.TokenLookup.Unknown)
    }

    @Test
    fun `the token memory is bounded too`() {
        val full = (0..ContentCardMemory.MAX_TOKENS).fold(ContentCardMemory()) { memory, index -> memory.storingToken("t$index", null) }

        assertThat(full.token("t0")).isEqualTo(ContentCardMemory.TokenLookup.Unknown)
        assertThat(full.token("t${ContentCardMemory.MAX_TOKENS}")).isEqualTo(ContentCardMemory.TokenLookup.Known(null))
    }
}
