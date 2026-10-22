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
