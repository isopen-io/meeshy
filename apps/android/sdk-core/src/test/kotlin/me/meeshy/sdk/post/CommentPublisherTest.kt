package me.meeshy.sdk.post

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.comment.CommentOwnershipRefusal
import me.meeshy.sdk.model.comment.UploadedCommentMedia
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.CommentPayload
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.File
import java.util.Base64

class CommentPublisherTest {

    private fun jwtFor(userId: String): String =
        "h." + Base64.getUrlEncoder().withoutPadding().encodeToString("""{"userId":"$userId"}""".toByteArray()) + ".s"

    private class Log {
        val uploads = mutableListOf<Pair<Int, String>>()
        val creations = mutableListOf<Pair<CommentPublisher.Creation, String>>()
        var prepared = 0
    }

    private fun publisher(
        log: Log,
        token: () -> String? = { jwtFor("u1") },
        upload: (CommentPublisher.Piece) -> NetworkResult<String> = { NetworkResult.Success("srv-${it.sourceIndex}") },
        create: () -> NetworkResult<ApiPostComment?> = { NetworkResult.Success(ApiPostComment(id = "c1")) },
    ) = CommentPublisher(
        prepare = { log.prepared++ },
        token = token,
        upload = { piece, bearer -> log.uploads += piece.sourceIndex to bearer; upload(piece) },
        create = { creation, bearer -> log.creations += creation to bearer; create() },
        nowMillis = { 1_000L },
    )

    private fun piece(i: Int) = CommentPublisher.Piece(i, File("p$i.jpg"), "image/jpeg")
    private val comment = CommentPayload(content = "vu")

    @Test
    fun `chaque piece est montee puis le commentaire part avec ses ids sous le jeton verifie`() = runTest {
        val log = Log()
        val uploadedSoFar = mutableListOf<UploadedCommentMedia>()

        val served = publisher(log).publish("p1", "u1", "cmid_1", comment, listOf(piece(0), piece(1)), onUploaded = { uploadedSoFar += it })

        assertThat(served?.id).isEqualTo("c1")
        assertThat(log.uploads.map { it.first }).containsExactly(0, 1).inOrder()
        assertThat(log.uploads.map { it.second }.distinct()).containsExactly(jwtFor("u1"))
        assertThat(log.creations.single().first.attachmentIds).containsExactly("srv-0", "srv-1").inOrder()
        assertThat(log.creations.single().second).isEqualTo(jwtFor("u1"))
        assertThat(log.creations.single().first.clientMutationId).isEqualTo("cmid_1")
        assertThat(uploadedSoFar.map { it.id }).containsExactly("srv-0", "srv-1").inOrder()
        assertThat(log.prepared).isEqualTo(3)
    }

    @Test
    fun `une interruption leve Interrupted avec ce qui est acquis`() = runTest {
        val log = Log()
        val flaky = publisher(log, upload = { if (it.sourceIndex == 1) NetworkResult.Failure(ApiError("offline", "NETWORK")) else NetworkResult.Success("srv-0") })

        val interrupted = runCatching { flaky.publish("p1", "u1", "cmid_1", comment, listOf(piece(0), piece(1))) }.exceptionOrNull()

        assertThat(interrupted).isInstanceOf(CommentPublisher.Interrupted::class.java)
        assertThat((interrupted as CommentPublisher.Interrupted).acquired.map { it.id }).containsExactly("srv-0")
        assertThat(log.creations).isEmpty()
    }

    @Test
    fun `la reprise ne renvoie pas les pieces acquises`() = runTest {
        val log = Log()
        val acquired = listOf(UploadedCommentMedia(0, "srv-old", 500L))

        publisher(log).publish("p1", "u1", "cmid_1", comment, listOf(piece(0), piece(1)), acquired = acquired)

        assertThat(log.uploads.map { it.first }).containsExactly(1)
        assertThat(log.creations.single().first.attachmentIds).containsExactly("srv-old", "srv-1").inOrder()
    }

    @Test
    fun `un refus de creation garde les pieces acquises pour la file`() = runTest {
        val log = Log()
        val refused = publisher(log, create = { NetworkResult.Failure(ApiError("boom", "X", 503)) })

        val interrupted = runCatching { refused.publish("p1", "u1", "cmid_1", comment, listOf(piece(0))) }.exceptionOrNull()

        assertThat((interrupted as CommentPublisher.Interrupted).acquired.map { it.id }).containsExactly("srv-0")
        assertThat(interrupted.error.httpStatus).isEqualTo(503)
    }

    @Test
    fun `une creation confirmee sans commentaire decrit rend null sans echec`() = runTest {
        val log = Log()

        val served = publisher(log, create = { NetworkResult.Success(null) }).publish("p1", "u1", "cmid_1", comment, emptyList())

        assertThat(served).isNull()
    }

    @Test
    fun `sous un autre compte rien ne part, ni piece ni commentaire`() = runTest {
        val log = Log()
        val other = publisher(log, token = { jwtFor("u2") })

        assertThrows(CommentOwnershipRefusal::class.java) {
            kotlinx.coroutines.runBlocking { other.publish("p1", "u1", "cmid_1", comment, listOf(piece(0))) }
        }

        assertThat(log.uploads).isEmpty()
        assertThat(log.creations).isEmpty()
    }

    @Test
    fun `le compte qui change entre deux pieces arrete l envoi avant la suivante`() = runTest {
        val log = Log()
        var current = "u1"
        val switching = publisher(log, token = { jwtFor(current) }, upload = { current = "u2"; NetworkResult.Success("srv-${it.sourceIndex}") })

        assertThrows(CommentOwnershipRefusal::class.java) {
            kotlinx.coroutines.runBlocking { switching.publish("p1", "u1", "cmid_1", comment, listOf(piece(0), piece(1))) }
        }

        assertThat(log.uploads.map { it.first }).containsExactly(0)
        assertThat(log.creations).isEmpty()
    }
}
