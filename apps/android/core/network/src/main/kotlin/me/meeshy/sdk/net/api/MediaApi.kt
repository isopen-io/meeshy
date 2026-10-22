package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.MediaUploadResponse
import me.meeshy.sdk.model.media.AttachmentStatusBody
import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path

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

    /**
     * Consommation d'un média (`listened` / `watched` / `viewed` / `downloaded`), avec les
     * plages continues et leur fin. La charge utile de la réponse n'est pas lue.
     */
    @POST("attachments/{attachmentId}/status")
    suspend fun reportStatus(
        @Path("attachmentId") attachmentId: String,
        @Body body: AttachmentStatusBody,
    ): ApiResponse<JsonElement>
}
