package me.meeshy.app.stories.composer.document

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryVisibility
import me.meeshy.sdk.model.composer.CarriedSceneAssets
import me.meeshy.sdk.model.composer.ComposerDocumentDraft
import me.meeshy.sdk.model.composer.ComposerDocumentMedia
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.DocumentDoor
import me.meeshy.sdk.model.composer.DocumentSendCoordinator
import me.meeshy.sdk.model.composer.DocumentSendOutcome
import me.meeshy.sdk.model.composer.toPublishIntent
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.publication.PublicationOutbox
import org.junit.Test

class DocumentDurablePublisherTest {
    private val uploads: MediaUploadQueue = mockk(relaxed = true)
    private val publications: PublicationOutbox = mockk(relaxed = true)
    private val publisher = DocumentDurablePublisher(uploads, publications)

    private val effects = StoryEffects(
        audioPlayerObjects = listOf(StoryAudioPlayerObject(id = "s1", mediaURL = "file:///data/a.m4a")),
        stickerObjects = listOf(StorySticker(id = "k1")),
    )
    private val carried = CarriedSceneAssets(
        listOf(ComposerDocumentMedia("/data/a.m4a", "audio/mp4"), ComposerDocumentMedia("/tmp/sticker_k1.png", "image/png")),
        mapOf("/data/a.m4a" to "s1", "/tmp/sticker_k1.png" to "k1"),
    )
    private val draft = ComposerDocumentDraft(
        ComposerFormat.POST, "salut", StoryVisibility.PUBLIC, null, storyEffects = effects,
    )

    @Test
    fun `the sound and the sticker leave as uploads the scene objects wait on, even without a pre-upload`() = runTest {
        coEvery { uploads.enqueue(any(), any(), any()) } returnsMany listOf("up1", "up2")
        val request = slot<CreatePostRequest>()
        coEvery { publications.enqueuePost(capture(request), any()) } returns "post1"

        val outcome = DocumentSendCoordinator(publisher).send(draft, DocumentDoor.Wireless, carried)

        assertThat(outcome).isEqualTo(DocumentSendOutcome.Accepted("post1"))
        assertThat(request.captured.mediaIds).containsExactly("up1", "up2")
        assertThat(request.captured.storyEffects?.audioPlayerObjects?.single()?.postMediaId).isEqualTo("up1")
        assertThat(request.captured.storyEffects?.stickerObjects?.single()?.postMediaId).isEqualTo("up2")
    }

    @Test
    fun `a post refused by the queue cancels the uploads it had queued and says why`() = runTest {
        coEvery { uploads.enqueue(any(), any(), any()) } returnsMany listOf("up1", "up2")
        coEvery { publications.enqueuePost(any(), any()) } throws IllegalStateException("disque plein")

        val outcome = DocumentSendCoordinator(publisher).send(draft, DocumentDoor.Wireless, carried)

        assertThat(outcome).isInstanceOf(DocumentSendOutcome.Refused::class.java)
        coVerify { uploads.cancel("up1") }
        coVerify { uploads.cancel("up2") }
    }

    @Test
    fun `captions and alternative texts follow their media to the upload ids`() {
        val intent = ComposerDocumentDraft(
            ComposerFormat.POST, null, StoryVisibility.PUBLIC, null,
            localMedia = listOf(ComposerDocumentMedia("/a.jpg", "image/jpeg")),
            mediaCaptions = mapOf("/a.jpg" to "légende"), mediaAlts = mapOf("/a.jpg" to "alt"),
        )
        val request = DocumentPostRequest.build(intent.toPublishIntent(), listOf("up1"))
        assertThat(request.mediaCaption).containsExactly("up1", "légende")
        assertThat(request.mediaAlt).containsExactly("up1", "alt")
        assertThat(request.mediaIds).containsExactly("up1")
    }
}
