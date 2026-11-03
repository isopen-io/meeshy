package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy
import me.meeshy.sdk.cache.KeyedJsonDocument
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.session.AccountTicket
import org.junit.Test

class PostGalleryCommentSourceTest {

    private class FakeCache(private val document: KeyedJsonDocument<List<ApiPostComment>>?) : CommentCacheSource {
        var writes = 0
        override suspend fun read(postId: String) = document
        override fun keep(postId: String, comments: List<ApiPostComment>, ticket: AccountTicket?) { writes++ }
    }

    private val now = 10_000_000L
    private val clock = object : CacheClock { override fun nowMillis() = now }
    private fun c(id: String) = ApiPostComment(id = id)
    private fun doc(ageMillis: Long, vararg ids: String) = KeyedJsonDocument(ids.map(::c), now - ageMillis)

    private fun ids(states: List<List<ApiPostComment>>) = states.map { list -> list.map { it.id } }

    @Test
    fun `un cache frais est servi sans aucun appel reseau`() = runBlocking<Unit> {
        var calls = 0
        val source = PostGalleryCommentSource(FakeCache(doc(1_000, "a", "b")), { calls++; listOf(c("z")) }, clock)
        val states = source.comments("p", listOf(c("e")), commentCount = 9).toList()
        assertThat(ids(states)).containsExactly(listOf("e"), listOf("e", "a", "b")).inOrder()
        assertThat(calls).isEqualTo(0)
    }

    @Test
    fun `un cache perime est servi d'abord puis le reseau complete, sans ecriture`() = runBlocking<Unit> {
        val cache = FakeCache(doc(CachePolicy.Comments.freshForMillis + 1, "a"))
        val source = PostGalleryCommentSource(cache, { listOf(c("a"), c("n")) }, clock)
        val states = source.comments("p", emptyList(), commentCount = 2).toList()
        assertThat(ids(states).last()).containsExactly("a", "n").inOrder()
        assertThat(ids(states)[1]).containsExactly("a")
        assertThat(cache.writes).isEqualTo(0)
    }

    @Test
    fun `sans cache, le reseau n'est appele que si le post annonce plus de commentaires`() = runBlocking<Unit> {
        var calls = 0
        val source = PostGalleryCommentSource(FakeCache(null), { calls++; listOf(c("n")) }, clock)
        source.comments("p", listOf(c("e")), commentCount = 1).toList()
        assertThat(calls).isEqualTo(0)
        source.comments("p", listOf(c("e")), commentCount = 3).toList()
        assertThat(calls).isEqualTo(1)
    }

    @Test
    fun `une panne reseau laisse la liste affichee`() = runBlocking<Unit> {
        val source = PostGalleryCommentSource(FakeCache(null), { error("hors ligne") }, clock)
        val states = source.comments("p", listOf(c("e")), commentCount = 5).toList()
        assertThat(ids(states)).containsExactly(listOf("e"))
    }

    @Test
    fun `une ligne au dela de la conservation est ignoree`() = runBlocking<Unit> {
        val source = PostGalleryCommentSource(FakeCache(doc(CachePolicy.Comments.keepForMillis + 1, "old")), { null }, clock)
        val states = source.comments("p", emptyList(), commentCount = 0).toList()
        assertThat(ids(states)).containsExactly(emptyList<String>())
    }
}
