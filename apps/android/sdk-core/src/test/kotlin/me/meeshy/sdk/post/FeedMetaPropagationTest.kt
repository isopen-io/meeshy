package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.analytics.ContentSurface
import me.meeshy.sdk.model.analytics.SocialRankingSource
import org.junit.Test

class FeedMetaPropagationTest {

    @Test
    fun `une page servie sans identifiant ne retient rien`() {
        val registry = FeedListingRegistry()

        registry.note(ContentSurface.FEED, feedRequestId = null, postIds = listOf("a"))

        assertThat(registry.listingFor("a")).isNull()
    }

    @Test
    fun `chaque post retient l identifiant de sa page et son rang`() {
        val registry = FeedListingRegistry()

        registry.note(ContentSurface.HASHTAG, "r1", listOf("a", "b", "c"))

        assertThat(registry.listingFor("c")?.feedRequestId).isEqualTo("r1")
        assertThat(registry.listingFor("c")?.position).isEqualTo(2)
        assertThat(registry.listingFor("c")?.rankingSource).isEqualTo(SocialRankingSource.HASHTAG)
    }

    @Test
    fun `une page plus recente remplace l identifiant d un post deja vu`() {
        val registry = FeedListingRegistry()
        registry.note(ContentSurface.FEED, "old", listOf("a"))

        registry.note(ContentSurface.FEED, "new", listOf("a"))

        assertThat(registry.listingFor("a")?.feedRequestId).isEqualTo("new")
    }

    @Test
    fun `le searchId est retenu et un nul ne l efface pas`() {
        val registry = FeedListingRegistry()
        registry.noteSearch("s1")

        registry.noteSearch(null)

        assertThat(registry.searchId).isEqualTo("s1")
    }

    @Test
    fun `le registre est borne`() {
        val registry = FeedListingRegistry()

        registry.note(ContentSurface.FEED, "r", (1..1_500).map { "p$it" })

        assertThat(registry.listingFor("p1")).isNull()
        assertThat(registry.listingFor("p1500")).isNotNull()
    }
}
