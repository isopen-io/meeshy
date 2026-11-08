package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.KeyedJsonDocument
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.session.AccountTicket
import org.junit.Test

class PostCommentsEngineCacheTest {
    private val now = 10_000_000_000L

    private class FakeSource(private val doc: KeyedJsonDocument<List<ApiPostComment>>?) : CommentCacheSource {
        val kept = mutableListOf<List<ApiPostComment>>()
        override suspend fun read(postId: String) = doc
        override fun keep(postId: String, comments: List<ApiPostComment>, ticket: AccountTicket?) { kept += comments }
    }

    private fun engine(source: CommentCacheSource) = PostCommentsEngine(
        cache = source,
        ticket = { null },
        clock = object : CacheClock { override fun nowMillis() = now },
    )

    private fun rows() = listOf(ApiPostComment(id = "a"), ApiPostComment(id = "b"))

    @Test
    fun `un fil recent est frais et sert sans relecture`() = runTest {
        val result = engine(FakeSource(KeyedJsonDocument(rows(), fetchedAt = now - 30_000))).cached("p")
        assertThat(result).isInstanceOf(CacheResult.Fresh::class.java)
    }

    @Test
    fun `un fil perime est servi puis rafraichi en silence`() = runTest {
        val result = engine(FakeSource(KeyedJsonDocument(rows(), fetchedAt = now - 10 * 60_000))).cached("p")
        assertThat(result).isInstanceOf(CacheResult.Stale::class.java)
        assertThat((result as CacheResult.Stale).value.map { it.id }).containsExactly("a", "b")
    }

    @Test
    fun `un disque vide ou illisible est vide`() = runTest {
        assertThat(engine(FakeSource(null)).cached("p")).isEqualTo(CacheResult.Empty)
        assertThat(engine(FakeSource(KeyedJsonDocument(emptyList(), now))).cached("p")).isEqualTo(CacheResult.Empty)
    }

    @Test
    fun `le moteur confie le fil au disque`() = runTest {
        val source = FakeSource(null)
        engine(source).keep("p", rows())
        assertThat(source.kept.single().map { it.id }).containsExactly("a", "b")
    }
}
