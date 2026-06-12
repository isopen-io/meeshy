package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiResponse
import okhttp3.MultipartBody
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

@Serializable
data class UploadedAttachments(
    val attachments: List<ApiMessageAttachment> = emptyList(),
)

/** POST /attachments/upload — multipart files, authenticated or anonymous. */
interface AttachmentApi {

    @Multipart
    @POST("attachments/upload")
    suspend fun upload(
        @Part files: List<MultipartBody.Part>,
    ): ApiResponse<UploadedAttachments>
}
