package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.MediaUploadResponse
import okhttp3.MultipartBody
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

/**
 * Media upload surface — port of iOS `AttachmentUploader`'s
 * `POST /attachments/upload`. Files are sent as multipart `files` parts; the
 * gateway responds with `{ attachments: [...] }` (see `messageAttachmentSchema`).
 */
interface MediaApi {
    @Multipart
    @POST("attachments/upload")
    suspend fun upload(
        @Part files: List<MultipartBody.Part>,
    ): ApiResponse<MediaUploadResponse>
}
