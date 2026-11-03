package me.meeshy.sdk.net.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.TranslationJob
import me.meeshy.sdk.net.routes.ApiRoutesTranslate
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** Blocking text translation request — port of TranslateRequest (ServiceModels.swift). */
@Serializable
data class TranslateRequest(
    val text: String,
    @SerialName("source_language") val sourceLanguage: String,
    @SerialName("target_language") val targetLanguage: String,
)

/** Blocking text translation response — port of TranslateResponse (ServiceModels.swift). */
@Serializable
data class TranslateResponse(
    @SerialName("translated_text") val translatedText: String = "",
    @SerialName("source_language") val detectedLanguage: String? = null,
)

/** Synchronous text translation — port of TranslationService (TranslationService.swift). */
interface TranslationApi {
    @POST("translate-blocking")
    suspend fun translate(@Body body: TranslateRequest): ApiResponse<TranslateResponse>

    /** Suivi d'un job de traduction de pièce lancé par `POST /attachments/:id/translate`. */
    @GET(ApiRoutesTranslate.JOBS_BY_JOB_ID)
    suspend fun job(@Path("jobId") jobId: String): ApiResponse<TranslationJob>

    @DELETE(ApiRoutesTranslate.JOBS_BY_JOB_ID)
    suspend fun cancelJob(@Path("jobId") jobId: String): ApiResponse<JsonElement>
}
