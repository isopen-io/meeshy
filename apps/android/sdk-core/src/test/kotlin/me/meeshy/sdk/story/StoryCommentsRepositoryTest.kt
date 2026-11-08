package me.meeshy.sdk.story

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.Pagination
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.UpdateCommentRequest
import org.junit.Test
import java.io.IOException

class StoryCommentsRepositoryTest {

    private data class Prefs(
        override val systemLanguage: String? = "fr",
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private val api: StoryApi = mockk(relaxed = true)
    private val cache = InMemoryStoryCommentsCache()
    private val repository = StoryCommentsRepository(api, cache)

    private fun rows(vararg ids: String) = ids.map { ApiPostComment(id = it, content = "c$it") }

    private fun served(rows: List<ApiPostComment>, next: String? = null, more: Boolean = false) =
        ApiResponse(success = true, data = rows, pagination = Pagination(nextCursor = next, hasMore = more))

    @Test
    fun `les racines se demandent par pages de cinquante et la premiere page nourrit le cache`() = runTest {
        coEvery { api.comments("s1", null, 50) } returns served(rows("a", "b"), next = "b", more = true)

        val result = repository.roots("s1", null, Prefs()) as NetworkResult.Success

        assertThat(result.data.comments.map { it.id }).containsExactly("a", "b").inOrder()
        assertThat(result.data.nextCursor).isEqualTo("b")
        assertThat(repository.cachedRoots("s1", Prefs())!!.comments.map { it.id }).containsExactly("a", "b")
    }

    @Test
    fun `une page suivante ne reecrit pas le cache`() = runTest {
        coEvery { api.comments("s1", "b", 50) } returns served(rows("c"))

        repository.roots("s1", "b", Prefs())

        assertThat(repository.cachedRoots("s1", Prefs())).isNull()
    }

    @Test
    fun `une panne reseau n'ecrase pas le cache`() = runTest {
        cache.write("s1", StoryCommentsSnapshot(rows("a"), null, false))
        coEvery { api.comments("s1", null, 50) } throws IOException("hors ligne")

        val result = repository.roots("s1", null, Prefs())

        assertThat(result).isInstanceOf(NetworkResult.Failure::class.java)
        assertThat(repository.cachedRoots("s1", Prefs())!!.comments).hasSize(1)
    }

    @Test
    fun `les reponses se demandent par pages de vingt sous leur racine`() = runTest {
        coEvery { api.commentReplies("s1", "r1", "x", 20) } returns served(rows("p1"), next = "p1", more = true)

        val result = repository.replies("s1", "r1", "x", Prefs()) as NetworkResult.Success

        assertThat(result.data.comments.single().id).isEqualTo("p1")
        assertThat(result.data.hasMore).isTrue()
    }

    @Test
    fun `sans enveloppe de pagination une page pleine promet la suivante`() = runTest {
        val full = (1..20).map { ApiPostComment(id = "r$it") }
        coEvery { api.commentReplies("s1", "r1", null, 20) } returns ApiResponse(success = true, data = full)

        val result = repository.replies("s1", "r1", null, Prefs()) as NetworkResult.Success

        assertThat(result.data.nextCursor).isEqualTo("r20")
        assertThat(result.data.hasMore).isTrue()
    }

    @Test
    fun `like et unlike appellent les routes du coeur`() = runTest {
        coEvery { api.likeComment("s1", "c1") } returns ApiResponse(success = true, data = Unit)
        coEvery { api.unlikeComment("s1", "c1") } returns ApiResponse(success = true, data = Unit)

        assertThat(repository.like("s1", "c1")).isInstanceOf(NetworkResult.Success::class.java)
        assertThat(repository.unlike("s1", "c1")).isInstanceOf(NetworkResult.Success::class.java)
        coVerify { api.likeComment("s1", "c1") }
        coVerify { api.unlikeComment("s1", "c1") }
    }

    @Test
    fun `l'edition n'envoie que le texte et rend la ligne servie`() = runTest {
        val body = slot<UpdateCommentRequest>()
        coEvery { api.updateComment("s1", "c1", capture(body)) } returns
            ApiResponse(success = true, data = ApiPostComment(id = "c1", content = "corrige"))

        val result = repository.edit("s1", "c1", "corrige", Prefs()) as NetworkResult.Success

        assertThat(body.captured).isEqualTo(UpdateCommentRequest(content = "corrige"))
        assertThat(result.data.content).isEqualTo("corrige")
    }

    @Test
    fun `la suppression appelle la route de retrait`() = runTest {
        coEvery { api.deleteComment("s1", "c1") } returns ApiResponse(success = true, data = Unit)

        assertThat(repository.delete("s1", "c1")).isInstanceOf(NetworkResult.Success::class.java)
        coVerify { api.deleteComment("s1", "c1") }
    }

    @Test
    fun `le cache est vide a la deconnexion`() = runTest {
        cache.write("s1", StoryCommentsSnapshot(rows("a"), null, false))
        cache.clear()
        assertThat(repository.cachedRoots("s1", Prefs())).isNull()
    }
}
