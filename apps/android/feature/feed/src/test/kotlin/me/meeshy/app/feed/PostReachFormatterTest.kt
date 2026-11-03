package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

/**
 * Pure port of iOS `PostReachFormatter` — the author-only "@pseudo · views · impressions"
 * reach line on the post detail screen.
 */
class PostReachFormatterTest {

    @Test
    fun compact_belowOneThousand_printsRaw() {
        assertThat(PostReachFormatter.compact(0)).isEqualTo("0")
        assertThat(PostReachFormatter.compact(999)).isEqualTo("999")
    }

    @Test
    fun compact_thousandsFormatWithOneDecimal() {
        assertThat(PostReachFormatter.compact(1_000, Locale.ENGLISH)).isEqualTo("1K")
        assertThat(PostReachFormatter.compact(3_400, Locale.ENGLISH)).isEqualTo("3.4K")
        assertThat(PostReachFormatter.compact(999_999, Locale.ENGLISH)).isEqualTo("1M")
    }

    @Test
    fun compact_millionsFormatWithOneDecimal() {
        assertThat(PostReachFormatter.compact(1_000_000, Locale.ENGLISH)).isEqualTo("1M")
        assertThat(PostReachFormatter.compact(2_300_000, Locale.ENGLISH)).isEqualTo("2.3M")
    }

    @Test
    fun components_nonAuthor_hidesViewsAndImpressions() {
        val c = PostReachFormatter.components(
            username = "marie",
            isAuthor = false,
            viewCount = 1_200,
            impressionCount = 3_400,
        )
        assertThat(c.pseudo).isEqualTo("@marie")
        assertThat(c.views).isNull()
        assertThat(c.impressions).isNull()
    }

    @Test
    fun components_author_showsCompactViewsAndImpressions() {
        val c = PostReachFormatter.components(
            username = "marie",
            isAuthor = true,
            viewCount = 1_200,
            impressionCount = 3_400,
            locale = Locale.ENGLISH,
        )
        assertThat(c.pseudo).isEqualTo("@marie")
        assertThat(c.views).isEqualTo("1.2K")
        assertThat(c.impressions).isEqualTo("3.4K")
    }

    @Test
    fun components_blankOrNullUsername_hasNoPseudo() {
        assertThat(
            PostReachFormatter.components(username = null, isAuthor = true, viewCount = 0, impressionCount = 0).pseudo,
        ).isNull()
        assertThat(
            PostReachFormatter.components(username = "", isAuthor = true, viewCount = 0, impressionCount = 0).pseudo,
        ).isNull()
    }
}

class PostReachUniqueViewsTest {
    @Test
    fun `the author sees the distinct people next to the views`() {
        val c = PostReachFormatter.components("marie", true, 2_300_000, 5, uniqueViewCount = 1_200, locale = Locale.ENGLISH)
        assertThat(c.views).isEqualTo("2.3M")
        assertThat(c.uniqueViews).isEqualTo("1.2K")
    }

    @Test
    fun `a reader who is not the author never sees them`() {
        val c = PostReachFormatter.components("marie", false, 10, 5, uniqueViewCount = 4)
        assertThat(c.uniqueViews).isNull()
    }

    @Test
    fun `a gateway that does not serve them leaves the line as it was`() {
        assertThat(PostReachFormatter.components("marie", true, 10, 5).uniqueViews).isNull()
    }
}
