package me.meeshy.sdk.media

import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.model.media.TusUploadMetadata
import me.meeshy.sdk.model.toUploadedMedia
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TusApi
import me.meeshy.sdk.net.api.createSession
import me.meeshy.sdk.net.apiCall
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Uploads media via the [tus.io resumable protocol](https://tus.io/protocols/
 * resumable-upload) and returns the domain [UploadedMedia] a post/story/status/
 * comment composer references by id. Unlike [MediaRepository] (`POST
 * /attachments/upload`, which only ever produces a `MessageAttachment`), a TUS
 * upload tagged with a [TusUploadContext] is the **only** path that produces a
 * `PostMedia` row — the id space `CreatePostRequest`/`CreateStoryRequest.mediaIds`
 * actually claims against server-side (`services/gateway/src/services/posts/
 * mediaOwnership.ts`). Port of iOS `TusUploadManager`, single-shot only: the whole
 * file is PATCHed in one request at `Upload-Offset: 0` (no chunking/resume/
 * checkpoint-store) — sufficient for compressed images; chunked large-video upload
 * is a tracked follow-up (`feature-parity.md` §F).
 */
@Singleton
public class TusUploadRepository @Inject constructor(
    private val tusApi: TusApi,
) {
    /** Uploads one [item] tagged with [context]. See [TusUploadRepository]. */
    public suspend fun upload(item: MediaUploadItem, context: TusUploadContext): NetworkResult<List<UploadedMedia>> {
        val fileName = MediaUpload.fileName(item.fileName)
        val mimeType = MediaUpload.mimeType(item.mimeType)

        val locationResult = tusApi.createSession(
            uploadLength = item.bytes.size.toLong(),
            uploadMetadata = TusUploadMetadata.headerValue(fileName, mimeType, context),
            tusResumable = TusUploadMetadata.TUS_RESUMABLE_VERSION,
        )
        val location = when (locationResult) {
            is NetworkResult.Failure -> return locationResult
            is NetworkResult.Success -> locationResult.data
        }

        val body = item.bytes.toRequestBody(OCTET_STREAM_MEDIA_TYPE)
        return apiCall {
            tusApi.uploadData(
                location = location,
                uploadOffset = 0L,
                tusResumable = TusUploadMetadata.TUS_RESUMABLE_VERSION,
                body = body,
            )
        }.map { data -> listOfNotNull(data.attachment?.toUploadedMedia()) }
    }

    /**
     * Uploads every item in [items], sequentially and in order, all tagged with the
     * same [context]. TUS has no batch endpoint (unlike [MediaRepository.upload]'s
     * single multipart call for a whole list) — this folds N single-file uploads into
     * the same all-or-nothing [NetworkResult] contract callers already expect:
     * **stops at the first failure** and returns it (mirrors iOS `TusUploadManager.
     * uploadFiles`'s task group, which cancels its siblings on the first thrown
     * error) rather than uploading the remainder or silently dropping the failed one.
     */
    public suspend fun uploadAll(
        items: List<MediaUploadItem>,
        context: TusUploadContext,
    ): NetworkResult<List<UploadedMedia>> {
        val uploaded = mutableListOf<UploadedMedia>()
        for (item in items) {
            when (val result = upload(item, context)) {
                is NetworkResult.Success -> uploaded += result.data
                is NetworkResult.Failure -> return result
            }
        }
        return NetworkResult.Success(uploaded)
    }

    private companion object {
        val OCTET_STREAM_MEDIA_TYPE = "application/offset+octet-stream".toMediaTypeOrNull()
    }
}
