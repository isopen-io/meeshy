package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.PendingMediaPreview
import me.meeshy.sdk.media.PendingMediaPreviewing
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.MessageEffects
import org.junit.Test

/**
 * #18915 (R3) — the settlement of an acknowledged send's local files runs once its row is already rewritten, and the
 * emission of that very write often cancels the caller (the thread's revalidation, inside the stream's
 * `transformLatest`). Cut halfway, it left the pending preview orphaned and the played file to download again.
 */
class AcknowledgedBubbleMediaTest {

    /** Previews whose release waits until the test lets it finish, recording what it released. */
    private class HeldRelease : PendingMediaPreviewing {
        val releasing = CompletableDeferred<Unit>()
        val finish = CompletableDeferred<Unit>()
        val released = mutableListOf<String>()

        override suspend fun keep(cmid: String, thumbnailPath: String?, effects: MessageEffects): String? = null
        override suspend fun render(cmid: String, item: MediaUploadItem, effects: MessageEffects): PendingMediaPreview? = null
        override suspend fun release(attachments: List<ApiMessageAttachment>) {
            releasing.complete(Unit)
            finish.await()
            released += attachments.map { it.id }
        }
    }

    @Test
    fun `a settlement under way finishes even when its caller is cancelled`() = runTest {
        val previews = HeldRelease()
        val media = AcknowledgedBubbleMedia(adoption = null, previews = previews, origin = AcknowledgedBubbleMedia.ORIGIN_PAGE)
        val local = ApiMessageAttachment(id = "cmid_up1", fileUrl = "file:///data/voice.m4a", mimeType = "audio/mp4")
        val served = ApiMessageAttachment(id = "att-srv1", fileUrl = "https://gate.meeshy.me/voice.m4a", mimeType = "audio/mp4")

        val settling = launch { media.settle(previous = listOf(local), written = listOf(served)) }
        previews.releasing.await()
        settling.cancel()
        previews.finish.complete(Unit)
        settling.join()

        assertThat(previews.released).containsExactly("cmid_up1")
    }
}
