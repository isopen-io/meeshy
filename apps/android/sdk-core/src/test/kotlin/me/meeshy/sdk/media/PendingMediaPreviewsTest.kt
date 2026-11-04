package me.meeshy.sdk.media

import com.google.common.truth.Truth.assertThat
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.composer.AttachmentThumbnail
import me.meeshy.sdk.composer.AttachmentThumbnailing
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.media.LocalFileUrl
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PendingMediaPreviewsTest {
    @get:Rule val folder = TemporaryFolder()

    private class Thumbnailer : AttachmentThumbnailing {
        val asked = mutableListOf<PendingAttachmentType>()
        override suspend fun thumbnail(file: File, type: PendingAttachmentType, outputDir: File, id: String): AttachmentThumbnail? {
            asked += type
            if (type == PendingAttachmentType.AUDIO) return AttachmentThumbnail(durationMs = 4_200L)
            val target = File(outputDir.apply { mkdirs() }, "$id.thumb.jpg").apply { writeBytes(byteArrayOf(9, 9)) }
            return AttachmentThumbnail(thumbnailPath = target.path, width = 1920, height = 1080, durationMs = 12_000L)
        }
    }

    private val dir by lazy { File(folder.root, "pending-previews") }
    private val thumbnailer = Thumbnailer()
    private val previews by lazy { PendingMediaPreviews(dir, thumbnailer, Dispatchers.Unconfined) }

    private fun trayThumbnail(): File = folder.newFile("tray.thumb.jpg").apply { writeBytes(byteArrayOf(1, 2, 3)) }

    private fun pathOf(url: String?): File = File(LocalFileUrl.pathOf(url!!)!!)

    private val viewOnce = MessageEffects(flags = MessageEffectFlags.VIEW_ONCE)
    private val blurred = MessageEffects(flags = MessageEffectFlags.BLURRED)

    @Test
    fun `the tray thumbnail is kept under the previews directory and named by its upload`() = runBlocking {
        val tray = trayThumbnail()

        val url = previews.keep("cmid_1", tray.path, MessageEffects())

        val kept = pathOf(url)
        assertThat(url).startsWith("file:///")
        assertThat(kept.parentFile?.canonicalPath).isEqualTo(dir.canonicalPath)
        assertThat(kept.name).startsWith("cmid_1")
        assertThat(kept.readBytes()).isEqualTo(byteArrayOf(1, 2, 3))
    }

    @Test
    fun `the kept preview outlives the tray file it was copied from`() = runBlocking {
        val tray = trayThumbnail()
        val url = previews.keep("cmid_1", tray.path, MessageEffects())

        tray.delete()

        assertThat(pathOf(url).isFile).isTrue()
    }

    @Test
    fun `a view-once or blurred piece writes no preview in clear`() = runBlocking {
        val tray = trayThumbnail()

        assertThat(previews.keep("cmid_1", tray.path, viewOnce)).isNull()
        assertThat(previews.keep("cmid_2", tray.path, blurred)).isNull()
        assertThat(dir.listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `a piece without a thumbnail keeps nothing`() = runBlocking {
        assertThat(previews.keep("cmid_1", null, MessageEffects())).isNull()
        assertThat(previews.keep("cmid_2", File(folder.root, "gone.jpg").path, MessageEffects())).isNull()
    }

    @Test
    fun `a received file is previewed from its own octets with what it learns`() = runBlocking {
        val video = folder.newFile("clip.mp4").apply { writeBytes(ByteArray(64)) }

        val preview = previews.render("cmid_1", MediaUploadItem.onDisk(video, "clip.mp4", "video/mp4"), MessageEffects())

        assertThat(preview).isNotNull()
        assertThat(preview!!.thumbnailUrl).startsWith("file:///")
        assertThat(pathOf(preview.thumbnailUrl).parentFile?.canonicalPath).isEqualTo(dir.canonicalPath)
        assertThat(preview.width).isEqualTo(1920)
        assertThat(preview.height).isEqualTo(1080)
        assertThat(preview.durationMs).isEqualTo(12_000L)
    }

    @Test
    fun `an audio is previewed by its duration alone`() = runBlocking {
        val voice = folder.newFile("voice.m4a").apply { writeBytes(ByteArray(16)) }

        val preview = previews.render("cmid_1", MediaUploadItem.onDisk(voice, "voice.m4a", "audio/mp4"), MessageEffects())

        assertThat(preview?.thumbnailUrl).isNull()
        assertThat(preview?.durationMs).isEqualTo(4_200L)
    }

    @Test
    fun `a protected received file is never decoded`() = runBlocking {
        val photo = folder.newFile("p.jpg").apply { writeBytes(ByteArray(16)) }

        val preview = previews.render("cmid_1", MediaUploadItem.onDisk(photo, "p.jpg", "image/jpeg"), viewOnce)

        assertThat(preview).isNull()
        assertThat(thumbnailer.asked).isEmpty()
    }

    @Test
    fun `octets held in memory are not previewed`() = runBlocking {
        val preview = previews.render("cmid_1", MediaUploadItem(byteArrayOf(1), "p.jpg", "image/jpeg"), MessageEffects())

        assertThat(preview).isNull()
    }

    @Test
    fun `releasing a bubble deletes its previews and nothing outside the directory`() = runBlocking {
        val url = previews.keep("cmid_1", trayThumbnail().path, MessageEffects())
        val foreign = folder.newFile("sticker.png")

        previews.release(
            listOf(
                ApiMessageAttachment(id = "cmid_1", mimeType = "image/jpeg", thumbnailUrl = url),
                ApiMessageAttachment(id = "s1", mimeType = "image/png", thumbnailUrl = foreign.toURI().toString()),
                ApiMessageAttachment(id = "r1", mimeType = "image/jpeg", thumbnailUrl = "https://gate.meeshy.me/t.jpg"),
            ),
        )

        assertThat(pathOf(url).exists()).isFalse()
        assertThat(foreign.exists()).isTrue()
    }

    @Test
    fun `a preview named through a parent path never escapes the directory`() = runBlocking {
        val outside = folder.newFile("outside.jpg")
        val sneaky = "file://" + File(dir, "../outside.jpg").path

        previews.release(listOf(ApiMessageAttachment(id = "x", mimeType = "image/jpeg", thumbnailUrl = sneaky)))

        assertThat(outside.exists()).isTrue()
    }

    @Test
    fun `the account boundary empties every preview`() = runBlocking {
        val url = previews.keep("cmid_1", trayThumbnail().path, MessageEffects())

        previews.clear()

        assertThat(pathOf(url).exists()).isFalse()
    }

    private fun recordedVoice(): File = folder.newFile("take.m4a").apply { writeBytes(byteArrayOf(7, 7, 7, 7)) }

    @Test
    fun `a voice note keeps a playable local copy named by its upload`() = runBlocking {
        val take = recordedVoice()

        val url = previews.keepPlayable("cmid_1", MediaUploadItem.onDisk(take, "take.m4a", "audio/mp4"), MessageEffects())

        val kept = pathOf(url)
        assertThat(url).startsWith("file:///")
        assertThat(kept.parentFile?.canonicalPath).isEqualTo(dir.canonicalPath)
        assertThat(kept.name).startsWith("cmid_1")
        assertThat(kept.name).endsWith(".m4a")
        assertThat(kept.readBytes()).isEqualTo(byteArrayOf(7, 7, 7, 7))
        take.delete()
        assertThat(kept.isFile).isTrue()
    }

    @Test
    fun `a voice note held in memory is kept playable too`() = runBlocking {
        val url = previews.keepPlayable("cmid_1", MediaUploadItem(byteArrayOf(5, 6), "v.ogg", "audio/ogg"), MessageEffects())

        assertThat(pathOf(url).readBytes()).isEqualTo(byteArrayOf(5, 6))
    }

    @Test
    fun `a view-once or blurred voice note writes no copy in clear`() = runBlocking {
        val item = MediaUploadItem.onDisk(recordedVoice(), "take.m4a", "audio/mp4")

        assertThat(previews.keepPlayable("cmid_1", item, viewOnce)).isNull()
        assertThat(previews.keepPlayable("cmid_2", item, blurred)).isNull()
        assertThat(dir.listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `only a sound is kept playable — a video is never duplicated`() = runBlocking {
        val clip = folder.newFile("clip.mp4").apply { writeBytes(ByteArray(64)) }

        assertThat(previews.keepPlayable("cmid_1", MediaUploadItem.onDisk(clip, "clip.mp4", "video/mp4"), MessageEffects())).isNull()
        assertThat(dir.listFiles().orEmpty()).isEmpty()
    }

    @Test
    fun `releasing a bubble deletes its playable copy`() = runBlocking {
        val url = previews.keepPlayable("cmid_1", MediaUploadItem.onDisk(recordedVoice(), "take.m4a", "audio/mp4"), MessageEffects())

        previews.release(listOf(ApiMessageAttachment(id = "cmid_1", mimeType = "audio/mp4", fileUrl = url)))

        assertThat(pathOf(url).exists()).isFalse()
    }

    @Test
    fun `releasing never deletes a local original the bubble does not own`() = runBlocking {
        val sticker = folder.newFile("sticker.webp")

        previews.release(listOf(ApiMessageAttachment(id = "s1", mimeType = "image/webp", fileUrl = "file://" + sticker.absolutePath)))

        assertThat(sticker.exists()).isTrue()
    }
}
