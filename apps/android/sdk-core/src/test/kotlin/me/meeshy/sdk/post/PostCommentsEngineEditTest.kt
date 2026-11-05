package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.CommentRepliesState
import me.meeshy.sdk.model.CommentThreadState
import me.meeshy.sdk.model.comment.CommentEditRequest
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class PostCommentsEngineEditTest {

    private val root = ApiPostComment(id = "c1", content = "Bonjour")
    private val other = ApiPostComment(id = "c2", content = "Autre")
    private val reply = ApiPostComment(id = "r1", content = "Une réponse", parentId = "c1")
    private val request = CommentEditRequest("c1", "Salut", 0, "fr")
    private val replyRequest = CommentEditRequest("r1", "Réponse corrigée", 0, "fr")

    private fun thread() = MutableStateFlow(CommentThreadState(comments = listOf(root, other), hasLoaded = true))
    private fun replies() = MutableStateFlow(CommentRepliesState(repliesByParent = mapOf("c1" to listOf(reply)), loadedIds = setOf("c1")))

    @Test
    fun `the row is replaced in place before the server answers, never inserted`() = runTest {
        val thread = thread()
        val replies = replies()
        var seenDuringSend: List<String>? = null
        PostCommentsEngine.edit(thread, replies, root, request) {
            seenDuringSend = thread.value.comments.map { c -> c.content }
            NetworkResult.Success(root.copy(content = "Salut"))
        }
        assertThat(seenDuringSend).containsExactly("Salut", "Autre").inOrder()
        assertThat(thread.value.comments.map { it.id }).containsExactly("c1", "c2").inOrder()
    }

    @Test
    fun `a confirmation keeps the edited row, the echo reconfirms it`() = runTest {
        val thread = thread()
        val outcome = PostCommentsEngine.edit(thread, replies(), root, request) { NetworkResult.Success(root.copy(content = "Salut")) }
        assertThat(outcome).isInstanceOf(CommentEditOutcome.Confirmed::class.java)
        assertThat(thread.value.comments.first().content).isEqualTo("Salut")
    }

    @Test
    fun `a refusal brings the original row back completely`() = runTest {
        val thread = thread()
        val replies = replies()
        val outcome = PostCommentsEngine.edit(thread, replies, root, request) { NetworkResult.Failure(ApiError(message = "non")) }
        assertThat(outcome).isEqualTo(CommentEditOutcome.Refused("non"))
        assertThat(thread.value.comments).containsExactly(root, other).inOrder()
    }

    @Test
    fun `an exception also brings the original row back`() = runTest {
        val thread = thread()
        val outcome = PostCommentsEngine.edit(thread, replies(), root, request) { error("boom") }
        assertThat(outcome).isInstanceOf(CommentEditOutcome.Refused::class.java)
        assertThat(thread.value.comments.first()).isEqualTo(root)
    }

    @Test
    fun `a reply is edited in place in its thread`() = runTest {
        val replies = replies()
        PostCommentsEngine.edit(thread(), replies, reply, replyRequest) { NetworkResult.Success(reply.copy(content = "Réponse corrigée")) }
        assertThat(replies.value.repliesFor("c1").map { it.content }).containsExactly("Réponse corrigée")
    }

    @Test
    fun `the socket echo is idempotent`() = runTest {
        val thread = thread()
        val replies = replies()
        val echoed = root.copy(content = "Salut")
        PostCommentsEngine.applyEcho(thread, replies, echoed)
        val once = thread.value
        PostCommentsEngine.applyEcho(thread, replies, echoed)
        assertThat(thread.value).isEqualTo(once)
        assertThat(thread.value.comments).hasSize(2)
    }

    @Test
    fun `an echo for a row that is not loaded changes nothing`() = runTest {
        val thread = thread()
        PostCommentsEngine.applyEcho(thread, replies(), ApiPostComment(id = "ghost", content = "x"))
        assertThat(thread.value.comments.map { it.id }).containsExactly("c1", "c2")
    }
}
