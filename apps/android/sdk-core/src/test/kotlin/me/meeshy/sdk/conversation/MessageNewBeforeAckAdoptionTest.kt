package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.Dispatchers
import me.meeshy.sdk.media.MediaAdoption
import me.meeshy.sdk.media.MediaCacheDirs
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.OwnedMediaRoots
import me.meeshy.sdk.media.PendingMediaPreview
import me.meeshy.sdk.media.PendingMediaPreviewing
import me.meeshy.sdk.media.TypedMediaCache
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.socket.SendMessageAck
import io.mockk.coEvery
import io.mockk.mockk
import java.io.IOException
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.api.MessageApi
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import retrofit2.Response
import org.robolectric.RobolectricTestRunner
import java.io.File

/**
 * #16012 — le `message:new` de mon propre vocal arrive AVANT son accusé : la bulle optimiste est remplacée par
 * l'ingestion, et l'accusé ne trouve plus rien à réconcilier. La copie jouable doit pourtant rejoindre le cache AUDIO
 * sous l'adresse servie (le rejeu hors ligne la lit là), une seule fois, et l'aperçu en attente partir avec la bulle.
 */
@RunWith(RobolectricTestRunner::class)
class MessageNewBeforeAckAdoptionTest {
    @get:Rule val folder = TemporaryFolder()

    private val sender = MeeshyUser(id = "me", username = "atabeth", displayName = "Atabeth")
    private val remote = "https://gate.meeshy.me/api/v1/static/u/2026/voice.m4a"

    private class RecordingPreviews : PendingMediaPreviewing {
        val released = mutableListOf<List<String>>()
        override suspend fun keep(cmid: String, thumbnailPath: String?, effects: MessageEffects): String? = null
        override suspend fun render(cmid: String, item: MediaUploadItem, effects: MessageEffects): PendingMediaPreview? = null
        override suspend fun release(attachments: List<ApiMessageAttachment>) {
            released += attachments.map { it.id }
        }
    }

    private class Scene(
        val cache: TypedMediaCache,
        val previews: RecordingPreviews,
        val coordinator: MessageSendCoordinator,
        val pipeline: MessageIngestPipeline,
        val media: AcknowledgedBubbleMedia,
        val voice: File,
        val cid: String,
    )

    private suspend fun scene(harness: MessageCollaboratorHarness): Scene {
        val cache = TypedMediaCache(MediaCacheDirs(folder.newFolder("cache"), folder.root))
        val owned = folder.newFolder("owned")
        val adoption = MediaAdoption(cache, { "https://gate.meeshy.me/api/v1/" }, OwnedMediaRoots(listOf(owned))::owns, Dispatchers.Unconfined)
        val previews = RecordingPreviews()
        val coordinator = MessageSendCoordinator(harness.database, harness.database.messageDao(), harness.outbox, harness.clock, adoption = adoption, previews = previews)
        val media = AcknowledgedBubbleMedia(adoption, previews)
        val pipeline = MessageIngestPipeline(harness.database, media = media)
        val voice = File(owned, "cmid_up1.voice.m4a").apply { writeBytes(ByteArray(64) { 7 }) }
        val local = ApiMessageAttachment(id = "cmid_up1", fileUrl = "file://" + voice.absolutePath, mimeType = "audio/mp4")
        val cid = coordinator.sendOptimistic("c1", "", "fr", sender, messageType = "audio", attachments = listOf(local))
        return Scene(cache, previews, coordinator, pipeline, media, voice, cid)
    }

    private fun served(cid: String) = ApiMessage(
        id = "srv1",
        conversationId = "c1",
        senderId = "me",
        messageType = "audio",
        createdAt = "2026-06-01T10:00:00Z",
        clientMessageId = cid,
        attachments = listOf(ApiMessageAttachment(id = "att-srv1", fileUrl = remote, mimeType = "audio/mp4")),
    )

    @Test
    fun `message new avant l'accuse socket range le vocal dans le cache audio une seule fois`() = runHarnessTest { harness ->
        val scene = scene(harness)

        scene.pipeline.ingest(listOf(served(scene.cid)), harness.clock.now)
        scene.coordinator.reconcileAcknowledged(scene.cid, SendMessageAck(messageId = "srv1", clientMessageId = scene.cid))

        assertThat(scene.cache.contains(MediaCacheCategory.AUDIO, remote)).isTrue()
        assertThat(scene.voice.exists()).isFalse()
        assertThat(scene.previews.released).containsExactly(listOf("cmid_up1"))
        assertThat(harness.database.messageDao().find(scene.cid)).isNull()
        assertThat(harness.database.messageDao().find("srv1")).isNotNull()
    }

    @Test
    fun `message new avant l'accuse REST range le vocal dans le cache audio une seule fois`() = runHarnessTest { harness ->
        val scene = scene(harness)

        scene.pipeline.ingest(listOf(served(scene.cid)), harness.clock.now)
        scene.coordinator.reconcileSent(scene.cid, served(scene.cid))

        assertThat(scene.cache.contains(MediaCacheCategory.AUDIO, remote)).isTrue()
        assertThat(scene.voice.exists()).isFalse()
        assertThat(scene.previews.released).containsExactly(listOf("cmid_up1"))
    }

    @Test
    fun `l'accuse avant message new reste une seule adoption`() = runHarnessTest { harness ->
        val scene = scene(harness)

        scene.coordinator.reconcileAcknowledged(scene.cid, SendMessageAck(messageId = "srv1", clientMessageId = scene.cid))
        scene.pipeline.ingest(listOf(served(scene.cid)), harness.clock.now)

        assertThat(scene.cache.contains(MediaCacheCategory.AUDIO, remote)).isTrue()
        assertThat(scene.previews.released).containsExactly(listOf("cmid_up1"))
    }

    @Test
    fun `un message recu d'un autre n'adopte ni ne libere rien`() = runHarnessTest { harness ->
        val scene = scene(harness)

        scene.pipeline.ingest(listOf(served(scene.cid).copy(id = "srv2", senderId = "other", clientMessageId = null)), harness.clock.now)

        assertThat(scene.cache.contains(MediaCacheCategory.AUDIO, remote)).isFalse()
        assertThat(scene.voice.exists()).isTrue()
        assertThat(scene.previews.released).isEmpty()
    }

    @Test
    fun `une page REST qui sert le vocal avant tout accuse l'adopte aussi`() = runHarnessTest { harness ->
        val scene = scene(harness)
        val api = mockk<MessageApi>().also { api ->
            coEvery { api.listAfter(any(), any(), any()) } throws IOException("offline")
            coEvery { api.listConditional("c1", any()) } returns Response.success(ApiResponse(success = true, data = listOf(served(scene.cid))))
        }
        val page = MessageCacheSource(
            "c1", harness.database, harness.database.messageDao(), harness.database.syncMetaDao(), api, harness.clock,
            flowOf(HistoryWindow.Recent(50)), media = scene.media,
        )

        page.revalidate()
        scene.coordinator.reconcileAcknowledged(scene.cid, SendMessageAck(messageId = "srv1", clientMessageId = scene.cid))

        assertThat(scene.cache.contains(MediaCacheCategory.AUDIO, remote)).isTrue()
        assertThat(scene.voice.exists()).isFalse()
        assertThat(scene.previews.released).containsExactly(listOf("cmid_up1"))
    }
}
