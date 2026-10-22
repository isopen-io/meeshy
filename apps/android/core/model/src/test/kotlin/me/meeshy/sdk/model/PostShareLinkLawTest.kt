package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostShareLinkLawTest {

    @Test
    fun `un lien court frappe est rendu tel quel et suivi`() {
        val link = PostShareLinkLaw.resolve("p1", "https://meeshy.me/l/abc")

        assertThat(link).isEqualTo(PostShareLink("https://meeshy.me/l/abc", tracked = true))
    }

    @Test
    fun `sans lien court l URL brute du post est rendue`() {
        assertThat(PostShareLinkLaw.resolve("p1", null))
            .isEqualTo(PostShareLink("https://meeshy.me/feeds/post/p1", tracked = false))
    }

    @Test
    fun `un lien court vide ou illisible retombe sur l URL brute`() {
        assertThat(PostShareLinkLaw.resolve("p1", "  ").tracked).isFalse()
        assertThat(PostShareLinkLaw.resolve("p1", "javascript:alert(1)").url).isEqualTo("https://meeshy.me/feeds/post/p1")
    }
}
