package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostShareLinkTest {

    @Test
    fun `the web link carries the post id, in the canonical feeds-post shape iOS and the web emit`() {
        assertThat(PostShareLink.webLink("6650c0ffee0000000000abcd"))
            .isEqualTo("https://meeshy.me/feeds/post/6650c0ffee0000000000abcd")
    }

    @Test
    fun `the web link never leaks an uninterpolated template`() {
        val link = PostShareLink.webLink("abc123")

        assertThat(link).doesNotContain("$")
        assertThat(link).doesNotContain("{")
        assertThat(link).endsWith("/abc123")
    }

    @Test
    fun `an unusual id is percent-encoded as one path segment`() {
        assertThat(PostShareLink.webLink("a b/c")).isEqualTo("https://meeshy.me/feeds/post/a%20b%2Fc")
    }

    @Test
    fun `both receiving segments are the canonical one and the legacy one the gateway still mints`() {
        assertThat(PostShareLink.CANONICAL_SEGMENT).isEqualTo("feeds/post")
        assertThat(PostShareLink.LEGACY_SEGMENT).isEqualTo("post")
    }
}
