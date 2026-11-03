package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.TusUploadRepository
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class StoryCommentMediaUploaderTest {

    private val item = MediaUploadItem(byteArrayOf(1, 2, 3), "photo.jpg", "image/jpeg")
    private val media = UploadedMedia("srv-1", "https://x/y.jpg", "image/jpeg", 3L, null, null, null, null)

    @Test
    fun `a piece uploads under the comment context and yields its server id`() = runTest {
        val tus = mockk<TusUploadRepository>()
        coEvery { tus.uploadAll(listOf(item), TusUploadContext.COMMENT, any()) } returns NetworkResult.Success(listOf(media))
        assertThat(StoryCommentMediaUploader(tus).upload(item)).isEqualTo(StoryCommentUpload.Done("srv-1"))
        coVerify(exactly = 1) { tus.uploadAll(listOf(item), TusUploadContext.COMMENT, any()) }
    }

    @Test
    fun `a refused upload fails the piece instead of throwing`() = runTest {
        val tus = mockk<TusUploadRepository>()
        coEvery { tus.uploadAll(any(), any(), any()) } returns NetworkResult.Failure(ApiError("500"))
        assertThat(StoryCommentMediaUploader(tus).upload(item)).isEqualTo(StoryCommentUpload.Failed)
    }

    @Test
    fun `an upload that throws fails the piece`() = runTest {
        val tus = mockk<TusUploadRepository>()
        coEvery { tus.uploadAll(any(), any(), any()) } throws IllegalStateException("boom")
        assertThat(StoryCommentMediaUploader(tus).upload(item)).isEqualTo(StoryCommentUpload.Failed)
    }
}
