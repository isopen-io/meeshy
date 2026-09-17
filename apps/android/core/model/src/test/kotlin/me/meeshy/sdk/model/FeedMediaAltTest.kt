package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * `FeedMedia.alt` (#6739) — the feed-listing sibling of `ApiPostMedia.alt`
 * (`Post.kt`). Unlike `caption`, `alt` carries no Prisme translation: it is
 * the author's accessibility description, served as-is to TalkBack.
 */
class FeedMediaAltTest {

    @Test
    fun `alt defaults to null when the server omits it`() {
        assertThat(FeedMedia(id = "m1").alt).isNull()
    }

    @Test
    fun `alt round-trips the author-authored description`() {
        assertThat(FeedMedia(id = "m1", alt = "A red bicycle leaning on a brick wall").alt)
            .isEqualTo("A red bicycle leaning on a brick wall")
    }
}
