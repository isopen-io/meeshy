package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.routes.ApiRoutesAttachments
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Path

/** Corps de `POST /attachments/:id/translate` ; les champs optionnels sont omis quand ils sont nuls. */
@Serializable
data class AttachmentTranslateRequest(
    val targetLanguages: List<String>,
    val sourceLanguage: String? = null,
    val generateVoiceClone: Boolean? = null,
)

/** Traduction d'UNE pièce audio (transcription, traduction, voix) — miroir de `AttachmentService.translate` (iOS). */
interface AttachmentTranslationApi {
    @POST(ApiRoutesAttachments.BY_ATTACHMENT_ID_TRANSLATE)
    suspend fun translate(
        @Path("attachmentId") attachmentId: String,
        @Body body: AttachmentTranslateRequest,
    ): ApiResponse<JsonElement>
}
