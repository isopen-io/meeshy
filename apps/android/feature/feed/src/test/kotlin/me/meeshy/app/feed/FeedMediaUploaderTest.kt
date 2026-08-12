package me.meeshy.app.feed

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

/**
 * [FeedMediaUploader] is the app-side product decision ("feed-post-picked media
 * uploads as `post`-context TUS media") sitting on top of the generic
 * [TusUploadRepository] building block — the Feed counterpart of
 * `me.meeshy.app.stories.StoryMediaUploader` (same SDK-purity split: the SDK
 * repository stays context-agnostic, the feature module owns "which context").
 * Thin by design — one behaviour to prove: it delegates with `POST`.
 */
class FeedMediaUploaderTest {

    private val tusUploadRepository: TusUploadRepository = mockk(relaxed = true)

    private fun uploader() = FeedMediaUploader(tusUploadRepository)

    private fun item(name: String = "photo.jpg") =
        MediaUploadItem(bytes = byteArrayOf(1, 2, 3), fileName = name, mimeType = "image/jpeg")

    private fun uploaded(id: String) = UploadedMedia(
        id = id,
        url = "https://cdn.meeshy.me/$id.jpg",
        mimeType = "image/jpeg",
        fileSize = 2048,
        width = 1080,
        height = 1920,
        durationMs = null,
        thumbnailUrl = null,
    )

    @Test
    fun `upload delegates to the repository tagged with the POST context`() = runTest {
        val items = listOf(item("a.jpg"), item("b.jpg"))
        coEvery { tusUploadRepository.uploadAll(items, TusUploadContext.POST) } returns
            NetworkResult.Success(listOf(uploaded("a"), uploaded("b")))

        val result = uploader().upload(items)

        assertThat(result).isEqualTo(NetworkResult.Success(listOf(uploaded("a"), uploaded("b"))))
        coVerify(exactly = 1) { tusUploadRepository.uploadAll(items, TusUploadContext.POST) }
    }

    @Test
    fun `upload propagates a repository failure unchanged`() = runTest {
        val items = listOf(item())
        val failure = NetworkResult.Failure(ApiError("offline"))
        coEvery { tusUploadRepository.uploadAll(items, TusUploadContext.POST) } returns failure

        assertThat(uploader().upload(items)).isEqualTo(failure)
    }
}
