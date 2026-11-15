package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.comment.UploadedCommentMedia
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.CommentPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxRepository
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.SendResult
import org.junit.Test
import java.io.File
import java.util.Base64

class CommentSendSenderResumeTest {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val now = System.currentTimeMillis()

    private fun jwt(userId: String) =
        "h." + Base64.getUrlEncoder().withoutPadding().encodeToString("""{"userId":"$userId"}""".toByteArray()) + ".s"

    private class Env {
        val uploads = mutableListOf<Int>()
        val created = mutableListOf<List<String>>()
        val rewritten = mutableListOf<String>()
        var createResult: NetworkResult<ApiPostComment?> = NetworkResult.Success(ApiPostComment(id = "c1"))
        var uploadResult: (Int) -> NetworkResult<String> = { NetworkResult.Success("srv-$it") }
    }

    private fun row(payload: CommentPayload, owner: String? = "u1") = OutboxEntity(
        cmid = "cmid_1", lane = "comment", kind = OutboxKind.CREATE_COMMENT.name, targetId = "p1",
        payload = json.encodeToString(CommentPayload.serializer(), payload), dependsOn = null, attempts = 0,
        state = OutboxState.PENDING.name, createdAt = 0L, updatedAt = 0L, ownerId = owner,
    )

    private fun sender(env: Env, existingFiles: Set<String>, token: String? = jwt("u1")): Pair<CommentSendSender, CommentMediaFiles> {
        val files = mockk<CommentMediaFiles>(relaxed = true)
        every { files.resolve(any(), any()) } answers {
            val path = secondArg<String>()
            if (path in existingFiles) mockk<File> { every { isFile } returns true } else null
        }
        val publisher = CommentPublisher(
            prepare = {},
            token = { token },
            upload = { piece, _ -> env.uploads += piece.sourceIndex; env.uploadResult(piece.sourceIndex) },
            create = { c, _ -> env.created += c.attachmentIds; env.createResult },
        )
        val outbox = mockk<OutboxRepository>(relaxed = true)
        coEvery { outbox.rewritePayload(any(), any()) } answers { env.rewritten += secondArg<String>() }
        return CommentSendSender(publisher, files, outbox, json) to files
    }

    private fun media(vararg uploaded: UploadedCommentMedia) = CommentMediaPayload(
        paths = listOf("comments-u1/cmid_1/0.jpg", "comments-u1/cmid_1/1.jpg"),
        mimeTypes = listOf("image/jpeg", "image/jpeg"),
        uploaded = uploaded.toList(),
    )

    private val both = setOf("comments-u1/cmid_1/0.jpg", "comments-u1/cmid_1/1.jpg")

    @Test
    fun `les pieces acquises sont reutilisees et seules les manquantes sont montees`() = runTest {
        val env = Env()
        val m = media(UploadedCommentMedia(0, "srv-old", now - 1_000))
        val (sender, _) = sender(env, both)

        val result = sender.send(row(CommentPayload("", media = m)), CommentPayload("", media = m), m)

        assertThat(result).isEqualTo(SendResult.Success)
        assertThat(env.uploads).containsExactly(1)
        assertThat(env.created.single()).containsExactly("srv-old", "srv-1").inOrder()
    }

    @Test
    fun `chaque piece montee est gravee sur la ligne avant la suivante`() = runTest {
        val env = Env()
        val m = media()
        val (sender, _) = sender(env, both)

        sender.send(row(CommentPayload("", media = m)), CommentPayload("", media = m), m)

        assertThat(env.rewritten).hasSize(2)
        val last = json.decodeFromString(CommentPayload.serializer(), env.rewritten.last())
        assertThat(last.media!!.uploaded.map { it.id }).containsExactly("srv-0", "srv-1")
    }

    @Test
    fun `apres la creation les fichiers locaux sont nettoyes`() = runTest {
        val env = Env()
        val m = media()
        val (sender, files) = sender(env, both)

        sender.send(row(CommentPayload("", media = m)), CommentPayload("", media = m), m)

        verify { files.discard("u1", m.paths) }
    }

    @Test
    fun `une interruption garde les fichiers et les pieces acquises, la ligne se rejoue`() = runTest {
        val env = Env().apply { uploadResult = { if (it == 1) NetworkResult.Failure(ApiError("offline", "NETWORK")) else NetworkResult.Success("srv-$it") } }
        val m = media()
        val (sender, files) = sender(env, both)

        val result = sender.send(row(CommentPayload("", media = m)), CommentPayload("", media = m), m)

        assertThat(result).isEqualTo(SendResult.TransientFailure)
        verify(exactly = 0) { files.discard(any(), any()) }
        val saved = json.decodeFromString(CommentPayload.serializer(), env.rewritten.single())
        assertThat(saved.media!!.uploaded.map { it.id }).containsExactly("srv-0")
        assertThat(env.created).isEmpty()
    }

    @Test
    fun `une piece perdue du disque sans id presentable renonce sans rien envoyer`() = runTest {
        val env = Env()
        val m = media()
        val (sender, _) = sender(env, setOf("comments-u1/cmid_1/0.jpg"))

        val result = sender.send(row(CommentPayload("", media = m)), CommentPayload("", media = m), m)

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        assertThat(env.uploads).isEmpty()
        assertThat(env.created).isEmpty()
    }

    @Test
    fun `un refus definitif de la creation renonce et garde les fichiers`() = runTest {
        val env = Env().apply { createResult = NetworkResult.Failure(ApiError("closed", "THREAD_CLOSED", 403)) }
        val m = media()
        val (sender, files) = sender(env, both)

        val result = sender.send(row(CommentPayload("", media = m)), CommentPayload("", media = m), m)

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
        verify(exactly = 0) { files.discard(any(), any()) }
    }

    @Test
    fun `sous un autre compte la ligne attend sans rien envoyer`() = runTest {
        val env = Env()
        val m = media()
        val (sender, _) = sender(env, both, token = jwt("u2"))

        val result = sender.send(row(CommentPayload("", media = m)), CommentPayload("", media = m), m)

        assertThat(result).isInstanceOf(SendResult.Deferred::class.java)
        assertThat(env.uploads).isEmpty()
    }
}
