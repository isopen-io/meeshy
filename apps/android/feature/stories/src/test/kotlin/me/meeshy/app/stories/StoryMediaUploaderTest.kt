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

/**
 * [StoryMediaUploader] is the app-side product decision ("story-picked media
 * uploads as `story`-context TUS media") sitting on top of the generic
 * [TusUploadRepository] building block — the SDK-purity split this codebase's
 * `packages/MeeshySDK/CLAUDE.md` grain test describes for iOS applies the same way
 * here: the SDK repository stays context-agnostic, the feature module owns "which
 * context". Thin by design — one behaviour to prove: it delegates with `STORY`.
 */
class StoryMediaUploaderTest {

    private val tusUploadRepository: TusUploadRepository = mockk(relaxed = true)

    private fun uploader() = StoryMediaUploader(tusUploadRepository)

    private fun item(name: String = "slide.jpg") =
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
    fun `upload delegates to the repository tagged with the STORY context`() = runTest {
        val items = listOf(item("a.jpg"), item("b.jpg"))
        coEvery { tusUploadRepository.uploadAll(items, TusUploadContext.STORY) } returns
            NetworkResult.Success(listOf(uploaded("a"), uploaded("b")))

        val result = uploader().upload(items)

        assertThat(result).isEqualTo(NetworkResult.Success(listOf(uploaded("a"), uploaded("b"))))
        coVerify(exactly = 1) { tusUploadRepository.uploadAll(items, TusUploadContext.STORY) }
    }

    @Test
    fun `upload propagates a repository failure unchanged`() = runTest {
        val items = listOf(item())
        val failure = NetworkResult.Failure(ApiError("offline"))
        coEvery { tusUploadRepository.uploadAll(items, TusUploadContext.STORY) } returns failure

        assertThat(uploader().upload(items)).isEqualTo(failure)
    }
}
