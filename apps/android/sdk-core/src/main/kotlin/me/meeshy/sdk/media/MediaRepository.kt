package me.meeshy.sdk.media

import me.meeshy.sdk.model.DEFAULT_MEDIA_MIME_TYPE
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.toUploadedMedia
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.net.apiCall
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pure construction of the multipart parts a media upload sends. Kept out of the
 * repository so the "which field name / which filename / which content type"
 * decisions stay JVM-testable without a network. The gateway accepts file parts
 * under the [FIELD_NAME] field (it filters file parts by type, not name — iOS
 * uses the same `files` name).
 */
object MediaUpload {
    const val FIELD_NAME: String = "files"
    const val DEFAULT_FILE_NAME: String = "upload"

    /** The advertised filename, falling back to [DEFAULT_FILE_NAME] when blank. */
    fun fileName(raw: String): String = raw.takeIf { it.isNotBlank() } ?: DEFAULT_FILE_NAME

    /** The content type, falling back to the octet-stream default when blank. */
    fun mimeType(raw: String): String = raw.takeIf { it.isNotBlank() } ?: DEFAULT_MEDIA_MIME_TYPE

    /** Builds the multipart `files` part for [item] with resolved name + content type, streamed from its source (#13551). */
    fun formPart(item: MediaUploadItem): MultipartBody.Part {
        val body = item.requestBody(mimeType(item.mimeType).toMediaTypeOrNull())
        return MultipartBody.Part.createFormData(FIELD_NAME, fileName(item.fileName), body)
    }
}

/**
 * Uploads media to the gateway (`POST /attachments/upload`) and returns the
 * domain [UploadedMedia] items a composer references by id. Port of iOS
 * `AttachmentUploader`, generalised to multiple files and any MIME type (iOS only
 * uploads a single compressed JPEG avatar).
 *
 * Unusable rows in the response (blank id or url) are dropped rather than failing
 * the whole upload, so one degenerate attachment never discards the good ones.
 */
@Singleton
class MediaRepository @Inject constructor(
    private val mediaApi: MediaApi,
    private val sanitizer: OutgoingMediaSanitizer,
) {
    suspend fun upload(items: List<MediaUploadItem>): NetworkResult<List<UploadedMedia>> {
        if (items.isEmpty()) return NetworkResult.Success(emptyList())
        val clean = mutableListOf<Pair<MediaUploadItem, MediaUploadItem>>()
        try {
            items.forEach { item ->
                when (val result = sanitizer.sanitize(item)) {
                    is NetworkResult.Failure -> return result
                    is NetworkResult.Success -> clean += result.data to item
                }
            }
            val parts = clean.map { (sent, _) -> MediaUpload.formPart(sent) }
            return apiCall { mediaApi.upload(parts) }
                .map { response -> response.attachments.mapNotNull { it.toUploadedMedia() } }
        } finally {
            clean.forEach { (sent, original) -> sanitizer.release(sent, original) }
        }
    }
}
