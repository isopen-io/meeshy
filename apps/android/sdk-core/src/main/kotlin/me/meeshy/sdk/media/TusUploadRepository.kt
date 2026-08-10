package me.meeshy.sdk.media

import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusChunkPlan
import me.meeshy.sdk.model.media.TusChunkRange
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.model.media.TusUploadMetadata
import me.meeshy.sdk.model.toUploadedMedia
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TusApi
import me.meeshy.sdk.net.api.createSession
import me.meeshy.sdk.net.api.patchChunk
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
 * mediaOwnership.ts`). Port of iOS `TusUploadManager`: the body is split into
 * bounded PATCH calls of at most [DEFAULT_CHUNK_SIZE_BYTES] each ([TusChunkPlan]),
 * matching iOS's own fixed-size chunking loop. Does **not** yet persist a
 * checkpoint or survive an app kill mid-upload — that remains a tracked follow-up
 * (`feature-parity.md` §Q); a body no larger than one chunk (the common case —
 * compressed images) still makes exactly one PATCH, unchanged from before.
 */
@Singleton
public class TusUploadRepository @Inject constructor(
    private val tusApi: TusApi,
) {
    /**
     * Uploads one [item] tagged with [context]. See [TusUploadRepository].
     * [chunkSizeBytes] defaults to [DEFAULT_CHUNK_SIZE_BYTES] — exposed as a
     * parameter (not a constructor field, to keep DI construction untouched) so
     * tests can exercise multi-chunk plans without allocating megabytes of test
     * fixture bytes.
     */
    public suspend fun upload(
        item: MediaUploadItem,
        context: TusUploadContext,
        chunkSizeBytes: Long = DEFAULT_CHUNK_SIZE_BYTES,
    ): NetworkResult<List<UploadedMedia>> {
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

        val ranges = TusChunkPlan.chunks(totalBytes = item.bytes.size.toLong(), chunkSize = chunkSizeBytes)
        for (range in ranges) {
            if (!range.isFinal) {
                val chunkResult = tusApi.patchChunk(
                    location = location,
                    uploadOffset = range.offset,
                    tusResumable = TusUploadMetadata.TUS_RESUMABLE_VERSION,
                    body = rangeBody(item.bytes, range),
                )
                if (chunkResult is NetworkResult.Failure) return chunkResult
                continue
            }

            return apiCall {
                tusApi.uploadData(
                    location = location,
                    uploadOffset = range.offset,
                    tusResumable = TusUploadMetadata.TUS_RESUMABLE_VERSION,
                    body = rangeBody(item.bytes, range),
                )
            }.map { data -> listOfNotNull(data.attachment?.toUploadedMedia()) }
        }

        // Unreachable: TusChunkPlan.chunks always returns at least one (final) range.
        error("TusChunkPlan produced no ranges for ${item.bytes.size} bytes")
    }

    private fun rangeBody(bytes: ByteArray, range: TusChunkRange) =
        bytes.copyOfRange(range.offset.toInt(), (range.offset + range.length).toInt()).toRequestBody(OCTET_STREAM_MEDIA_TYPE)

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

    public companion object {
        /**
         * Default PATCH chunk size — matches iOS `TusUploadManager.chunkSize` (10 MB)
         * so both clients place the same load shape against the gateway's `@tus/server`
         * mount. Public so it's usable as a real default for [upload]'s [chunkSizeBytes]
         * parameter from any caller/module.
         */
        public const val DEFAULT_CHUNK_SIZE_BYTES: Long = 10L * 1024 * 1024

        private val OCTET_STREAM_MEDIA_TYPE = "application/offset+octet-stream".toMediaTypeOrNull()
    }
}
