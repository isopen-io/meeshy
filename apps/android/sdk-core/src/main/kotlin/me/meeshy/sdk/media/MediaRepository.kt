package me.meeshy.sdk.media

import me.meeshy.sdk.model.DEFAULT_MEDIA_MIME_TYPE
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.toUploadedMedia
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.net.apiCall
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

/**
 * One file to upload: its raw [bytes], the [fileName] to advertise and a
 * [mimeType]. A blank [fileName] or [mimeType] is replaced with a sane default by
 * [MediaUpload.formPart] so a missing value never produces a malformed part.
 *
 * Plain class (not a `data class`) because [bytes] is a `ByteArray` — value
 * equality over arrays is a footgun and the type is never compared by value.
 */
class MediaUploadItem(
    val bytes: ByteArray,
    val fileName: String,
    val mimeType: String,
)

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

    /** Builds the multipart `files` part for [item] with resolved name + content type. */
    fun formPart(item: MediaUploadItem): MultipartBody.Part {
        val resolvedMime = mimeType(item.mimeType)
        val body = item.bytes.toRequestBody(resolvedMime.toMediaTypeOrNull())
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
) {
    suspend fun upload(items: List<MediaUploadItem>): NetworkResult<List<UploadedMedia>> {
        if (items.isEmpty()) return NetworkResult.Success(emptyList())
        val parts = items.map { MediaUpload.formPart(it) }
        return apiCall { mediaApi.upload(parts) }
            .map { response -> response.attachments.mapNotNull { it.toUploadedMedia() } }
    }
}
