package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.net.api.CreateCommentRequest
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.outbox.CommentPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import me.meeshy.sdk.post.InMemoryUnsentCommentStore
import me.meeshy.sdk.outbox.UnsentCommentNotice
import me.meeshy.sdk.post.PostRepository
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class CreateCommentHandlerTest {

    private val postApi = mockk<PostApi>()
    private val postRepository = mockk<PostRepository>(relaxed = true)
    private val unsent = InMemoryUnsentCommentStore()
    private val notices = mutableListOf<Triple<String?, String, String>>()
    private val handler = CreateCommentHandler(
        postApi, senderJson, postRepository, unsent,
        UnsentCommentNotice { owner, post, text -> notices += Triple(owner, post, text) },
    )

    private fun row(payload: CommentPayload = CommentPayload("Bravo", parentId = "c9", originalLanguage = null)) =
        outboxRow(OutboxKind.CREATE_COMMENT, targetId = "p1", cmid = "cmid_c1", payload = encodedPayload(payload))

    private fun refusal(status: Int, body: String = "{}") = HttpException(Response.error<ApiPostComment>(status, body.toResponseBody()))

    private val request = CreateCommentRequest(content = "Bravo", parentId = "c9")

    @Test
    fun `un commentaire en file part sous la cle de sa ligne pour qu un rejeu ne commente jamais deux fois`() = runTest {
        coEvery { postApi.addComment("p1", request, "cmid_c1") } returns accepted(ApiPostComment(id = "c-new"))

        assertThat(handler.send(row())).isEqualTo(SendResult.Success)
        assertThat(handler.send(row())).isEqualTo(SendResult.Success)

        coVerify(exactly = 2) { postApi.addComment("p1", request, "cmid_c1") }
    }

    @Test
    fun `un commentaire racine n envoie aucun parent`() = runTest {
        val root = CreateCommentRequest(content = "Joli")
        coEvery { postApi.addComment("p1", root, "cmid_c1") } returns accepted(ApiPostComment(id = "c-new"))

        assertThat(handler.send(row(CommentPayload("Joli")))).isEqualTo(SendResult.Success)
    }

    @Test
    fun `hors ligne, limite ou panne serveur le commentaire est rejoue`() = runTest {
        coEvery { postApi.addComment(any(), any(), any()) } throws IOException("offline")
        assertThat(handler.send(row())).isEqualTo(SendResult.TransientFailure)

        listOf(401, 408, 429, 500, 503).forEach {
            coEvery { postApi.addComment(any(), any(), any()) } throws refusal(it)
            assertThat(handler.send(row())).isEqualTo(SendResult.TransientFailure)
        }
    }

    @Test
    fun `un refus que la passerelle motive est definitif, un 404 sans enveloppe ne l est pas`() = runTest {
        coEvery { postApi.addComment(any(), any(), any()) } throws
            refusal(404, """{"success":false,"error":"Post not found","code":"POST_NOT_FOUND"}""")
        assertThat(handler.send(row())).isInstanceOf(SendResult.PermanentFailure::class.java)

        coEvery { postApi.addComment(any(), any(), any()) } throws refusal(404, "<html>proxy</html>")
        assertThat(handler.send(row())).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `un resultat disparu 410 vaut commentaire deja pose`() = runTest {
        coEvery { postApi.addComment(any(), any(), any()) } throws
            refusal(410, """{"success":false,"error":"gone","code":"MUTATION_RESULT_GONE"}""")

        assertThat(handler.send(row())).isEqualTo(SendResult.Success)
    }

    @Test
    fun `un 410 qui ne dit pas que le geste a eu lieu n efface pas le commentaire de la file`() = runTest {
        coEvery { postApi.addComment(any(), any(), any()) } throws refusal(410, "<html>gone</html>")

        assertThat(handler.send(row())).isNotEqualTo(SendResult.Success)
    }

    @Test
    fun `une charge illisible echoue sans appeler la passerelle`() = runTest {
        val result = handler.send(outboxRow(OutboxKind.CREATE_COMMENT, targetId = "p1", payload = "oops"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        coVerify(exactly = 0) { postApi.addComment(any(), any(), any()) }
    }

    @Test
    fun `un commentaire qui renonce rend le compteur du post`() = runTest {
        handler.onExhausted(row())

        coVerify(exactly = 1) { postRepository.rollbackQueuedComment("p1") }
    }

    @Test
    fun `un commentaire qui renonce previent son auteur et garde son texte recuperable`() = runTest {
        handler.onExhausted(row().copy(ownerId = "me"))

        assertThat(notices).containsExactly(Triple<String?, String, String>("me", "p1", "Bravo"))
        assertThat(unsent.peek("p1")).isEqualTo("Bravo")
    }

    @Test
    fun `une charge illisible ne previent personne, le compteur est tout de meme rendu`() = runTest {
        handler.onExhausted(outboxRow(OutboxKind.CREATE_COMMENT, targetId = "p1", payload = "oops"))

        assertThat(notices).isEmpty()
        assertThat(unsent.peek("p1")).isNull()
        coVerify(exactly = 1) { postRepository.rollbackQueuedComment("p1") }
    }

    @Test
    fun `un refus passager ne previent pas, la ligne est rejouee`() = runTest {
        coEvery { postApi.addComment(any(), any(), any()) } throws IOException("offline")
        assertThat(handler.send(row())).isEqualTo(SendResult.TransientFailure)
        coEvery { postApi.addComment(any(), any(), any()) } throws refusal(503)
        assertThat(handler.send(row())).isEqualTo(SendResult.TransientFailure)

        assertThat(notices).isEmpty()
        assertThat(unsent.peek("p1")).isNull()
    }

    @Test
    fun `un avis qui echoue ne defait pas le retour du compteur ni le texte garde`() = runTest {
        val failing = CreateCommentHandler(postApi, senderJson, postRepository, unsent, UnsentCommentNotice { _, _, _ -> error("channel") })

        failing.onExhausted(row())

        assertThat(unsent.peek("p1")).isEqualTo("Bravo")
        coVerify(exactly = 1) { postRepository.rollbackQueuedComment("p1") }
    }
}
