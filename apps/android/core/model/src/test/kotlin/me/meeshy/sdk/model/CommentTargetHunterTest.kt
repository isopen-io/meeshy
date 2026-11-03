package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test

class CommentTargetHunterTest {
    private class Feed(private val totalPages: Int, private val targetPage: Int?) {
        var pages = 0
        val present get() = targetPage != null && pages >= targetPage
        val more get() = pages < totalPages
        suspend fun next() { pages += 1 }
    }

    private suspend fun hunt(feed: Feed, max: Int = CommentTargetHunter.DEFAULT_MAX_PAGES) =
        CommentTargetHunter.hunt(max, { feed.present }, { feed.more }, { feed.next() })

    @Test
    fun `la cible deja presente ne charge aucune page`() = runTest {
        val feed = Feed(totalPages = 5, targetPage = 0)
        assertThat(hunt(feed)).isTrue()
        assertThat(feed.pages).isEqualTo(0)
    }

    @Test
    fun `la chasse suit les pages jusqu a la cible`() = runTest {
        val feed = Feed(totalPages = 40, targetPage = 7)
        assertThat(hunt(feed)).isTrue()
        assertThat(feed.pages).isEqualTo(7)
    }

    @Test
    fun `la chasse s arrete a quinze pages`() = runTest {
        val feed = Feed(totalPages = 40, targetPage = 30)
        assertThat(hunt(feed)).isFalse()
        assertThat(feed.pages).isEqualTo(15)
    }

    @Test
    fun `une cible introuvable s arrete quand il n y a plus de page`() = runTest {
        val feed = Feed(totalPages = 3, targetPage = null)
        assertThat(hunt(feed)).isFalse()
        assertThat(feed.pages).isEqualTo(3)
    }
}
