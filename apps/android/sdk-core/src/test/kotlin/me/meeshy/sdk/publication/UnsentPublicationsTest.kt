package me.meeshy.sdk.publication

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.media.MediaLocationRefusal
import me.meeshy.sdk.media.MediaUploadSender
import me.meeshy.sdk.model.media.MediaFate
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.outbox.OutboxIds
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxState
import org.junit.Test

class UnsentPublicationsTest {

    private val photo = OutboxIds.cmid()
    private val video = OutboxIds.cmid()
    private val gone = OutboxIds.cmid()

    private fun row(
        cmid: String,
        kind: OutboxKind,
        payload: String = "{}",
        state: OutboxState = OutboxState.PENDING,
        error: String? = null,
        owner: String? = "me",
    ) = OutboxEntity(
        cmid = cmid, lane = "lane", kind = kind.name, targetId = cmid, payload = payload, dependsOn = null,
        attempts = 0, state = state.name, createdAt = 1L, updatedAt = 1L, lastError = error, ownerId = owner,
    )

    private fun post(vararg mediaIds: String, cmid: String = "post-1", state: OutboxState = OutboxState.PENDING, owner: String? = "me") =
        row(cmid, OutboxKind.CREATE_POST, MeeshyApi.json.encodeToString(CreatePostRequest(content = "hello", mediaIds = mediaIds.toList())), state, owner = owner)

    private fun upload(cmid: String, state: OutboxState = OutboxState.PENDING, error: String? = null) =
        row(cmid, OutboxKind.UPLOAD_MEDIA, state = state, error = error)

    @Test
    fun `each media of a publication carries its own fate and its own progress`() {
        val rows = listOf(
            post("server-id", photo, video, gone),
            upload(photo),
            upload(video, OutboxState.EXHAUSTED, error = "Transient delivery failure"),
        )
        val progress = mapOf(photo to MediaUploadProgress.Uploading(10, 40))

        val media = UnsentPublications.from(rows, ownerId = "me", progress = progress).single().media

        assertThat(media.map { it.fate }).containsExactly(
            MediaFate.UPLOADED, MediaFate.WAITING, MediaFate.REFUSED, MediaFate.LOST,
        ).inOrder()
        assertThat(media[0].progress).isEqualTo(MediaUploadProgress.Ready("server-id"))
        assertThat(media[1].progress).isEqualTo(MediaUploadProgress.Uploading(10, 40))
        assertThat(media[2].progress).isEqualTo(MediaUploadProgress.Idle)
    }

    @Test
    fun `an upload whose bytes were swept is lost not merely refused`() {
        val rows = listOf(
            post(photo, state = OutboxState.EXHAUSTED),
            upload(photo, OutboxState.EXHAUSTED, error = MediaUploadSender.REASON_BLOB_GONE),
        )

        val unsent = UnsentPublications.from(rows, ownerId = "me", progress = emptyMap()).single()

        assertThat(unsent.media.single().fate).isEqualTo(MediaFate.LOST)
        assertThat(unsent.status).isEqualTo(UnsentPublicationStatus.FAILED)
    }

    @Test
    fun `an upload refused for its location is told apart from a plain refusal`() {
        val rows = listOf(
            post(photo, state = OutboxState.EXHAUSTED),
            upload(photo, OutboxState.EXHAUSTED, error = MediaLocationRefusal.REASON),
        )

        val unsent = UnsentPublications.from(rows, ownerId = "me", progress = emptyMap()).single()

        assertThat(unsent.media.single().fate).isEqualTo(MediaFate.LOCATION_REFUSED)
    }

    @Test
    fun `another account's publications never reach the list`() {
        val rows = listOf(post("a", cmid = "mine"), post("b", cmid = "theirs", owner = "someone-else"), post("c", cmid = "legacy", owner = null))

        val cmids = UnsentPublications.from(rows, ownerId = "me", progress = emptyMap()).map { it.cmid }

        assertThat(cmids).containsExactly("mine")
    }

    @Test
    fun `nobody signed in lists nothing`() {
        assertThat(UnsentPublications.from(listOf(post("a")), ownerId = null, progress = emptyMap())).isEmpty()
    }
}
